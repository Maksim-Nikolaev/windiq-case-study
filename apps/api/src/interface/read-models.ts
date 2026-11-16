import { and, count, desc, eq, gt, gte, lte, max, ne, sql } from 'drizzle-orm';
import type { ActiveMasterData, Store } from '../application/ports.ts';
import { hoursInWindow, yieldWindowEndingAt } from '../domain/annual-yield.ts';
import { HOUR_MS } from '../domain/measurement-hour.ts';
import { computeBreakdown } from '../domain/yield-breakdown.ts';
import type { Database } from '../infrastructure/db/client.ts';
import {
  ingestRuns,
  masterDataVersions,
  measurementRevisions,
  measurements,
  rejectedRows,
  yieldResults,
} from '../infrastructure/db/schema.ts';
import type {
  DataQuality,
  ReadyYieldOverview,
  Status,
  YieldBreakdownResponse,
  YieldHistory,
  YieldOverview,
} from './schemas.ts';

const DAY_MS = 24 * HOUR_MS;
const HISTORY_DAYS = 30;
const LIST_LIMIT = 100;

export interface StatusSettings {
  readonly appVersion: string;
  readonly startedAt: Date;
  readonly staleAfterMs: number;
}

export interface ReadModels {
  yieldOverview(): Promise<YieldOverview>;
  yieldHistory(): Promise<YieldHistory>;
  yieldBreakdown(): Promise<YieldBreakdownResponse>;
  dataQuality(): Promise<DataQuality>;
  status(now: Date): Promise<Status>;
  isDatabaseReachable(): Promise<boolean>;
}

function iso(instant: Date): string {
  return instant.toISOString();
}

function isoOrNull(instant: Date | null): string | null {
  return instant === null ? null : instant.toISOString();
}

function describeInputs(active: ActiveMasterData): ReadyYieldOverview['inputs'] {
  const mast = active.mast.record;
  const turbine = active.turbine.record;
  const site = active.site.record;

  return {
    mast: {
      id: mast.id,
      name: mast.name,
      latitude: mast.latitude,
      longitude: mast.longitude,
      measurementHeightM: mast.measurementHeightM,
    },
    turbine: {
      id: turbine.id,
      name: turbine.name,
      ratedPowerKw: turbine.ratedPowerKw,
      hubHeightM: turbine.hubHeightM,
      rotorDiameterM: turbine.rotorDiameterM,
      cutInMs: turbine.powerCurve.cutInMs,
      cutOutMs: turbine.powerCurve.cutOutMs,
      powerCurve: turbine.powerCurve.points.map((point) => ({ ...point })),
      version: turbine.version,
      updatedAt: turbine.updatedAt,
    },
    site: {
      id: site.id,
      name: site.name,
      shearExponent: site.shearExponent,
      losses: site.losses,
      uncertainty: site.uncertainty,
      version: site.version,
      updatedAt: site.updatedAt,
    },
  };
}

export function createReadModels(db: Database, store: Store, settings: StatusSettings): ReadModels {
  async function hoursByStatus(latestHour: Date): Promise<ReadyYieldOverview['hours']> {
    const window = yieldWindowEndingAt(latestHour);
    const rows = await db
      .select({ status: measurements.status, hours: count() })
      .from(measurements)
      .where(
        and(gte(measurements.measuredAt, window.start), lte(measurements.measuredAt, window.end)),
      )
      .groupBy(measurements.status);
    const hoursOf = (status: 'valid' | 'missing' | 'invalid') =>
      rows.find((row) => row.status === status)?.hours ?? 0;
    const present = rows.reduce((sum, row) => sum + row.hours, 0);

    return {
      valid: hoursOf('valid'),
      missing: hoursOf('missing'),
      invalid: hoursOf('invalid'),
      absent: hoursInWindow(window) - present,
    };
  }

  return {
    async yieldOverview(): Promise<YieldOverview> {
      const [record, active, latestHour] = await Promise.all([
        store.latestYieldRecord(),
        store.activeMasterData(),
        store.latestMeasuredHour(),
      ]);

      if (record === null || active === null || latestHour === null) {
        return { state: 'pending' };
      }

      return {
        state: 'ready',
        result: {
          ...record.result,
          computedAt: iso(record.computedAt),
          windowStart: iso(record.window.start),
          windowEnd: iso(record.window.end),
        },
        inputs: describeInputs(active),
        hours: await hoursByStatus(latestHour),
      };
    },

    async yieldHistory(): Promise<YieldHistory> {
      const rows = await db
        .select({
          computedAt: yieldResults.computedAt,
          windowEnd: yieldResults.windowEnd,
          grossMwh: yieldResults.grossMwh,
          p50Mwh: yieldResults.p50Mwh,
          p90Mwh: yieldResults.p90Mwh,
          validHours: yieldResults.validHours,
        })
        .from(yieldResults)
        .where(gte(yieldResults.computedAt, new Date(Date.now() - HISTORY_DAYS * DAY_MS)))
        .orderBy(yieldResults.id);

      return {
        points: rows.map((row) => ({
          ...row,
          computedAt: iso(row.computedAt),
          windowEnd: iso(row.windowEnd),
        })),
      };
    },

    async yieldBreakdown(): Promise<YieldBreakdownResponse> {
      const [active, latestHour] = await Promise.all([
        store.activeMasterData(),
        store.latestMeasuredHour(),
      ]);

      if (active === null || latestHour === null) {
        return { months: [], windSpeedBins: [] };
      }

      const window = yieldWindowEndingAt(latestHour);
      const rows = await db
        .select({
          measuredAt: measurements.measuredAt,
          windSpeedMs: measurements.windSpeedMs,
        })
        .from(measurements)
        .where(
          and(
            eq(measurements.status, 'valid'),
            gte(measurements.measuredAt, window.start),
            lte(measurements.measuredAt, window.end),
          ),
        );
      const breakdown = computeBreakdown({
        readings: rows.flatMap((row) =>
          row.windSpeedMs === null ? [] : [{ ...row, windSpeedMs: row.windSpeedMs }],
        ),
        window,
        measurementHeightM: active.mast.record.measurementHeightM,
        turbine: active.turbine.record,
        site: active.site.record,
      });

      return { months: [...breakdown.months], windSpeedBins: [...breakdown.windSpeedBins] };
    },

    async dataQuality(): Promise<DataQuality> {
      const revisionCount = count();
      const correctedAt = max(measurementRevisions.upstreamUpdatedAt);
      const [unusable, corrections, rejected, versions] = await Promise.all([
        db
          .select()
          .from(measurements)
          .where(ne(measurements.status, 'valid'))
          .orderBy(desc(measurements.measuredAt))
          .limit(LIST_LIMIT),
        db
          .select({
            measuredAt: measurementRevisions.measuredAt,
            revisions: revisionCount,
            latestVersion: measurements.version,
            firstWindSpeedMs: sql<
              number | null
            >`(array_agg(${measurementRevisions.windSpeedMs} order by ${measurementRevisions.version}, ${measurementRevisions.upstreamUpdatedAt}))[1]`,
            currentWindSpeedMs: measurements.windSpeedMs,
            correctedAt,
          })
          .from(measurementRevisions)
          .innerJoin(measurements, eq(measurements.measuredAt, measurementRevisions.measuredAt))
          .groupBy(measurementRevisions.measuredAt, measurements.version, measurements.windSpeedMs)
          .having(gt(revisionCount, 1))
          .orderBy(desc(correctedAt))
          .limit(LIST_LIMIT),
        db.select().from(rejectedRows).orderBy(desc(rejectedRows.lastSeenAt)).limit(LIST_LIMIT),
        db.select().from(masterDataVersions).orderBy(desc(masterDataVersions.id)).limit(LIST_LIMIT),
      ]);

      return {
        unusableHours: unusable.flatMap((row) =>
          row.status === 'valid'
            ? []
            : [
                {
                  measuredAt: iso(row.measuredAt),
                  status: row.status,
                  reason: row.rejectReason,
                  rawValue: row.rawValue,
                  rawUnit: row.rawUnit,
                  version: row.version,
                },
              ],
        ),
        corrections: corrections.flatMap((row) =>
          row.correctedAt === null
            ? []
            : [{ ...row, measuredAt: iso(row.measuredAt), correctedAt: iso(row.correctedAt) }],
        ),
        rejectedRows: rejected.map((row) => ({
          reason: row.reason,
          payload: JSON.stringify(row.payload),
          firstSeenAt: iso(row.firstSeenAt),
          lastSeenAt: iso(row.lastSeenAt),
        })),
        masterDataVersions: versions.map((row) => ({
          kind: row.kind,
          accepted: row.accepted,
          rejectReason: row.rejectReason,
          upstreamVersion: row.upstreamVersion,
          upstreamUpdatedAt: isoOrNull(row.upstreamUpdatedAt),
          fetchedAt: iso(row.fetchedAt),
        })),
      };
    },

    async status(now: Date): Promise<Status> {
      const since = new Date(now.getTime() - DAY_MS);
      const [latestHour, rejectedMasterData, state, runs, totals] = await Promise.all([
        store.latestValidHour(),
        store.rejectedMasterData(),
        store.ingestState(),
        db.select().from(ingestRuns).orderBy(desc(ingestRuns.id)).limit(30),
        db
          .select({ outcome: ingestRuns.outcome, runs: count() })
          .from(ingestRuns)
          .where(gte(ingestRuns.startedAt, since))
          .groupBy(ingestRuns.outcome),
      ]);
      const ageMs = latestHour === null ? null : now.getTime() - latestHour.getTime();
      const freshness =
        ageMs === null ? 'empty' : ageMs <= settings.staleAfterMs ? 'fresh' : 'stale';

      return {
        version: settings.appVersion,
        startedAt: iso(settings.startedAt),
        now: iso(now),
        dataFreshness: freshness,
        dataAgeMinutes: ageMs === null ? null : Math.round(ageMs / 60_000),
        latestValidMeasurementAt: isoOrNull(latestHour),
        rejectedMasterData,
        lastPollSuccessAt: isoOrNull(state.lastPollSuccessAt),
        lastReconcileAt: isoOrNull(state.lastReconcileAt),
        runsLast24h: {
          total: totals.reduce((sum, row) => sum + row.runs, 0),
          failed: totals.find((row) => row.outcome === 'failed')?.runs ?? 0,
        },
        runs: runs.map((run) => ({
          kind: run.kind,
          startedAt: iso(run.startedAt),
          durationMs: run.finishedAt.getTime() - run.startedAt.getTime(),
          outcome: run.outcome,
          errorMessage: run.errorMessage,
          rowsNew: run.rowsNew,
          rowsCorrected: run.rowsCorrected,
          rowsRejected: run.rowsRejected,
        })),
      };
    },

    async isDatabaseReachable(): Promise<boolean> {
      try {
        await db.execute(sql`select 1`);

        return true;
      } catch {
        return false;
      }
    },
  };
}

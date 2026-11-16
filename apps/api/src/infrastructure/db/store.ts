import { and, desc, eq, gte, lte, max, sql } from 'drizzle-orm';
import type {
  ActiveMasterData,
  ActiveVersion,
  IngestRun,
  IngestState,
  RejectedRow,
  SourceDocument,
  Store,
  UpsertCounts,
  YieldRecord,
} from '../../application/ports.ts';
import type { HourlyWindSpeed, YieldWindow } from '../../domain/annual-yield.ts';
import type {
  MasterDataKind,
  MastRecord,
  SiteRecord,
  TurbineRecord,
} from '../../domain/master-data.ts';
import { latestRevisionPerHour, type Measurement } from '../../domain/measurement.ts';
import { contentHash } from '../content-hash.ts';
import type { Database } from './client.ts';
import {
  ingestRuns,
  ingestState,
  masterDataVersions,
  measurementRevisions,
  measurements,
  rejectedRows,
  yieldResults,
} from './schema.ts';

const STATE_ROW_ID = 1;
const EMPTY_STATE: IngestState = {
  feedPosition: null,
  lastPollSuccessAt: null,
  lastReconcileAt: null,
  lastReconcileAttemptAt: null,
  lastMasterDataSyncAt: null,
};

function toRow(measurement: Measurement, fetchedAt: Date) {
  const reading = measurement.reading;

  return {
    measuredAt: measurement.measuredAt,
    rawValue: measurement.rawValue,
    rawUnit: measurement.rawUnit,
    windSpeedMs: reading.status === 'valid' ? reading.windSpeedMs : null,
    status: reading.status,
    rejectReason: reading.status === 'invalid' ? reading.reason : null,
    version: measurement.version,
    upstreamUpdatedAt: measurement.upstreamUpdatedAt,
    fetchedAt,
  };
}

export function createStore(db: Database): Store {
  return {
    async ingestState(): Promise<IngestState> {
      const [row] = await db.select().from(ingestState).where(eq(ingestState.id, STATE_ROW_ID));

      return row ?? EMPTY_STATE;
    },

    async saveIngestState(patch: Partial<IngestState>): Promise<void> {
      await db
        .insert(ingestState)
        .values({ id: STATE_ROW_ID, ...EMPTY_STATE, ...patch })
        .onConflictDoUpdate({ target: ingestState.id, set: patch });
    },

    async saveMeasurements(batch: readonly Measurement[], fetchedAt: Date): Promise<UpsertCounts> {
      if (batch.length === 0) {
        return { inserted: 0, corrected: 0 };
      }

      return db.transaction(async (tx) => {
        await tx
          .insert(measurementRevisions)
          .values(batch.map((measurement) => toRow(measurement, fetchedAt)))
          .onConflictDoNothing();

        const saved = await tx
          .insert(measurements)
          .values(
            latestRevisionPerHour(batch).map((measurement) => ({
              ...toRow(measurement, fetchedAt),
              windDirectionDeg: measurement.windDirectionDeg,
            })),
          )
          .onConflictDoUpdate({
            target: measurements.measuredAt,
            set: {
              rawValue: sql`excluded.raw_value`,
              rawUnit: sql`excluded.raw_unit`,
              windSpeedMs: sql`excluded.wind_speed_ms`,
              windDirectionDeg: sql`excluded.wind_direction_deg`,
              status: sql`excluded.status`,
              rejectReason: sql`excluded.reject_reason`,
              version: sql`excluded.version`,
              upstreamUpdatedAt: sql`excluded.upstream_updated_at`,
              fetchedAt: sql`excluded.fetched_at`,
            },
            setWhere: sql`(excluded.version, excluded.upstream_updated_at) > (${measurements.version}, ${measurements.upstreamUpdatedAt})`,
          })
          .returning({ inserted: sql<boolean>`xmax = 0` });
        const inserted = saved.filter((row) => row.inserted).length;

        return { inserted, corrected: saved.length - inserted };
      });
    },

    async saveRejectedRows(rows: readonly RejectedRow[], seenAt: Date): Promise<number> {
      if (rows.length === 0) {
        return 0;
      }

      const unique = new Map(rows.map((row) => [contentHash(row.payload), row]));
      const saved = await db
        .insert(rejectedRows)
        .values(
          [...unique].map(([payloadHash, row]) => ({
            payloadHash,
            payload: row.payload,
            reason: row.reason,
            firstSeenAt: seenAt,
            lastSeenAt: seenAt,
          })),
        )
        .onConflictDoUpdate({ target: rejectedRows.payloadHash, set: { lastSeenAt: seenAt } })
        .returning({ inserted: sql<boolean>`xmax = 0` });

      return saved.filter((row) => row.inserted).length;
    },

    async saveIngestRun(run: IngestRun): Promise<void> {
      await db.insert(ingestRuns).values(run);
    },

    async latestMasterDataHash(kind: MasterDataKind): Promise<string | null> {
      const [row] = await db
        .select({ contentHash: masterDataVersions.contentHash })
        .from(masterDataVersions)
        .where(eq(masterDataVersions.kind, kind))
        .orderBy(desc(masterDataVersions.id))
        .limit(1);

      return row?.contentHash ?? null;
    },

    async saveMasterDataVersion(
      kind: MasterDataKind,
      document: SourceDocument,
      fetchedAt: Date,
    ): Promise<void> {
      const record = document.validation.accepted ? document.validation.record : null;
      const versioned = record === null || record.kind === 'mast' ? null : record;

      await db.insert(masterDataVersions).values({
        kind,
        contentHash: document.contentHash,
        payload: document.payload,
        record,
        accepted: document.validation.accepted,
        rejectReason: document.validation.accepted ? null : document.validation.reason,
        upstreamVersion: versioned?.version ?? null,
        upstreamUpdatedAt: versioned === null ? null : new Date(versioned.updatedAt),
        fetchedAt,
      });
    },

    async activeMasterData(): Promise<ActiveMasterData | null> {
      const latest = await db
        .selectDistinctOn([masterDataVersions.kind], {
          versionId: masterDataVersions.id,
          record: masterDataVersions.record,
        })
        .from(masterDataVersions)
        .where(eq(masterDataVersions.accepted, true))
        .orderBy(masterDataVersions.kind, desc(masterDataVersions.id));
      let mast: ActiveVersion<MastRecord> | null = null;
      let turbine: ActiveVersion<TurbineRecord> | null = null;
      let site: ActiveVersion<SiteRecord> | null = null;

      for (const { versionId, record } of latest) {
        if (record?.kind === 'mast') {
          mast = { versionId, record };
        } else if (record?.kind === 'turbine') {
          turbine = { versionId, record };
        } else if (record?.kind === 'site') {
          site = { versionId, record };
        }
      }

      return mast === null || turbine === null || site === null ? null : { mast, turbine, site };
    },

    async latestMeasuredHour(): Promise<Date | null> {
      const [row] = await db.select({ latest: max(measurements.measuredAt) }).from(measurements);

      return row?.latest ?? null;
    },

    async latestValidHour(): Promise<Date | null> {
      const [row] = await db
        .select({ latest: max(measurements.measuredAt) })
        .from(measurements)
        .where(eq(measurements.status, 'valid'));

      return row?.latest ?? null;
    },

    async rejectedMasterData(): Promise<MasterDataKind[]> {
      const latest = await db
        .selectDistinctOn([masterDataVersions.kind], {
          kind: masterDataVersions.kind,
          accepted: masterDataVersions.accepted,
        })
        .from(masterDataVersions)
        .orderBy(masterDataVersions.kind, desc(masterDataVersions.id));

      return latest.filter((row) => !row.accepted).map((row) => row.kind);
    },

    async validReadings(window: YieldWindow): Promise<HourlyWindSpeed[]> {
      const rows = await db
        .select({ measuredAt: measurements.measuredAt, windSpeedMs: measurements.windSpeedMs })
        .from(measurements)
        .where(
          and(
            eq(measurements.status, 'valid'),
            gte(measurements.measuredAt, window.start),
            lte(measurements.measuredAt, window.end),
          ),
        )
        .orderBy(measurements.measuredAt);

      return rows.flatMap((row) =>
        row.windSpeedMs === null
          ? []
          : [{ measuredAt: row.measuredAt, windSpeedMs: row.windSpeedMs }],
      );
    },

    async latestYieldRecord(): Promise<YieldRecord | null> {
      const [row] = await db.select().from(yieldResults).orderBy(desc(yieldResults.id)).limit(1);

      if (row === undefined) {
        return null;
      }

      return {
        computedAt: row.computedAt,
        window: { start: row.windowStart, end: row.windowEnd },
        mastVersionId: row.mastVersionId,
        turbineVersionId: row.turbineVersionId,
        siteVersionId: row.siteVersionId,
        result: {
          grossMwh: row.grossMwh,
          netMwh: row.netMwh,
          p50Mwh: row.p50Mwh,
          p90Mwh: row.p90Mwh,
          lossFactor: row.lossFactor,
          expectedHours: row.expectedHours,
          validHours: row.validHours,
          coverage: row.expectedHours === 0 ? 0 : row.validHours / row.expectedHours,
          measuredGrossMwh: row.measuredGrossMwh,
          interpolatedHours: row.interpolatedHours,
          monthMeanHours: row.monthMeanHours,
          meanHubWindSpeedMs: row.meanHubWindSpeedMs,
          capacityFactor: row.capacityFactor,
          fullLoadHours: row.fullLoadHours,
        },
      };
    },

    async saveYieldRecord(record: YieldRecord): Promise<void> {
      const { coverage: _coverage, ...result } = record.result;

      await db.insert(yieldResults).values({
        ...result,
        computedAt: record.computedAt,
        windowStart: record.window.start,
        windowEnd: record.window.end,
        mastVersionId: record.mastVersionId,
        turbineVersionId: record.turbineVersionId,
        siteVersionId: record.siteVersionId,
      });
    },
  };
}

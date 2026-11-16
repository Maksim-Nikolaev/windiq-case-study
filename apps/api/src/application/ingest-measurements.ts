import { type Measurement, normaliseMeasurement } from '../domain/measurement.ts';
import type {
  IngestDependencies,
  IngestRun,
  IngestState,
  MeasurementFilter,
  RejectedRow,
  SourceRow,
} from './ports.ts';

export type MeasurementRunKind = 'backfill' | 'poll' | 'reconcile';

interface PageOutcome {
  readonly measurements: readonly Measurement[];
  readonly rejected: readonly RejectedRow[];
  readonly latestUpdateMs: number | null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function filterFor(
  kind: MeasurementRunKind,
  state: IngestState,
  overlapMs: number,
): MeasurementFilter {
  if (kind === 'poll' && state.feedPosition !== null) {
    return { by: 'updated', since: new Date(state.feedPosition.getTime() - overlapMs) };
  }

  return { by: 'all' };
}

function laterOf(left: number | null, right: number | null): number | null {
  if (left === null || right === null) {
    return left ?? right;
  }

  return Math.max(left, right);
}

function readPage(rows: readonly SourceRow[], now: Date): PageOutcome {
  const measurements: Measurement[] = [];
  const rejected: RejectedRow[] = [];
  let latestUpdateMs: number | null = null;

  for (const row of rows) {
    if (!row.ok) {
      rejected.push({ payload: row.payload, reason: 'schema' });
      continue;
    }

    const normalised = normaliseMeasurement(row.raw, now);

    if (normalised.ok) {
      measurements.push(normalised.measurement);
    } else {
      rejected.push({ payload: row.payload, reason: normalised.reason });
    }

    // A row that is rejected as in the future must come again with the next poll.
    if (normalised.ok || normalised.reason !== 'in_future') {
      latestUpdateMs = laterOf(latestUpdateMs, row.raw.updatedAt.getTime());
    }
  }

  return { measurements, rejected, latestUpdateMs };
}

export async function ingestMeasurements(
  deps: IngestDependencies,
  kind: MeasurementRunKind,
  state: IngestState,
): Promise<IngestRun> {
  const startedAt = deps.clock.now();
  const filter = filterFor(kind, state, deps.settings.feedOverlapMs);
  const counts = { rowsReceived: 0, rowsNew: 0, rowsCorrected: 0, rowsRejected: 0 };
  let latestUpdateMs = state.feedPosition?.getTime() ?? null;

  try {
    for await (const rows of deps.source.measurementPages(filter)) {
      const page = readPage(rows, startedAt);
      const saved = await deps.store.saveMeasurements(page.measurements, startedAt);
      const newlyRejected = await deps.store.saveRejectedRows(page.rejected, startedAt);

      counts.rowsReceived += rows.length;
      counts.rowsNew += saved.inserted;
      counts.rowsCorrected += saved.corrected;
      counts.rowsRejected += newlyRejected;
      latestUpdateMs = laterOf(latestUpdateMs, page.latestUpdateMs);
    }

    await deps.store.saveIngestState({
      ...(latestUpdateMs === null
        ? {}
        : { feedPosition: new Date(Math.min(latestUpdateMs, startedAt.getTime())) }),
      lastPollSuccessAt: startedAt,
      ...(kind === 'poll' ? {} : { lastReconcileAt: startedAt }),
    });

    return {
      kind,
      startedAt,
      finishedAt: deps.clock.now(),
      outcome: 'ok',
      errorMessage: null,
      ...counts,
    };
  } catch (error) {
    deps.logger.warn({ kind, error: describeError(error) }, 'measurement ingest failed');

    return {
      kind,
      startedAt,
      finishedAt: deps.clock.now(),
      outcome: 'failed',
      errorMessage: describeError(error),
      ...counts,
    };
  }
}

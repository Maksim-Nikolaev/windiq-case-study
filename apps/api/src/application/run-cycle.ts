import { ingestMeasurements } from './ingest-measurements.ts';
import type { CycleReport, IngestDependencies, IngestRun, IngestState } from './ports.ts';
import { recomputeYield } from './recompute-yield.ts';
import { syncMasterData } from './sync-master-data.ts';

const RECONCILE_RETRY_MS = 60 * 60_000;

function isDue(lastRunAt: Date | null, intervalMs: number, now: Date): boolean {
  return lastRunAt === null || now.getTime() - lastRunAt.getTime() >= intervalMs;
}

function isReconcileDue(state: IngestState, reconcileIntervalMs: number, now: Date): boolean {
  return (
    isDue(state.lastReconcileAt, reconcileIntervalMs, now) &&
    isDue(state.lastReconcileAttemptAt, RECONCILE_RETRY_MS, now)
  );
}

async function measurementRuns(
  deps: IngestDependencies,
  state: IngestState,
  now: Date,
): Promise<IngestRun[]> {
  if (state.feedPosition === null) {
    return [await ingestMeasurements(deps, 'backfill', state)];
  }

  const poll = await ingestMeasurements(deps, 'poll', state);

  if (!isReconcileDue(state, deps.settings.reconcileIntervalMs, now)) {
    return [poll];
  }

  await deps.store.saveIngestState({ lastReconcileAttemptAt: now });

  return [poll, await ingestMeasurements(deps, 'reconcile', await deps.store.ingestState())];
}

export async function runCycle(deps: IngestDependencies): Promise<CycleReport> {
  const now = deps.clock.now();
  const state = await deps.store.ingestState();
  const runs: IngestRun[] = [];

  if (isDue(state.lastMasterDataSyncAt, deps.settings.masterDataIntervalMs, now)) {
    runs.push(await syncMasterData(deps));
  }

  runs.push(...(await measurementRuns(deps, state, now)));

  for (const run of runs) {
    await deps.store.saveIngestRun(run);
  }

  const backfillFailed = runs.some((run) => run.kind === 'backfill' && run.outcome === 'failed');
  const dataChanged = !backfillFailed && (await recomputeYield(deps));
  const report: CycleReport = { finishedAt: deps.clock.now(), runs, dataChanged };

  if (dataChanged) {
    deps.events.publish({ type: 'data.changed' });
  }

  deps.events.publish({ type: 'cycle.finished', report });

  return report;
}

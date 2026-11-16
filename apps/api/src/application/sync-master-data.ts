import { MASTER_DATA_KINDS, type MasterDataKind } from '../domain/master-data.ts';
import type { IngestDependencies, IngestRun } from './ports.ts';

async function syncKind(
  deps: IngestDependencies,
  kind: MasterDataKind,
  now: Date,
): Promise<boolean> {
  const document = await deps.source.masterData(kind);
  const knownHash = await deps.store.latestMasterDataHash(kind);

  if (knownHash === document.contentHash) {
    return false;
  }

  await deps.store.saveMasterDataVersion(kind, document, now);

  if (!document.validation.accepted) {
    deps.logger.warn(
      { kind, reason: document.validation.reason },
      'master data rejected, previous version stays active',
    );
  }

  return document.validation.accepted;
}

export async function syncMasterData(deps: IngestDependencies): Promise<IngestRun> {
  const startedAt = deps.clock.now();
  const outcomes = await Promise.allSettled(
    MASTER_DATA_KINDS.map((kind) => syncKind(deps, kind, startedAt)),
  );
  const failures = outcomes.flatMap((outcome, index) =>
    outcome.status === 'rejected' ? [`${MASTER_DATA_KINDS[index]}: ${String(outcome.reason)}`] : [],
  );

  if (failures.length === 0) {
    await deps.store.saveIngestState({ lastMasterDataSyncAt: startedAt });
  } else {
    deps.logger.warn({ failures }, 'master data sync failed');
  }

  return {
    kind: 'master_data',
    startedAt,
    finishedAt: deps.clock.now(),
    outcome: failures.length === 0 ? 'ok' : 'failed',
    errorMessage: failures.length === 0 ? null : failures.join('; '),
    rowsReceived: MASTER_DATA_KINDS.length - failures.length,
    rowsNew: outcomes.filter((outcome) => outcome.status === 'fulfilled' && outcome.value).length,
    rowsCorrected: 0,
    rowsRejected: 0,
  };
}

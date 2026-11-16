import { isDeepStrictEqual } from 'node:util';
import { computeAnnualYield, yieldWindowEndingAt } from '../domain/annual-yield.ts';
import type { IngestDependencies, YieldRecord } from './ports.ts';

function isSameRecord(previous: YieldRecord, next: YieldRecord): boolean {
  return isDeepStrictEqual({ ...previous, computedAt: null }, { ...next, computedAt: null });
}

export async function recomputeYield(deps: IngestDependencies): Promise<boolean> {
  const [masterData, latestHour] = await Promise.all([
    deps.store.activeMasterData(),
    deps.store.latestMeasuredHour(),
  ]);

  if (masterData === null || latestHour === null) {
    return false;
  }

  const window = yieldWindowEndingAt(latestHour);
  const readings = await deps.store.validReadings(window);
  const record: YieldRecord = {
    computedAt: deps.clock.now(),
    window,
    mastVersionId: masterData.mast.versionId,
    turbineVersionId: masterData.turbine.versionId,
    siteVersionId: masterData.site.versionId,
    result: computeAnnualYield({
      readings,
      window,
      measurementHeightM: masterData.mast.record.measurementHeightM,
      turbine: masterData.turbine.record,
      site: masterData.site.record,
    }),
  };
  const previous = await deps.store.latestYieldRecord();

  if (previous !== null && isSameRecord(previous, record)) {
    return false;
  }

  await deps.store.saveYieldRecord(record);

  return true;
}

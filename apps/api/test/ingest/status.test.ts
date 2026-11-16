import { referenceSite } from '@windiq/fake-upstream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/infrastructure/event-bus.ts';
import { createMetrics } from '../../src/infrastructure/metrics.ts';
import { createReadModels } from '../../src/interface/read-models.ts';
import {
  createHarness,
  type Harness,
  hoursBefore,
  LATEST_HOUR,
  START,
  steadyHours,
} from '../support/harness.ts';

const STALE_AFTER_MS = 150 * 60_000;
const TEN_MINUTES_MS = 10 * 60_000;

let harness: Harness;

beforeEach(async () => {
  harness = await createHarness();
});

afterEach(async () => {
  await harness.close();
});

function readModels() {
  return createReadModels(harness.db, harness.store, {
    appVersion: 'test',
    startedAt: START,
    staleAfterMs: STALE_AFTER_MS,
  });
}

describe('status', () => {
  it('measures the data age from the latest valid hour', async () => {
    harness.upstream.measurements = steadyHours(24, 15).map((row, index) =>
      index >= 21 ? { ...row, wind_speed: null } : row,
    );

    await harness.cycle();
    const status = await readModels().status(START);

    expect(status.latestValidMeasurementAt).toBe(hoursBefore(LATEST_HOUR, 3).toISOString());
    expect(status.dataAgeMinutes).toBe(190);
    expect(status.dataFreshness).toBe('stale');
  });

  it('names the master data whose latest version is rejected', async () => {
    harness.upstream.measurements = steadyHours(24, 15);
    await harness.cycle();
    harness.upstream.site = { ...referenceSite, uncertainty: 5, version: 2 };
    harness.advance(TEN_MINUTES_MS);
    await harness.cycle();

    const status = await readModels().status(START);
    const metrics = await createMetrics(harness.store, createEventBus()).registry.metrics();

    expect(status.rejectedMasterData).toEqual(['site']);
    expect(metrics).toContain('windiq_master_data_rejected{kind="site"} 1');
    expect(metrics).toContain('windiq_master_data_rejected{kind="turbine"} 0');

    harness.upstream.site = { ...referenceSite, version: 3 };
    harness.advance(TEN_MINUTES_MS);
    await harness.cycle();

    expect((await readModels().status(START)).rejectedMasterData).toEqual([]);
  });
});

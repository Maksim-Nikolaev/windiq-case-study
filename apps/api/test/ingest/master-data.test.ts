import { referenceSite, referenceTurbine } from '@windiq/fake-upstream';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SiteRecord } from '../../src/domain/master-data.ts';
import { masterDataVersions } from '../../src/infrastructure/db/schema.ts';
import { createHarness, type Harness, START, steadyHours } from '../support/harness.ts';

const TEN_MINUTES_MS = 10 * 60_000;

let harness: Harness;

beforeEach(async () => {
  harness = await createHarness();
  harness.upstream.measurements = steadyHours(100, 15);
  await harness.cycle();
  harness.events.length = 0;
});

afterEach(async () => {
  await harness.close();
});

async function siteVersions() {
  return harness.db
    .select({ accepted: masterDataVersions.accepted, version: masterDataVersions.upstreamVersion })
    .from(masterDataVersions)
    .where(eq(masterDataVersions.kind, 'site'))
    .orderBy(asc(masterDataVersions.id));
}

describe('master data', () => {
  it('does not add a version when the data did not change', async () => {
    harness.advance(TEN_MINUTES_MS);

    const report = await harness.cycle();

    expect(report.runs[0]).toMatchObject({ kind: 'master_data', outcome: 'ok', rowsNew: 0 });
    expect(await siteVersions()).toHaveLength(1);
  });

  it('calculates again with a new site version', async () => {
    const before = await harness.store.latestYieldRecord();
    harness.upstream.site = {
      ...referenceSite,
      losses: { availability: 0.03, electrical: 0.02, wake: 0.1 },
      uncertainty: 0.15,
      version: 2,
    };
    harness.advance(TEN_MINUTES_MS);

    const report = await harness.cycle();
    const after = await harness.store.latestYieldRecord();

    expect(report.dataChanged).toBe(true);
    expect(after?.siteVersionId).not.toBe(before?.siteVersionId);
    const grossMwh = after?.result.grossMwh ?? 0;

    expect(after?.result.measuredGrossMwh).toBeCloseTo(360, 6);
    expect(after?.result.netMwh).toBeCloseTo(grossMwh * 0.97 * 0.98 * 0.9, 6);
    expect(after?.result.p90Mwh).toBeCloseTo(grossMwh * 0.97 * 0.98 * 0.9 * (1 - 1.282 * 0.15), 6);
  });

  it('calculates again with a new power curve', async () => {
    harness.upstream.turbine = {
      ...referenceTurbine,
      power_curve: referenceTurbine.power_curve.map((point) => ({
        ...point,
        power_kw: point.power_kw / 2,
      })),
      version: 2,
    };
    harness.advance(TEN_MINUTES_MS);

    await harness.cycle();

    expect((await harness.store.latestYieldRecord())?.result.measuredGrossMwh).toBeCloseTo(180, 6);
  });

  it('keeps the previous version active when the new data is not plausible', async () => {
    const before = await harness.store.latestYieldRecord();
    harness.upstream.site = {
      ...referenceSite,
      losses: { availability: 3, electrical: 2, wake: 5 },
      version: 2,
    };
    harness.advance(TEN_MINUTES_MS);

    const report = await harness.cycle();

    expect(report.dataChanged).toBe(false);
    expect(await siteVersions()).toEqual([
      { accepted: true, version: 1 },
      { accepted: false, version: null },
    ]);
    expect(await harness.store.latestYieldRecord()).toEqual(before);
  });

  it('uses master data from a source with another payload format', async () => {
    const site: SiteRecord = {
      kind: 'site',
      id: 'OTHER-SITE',
      name: 'Standort einer anderen Quelle',
      version: 7,
      updatedAt: '2026-11-01T00:00:00.000Z',
      shearExponent: 0.25,
      losses: { availability: 0.01, electrical: 0.01, wake: 0.02 },
      uncertainty: 0.08,
    };

    await harness.store.saveMasterDataVersion(
      'site',
      {
        payload: { format: 'other-source', alpha: 0.25 },
        contentHash: 'other-source',
        validation: { accepted: true, record: site },
      },
      START,
    );

    expect((await harness.store.activeMasterData())?.site.record).toEqual(site);
    expect(await siteVersions()).toContainEqual({ accepted: true, version: 7 });
  });

  it('does not check the master data again before the interval ends', async () => {
    harness.advance(60_000);

    const report = await harness.cycle();

    expect(report.runs.map((run) => run.kind)).toEqual(['poll']);
  });
});

import { hourlyMeasurement } from '@windiq/fake-upstream';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HOUR_MS } from '../../src/domain/measurement-hour.ts';
import {
  ingestRuns,
  measurementRevisions,
  measurements,
  rejectedRows,
  yieldResults,
} from '../../src/infrastructure/db/schema.ts';
import {
  createHarness,
  type Harness,
  hoursBefore,
  LATEST_HOUR,
  START,
  steadyHours,
} from '../support/harness.ts';

const MINUTE_MS = 60_000;
const RATED_SPEED_MS = 15;
const NET_FACTOR = 0.97 * 0.98 * 0.95;
const PUBLISH_DELAY_MS = 4 * MINUTE_MS;

function failure(status: number): Response {
  return new Response(JSON.stringify({ detail: 'injected fault' }), { status });
}

function isFullList(url: URL): boolean {
  return url.pathname === '/v1/measurements' && !url.searchParams.has('updated_since');
}

let harness: Harness;

beforeEach(async () => {
  harness = await createHarness();
});

afterEach(async () => {
  await harness.close();
});

async function latestYield() {
  const record = await harness.store.latestYieldRecord();

  if (record === null) {
    throw new Error('no yield record');
  }

  return record.result;
}

async function storedHour(hour: Date) {
  const [row] = await harness.db
    .select()
    .from(measurements)
    .where(eq(measurements.measuredAt, hour));

  return row;
}

describe('backfill', () => {
  it('loads all pages and calculates the yield from the stored hours', async () => {
    harness.upstream.measurements = steadyHours(1200, RATED_SPEED_MS);

    const report = await harness.cycle();
    const result = await latestYield();

    expect(report.runs.map((run) => [run.kind, run.outcome])).toEqual([
      ['master_data', 'ok'],
      ['backfill', 'ok'],
    ]);
    expect(report.runs[1]).toMatchObject({ rowsReceived: 1200, rowsNew: 1200, rowsRejected: 0 });
    expect(result.validHours).toBe(1200);
    expect(result.expectedHours).toBe(8760);
    expect(result.measuredGrossMwh).toBeCloseTo(1200 * 3.6, 6);
    expect(result.interpolatedHours + result.monthMeanHours).toBe(8760 - 1200);
    expect(result.grossMwh).toBeCloseTo(8760 * 3.6, 6);
    expect(result.netMwh).toBeCloseTo(8760 * 3.6 * NET_FACTOR, 6);
    expect(result.p90Mwh).toBeCloseTo(8760 * 3.6 * NET_FACTOR * 0.8718, 6);
    expect(harness.events.map((event) => event.type)).toEqual(['data.changed', 'cycle.finished']);
  });

  it('does not count a row twice when the same data arrives again', async () => {
    harness.upstream.measurements = steadyHours(700, RATED_SPEED_MS);

    await harness.cycle();
    harness.advance(MINUTE_MS);
    const second = await harness.cycle();

    expect(second.runs[0]).toMatchObject({ kind: 'poll', rowsNew: 0, rowsCorrected: 0 });
    expect(second.dataChanged).toBe(false);
    expect(await harness.db.$count(measurements)).toBe(700);
    expect(await harness.db.$count(yieldResults)).toBe(1);
  });

  it('reads the full list without a filter, as the specification describes', async () => {
    const urls: URL[] = [];
    harness.upstream.measurements = steadyHours(24, RATED_SPEED_MS);
    harness.respondWith((url) => {
      urls.push(url);

      return null;
    });

    await harness.cycle();
    const pages = urls.filter((url) => url.pathname === '/v1/measurements');

    expect(pages.map((url) => [...url.searchParams.keys()])).toEqual([['limit']]);
  });

  it('publishes no result before the backfill is complete', async () => {
    harness.upstream.measurements = steadyHours(1200, RATED_SPEED_MS);
    harness.respondWith((url) => (url.searchParams.has('cursor') ? failure(503) : null));

    const failed = await harness.cycle();

    expect(failed.runs.at(-1)).toMatchObject({ kind: 'backfill', outcome: 'failed' });
    expect(failed.dataChanged).toBe(false);
    expect(await harness.store.latestYieldRecord()).toBeNull();

    harness.respondWith(null);
    harness.advance(MINUTE_MS);
    const retry = await harness.cycle();

    expect(retry.runs.at(-1)).toMatchObject({ kind: 'backfill', outcome: 'ok', rowsNew: 700 });
    expect((await latestYield()).validHours).toBe(1200);
  });
});

describe('feed position', () => {
  it('moves past rows that the ingest rejects', async () => {
    harness.upstream.measurements = steadyHours(48, RATED_SPEED_MS).map((row) => ({
      ...row,
      timestamp: String(row.timestamp).replace('Z', ''),
    }));

    const backfill = await harness.cycle();
    harness.advance(MINUTE_MS);
    const poll = await harness.cycle();

    expect(backfill.runs.at(-1)).toMatchObject({ kind: 'backfill', rowsRejected: 48 });
    expect((await harness.store.ingestState()).feedPosition).toEqual(
      new Date(LATEST_HOUR.getTime() + PUBLISH_DELAY_MS),
    );
    expect(poll.runs.at(-1)).toMatchObject({ kind: 'poll', rowsReceived: 1 });
  });

  it('reads a row again that arrives late inside the overlap', async () => {
    const lateHour = hoursBefore(LATEST_HOUR, 3);
    harness.upstream.measurements = steadyHours(24, RATED_SPEED_MS).filter(
      (row) => row.timestamp !== hourlyMeasurement(lateHour, 0, 0).timestamp,
    );
    await harness.cycle();
    harness.upstream.measurements.push({
      ...hourlyMeasurement(lateHour, RATED_SPEED_MS, 240),
      updated_at: new Date(LATEST_HOUR.getTime() + PUBLISH_DELAY_MS - 5 * MINUTE_MS).toISOString(),
    });

    harness.advance(MINUTE_MS);
    const poll = await harness.cycle();

    expect(poll.runs.at(-1)).toMatchObject({ kind: 'poll', rowsNew: 1 });
  });

  it('does not move past the start of the run when the source clock is ahead', async () => {
    harness.upstream.measurements = steadyHours(24, RATED_SPEED_MS);
    harness.upstream.measurements.push({
      ...hourlyMeasurement(new Date(LATEST_HOUR.getTime() + HOUR_MS), RATED_SPEED_MS, 240),
      updated_at: new Date(LATEST_HOUR.getTime() + 3 * HOUR_MS).toISOString(),
    });

    await harness.cycle();

    expect((await harness.store.ingestState()).feedPosition).toEqual(START);
  });
});

describe('change feed', () => {
  beforeEach(async () => {
    harness.upstream.measurements = steadyHours(48, RATED_SPEED_MS);
    await harness.cycle();
    harness.events.length = 0;
  });

  it('adds a new hour and publishes the change', async () => {
    const nextHour = new Date(LATEST_HOUR.getTime() + HOUR_MS);
    harness.advance(HOUR_MS);
    harness.upstream.measurements.push(hourlyMeasurement(nextHour, RATED_SPEED_MS, 200));

    const report = await harness.cycle();
    const record = await harness.store.latestYieldRecord();

    expect(report.runs.at(-1)).toMatchObject({ kind: 'poll', rowsNew: 1 });
    expect(record?.window.end).toEqual(nextHour);
    expect(record?.result.validHours).toBe(49);
    expect(harness.events.map((event) => event.type)).toEqual(['data.changed', 'cycle.finished']);
  });

  it('applies a corrected version of an old hour and keeps the history', async () => {
    const correctedHour = hoursBefore(LATEST_HOUR, 30);
    const before = await latestYield();
    harness.advance(MINUTE_MS);
    harness.upstream.measurements.push({
      ...hourlyMeasurement(correctedHour, 0, 240),
      version: 2,
      updated_at: harness.upstream.now().toISOString(),
    });

    const report = await harness.cycle();
    const after = await latestYield();
    const history = await harness.db
      .select({ version: measurementRevisions.version })
      .from(measurementRevisions)
      .where(eq(measurementRevisions.measuredAt, correctedHour))
      .orderBy(asc(measurementRevisions.version));

    expect(report.runs.at(-1)).toMatchObject({ rowsNew: 0, rowsCorrected: 1 });
    expect((await storedHour(correctedHour))?.version).toBe(2);
    expect(history).toEqual([{ version: 1 }, { version: 2 }]);
    expect(after.measuredGrossMwh).toBeCloseTo(before.measuredGrossMwh - 3.6, 6);
  });

  it('stores a new result when a correction changes only the mean wind speed', async () => {
    const before = await latestYield();
    harness.advance(MINUTE_MS);
    harness.upstream.measurements.push({
      ...hourlyMeasurement(hoursBefore(LATEST_HOUR, 5), RATED_SPEED_MS + 1, 240),
      version: 2,
      updated_at: harness.upstream.now().toISOString(),
    });

    const report = await harness.cycle();
    const after = await latestYield();

    expect(report.dataChanged).toBe(true);
    expect(after.grossMwh).toBe(before.grossMwh);
    expect(after.meanHubWindSpeedMs).toBeGreaterThan(before.meanHubWindSpeedMs);
  });

  it('ignores an older version that arrives late', async () => {
    const hour = hoursBefore(LATEST_HOUR, 5);
    harness.advance(MINUTE_MS);
    harness.upstream.measurements.push({
      ...hourlyMeasurement(hour, 1, 240),
      version: 0,
      updated_at: harness.upstream.now().toISOString(),
    });

    const report = await harness.cycle();

    expect(report.runs.at(-1)).toMatchObject({ rowsNew: 0, rowsCorrected: 0 });
    expect((await storedHour(hour))?.windSpeedMs).toBe(RATED_SPEED_MS);
  });
});

describe('data quality', () => {
  it('normalises strings, units and offsets, and marks unusable values', async () => {
    const base = hourlyMeasurement(LATEST_HOUR, RATED_SPEED_MS, 240);
    const at = (hoursBack: number) => hoursBefore(LATEST_HOUR, hoursBack);
    harness.upstream.measurements = [
      { ...base, timestamp: at(6).toISOString(), wind_speed: '15.0' },
      { ...base, timestamp: at(5).toISOString(), wind_speed: '15,0' },
      { ...base, timestamp: at(4).toISOString(), wind_speed: 54, unit: 'km/h' },
      { ...base, timestamp: '2026-11-16T10:00:00+01:00', wind_speed: 15 },
      { ...base, timestamp: at(2).toISOString(), wind_speed: null },
      { ...base, timestamp: at(1).toISOString(), wind_speed: 'n/a' },
      { ...base, timestamp: at(0).toISOString(), wind_speed: 999 },
    ];

    await harness.cycle();
    const rows = await harness.db.select().from(measurements).orderBy(asc(measurements.measuredAt));
    const result = await latestYield();

    expect(rows.map((row) => [row.status, row.windSpeedMs, row.rejectReason])).toEqual([
      ['valid', 15, null],
      ['valid', 15, null],
      ['valid', 15, null],
      ['valid', 15, null],
      ['missing', null, null],
      ['invalid', null, 'not_numeric'],
      ['invalid', null, 'implausible'],
    ]);
    expect(rows[3]?.measuredAt).toEqual(at(3));
    expect(result.validHours).toBe(4);
    expect(result.measuredGrossMwh).toBeCloseTo(4 * 3.6, 6);
  });

  it('counts a rejected row one time when the poll reads it again', async () => {
    harness.upstream.measurements = steadyHours(24, RATED_SPEED_MS);
    await harness.cycle();
    harness.advance(MINUTE_MS);
    harness.upstream.measurements.push({
      ...hourlyMeasurement(new Date(LATEST_HOUR.getTime() + HOUR_MS), RATED_SPEED_MS, 240),
      timestamp: '2026-11-16T13:00:00',
      updated_at: harness.upstream.now().toISOString(),
    });
    let rejected = 0;

    for (let poll = 0; poll < 5; poll += 1) {
      rejected += (await harness.cycle()).runs.at(-1)?.rowsRejected ?? 0;
      harness.advance(MINUTE_MS);
    }

    expect(rejected).toBe(1);
  });

  it('keeps one value when two offsets describe the same hour', async () => {
    const base = hourlyMeasurement(LATEST_HOUR, RATED_SPEED_MS, 240);
    harness.upstream.measurements = [
      base,
      { ...base, timestamp: '2026-11-16T13:00:00+01:00' },
      { ...base, timestamp: '2026-11-16T07:00:00-05:00' },
    ];

    await harness.cycle();

    expect(await harness.db.$count(measurements)).toBe(1);
  });

  it('stores unreadable rows with a reason and continues with the other rows', async () => {
    const good = hourlyMeasurement(LATEST_HOUR, RATED_SPEED_MS, 240);
    harness.upstream.measurements = [
      good,
      { ...good, timestamp: '2026-11-16T09:00:00' },
      { ...good, timestamp: '2026-11-16T09:30:00Z' },
      { ...good, timestamp: '2099-01-01T00:00:00Z' },
      { ...good, timestamp: 'yesterday' },
      { ...good, timestamp: hoursBefore(LATEST_HOUR, 1).toISOString(), version: 'two' },
      { ...good, timestamp: hoursBefore(LATEST_HOUR, 2).toISOString(), updated_at: null },
    ];

    const report = await harness.cycle();
    const reasons = await harness.db
      .select({ reason: rejectedRows.reason })
      .from(rejectedRows)
      .orderBy(asc(rejectedRows.reason));

    expect(report.runs.at(-1)).toMatchObject({ outcome: 'ok', rowsNew: 1, rowsRejected: 6 });
    expect(reasons.map((row) => row.reason)).toEqual([
      'in_future',
      'missing_offset',
      'not_on_hour',
      'schema',
      'schema',
      'unparseable',
    ]);
    expect((await harness.store.latestYieldRecord())?.window.end).toEqual(LATEST_HOUR);
  });
});

describe('upstream faults', () => {
  beforeEach(async () => {
    harness.upstream.measurements = steadyHours(24, RATED_SPEED_MS);
    await harness.cycle();
    harness.advance(HOUR_MS);
    harness.upstream.measurements.push(
      hourlyMeasurement(new Date(LATEST_HOUR.getTime() + HOUR_MS), RATED_SPEED_MS, 240),
    );
  });

  it('retries a short failure inside the same run', async () => {
    harness.upstream.failure = {
      status: 500,
      remaining: 2,
      retryAfterSeconds: null,
      pathPrefix: '/v1/measurements',
    };

    const report = await harness.cycle();

    expect(report.runs.at(-1)).toMatchObject({ outcome: 'ok', rowsNew: 1 });
    expect(harness.sleeps).toHaveLength(2);
  });

  it('waits for the time that Retry-After requests', async () => {
    harness.upstream.failure = {
      status: 429,
      remaining: 1,
      retryAfterSeconds: 7,
      pathPrefix: '/v1/measurements',
    };

    const report = await harness.cycle();

    expect(report.runs.at(-1)?.outcome).toBe('ok');
    expect(harness.sleeps).toEqual([7000]);
  });

  it('keeps the stored result during an outage and fills the gap after it', async () => {
    const before = await latestYield();
    harness.upstream.failure = {
      status: 503,
      remaining: 1000,
      retryAfterSeconds: null,
      pathPrefix: '/',
    };

    const during = await harness.cycle();

    expect(during.runs.map((run) => run.outcome)).toEqual(['failed', 'failed']);
    expect(during.runs.at(-1)?.errorMessage).toContain('HTTP 503');
    expect(await latestYield()).toEqual(before);

    harness.upstream.failure = null;
    harness.advance(3 * HOUR_MS);
    harness.upstream.measurements.push(
      ...[2, 3, 4].map((offset) =>
        hourlyMeasurement(new Date(LATEST_HOUR.getTime() + offset * HOUR_MS), RATED_SPEED_MS, 240),
      ),
    );

    const after = await harness.cycle();

    expect(after.runs.at(-1)).toMatchObject({ outcome: 'ok', rowsNew: 4 });
    expect((await latestYield()).validHours).toBe(28);
  });

  it('gets a new token when the old token is rejected', async () => {
    await harness.cycle();
    harness.advance(MINUTE_MS);
    harness.upstream.tokens.clear();
    harness.upstream.requests.length = 0;

    const report = await harness.cycle();
    const statusesOf = (prefix: string) =>
      harness.upstream.requests
        .filter((request) => request.path.startsWith(prefix))
        .map((request) => request.status);

    expect(report.runs.at(-1)?.outcome).toBe('ok');
    expect(statusesOf('/v1/measurements')).toEqual([401, 200]);
    expect(statusesOf('/auth/token')).toEqual([200]);
  });

  it('asks for one token when three requests start together', async () => {
    harness.upstream.requests.length = 0;

    await harness.cycle();
    const tokenRequests = harness.upstream.requests.filter((request) =>
      request.path.startsWith('/auth/token'),
    );

    expect(tokenRequests).toHaveLength(1);
  });

  it('gets a new token before the old token expires', async () => {
    harness.advance(2 * HOUR_MS);

    const report = await harness.cycle();
    const unauthorised = harness.upstream.requests.filter((request) => request.status === 401);

    expect(report.runs.at(-1)?.outcome).toBe('ok');
    expect(unauthorised).toHaveLength(0);
  });

  it('records a failed run when the upstream does not answer in time', async () => {
    harness.upstream.delayMs = 1000;

    const report = await harness.cycle();

    expect(report.runs.at(-1)?.outcome).toBe('failed');
    expect(await harness.db.$count(ingestRuns, eq(ingestRuns.outcome, 'failed'))).toBeGreaterThan(
      0,
    );
  });

  it('stops when the cursor repeats', async () => {
    harness.upstream.repeatCursor = true;

    const report = await harness.cycle();

    expect(report.runs.at(-1)).toMatchObject({ outcome: 'failed' });
    expect(report.runs.at(-1)?.errorMessage).toContain('cursor repeats');
  });
});

describe('reconciliation', () => {
  it('finds an hour that the change feed did not deliver', async () => {
    harness.upstream.measurements = steadyHours(24, RATED_SPEED_MS).filter(
      (_, index) => index !== 10,
    );
    await harness.cycle();
    harness.upstream.measurements.push(
      hourlyMeasurement(hoursBefore(LATEST_HOUR, 13), RATED_SPEED_MS, 240),
    );

    harness.advance(MINUTE_MS);
    const poll = await harness.cycle();
    harness.advance(24 * HOUR_MS);
    const reconcile = await harness.cycle();

    expect(poll.runs.at(-1)).toMatchObject({ kind: 'poll', rowsNew: 0 });
    expect(reconcile.runs.at(-1)).toMatchObject({ kind: 'reconcile', rowsNew: 1 });
    expect((await latestYield()).validHours).toBe(24);
  });

  it('keeps the poll running while the reconciliation fails', async () => {
    const nextHour = new Date(LATEST_HOUR.getTime() + HOUR_MS);
    harness.upstream.measurements = steadyHours(24, RATED_SPEED_MS);
    await harness.cycle();
    harness.advance(24 * HOUR_MS);
    harness.upstream.measurements.push(hourlyMeasurement(nextHour, RATED_SPEED_MS, 240));
    harness.respondWith((url) => (isFullList(url) ? failure(429) : null));

    const report = await harness.cycle();

    expect(report.runs.map((run) => [run.kind, run.outcome])).toEqual([
      ['master_data', 'ok'],
      ['poll', 'ok'],
      ['reconcile', 'failed'],
    ]);
    expect(await harness.store.latestMeasuredHour()).toEqual(nextHour);
  });

  it('repeats a failed reconciliation after one hour, not in each cycle', async () => {
    harness.upstream.measurements = steadyHours(24, RATED_SPEED_MS);
    await harness.cycle();
    harness.advance(24 * HOUR_MS);
    harness.respondWith((url) => (isFullList(url) ? failure(429) : null));
    await harness.cycle();

    harness.advance(MINUTE_MS);
    const soon = await harness.cycle();
    harness.respondWith(null);
    harness.advance(HOUR_MS);
    const later = await harness.cycle();

    expect(soon.runs.map((run) => run.kind)).toEqual(['poll']);
    expect(later.runs.at(-1)).toMatchObject({ kind: 'reconcile', outcome: 'ok' });
  });
});

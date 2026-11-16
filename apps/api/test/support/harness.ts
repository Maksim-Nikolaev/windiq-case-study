import { createFakeUpstream, type FakeMeasurement, hourlyMeasurement } from '@windiq/fake-upstream';
import { sql } from 'drizzle-orm';
import type { AppEvent, IngestDependencies, Logger } from '../../src/application/ports.ts';
import { runCycle } from '../../src/application/run-cycle.ts';
import { HOUR_MS } from '../../src/domain/measurement-hour.ts';
import { connectDatabase } from '../../src/infrastructure/db/client.ts';
import { createStore } from '../../src/infrastructure/db/store.ts';
import { createWindIqClient } from '../../src/infrastructure/windiq/client.ts';
import { createWindIqSource } from '../../src/infrastructure/windiq/source.ts';
import { TEST_DATABASE_URL } from './test-database.ts';

export const START = new Date('2026-11-16T12:10:00Z');
export const LATEST_HOUR = new Date('2026-11-16T12:00:00Z');

const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

export function hoursBefore(hour: Date, count: number): Date {
  return new Date(hour.getTime() - count * HOUR_MS);
}

export function steadyHours(count: number, windSpeedMs: number): FakeMeasurement[] {
  return Array.from({ length: count }, (_, index) =>
    hourlyMeasurement(hoursBefore(LATEST_HOUR, count - 1 - index), windSpeedMs, 240),
  );
}

export type Responder = (url: URL) => Response | null;

export async function createHarness() {
  const connection = connectDatabase(TEST_DATABASE_URL);
  const clock = { current: START };
  const events: AppEvent[] = [];
  const sleeps: number[] = [];
  const intercept: { responder: Responder | null } = { responder: null };

  await connection.db.execute(
    sql`truncate measurements, measurement_revisions, rejected_rows, yield_results, master_data_versions, ingest_runs, ingest_state restart identity cascade`,
  );

  const upstream = createFakeUpstream({ now: () => clock.current });
  const client = createWindIqClient({
    baseUrl: 'http://upstream.test',
    clientId: upstream.state.clientId,
    clientSecret: upstream.state.clientSecret,
    fetch: async (input, init) =>
      intercept.responder?.(new URL(String(input))) ?? upstream.fetch(input, init),
    now: () => clock.current,
    sleep: async (durationMs) => {
      sleeps.push(durationMs);
    },
    observe: () => {},
    requestTimeoutMs: 200,
    maxAttempts: 3,
  });
  const store = createStore(connection.db);
  const deps: IngestDependencies = {
    source: createWindIqSource(client),
    store,
    events: { publish: (event) => events.push(event) },
    clock: { now: () => clock.current },
    logger: silentLogger,
    settings: {
      masterDataIntervalMs: 10 * 60_000,
      reconcileIntervalMs: 24 * HOUR_MS,
      feedOverlapMs: 10 * 60_000,
    },
  };

  return {
    db: connection.db,
    store,
    upstream: upstream.state,
    events,
    sleeps,
    cycle: () => runCycle(deps),
    advance(durationMs: number): void {
      clock.current = new Date(clock.current.getTime() + durationMs);
    },
    respondWith(responder: Responder | null): void {
      intercept.responder = responder;
    },
    close: () => connection.close(),
  };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

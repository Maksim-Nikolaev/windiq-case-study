import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import pino from 'pino';
import type { IngestDependencies } from './application/ports.ts';
import { runCycle } from './application/run-cycle.ts';
import { startScheduler } from './application/scheduler.ts';
import { loadConfig } from './config.ts';
import { connectDatabase } from './infrastructure/db/client.ts';
import { createStore } from './infrastructure/db/store.ts';
import { createEventBus } from './infrastructure/event-bus.ts';
import { createMetrics } from './infrastructure/metrics.ts';
import { createWindIqClient } from './infrastructure/windiq/client.ts';
import { createWindIqSource } from './infrastructure/windiq/source.ts';
import { createHttpApp } from './interface/http.ts';
import { createReadModels } from './interface/read-models.ts';

const FEED_OVERLAP_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

const config = loadConfig(process.env);
const logger = pino({
  level: config.logLevel,
  base: { service: 'windiq-api', version: config.appVersion },
});
const startedAt = new Date();
const database = connectDatabase(config.databaseUrl);
const store = createStore(database.db);
const bus = createEventBus();
const metrics = createMetrics(store, bus);

const client = createWindIqClient({
  ...config.windIq,
  fetch,
  now: () => new Date(),
  sleep: (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)),
  observe: metrics.observeUpstream,
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  maxAttempts: MAX_ATTEMPTS,
});
const ingest: IngestDependencies = {
  source: createWindIqSource(client),
  store,
  events: bus,
  clock: { now: () => new Date() },
  logger,
  settings: {
    masterDataIntervalMs: config.masterDataIntervalMs,
    reconcileIntervalMs: config.reconcileIntervalMs,
    feedOverlapMs: FEED_OVERLAP_MS,
  },
};

bus.subscribe((event) => {
  if (event.type !== 'cycle.finished') {
    return;
  }

  const failed = event.report.runs.filter((run) => run.outcome === 'failed');
  logger.info(
    {
      runs: event.report.runs.map((run) => `${run.kind}:${run.outcome}`),
      dataChanged: event.report.dataChanged,
    },
    'cycle finished',
  );

  if (failed.length === 0 && config.heartbeatPushUrl !== null) {
    fetch(config.heartbeatPushUrl, { signal: AbortSignal.timeout(10_000) }).catch((error) => {
      logger.warn({ error: String(error) }, 'heartbeat push failed');
    });
  }
});

const app = createHttpApp({
  readModels: createReadModels(database.db, store, {
    appVersion: config.appVersion,
    startedAt,
    staleAfterMs: config.staleAfterMs,
  }),
  bus,
  now: () => new Date(),
  onSseClients: (change) => metrics.sseClients.inc(change),
});
const metricsApp = new Hono().get('/metrics', async (context) =>
  context.text(await metrics.registry.metrics(), 200, {
    'content-type': metrics.registry.contentType,
  }),
);

const server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' });
const metricsServer = serve({
  fetch: metricsApp.fetch,
  port: config.metricsPort,
  hostname: '0.0.0.0',
});
const scheduler = startScheduler(() => runCycle(ingest), config.pollIntervalMs, logger);

logger.info({ port: config.port, metricsPort: config.metricsPort }, 'windiq api started');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutdown');
  server.close();
  metricsServer.close();
  await scheduler.stop();
  await database.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

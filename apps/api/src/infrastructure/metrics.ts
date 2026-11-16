import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';
import type { AppEvent, Store } from '../application/ports.ts';
import { MASTER_DATA_KINDS } from '../domain/master-data.ts';
import type { EventBus } from './event-bus.ts';
import type { UpstreamObservation } from './windiq/client.ts';

export interface Metrics {
  readonly registry: Registry;
  observeUpstream(observation: UpstreamObservation): void;
  sseClients: Gauge;
}

export function createMetrics(store: Store, bus: EventBus): Metrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const upstreamRequests = new Counter({
    name: 'windiq_upstream_requests_total',
    help: 'Requests to the WindIQ measurement API',
    labelNames: ['path', 'status'],
    registers: [registry],
  });
  const upstreamDuration = new Histogram({
    name: 'windiq_upstream_request_duration_seconds',
    help: 'Duration of requests to the WindIQ measurement API',
    labelNames: ['path'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });
  const ingestRuns = new Counter({
    name: 'windiq_ingest_runs_total',
    help: 'Ingest runs by kind and outcome',
    labelNames: ['kind', 'outcome'],
    registers: [registry],
  });
  const measurementRows = new Counter({
    name: 'windiq_measurement_rows_total',
    help: 'Measurement rows by change type',
    labelNames: ['change'],
    registers: [registry],
  });
  const sseClients = new Gauge({
    name: 'windiq_sse_clients',
    help: 'Open server-sent event connections',
    registers: [registry],
  });

  new Gauge({
    name: 'windiq_latest_valid_measurement_timestamp_seconds',
    help: 'Start of the latest stored measurement hour with a valid wind speed',
    registers: [registry],
    async collect() {
      const latest = await store.latestValidHour();
      this.set(latest === null ? 0 : latest.getTime() / 1000);
    },
  });
  new Gauge({
    name: 'windiq_master_data_rejected',
    help: '1 when the latest fetched version of the master data is rejected',
    labelNames: ['kind'],
    registers: [registry],
    async collect() {
      const rejected = await store.rejectedMasterData();

      for (const kind of MASTER_DATA_KINDS) {
        this.set({ kind }, rejected.includes(kind) ? 1 : 0);
      }
    },
  });
  new Gauge({
    name: 'windiq_last_successful_poll_timestamp_seconds',
    help: 'Time of the last successful measurement ingest',
    registers: [registry],
    async collect() {
      const state = await store.ingestState();
      this.set(state.lastPollSuccessAt === null ? 0 : state.lastPollSuccessAt.getTime() / 1000);
    },
  });
  new Gauge({
    name: 'windiq_yield_mwh',
    help: 'Latest annual energy production',
    labelNames: ['quantity'],
    registers: [registry],
    async collect() {
      const record = await store.latestYieldRecord();

      if (record !== null) {
        this.set({ quantity: 'gross' }, record.result.grossMwh);
        this.set({ quantity: 'p50' }, record.result.p50Mwh);
        this.set({ quantity: 'p90' }, record.result.p90Mwh);
      }
    },
  });

  bus.subscribe((event: AppEvent) => {
    if (event.type !== 'cycle.finished') {
      return;
    }

    for (const run of event.report.runs) {
      ingestRuns.inc({ kind: run.kind, outcome: run.outcome });

      if (run.kind !== 'master_data') {
        measurementRows.inc({ change: 'new' }, run.rowsNew);
        measurementRows.inc({ change: 'corrected' }, run.rowsCorrected);
        measurementRows.inc({ change: 'rejected' }, run.rowsRejected);
      }
    }
  });

  return {
    registry,
    sseClients,
    observeUpstream(observation: UpstreamObservation): void {
      upstreamRequests.inc({ path: observation.path, status: observation.status ?? 'error' });
      upstreamDuration.observe({ path: observation.path }, observation.durationMs / 1000);
    },
  };
}

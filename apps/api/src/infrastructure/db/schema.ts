import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { INGEST_RUN_KINDS, INGEST_RUN_OUTCOMES } from '../../application/ports.ts';
import { MASTER_DATA_KINDS, type MasterDataRecord } from '../../domain/master-data.ts';
import { READING_STATUSES } from '../../domain/wind-speed.ts';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const measurementStatus = pgEnum('measurement_status', READING_STATUSES);
export const masterDataKind = pgEnum('master_data_kind', MASTER_DATA_KINDS);
export const ingestRunKind = pgEnum('ingest_run_kind', INGEST_RUN_KINDS);
export const ingestRunOutcome = pgEnum('ingest_run_outcome', INGEST_RUN_OUTCOMES);

export const measurements = pgTable(
  'measurements',
  {
    measuredAt: instant('measured_at').primaryKey(),
    rawValue: text('raw_value'),
    rawUnit: text('raw_unit').notNull(),
    windSpeedMs: doublePrecision('wind_speed_ms'),
    windDirectionDeg: integer('wind_direction_deg'),
    status: measurementStatus('status').notNull(),
    rejectReason: text('reject_reason'),
    version: integer('version').notNull(),
    upstreamUpdatedAt: instant('upstream_updated_at').notNull(),
    fetchedAt: instant('fetched_at').notNull(),
  },
  (table) => [index('measurements_status_idx').on(table.status, table.measuredAt)],
);

export const measurementRevisions = pgTable(
  'measurement_revisions',
  {
    measuredAt: instant('measured_at').notNull(),
    version: integer('version').notNull(),
    upstreamUpdatedAt: instant('upstream_updated_at').notNull(),
    rawValue: text('raw_value'),
    rawUnit: text('raw_unit').notNull(),
    windSpeedMs: doublePrecision('wind_speed_ms'),
    status: measurementStatus('status').notNull(),
    rejectReason: text('reject_reason'),
    fetchedAt: instant('fetched_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.measuredAt, table.version, table.upstreamUpdatedAt] })],
);

export const rejectedRows = pgTable('rejected_rows', {
  payloadHash: text('payload_hash').primaryKey(),
  payload: jsonb('payload').notNull(),
  reason: text('reason').notNull(),
  firstSeenAt: instant('first_seen_at').notNull(),
  lastSeenAt: instant('last_seen_at').notNull(),
});

export const masterDataVersions = pgTable(
  'master_data_versions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    kind: masterDataKind('kind').notNull(),
    contentHash: text('content_hash').notNull(),
    payload: jsonb('payload').notNull(),
    record: jsonb('record').$type<MasterDataRecord>(),
    accepted: boolean('accepted').notNull(),
    rejectReason: text('reject_reason'),
    upstreamVersion: integer('upstream_version'),
    upstreamUpdatedAt: instant('upstream_updated_at'),
    fetchedAt: instant('fetched_at').notNull(),
  },
  (table) => [index('master_data_versions_kind_idx').on(table.kind, table.id)],
);

export const yieldResults = pgTable(
  'yield_results',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    computedAt: instant('computed_at').notNull(),
    windowStart: instant('window_start').notNull(),
    windowEnd: instant('window_end').notNull(),
    expectedHours: integer('expected_hours').notNull(),
    validHours: integer('valid_hours').notNull(),
    grossMwh: doublePrecision('gross_mwh').notNull(),
    netMwh: doublePrecision('net_mwh').notNull(),
    p50Mwh: doublePrecision('p50_mwh').notNull(),
    p90Mwh: doublePrecision('p90_mwh').notNull(),
    measuredGrossMwh: doublePrecision('measured_gross_mwh').notNull(),
    interpolatedHours: integer('interpolated_hours').notNull(),
    monthMeanHours: integer('month_mean_hours').notNull(),
    lossFactor: doublePrecision('loss_factor').notNull(),
    meanHubWindSpeedMs: doublePrecision('mean_hub_wind_speed_ms').notNull(),
    capacityFactor: doublePrecision('capacity_factor').notNull(),
    fullLoadHours: doublePrecision('full_load_hours').notNull(),
    mastVersionId: integer('mast_version_id')
      .notNull()
      .references(() => masterDataVersions.id),
    turbineVersionId: integer('turbine_version_id')
      .notNull()
      .references(() => masterDataVersions.id),
    siteVersionId: integer('site_version_id')
      .notNull()
      .references(() => masterDataVersions.id),
  },
  (table) => [index('yield_results_computed_at_idx').on(table.computedAt)],
);

export const ingestRuns = pgTable(
  'ingest_runs',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    kind: ingestRunKind('kind').notNull(),
    startedAt: instant('started_at').notNull(),
    finishedAt: instant('finished_at').notNull(),
    outcome: ingestRunOutcome('outcome').notNull(),
    errorMessage: text('error_message'),
    rowsReceived: integer('rows_received').notNull(),
    rowsNew: integer('rows_new').notNull(),
    rowsCorrected: integer('rows_corrected').notNull(),
    rowsRejected: integer('rows_rejected').notNull(),
  },
  (table) => [index('ingest_runs_started_at_idx').on(table.startedAt)],
);

export const ingestState = pgTable('ingest_state', {
  id: integer('id').primaryKey(),
  feedPosition: instant('feed_position'),
  lastPollSuccessAt: instant('last_poll_success_at'),
  lastReconcileAt: instant('last_reconcile_at'),
  lastReconcileAttemptAt: instant('last_reconcile_attempt_at'),
  lastMasterDataSyncAt: instant('last_master_data_sync_at'),
});

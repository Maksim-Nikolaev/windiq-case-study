import type { AnnualYield, HourlyWindSpeed, YieldWindow } from '../domain/annual-yield.ts';
import type {
  MasterDataKind,
  MasterDataRecord,
  MastRecord,
  SiteRecord,
  TurbineRecord,
} from '../domain/master-data.ts';
import type { Measurement, RawMeasurement } from '../domain/measurement.ts';

export const INGEST_RUN_KINDS: readonly ['backfill', 'poll', 'reconcile', 'master_data'] = [
  'backfill',
  'poll',
  'reconcile',
  'master_data',
];
export const INGEST_RUN_OUTCOMES: readonly ['ok', 'failed'] = ['ok', 'failed'];

export type IngestRunKind = (typeof INGEST_RUN_KINDS)[number];
export type IngestRunOutcome = (typeof INGEST_RUN_OUTCOMES)[number];

export interface ParsedSourceRow {
  readonly ok: true;
  readonly raw: RawMeasurement;
  readonly payload: unknown;
}

export interface UnreadableSourceRow {
  readonly ok: false;
  readonly payload: unknown;
}

export type SourceRow = ParsedSourceRow | UnreadableSourceRow;

export interface AllMeasurements {
  readonly by: 'all';
}

export interface UpdatedSince {
  readonly by: 'updated';
  readonly since: Date;
}

export type MeasurementFilter = AllMeasurements | UpdatedSince;

export interface AcceptedDocument {
  readonly accepted: true;
  readonly record: MasterDataRecord;
}

export interface RejectedDocument {
  readonly accepted: false;
  readonly reason: string;
}

export interface SourceDocument {
  readonly payload: unknown;
  readonly contentHash: string;
  readonly validation: AcceptedDocument | RejectedDocument;
}

export interface MeasurementSource {
  masterData(kind: MasterDataKind): Promise<SourceDocument>;
  measurementPages(filter: MeasurementFilter): AsyncIterable<readonly SourceRow[]>;
}

export interface IngestState {
  readonly feedPosition: Date | null;
  readonly lastPollSuccessAt: Date | null;
  readonly lastReconcileAt: Date | null;
  readonly lastReconcileAttemptAt: Date | null;
  readonly lastMasterDataSyncAt: Date | null;
}

export interface UpsertCounts {
  readonly inserted: number;
  readonly corrected: number;
}

export interface RejectedRow {
  readonly payload: unknown;
  readonly reason: string;
}

export interface IngestRun {
  readonly kind: IngestRunKind;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly outcome: IngestRunOutcome;
  readonly errorMessage: string | null;
  readonly rowsReceived: number;
  readonly rowsNew: number;
  readonly rowsCorrected: number;
  readonly rowsRejected: number;
}

export interface ActiveVersion<Data extends MasterDataRecord> {
  readonly versionId: number;
  readonly record: Data;
}

export interface ActiveMasterData {
  readonly mast: ActiveVersion<MastRecord>;
  readonly turbine: ActiveVersion<TurbineRecord>;
  readonly site: ActiveVersion<SiteRecord>;
}

export interface MasterDataVersionIds {
  readonly mastVersionId: number;
  readonly turbineVersionId: number;
  readonly siteVersionId: number;
}

export interface YieldRecord extends MasterDataVersionIds {
  readonly computedAt: Date;
  readonly window: YieldWindow;
  readonly result: AnnualYield;
}

export interface Store {
  ingestState(): Promise<IngestState>;
  saveIngestState(patch: Partial<IngestState>): Promise<void>;
  saveMeasurements(measurements: readonly Measurement[], fetchedAt: Date): Promise<UpsertCounts>;
  saveRejectedRows(rows: readonly RejectedRow[], seenAt: Date): Promise<number>;
  saveIngestRun(run: IngestRun): Promise<void>;
  latestMasterDataHash(kind: MasterDataKind): Promise<string | null>;
  saveMasterDataVersion(
    kind: MasterDataKind,
    document: SourceDocument,
    fetchedAt: Date,
  ): Promise<void>;
  activeMasterData(): Promise<ActiveMasterData | null>;
  latestMeasuredHour(): Promise<Date | null>;
  latestValidHour(): Promise<Date | null>;
  rejectedMasterData(): Promise<MasterDataKind[]>;
  validReadings(window: YieldWindow): Promise<HourlyWindSpeed[]>;
  latestYieldRecord(): Promise<YieldRecord | null>;
  saveYieldRecord(record: YieldRecord): Promise<void>;
}

export interface CycleReport {
  readonly finishedAt: Date;
  readonly runs: readonly IngestRun[];
  readonly dataChanged: boolean;
}

export interface DataChanged {
  readonly type: 'data.changed';
}

export interface CycleFinished {
  readonly type: 'cycle.finished';
  readonly report: CycleReport;
}

export type AppEvent = DataChanged | CycleFinished;

export interface EventPublisher {
  publish(event: AppEvent): void;
}

export interface Clock {
  now(): Date;
}

export interface Logger {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
  error(fields: object, message: string): void;
}

export interface IngestSettings {
  readonly masterDataIntervalMs: number;
  readonly reconcileIntervalMs: number;
  readonly feedOverlapMs: number;
}

export interface IngestDependencies {
  readonly source: MeasurementSource;
  readonly store: Store;
  readonly events: EventPublisher;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly settings: IngestSettings;
}

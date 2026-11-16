import { parseMeasurementHour, type TimestampRejectReason } from './measurement-hour.ts';
import { normaliseWindSpeed, type WindSpeedReading } from './wind-speed.ts';

export interface RawMeasurement {
  readonly timestamp: string;
  readonly windSpeed: number | string | null;
  readonly unit: string;
  readonly windDirectionDeg: number | null;
  readonly version: number;
  readonly updatedAt: Date;
}

export interface Measurement {
  readonly measuredAt: Date;
  readonly rawValue: string | null;
  readonly rawUnit: string;
  readonly reading: WindSpeedReading;
  readonly windDirectionDeg: number | null;
  readonly version: number;
  readonly upstreamUpdatedAt: Date;
}

export interface AcceptedMeasurement {
  readonly ok: true;
  readonly measurement: Measurement;
}

export interface RejectedMeasurement {
  readonly ok: false;
  readonly reason: TimestampRejectReason;
}

export type NormalisedMeasurement = AcceptedMeasurement | RejectedMeasurement;

export function normaliseMeasurement(raw: RawMeasurement, now: Date): NormalisedMeasurement {
  const hour = parseMeasurementHour(raw.timestamp, now);

  if (!hour.ok) {
    return { ok: false, reason: hour.reason };
  }

  return {
    ok: true,
    measurement: {
      measuredAt: hour.hour,
      rawValue: raw.windSpeed === null ? null : String(raw.windSpeed),
      rawUnit: raw.unit,
      reading: normaliseWindSpeed({ value: raw.windSpeed, unit: raw.unit }),
      windDirectionDeg: raw.windDirectionDeg,
      version: raw.version,
      upstreamUpdatedAt: raw.updatedAt,
    },
  };
}

type Revision = Pick<Measurement, 'version' | 'upstreamUpdatedAt'>;

export function supersedes(candidate: Revision, current: Revision): boolean {
  if (candidate.version !== current.version) {
    return candidate.version > current.version;
  }

  return candidate.upstreamUpdatedAt > current.upstreamUpdatedAt;
}

export function latestRevisionPerHour(measurements: readonly Measurement[]): Measurement[] {
  const latest = new Map<number, Measurement>();

  for (const measurement of measurements) {
    const current = latest.get(measurement.measuredAt.getTime());

    if (current === undefined || supersedes(measurement, current)) {
      latest.set(measurement.measuredAt.getTime(), measurement);
    }
  }

  return [...latest.values()];
}

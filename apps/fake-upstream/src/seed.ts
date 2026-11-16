import type { FakeMeasurement } from './state.ts';

export const HOUR_MS = 3_600_000;
const PUBLISH_DELAY_MS = 4 * 60_000;
const MEAN_WIND_SPEED_MS = 6.6;

function mulberry32(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface SeedOptions {
  readonly lastHour: Date;
  readonly hours: number;
  readonly seed: number;
}

export function hourlyMeasurement(hour: Date, windSpeedMs: number, directionDeg: number) {
  return {
    timestamp: hour.toISOString().replace('.000Z', 'Z'),
    wind_speed: Math.round(windSpeedMs * 100) / 100,
    unit: 'm/s',
    wind_direction_deg: Math.round(directionDeg),
    version: 1,
    updated_at: new Date(hour.getTime() + PUBLISH_DELAY_MS).toISOString().replace('.000Z', 'Z'),
  } satisfies FakeMeasurement;
}

export function seedMeasurements(options: SeedOptions): FakeMeasurement[] {
  const random = mulberry32(options.seed);
  const firstHourMs = options.lastHour.getTime() - (options.hours - 1) * HOUR_MS;
  let speedMs = MEAN_WIND_SPEED_MS;
  let directionDeg = 240;

  return Array.from({ length: options.hours }, (_, index) => {
    const weibull = MEAN_WIND_SPEED_MS * 1.128 * Math.sqrt(-Math.log(1 - random()));
    speedMs = 0.92 * speedMs + 0.08 * weibull + (random() - 0.5) * 1.2;
    speedMs = Math.min(32, Math.max(0, speedMs));
    directionDeg = (directionDeg + (random() - 0.5) * 30 + 360) % 360;

    return hourlyMeasurement(new Date(firstHourMs + index * HOUR_MS), speedMs, directionDeg);
  });
}

import { HOUR_MS } from './measurement-hour.ts';
import { type PowerCurve, powerKwAt } from './power-curve.ts';

export const P90_Z_SCORE = 1.282;

const MAX_INTERPOLATED_GAP_HOURS = 3;

export interface HourlyWindSpeed {
  readonly measuredAt: Date;
  readonly windSpeedMs: number;
}

export interface Losses {
  readonly availability: number;
  readonly electrical: number;
  readonly wake: number;
}

export interface SiteParameters {
  readonly shearExponent: number;
  readonly losses: Losses;
  readonly uncertainty: number;
}

export interface TurbineParameters {
  readonly hubHeightM: number;
  readonly ratedPowerKw: number;
  readonly powerCurve: PowerCurve;
}

export interface YieldWindow {
  readonly start: Date;
  readonly end: Date;
}

export interface YieldInputs {
  readonly readings: readonly HourlyWindSpeed[];
  readonly window: YieldWindow;
  readonly measurementHeightM: number;
  readonly turbine: TurbineParameters;
  readonly site: SiteParameters;
}

export interface AnnualYield {
  readonly grossMwh: number;
  readonly netMwh: number;
  readonly p50Mwh: number;
  readonly p90Mwh: number;
  readonly lossFactor: number;
  readonly expectedHours: number;
  readonly validHours: number;
  readonly coverage: number;
  readonly measuredGrossMwh: number;
  readonly interpolatedHours: number;
  readonly monthMeanHours: number;
  readonly meanHubWindSpeedMs: number;
  readonly capacityFactor: number;
  readonly fullLoadHours: number;
}

export interface HubHeightInputs {
  readonly measuredMs: number;
  readonly measurementHeightM: number;
  readonly hubHeightM: number;
  readonly shearExponent: number;
}

export function hubWindSpeedMs(inputs: HubHeightInputs): number {
  return (
    inputs.measuredMs * (inputs.hubHeightM / inputs.measurementHeightM) ** inputs.shearExponent
  );
}

export function yieldWindowEndingAt(latestHour: Date): YieldWindow {
  const start = new Date(latestHour.getTime() + HOUR_MS);
  start.setUTCFullYear(start.getUTCFullYear() - 1);

  return { start, end: latestHour };
}

export function hoursInWindow(window: YieldWindow): number {
  return Math.round((window.end.getTime() - window.start.getTime()) / HOUR_MS) + 1;
}

function isInWindow(window: YieldWindow, measuredAt: Date): boolean {
  return measuredAt >= window.start && measuredAt <= window.end;
}

export function lossFactor(losses: Losses): number {
  return (1 - losses.availability) * (1 - losses.electrical) * (1 - losses.wake);
}

export function p90Mwh(p50: number, uncertainty: number): number {
  return p50 * (1 - P90_Z_SCORE * uncertainty);
}

export interface HourlyProduction {
  readonly hubWindSpeedMs: number;
  readonly powerKw: number;
}

type ProductionInputs = Pick<YieldInputs, 'measurementHeightM' | 'turbine' | 'site'>;

export function hourlyProduction(inputs: ProductionInputs, measuredMs: number): HourlyProduction {
  const hubMs = hubWindSpeedMs({
    measuredMs,
    measurementHeightM: inputs.measurementHeightM,
    hubHeightM: inputs.turbine.hubHeightM,
    shearExponent: inputs.site.shearExponent,
  });

  return { hubWindSpeedMs: hubMs, powerKw: powerKwAt(inputs.turbine.powerCurve, hubMs) };
}

export type HourSource = 'measured' | 'interpolated' | 'monthMean';

export interface FilledHour {
  readonly measuredAt: Date;
  readonly source: HourSource;
  readonly powerKw: number;
  readonly hubWindSpeedMs: number | null;
}

export function monthOf(instant: Date): string {
  return instant.toISOString().slice(0, 7);
}

function sumOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function meanOf(values: readonly number[]): number {
  return values.length === 0 ? 0 : sumOf(values) / values.length;
}

export function energyMwh(hours: readonly FilledHour[]): number {
  return sumOf(hours.map((hour) => hour.powerKw)) / 1000;
}

function interpolateShortGaps(speedsMs: readonly (number | null)[]): (number | null)[] {
  const filled = [...speedsMs];
  let previous: { readonly index: number; readonly speedMs: number } | null = null;

  for (const [index, speedMs] of speedsMs.entries()) {
    if (speedMs === null) {
      continue;
    }

    const gap = previous === null ? 0 : index - previous.index - 1;

    if (previous !== null && gap > 0 && gap <= MAX_INTERPOLATED_GAP_HOURS) {
      for (let step = 1; step <= gap; step += 1) {
        filled[previous.index + step] =
          previous.speedMs + ((speedMs - previous.speedMs) * step) / (gap + 1);
      }
    }

    previous = { index, speedMs };
  }

  return filled;
}

export function fillHours(inputs: YieldInputs): FilledHour[] {
  const speedByHour = new Map(
    inputs.readings
      .filter((reading) => isInWindow(inputs.window, reading.measuredAt))
      .map((reading) => [reading.measuredAt.getTime(), reading.windSpeedMs]),
  );
  const times = Array.from(
    { length: hoursInWindow(inputs.window) },
    (_, index) => new Date(inputs.window.start.getTime() + index * HOUR_MS),
  );
  const speedsMs = interpolateShortGaps(
    times.map((time) => speedByHour.get(time.getTime()) ?? null),
  );
  const known = times.map((measuredAt, index): FilledHour | null => {
    const speedMs = speedsMs[index] ?? null;

    if (speedMs === null) {
      return null;
    }

    const source = speedByHour.has(measuredAt.getTime()) ? 'measured' : 'interpolated';

    return { measuredAt, source, ...hourlyProduction(inputs, speedMs) };
  });
  const measured = known.flatMap((hour) => (hour?.source === 'measured' ? [hour] : []));
  const windowMeanKw = meanOf(measured.map((hour) => hour.powerKw));
  const monthMeanKw = (month: string) => {
    const inMonth = measured.filter((hour) => monthOf(hour.measuredAt) === month);

    return inMonth.length === 0 ? windowMeanKw : meanOf(inMonth.map((hour) => hour.powerKw));
  };
  const meanKwByMonth = new Map(
    [...new Set(times.map(monthOf))].map((month) => [month, monthMeanKw(month)]),
  );

  return times.map(
    (measuredAt, index) =>
      known[index] ?? {
        measuredAt,
        source: 'monthMean',
        powerKw: meanKwByMonth.get(monthOf(measuredAt)) ?? windowMeanKw,
        hubWindSpeedMs: null,
      },
  );
}

export function computeAnnualYield(inputs: YieldInputs): AnnualYield {
  const hours = fillHours(inputs);
  const measured = hours.filter((hour) => hour.source === 'measured');
  const countOf = (source: HourSource) => hours.filter((hour) => hour.source === source).length;

  const expectedHours = hours.length;
  const validHours = measured.length;
  const grossMwh = validHours === 0 ? 0 : energyMwh(hours);
  const factor = lossFactor(inputs.site.losses);
  const netMwh = grossMwh * factor;
  const fullLoadHours = (netMwh * 1000) / inputs.turbine.ratedPowerKw;

  return {
    grossMwh,
    netMwh,
    p50Mwh: netMwh,
    p90Mwh: p90Mwh(netMwh, inputs.site.uncertainty),
    lossFactor: factor,
    expectedHours,
    validHours,
    coverage: expectedHours === 0 ? 0 : validHours / expectedHours,
    measuredGrossMwh: energyMwh(measured),
    interpolatedHours: countOf('interpolated'),
    monthMeanHours: validHours === 0 ? 0 : countOf('monthMean'),
    meanHubWindSpeedMs: meanOf(measured.map((hour) => hour.hubWindSpeedMs ?? 0)),
    capacityFactor: expectedHours === 0 ? 0 : fullLoadHours / expectedHours,
    fullLoadHours,
  };
}

import { describe, expect, it } from 'vitest';
import {
  computeAnnualYield,
  fillHours,
  hourlyProduction,
  type YieldInputs,
  type YieldWindow,
} from '../../src/domain/annual-yield.ts';
import { HOUR_MS } from '../../src/domain/measurement-hour.ts';
import {
  REFERENCE_MEASUREMENT_HEIGHT_M,
  referenceSite,
  referenceTurbine,
} from '../support/reference-site.ts';

const RATED_KW = 3600;

function windowFrom(start: string, hours: number): YieldWindow {
  const startAt = new Date(start);

  return { start: startAt, end: new Date(startAt.getTime() + (hours - 1) * HOUR_MS) };
}

function inputsFor(window: YieldWindow, speedsMs: readonly (number | null)[]): YieldInputs {
  return {
    readings: speedsMs.flatMap((windSpeedMs, index) =>
      windSpeedMs === null
        ? []
        : [{ measuredAt: new Date(window.start.getTime() + index * HOUR_MS), windSpeedMs }],
    ),
    window,
    measurementHeightM: REFERENCE_MEASUREMENT_HEIGHT_M,
    turbine: referenceTurbine,
    site: referenceSite,
  };
}

const october = windowFrom('2026-10-01T00:00:00Z', 10);

describe('fillHours', () => {
  it('returns one hour for each hour of the window', () => {
    const hours = fillHours(inputsFor(october, [6, null, 9]));

    expect(hours).toHaveLength(10);
    expect(hours.map((hour) => hour.measuredAt.getTime() - october.start.getTime())).toEqual(
      Array.from({ length: 10 }, (_, index) => index * HOUR_MS),
    );
  });

  it('interpolates the wind speed linearly in a gap of up to 3 hours', () => {
    const inputs = inputsFor(october, [6, null, null, 9, null, null, null, 13, 13, 13]);
    const hours = fillHours(inputs);

    expect(hours.map((hour) => hour.source)).toEqual([
      'measured',
      'interpolated',
      'interpolated',
      'measured',
      'interpolated',
      'interpolated',
      'interpolated',
      'measured',
      'measured',
      'measured',
    ]);
    expect(hours[1]).toMatchObject(hourlyProduction(inputs, 7));
    expect(hours[2]).toMatchObject(hourlyProduction(inputs, 8));
    expect(hours[5]).toMatchObject(hourlyProduction(inputs, 11));
  });

  it('fills a longer gap with the mean energy of the measured hours of the month', () => {
    const inputs = inputsFor(october, [15, null, null, null, null, 2, 15, 2, 15, 2]);
    const hours = fillHours(inputs);
    const meanKw = (3 * RATED_KW) / 6;

    expect(hours.slice(1, 5).map((hour) => [hour.source, hour.powerKw])).toEqual(
      Array.from({ length: 4 }, () => ['monthMean', meanKw]),
    );
    expect(hours[1]?.hubWindSpeedMs).toBeNull();
  });

  it('fills a gap at the edge of the window with the month mean', () => {
    const hours = fillHours(inputsFor(october, [null, 15, 15, 15, 15, 15, 15, 15, 15, null]));

    expect([hours[0]?.source, hours[9]?.source]).toEqual(['monthMean', 'monthMean']);
    expect(hours[0]?.powerKw).toBe(RATED_KW);
  });

  it('uses the mean of the window for a month without a measured hour', () => {
    const acrossMonths = windowFrom('2026-09-30T20:00:00Z', 10);
    const hours = fillHours(
      inputsFor(acrossMonths, [null, null, null, null, 15, 2, 15, 2, 15, 15]),
    );

    expect(hours.slice(0, 4).map((hour) => hour.source)).toEqual(
      Array.from({ length: 4 }, () => 'monthMean'),
    );
    expect(hours[0]?.powerKw).toBe((4 * RATED_KW) / 6);
  });
});

describe('computeAnnualYield with gaps', () => {
  it('adds the filled hours to the gross energy and reports them', () => {
    const result = computeAnnualYield(
      inputsFor(october, [15, null, 15, 15, null, null, null, null, 15, 15]),
    );

    expect(result.validHours).toBe(5);
    expect(result.interpolatedHours).toBe(1);
    expect(result.monthMeanHours).toBe(4);
    expect(result.measuredGrossMwh).toBeCloseTo(5 * 3.6, 9);
    expect(result.grossMwh).toBeCloseTo(10 * 3.6, 9);
    expect(result.coverage).toBe(0.5);
  });

  it('fills nothing when every hour has a valid value', () => {
    const result = computeAnnualYield(
      inputsFor(
        october,
        Array.from({ length: 10 }, () => 15),
      ),
    );

    expect([result.interpolatedHours, result.monthMeanHours]).toEqual([0, 0]);
    expect(result.grossMwh).toBe(result.measuredGrossMwh);
  });
});

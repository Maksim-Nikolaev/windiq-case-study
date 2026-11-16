import { describe, expect, it } from 'vitest';
import {
  computeAnnualYield,
  hoursInWindow,
  hubWindSpeedMs,
  lossFactor,
  p90Mwh,
  type YieldInputs,
  type YieldWindow,
  yieldWindowEndingAt,
} from '../../src/domain/annual-yield.ts';
import { HOUR_MS } from '../../src/domain/measurement-hour.ts';
import {
  REFERENCE_MEASUREMENT_HEIGHT_M,
  referenceSite,
  referenceTurbine,
} from '../support/reference-site.ts';

const window = yieldWindowEndingAt(new Date('2026-10-20T09:00:00Z'));

function lastHours(hours: number): YieldWindow {
  return { start: new Date(window.end.getTime() - (hours - 1) * HOUR_MS), end: window.end };
}

function inputsFor(speedsMs: readonly number[], inWindow = window): YieldInputs {
  return {
    readings: speedsMs.map((windSpeedMs, index) => ({
      measuredAt: new Date(inWindow.end.getTime() - index * HOUR_MS),
      windSpeedMs,
    })),
    window: inWindow,
    measurementHeightM: REFERENCE_MEASUREMENT_HEIGHT_M,
    turbine: referenceTurbine,
    site: referenceSite,
  };
}

describe('hubWindSpeedMs', () => {
  it('scales 100 m to 140 m with the exponent 0.2', () => {
    const hubMs = hubWindSpeedMs({
      measuredMs: 6.42,
      measurementHeightM: 100,
      hubHeightM: 140,
      shearExponent: 0.2,
    });

    expect(hubMs).toBeCloseTo(6.866898612154942, 12);
  });

  it('returns the measured speed when the heights are equal', () => {
    expect(
      hubWindSpeedMs({
        measuredMs: 8,
        measurementHeightM: 120,
        hubHeightM: 120,
        shearExponent: 0.3,
      }),
    ).toBe(8);
  });
});

describe('yieldWindowEndingAt', () => {
  it('covers 8760 hours in a year without a leap day', () => {
    expect(window.start).toEqual(new Date('2025-10-20T10:00:00Z'));
    expect(hoursInWindow(window)).toBe(8760);
  });

  it('covers 8784 hours when the window contains 29 February', () => {
    expect(hoursInWindow(yieldWindowEndingAt(new Date('2028-06-01T00:00:00Z')))).toBe(8784);
  });
});

describe('loss and uncertainty formulas', () => {
  it('multiplies the three loss terms', () => {
    expect(lossFactor(referenceSite.losses)).toBeCloseTo(0.90307, 12);
  });

  it('derives P90 from P50 with the factor 1.282', () => {
    expect(p90Mwh(1000, 0.1)).toBeCloseTo(871.8, 9);
  });
});

describe('computeAnnualYield', () => {
  it('matches the hand calculation for the two example hours of the specification', () => {
    const result = computeAnnualYield(inputsFor([6.42, 6.87], lastHours(2)));

    expect(result.grossMwh * 1000).toBeCloseTo(2284.3533182899, 6);
    expect(result.netMwh * 1000).toBeCloseTo(2062.93095114806, 6);
    expect(result.p50Mwh).toBe(result.netMwh);
    expect(result.p90Mwh * 1000).toBeCloseTo(1798.4632032108789, 6);
  });

  it('gives rated energy for each hour at rated wind speed', () => {
    const result = computeAnnualYield(
      inputsFor(
        Array.from({ length: 100 }, () => 15),
        lastHours(100),
      ),
    );

    expect(result.grossMwh).toBeCloseTo(360, 9);
    expect(result.fullLoadHours).toBeCloseTo(100 * 0.90307, 9);
  });

  it('derives the full-load hours and the capacity factor from the same net energy', () => {
    const result = computeAnnualYield(inputsFor(Array.from({ length: 8760 }, () => 15)));

    expect(result.fullLoadHours).toBeCloseTo(8760 * 0.90307, 6);
    expect(result.capacityFactor).toBeCloseTo(0.90307, 12);
    expect(result.capacityFactor * result.expectedHours).toBeCloseTo(result.fullLoadHours, 6);
  });

  it('gives no energy below the cut-in speed and above the cut-out speed', () => {
    expect(computeAnnualYield(inputsFor([2.7, 24])).grossMwh).toBe(0);
  });

  it('ignores readings outside the window', () => {
    const inside = inputsFor([10]);
    const outside = {
      ...inside,
      readings: [
        ...inside.readings,
        { measuredAt: new Date(window.start.getTime() - HOUR_MS), windSpeedMs: 10 },
        { measuredAt: new Date(window.end.getTime() + HOUR_MS), windSpeedMs: 10 },
      ],
    };

    expect(computeAnnualYield(outside)).toEqual(computeAnnualYield(inside));
  });

  it('reports the coverage and the energy of the measured hours', () => {
    const result = computeAnnualYield(inputsFor(Array.from({ length: 4380 }, () => 15)));

    expect(result.expectedHours).toBe(8760);
    expect(result.validHours).toBe(4380);
    expect(result.coverage).toBe(0.5);
    expect(result.measuredGrossMwh).toBeCloseTo(4380 * 3.6, 6);
    expect(result.grossMwh).toBeCloseTo(8760 * 3.6, 6);
  });

  it('returns zeros for an empty window', () => {
    const result = computeAnnualYield(inputsFor([]));

    expect(result.grossMwh).toBe(0);
    expect(result.monthMeanHours).toBe(0);
    expect(result.p90Mwh).toBe(0);
    expect(result.coverage).toBe(0);
    expect(result.meanHubWindSpeedMs).toBe(0);
  });
});

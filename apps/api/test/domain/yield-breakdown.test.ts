import { describe, expect, it } from 'vitest';
import {
  computeAnnualYield,
  type YieldInputs,
  yieldWindowEndingAt,
} from '../../src/domain/annual-yield.ts';
import { HOUR_MS } from '../../src/domain/measurement-hour.ts';
import { computeBreakdown } from '../../src/domain/yield-breakdown.ts';
import {
  REFERENCE_MEASUREMENT_HEIGHT_M,
  referenceSite,
  referenceTurbine,
} from '../support/reference-site.ts';

const window = yieldWindowEndingAt(new Date('2026-10-31T23:00:00Z'));

const GAP_HOURS = new Set([1000, ...Array.from({ length: 10 }, (_, index) => 2000 + index)]);

const inputs: YieldInputs = {
  readings: Array.from({ length: 8760 }, (_, index) => ({
    measuredAt: new Date(window.start.getTime() + index * HOUR_MS),
    windSpeedMs: 3 + (index % 12),
  })).filter((_, index) => !GAP_HOURS.has(index)),
  window,
  measurementHeightM: REFERENCE_MEASUREMENT_HEIGHT_M,
  turbine: referenceTurbine,
  site: referenceSite,
};

describe('computeBreakdown', () => {
  const breakdown = computeBreakdown(inputs);
  const total = computeAnnualYield(inputs);

  it('splits the window into 12 calendar months that add up to the annual yield', () => {
    expect(breakdown.months.map((month) => month.month)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(breakdown.months[3]).toMatchObject({ expectedHours: 672, validHours: 672 });
    expect(breakdown.months.reduce((sum, month) => sum + month.validHours, 0)).toBe(8749);
    expect(total.grossMwh).toBeGreaterThan(total.measuredGrossMwh);
    expect(breakdown.months.reduce((sum, month) => sum + month.grossMwh, 0)).toBeCloseTo(
      total.grossMwh,
      6,
    );
    expect(breakdown.months.reduce((sum, month) => sum + month.netMwh, 0)).toBeCloseTo(
      total.netMwh,
      6,
    );
  });

  it('counts each measured hour in one wind speed bin', () => {
    expect(breakdown.windSpeedBins.reduce((sum, bin) => sum + bin.hours, 0)).toBe(8749);
    expect(breakdown.windSpeedBins.reduce((sum, bin) => sum + bin.grossMwh, 0)).toBeCloseTo(
      total.measuredGrossMwh,
      6,
    );
  });
});

import { describe, expect, it } from 'vitest';
import { isUsablePowerCurve, powerKwAt } from '../../src/domain/power-curve.ts';
import { referenceTurbine } from '../support/reference-site.ts';

const curve = referenceTurbine.powerCurve;

describe('powerKwAt', () => {
  it.each([
    [3, 55],
    [6, 680],
    [13, 3590],
    [25, 3600],
  ])('returns the curve point at %d m/s', (windSpeedMs, powerKw) => {
    expect(powerKwAt(curve, windSpeedMs)).toBe(powerKw);
  });

  it.each([
    [6.5, 880],
    [7.25, 1207.5],
    [12.5, 3555],
  ])('interpolates linearly at %d m/s', (windSpeedMs, powerKw) => {
    expect(powerKwAt(curve, windSpeedMs)).toBeCloseTo(powerKw, 9);
  });

  it.each([0, 2.99, 25.01, 40])('returns 0 kW outside the operating range at %d m/s', (speed) => {
    expect(powerKwAt(curve, speed)).toBe(0);
  });

  it('holds the last point up to the cut-out speed', () => {
    const shortCurve = { ...curve, points: curve.points.slice(0, 15) };

    expect(powerKwAt(shortCurve, 20)).toBe(3600);
  });
});

describe('isUsablePowerCurve', () => {
  it('accepts the reference curve', () => {
    expect(isUsablePowerCurve(curve)).toBe(true);
  });

  it('rejects points that are not in ascending order', () => {
    expect(isUsablePowerCurve({ ...curve, points: [...curve.points].reverse() })).toBe(false);
  });

  it('rejects a negative power and a cut-out below the cut-in', () => {
    const negative = [{ windSpeedMs: 0, powerKw: -1 }, ...curve.points.slice(1)];

    expect(isUsablePowerCurve({ ...curve, points: negative })).toBe(false);
    expect(isUsablePowerCurve({ ...curve, cutOutMs: 2 })).toBe(false);
  });
});

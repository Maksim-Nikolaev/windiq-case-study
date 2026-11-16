import { describe, expect, it } from 'vitest';
import { normaliseWindSpeed } from '../../src/domain/wind-speed.ts';

describe('normaliseWindSpeed', () => {
  it('keeps a number in m/s', () => {
    expect(normaliseWindSpeed({ value: 6.42, unit: 'm/s' })).toEqual({
      status: 'valid',
      windSpeedMs: 6.42,
    });
  });

  it.each([
    ['6.42', 6.42],
    ['6,42', 6.42],
    [' 7 ', 7],
  ])('accepts the numeric string %j', (value, windSpeedMs) => {
    expect(normaliseWindSpeed({ value, unit: 'm/s' })).toEqual({ status: 'valid', windSpeedMs });
  });

  it.each([
    ['km/h', 36, 10],
    ['KM/H', 36, 10],
    ['kn', 10, 5.144444444444445],
    ['mph', 10, 4.4704],
    [' m / s ', 5, 5],
  ])('converts %s to m/s', (unit, value, windSpeedMs) => {
    const reading = normaliseWindSpeed({ value, unit });

    expect(reading.status).toBe('valid');
    expect(reading).toHaveProperty('windSpeedMs', expect.closeTo(windSpeedMs, 12));
  });

  it.each([null, '', '   '])('marks %j as missing', (value) => {
    expect(normaliseWindSpeed({ value, unit: 'm/s' })).toEqual({ status: 'missing' });
  });

  it.each(['n/a', 'NaN', '6.4.2', '1e3', '--'])('rejects the text %j', (value) => {
    expect(normaliseWindSpeed({ value, unit: 'm/s' })).toEqual({
      status: 'invalid',
      reason: 'not_numeric',
    });
  });

  it('rejects a number that is not finite', () => {
    expect(normaliseWindSpeed({ value: Number.NaN, unit: 'm/s' })).toEqual({
      status: 'invalid',
      reason: 'not_numeric',
    });
  });

  it('rejects an unknown unit', () => {
    expect(normaliseWindSpeed({ value: 5, unit: 'furlong/fortnight' })).toEqual({
      status: 'invalid',
      reason: 'unknown_unit',
    });
  });

  it('rejects a negative value', () => {
    expect(normaliseWindSpeed({ value: -999, unit: 'm/s' })).toEqual({
      status: 'invalid',
      reason: 'negative',
    });
  });

  it('rejects a value above the plausible limit after the conversion', () => {
    expect(normaliseWindSpeed({ value: 999, unit: 'm/s' })).toEqual({
      status: 'invalid',
      reason: 'implausible',
    });
    expect(normaliseWindSpeed({ value: 100, unit: 'km/h' }).status).toBe('valid');
  });
});

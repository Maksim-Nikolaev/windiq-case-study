import { describe, expect, it } from 'vitest';
import { parseMeasurementHour } from '../../src/domain/measurement-hour.ts';

const NOW = new Date('2026-11-16T12:30:00Z');

describe('parseMeasurementHour', () => {
  it.each([
    '2026-10-20T08:00:00Z',
    '2026-10-20T10:00:00+02:00',
    '2026-10-20T10:00:00+0200',
    '2026-10-20T03:00:00-05:00',
    '2026-10-20 08:00Z',
    '2026-10-20T08:00:00.000z',
  ])('normalises %s to the same UTC hour', (timestamp) => {
    expect(parseMeasurementHour(timestamp, NOW)).toEqual({
      ok: true,
      hour: new Date('2026-10-20T08:00:00Z'),
    });
  });

  it('rejects a timestamp without an offset', () => {
    expect(parseMeasurementHour('2026-10-20T08:00:00', NOW)).toEqual({
      ok: false,
      reason: 'missing_offset',
    });
  });

  it.each([
    '',
    'yesterday',
    '2026-13-40T08:00:00Z',
    '2026-02-30T08:00:00Z',
    '2026-04-31T00:00:00+02:00',
    '2026-10-20T24:00:00Z',
    '2026-10-20T08:00:00 CET',
    '20.10.2026 08:00',
  ])('rejects the unparseable text %j', (timestamp) => {
    expect(parseMeasurementHour(timestamp, NOW)).toEqual({ ok: false, reason: 'unparseable' });
  });

  it.each(['2026-10-20T08:30:00Z', '2026-10-20T08:00:01Z', '2026-10-20T08:00:00+05:30'])(
    'rejects %s because it is not a full UTC hour',
    (timestamp) => {
      expect(parseMeasurementHour(timestamp, NOW)).toEqual({ ok: false, reason: 'not_on_hour' });
    },
  );

  it('accepts the current hour and rejects a later hour', () => {
    expect(parseMeasurementHour('2026-11-16T13:00:00Z', NOW).ok).toBe(true);
    expect(parseMeasurementHour('2026-11-16T14:00:00Z', NOW)).toEqual({
      ok: false,
      reason: 'in_future',
    });
  });
});

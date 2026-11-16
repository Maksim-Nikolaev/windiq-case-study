export type WindSpeedRejectReason = 'not_numeric' | 'unknown_unit' | 'negative' | 'implausible';

export const READING_STATUSES: readonly ['valid', 'missing', 'invalid'] = [
  'valid',
  'missing',
  'invalid',
];

export interface ValidWindSpeed {
  readonly status: 'valid';
  readonly windSpeedMs: number;
}

export interface MissingWindSpeed {
  readonly status: 'missing';
}

export interface InvalidWindSpeed {
  readonly status: 'invalid';
  readonly reason: WindSpeedRejectReason;
}

export type WindSpeedReading = ValidWindSpeed | MissingWindSpeed | InvalidWindSpeed;

export interface RawWindSpeed {
  readonly value: number | string | null;
  readonly unit: string;
}

export const MAX_PLAUSIBLE_WIND_SPEED_MS = 50;

const FACTOR_TO_MS = new Map<string, number>([
  ['m/s', 1],
  ['mps', 1],
  ['km/h', 1 / 3.6],
  ['kmh', 1 / 3.6],
  ['kph', 1 / 3.6],
  ['kn', 1852 / 3600],
  ['kt', 1852 / 3600],
  ['kts', 1852 / 3600],
  ['knots', 1852 / 3600],
  ['mph', 1609.344 / 3600],
]);

const DECIMAL_NUMBER = /^[+-]?\d+(?:[.,]\d+)?$/;

function parseNumeric(value: number | string): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const text = value.trim();

  if (!DECIMAL_NUMBER.test(text)) {
    return null;
  }

  return Number(text.replace(',', '.'));
}

export function normaliseWindSpeed(raw: RawWindSpeed): WindSpeedReading {
  if (raw.value === null || (typeof raw.value === 'string' && raw.value.trim() === '')) {
    return { status: 'missing' };
  }

  const numeric = parseNumeric(raw.value);

  if (numeric === null) {
    return { status: 'invalid', reason: 'not_numeric' };
  }

  const factorToMs = FACTOR_TO_MS.get(raw.unit.trim().toLowerCase().replace(/\s+/g, ''));

  if (factorToMs === undefined) {
    return { status: 'invalid', reason: 'unknown_unit' };
  }

  const windSpeedMs = numeric * factorToMs;

  if (windSpeedMs < 0) {
    return { status: 'invalid', reason: 'negative' };
  }

  if (windSpeedMs > MAX_PLAUSIBLE_WIND_SPEED_MS) {
    return { status: 'invalid', reason: 'implausible' };
  }

  return { status: 'valid', windSpeedMs };
}

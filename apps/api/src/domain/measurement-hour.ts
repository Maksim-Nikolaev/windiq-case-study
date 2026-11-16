export type TimestampRejectReason = 'unparseable' | 'missing_offset' | 'not_on_hour' | 'in_future';

export interface AcceptedHour {
  readonly ok: true;
  readonly hour: Date;
}

export interface RejectedHour {
  readonly ok: false;
  readonly reason: TimestampRejectReason;
}

export type MeasurementHour = AcceptedHour | RejectedHour;

export const HOUR_MS = 3_600_000;

const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(.*)$/;
const UTC_OFFSET = /^(?:Z|([+-]\d{2}):?(\d{2}))$/i;

function offsetMs(hours: string | undefined, minutes: string | undefined): number {
  if (hours === undefined || minutes === undefined) {
    return 0;
  }

  const sign = hours.startsWith('-') ? -1 : 1;

  return sign * (Math.abs(Number(hours)) * 60 + Number(minutes)) * 60_000;
}

export function parseMeasurementHour(timestamp: string, now: Date): MeasurementHour {
  const dateTime = ISO_DATE_TIME.exec(timestamp.trim());

  if (dateTime === null) {
    return { ok: false, reason: 'unparseable' };
  }

  const [, date = '', time = '', zone = ''] = dateTime;

  if (zone === '') {
    return { ok: false, reason: 'missing_offset' };
  }

  const offset = UTC_OFFSET.exec(zone);

  if (offset === null) {
    return { ok: false, reason: 'unparseable' };
  }

  const isoZone = offset[1] === undefined ? 'Z' : `${offset[1]}:${offset[2]}`;
  const hour = new Date(`${date}T${time}${isoZone}`);

  if (Number.isNaN(hour.getTime())) {
    return { ok: false, reason: 'unparseable' };
  }

  const wallClock = new Date(hour.getTime() + offsetMs(offset[1], offset[2])).toISOString();

  if (!wallClock.startsWith(`${date}T${time.slice(0, 5)}`)) {
    return { ok: false, reason: 'unparseable' };
  }

  if (hour.getTime() % HOUR_MS !== 0) {
    return { ok: false, reason: 'not_on_hour' };
  }

  if (hour.getTime() > now.getTime() + HOUR_MS) {
    return { ok: false, reason: 'in_future' };
  }

  return { ok: true, hour };
}

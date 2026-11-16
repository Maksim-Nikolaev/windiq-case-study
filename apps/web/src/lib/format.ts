export interface PluralForms {
  readonly one: string;
  readonly other: string;
}

const LOCALE = 'de-DE';
const TIME_ZONE = 'Europe/Berlin';

const dateTime = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: TIME_ZONE,
});
const shortDateTime = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
});
const monthYear = new Intl.DateTimeFormat(LOCALE, {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});

function number(value: number, fractionDigits = 0): string {
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export const f = {
  number,
  percent: (share: number, fractionDigits = 1) => `${number(share * 100, fractionDigits)} %`,
  count: (count: number, forms: PluralForms) =>
    `${number(count)} ${count === 1 ? forms.one : forms.other}`,
  dateTime: (instant: string) => dateTime.format(new Date(instant)),
  shortDateTime: (instant: string) => shortDateTime.format(new Date(instant)),
  month: (value: string) => monthYear.format(new Date(`${value}-01T00:00:00Z`)),
  duration: (durationMs: number) =>
    durationMs < 1000 ? `${durationMs} ms` : `${number(durationMs / 1000, 1)} s`,
};

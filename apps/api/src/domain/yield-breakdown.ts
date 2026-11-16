import { energyMwh, fillHours, lossFactor, monthOf, type YieldInputs } from './annual-yield.ts';

export interface MonthlyEnergy {
  readonly month: string;
  readonly expectedHours: number;
  readonly validHours: number;
  readonly grossMwh: number;
  readonly netMwh: number;
}

export interface WindSpeedBin {
  readonly fromMs: number;
  readonly hours: number;
  readonly grossMwh: number;
}

export interface YieldBreakdown {
  readonly months: readonly MonthlyEnergy[];
  readonly windSpeedBins: readonly WindSpeedBin[];
}

const MAX_BIN_MS = 30;

export function computeBreakdown(inputs: YieldInputs): YieldBreakdown {
  const factor = lossFactor(inputs.site.losses);
  const hours = fillHours(inputs);
  const measured = hours.filter((hour) => hour.source === 'measured');

  const months = [...new Set(hours.map((hour) => monthOf(hour.measuredAt)))].map((month) => {
    const inMonth = hours.filter((hour) => monthOf(hour.measuredAt) === month);
    const grossMwh = energyMwh(inMonth);

    return {
      month,
      expectedHours: inMonth.length,
      validHours: inMonth.filter((hour) => hour.source === 'measured').length,
      grossMwh,
      netMwh: grossMwh * factor,
    };
  });

  const windSpeedBins = Array.from({ length: MAX_BIN_MS }, (_, fromMs) => {
    const inBin = measured.filter(
      (hour) => Math.min(MAX_BIN_MS - 1, Math.floor(hour.hubWindSpeedMs ?? 0)) === fromMs,
    );

    return { fromMs, hours: inBin.length, grossMwh: energyMwh(inBin) };
  });

  return { months, windSpeedBins };
}

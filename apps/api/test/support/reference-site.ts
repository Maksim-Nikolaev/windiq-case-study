import type { SiteParameters, TurbineParameters } from '../../src/domain/annual-yield.ts';

const RATED_SPEEDS_MS = Array.from({ length: 12 }, (_, index) => index + 14);

export const referenceTurbine: TurbineParameters = {
  hubHeightM: 140,
  ratedPowerKw: 3600,
  powerCurve: {
    cutInMs: 3,
    cutOutMs: 25,
    points: [
      { windSpeedMs: 0, powerKw: 0 },
      { windSpeedMs: 1, powerKw: 0 },
      { windSpeedMs: 2, powerKw: 0 },
      { windSpeedMs: 3, powerKw: 55 },
      { windSpeedMs: 4, powerKw: 180 },
      { windSpeedMs: 5, powerKw: 385 },
      { windSpeedMs: 6, powerKw: 680 },
      { windSpeedMs: 7, powerKw: 1080 },
      { windSpeedMs: 8, powerKw: 1590 },
      { windSpeedMs: 9, powerKw: 2180 },
      { windSpeedMs: 10, powerKw: 2780 },
      { windSpeedMs: 11, powerKw: 3250 },
      { windSpeedMs: 12, powerKw: 3520 },
      { windSpeedMs: 13, powerKw: 3590 },
      ...RATED_SPEEDS_MS.map((windSpeedMs) => ({ windSpeedMs, powerKw: 3600 })),
    ],
  },
};

export const referenceSite: SiteParameters = {
  shearExponent: 0.2,
  losses: { availability: 0.03, electrical: 0.02, wake: 0.05 },
  uncertainty: 0.1,
};

export const REFERENCE_MEASUREMENT_HEIGHT_M = 100;

const RATED_SPEEDS_MS = Array.from({ length: 12 }, (_, index) => index + 14);
const RAMP_KW = [0, 0, 0, 55, 180, 385, 680, 1080, 1590, 2180, 2780, 3250, 3520, 3590];

export const referenceMast = {
  id: 'WIQ-MM-01',
  name: 'Messmast Spreewald',
  latitude: 51.8732,
  longitude: 14.0412,
  measurement_height_m: 100,
  operator: 'WindIQ',
  commissioned_at: '2023-04-01',
};

export const referenceTurbine = {
  id: 'WIQ-T36',
  name: 'Referenzanlage 3,6 MW',
  rated_power_kw: 3600,
  hub_height_m: 140,
  rotor_diameter_m: 136,
  cut_in_wind_speed_ms: 3,
  cut_out_wind_speed_ms: 25,
  power_curve: [
    ...RAMP_KW.map((power_kw, wind_speed_ms) => ({ wind_speed_ms, power_kw })),
    ...RATED_SPEEDS_MS.map((wind_speed_ms) => ({ wind_speed_ms, power_kw: 3600 })),
  ],
  version: 1,
  updated_at: '2026-09-20T08:00:00Z',
};

export const referenceSite = {
  id: 'WIQ-SITE-01',
  name: 'Windpark Spreewald',
  mast_id: 'WIQ-MM-01',
  shear_exponent: 0.2,
  losses: { availability: 0.03, electrical: 0.02, wake: 0.05 },
  uncertainty: 0.1,
  version: 1,
  updated_at: '2026-09-20T08:00:00Z',
};

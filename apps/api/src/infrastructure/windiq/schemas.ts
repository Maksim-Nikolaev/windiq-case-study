import { z } from 'zod';
import type { MastRecord, SiteRecord, TurbineRecord } from '../../domain/master-data.ts';
import type { RawMeasurement } from '../../domain/measurement.ts';
import { isUsablePowerCurve } from '../../domain/power-curve.ts';

const instant = z.string().pipe(z.coerce.date());
const lossFraction = z.number().min(0).lt(1);

const MAX_UNCERTAINTY = 0.78;

export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

export const measurementPageSchema = z.object({
  data: z.array(z.unknown()),
  next_cursor: z.string().nullable(),
});

function compassDegrees(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 360) {
    return null;
  }

  return value % 360;
}

export const measurementRowSchema = z
  .object({
    timestamp: z.string(),
    wind_speed: z.union([z.number(), z.string(), z.null()]),
    unit: z.string(),
    wind_direction_deg: z.unknown(),
    version: z.number().int(),
    updated_at: instant,
  })
  .transform(
    (row): RawMeasurement => ({
      timestamp: row.timestamp,
      windSpeed: row.wind_speed,
      unit: row.unit,
      windDirectionDeg: compassDegrees(row.wind_direction_deg),
      version: row.version,
      updatedAt: row.updated_at,
    }),
  );

export const mastSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    measurement_height_m: z.number().positive(),
    operator: z.string(),
    commissioned_at: z.string(),
  })
  .transform(
    (mast): MastRecord => ({
      kind: 'mast',
      id: mast.id,
      name: mast.name,
      latitude: mast.latitude,
      longitude: mast.longitude,
      measurementHeightM: mast.measurement_height_m,
    }),
  );

export const turbineSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    rated_power_kw: z.number().positive(),
    hub_height_m: z.number().positive(),
    rotor_diameter_m: z.number().positive(),
    cut_in_wind_speed_ms: z.number().min(0),
    cut_out_wind_speed_ms: z.number().positive(),
    power_curve: z.array(z.object({ wind_speed_ms: z.number(), power_kw: z.number() })),
    version: z.number().int(),
    updated_at: instant,
  })
  .transform(
    (turbine): TurbineRecord => ({
      kind: 'turbine',
      id: turbine.id,
      name: turbine.name,
      rotorDiameterM: turbine.rotor_diameter_m,
      version: turbine.version,
      updatedAt: turbine.updated_at.toISOString(),
      hubHeightM: turbine.hub_height_m,
      ratedPowerKw: turbine.rated_power_kw,
      powerCurve: {
        cutInMs: turbine.cut_in_wind_speed_ms,
        cutOutMs: turbine.cut_out_wind_speed_ms,
        points: turbine.power_curve.map((point) => ({
          windSpeedMs: point.wind_speed_ms,
          powerKw: point.power_kw,
        })),
      },
    }),
  )
  .refine((turbine) => isUsablePowerCurve(turbine.powerCurve), {
    message: 'power curve is not usable',
    path: ['power_curve'],
  });

export const siteSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    mast_id: z.string(),
    shear_exponent: z.number().min(0).max(1),
    losses: z.object({
      availability: lossFraction,
      electrical: lossFraction,
      wake: lossFraction,
    }),
    uncertainty: z.number().min(0).max(MAX_UNCERTAINTY),
    version: z.number().int(),
    updated_at: instant,
  })
  .transform(
    (site): SiteRecord => ({
      kind: 'site',
      id: site.id,
      name: site.name,
      version: site.version,
      updatedAt: site.updated_at.toISOString(),
      shearExponent: site.shear_exponent,
      losses: site.losses,
      uncertainty: site.uncertainty,
    }),
  );

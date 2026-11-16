ALTER TABLE "master_data_versions" ADD COLUMN "record" jsonb;--> statement-breakpoint
UPDATE "master_data_versions" SET "record" = jsonb_build_object(
  'kind', 'mast',
  'id', "payload"->'id',
  'name', "payload"->'name',
  'latitude', "payload"->'latitude',
  'longitude', "payload"->'longitude',
  'measurementHeightM', "payload"->'measurement_height_m'
) WHERE "kind" = 'mast' AND "accepted";--> statement-breakpoint
UPDATE "master_data_versions" SET "record" = jsonb_build_object(
  'kind', 'turbine',
  'id', "payload"->'id',
  'name', "payload"->'name',
  'rotorDiameterM', "payload"->'rotor_diameter_m',
  'version', "payload"->'version',
  'updatedAt', to_char(("payload"->>'updated_at')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'hubHeightM', "payload"->'hub_height_m',
  'ratedPowerKw', "payload"->'rated_power_kw',
  'powerCurve', jsonb_build_object(
    'cutInMs', "payload"->'cut_in_wind_speed_ms',
    'cutOutMs', "payload"->'cut_out_wind_speed_ms',
    'points', (
      SELECT jsonb_agg(
        jsonb_build_object('windSpeedMs', "point"->'wind_speed_ms', 'powerKw', "point"->'power_kw')
        ORDER BY "position"
      )
      FROM jsonb_array_elements("payload"->'power_curve') WITH ORDINALITY AS "curve"("point", "position")
    )
  )
) WHERE "kind" = 'turbine' AND "accepted";--> statement-breakpoint
UPDATE "master_data_versions" SET "record" = jsonb_build_object(
  'kind', 'site',
  'id', "payload"->'id',
  'name', "payload"->'name',
  'version', "payload"->'version',
  'updatedAt', to_char(("payload"->>'updated_at')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'shearExponent', "payload"->'shear_exponent',
  'losses', jsonb_build_object(
    'availability', "payload"->'losses'->'availability',
    'electrical', "payload"->'losses'->'electrical',
    'wake', "payload"->'losses'->'wake'
  ),
  'uncertainty', "payload"->'uncertainty'
) WHERE "kind" = 'site' AND "accepted";

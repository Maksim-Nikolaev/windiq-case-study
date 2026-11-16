import { z } from '@hono/zod-openapi';
import { INGEST_RUN_KINDS, INGEST_RUN_OUTCOMES } from '../application/ports.ts';
import { MASTER_DATA_KINDS } from '../domain/master-data.ts';

const instant = z.iso.datetime().openapi({ example: '2026-11-16T12:00:00.000Z' });

export const yieldResultSchema = z
  .object({
    computedAt: instant.describe('Time of the calculation.'),
    windowStart: instant.describe('Start of the first hour of the 12-month window (UTC).'),
    windowEnd: instant.describe(
      'Start of the latest delivered measurement hour, the last hour of the window (UTC).',
    ),
    grossMwh: z
      .number()
      .describe(
        'AEP gross in MWh: power curve energy of all hours of the window, with the gaps filled.',
      ),
    netMwh: z
      .number()
      .describe('AEP net in MWh: gross × (1 − availability) × (1 − electrical) × (1 − wake).'),
    p50Mwh: z.number().describe('P50 in MWh, equal to AEP net.'),
    p90Mwh: z.number().describe('P90 in MWh: P50 × (1 − 1.282 × U).'),
    lossFactor: z
      .number()
      .describe('Share of the gross energy that remains after the three losses, 0–1.'),
    expectedHours: z
      .number()
      .int()
      .describe('Hours in the window: 8760, or 8784 with 29 February.'),
    validHours: z.number().int().describe('Hours in the window with a valid wind speed.'),
    coverage: z.number().describe('Share of the expected hours with a valid value, 0–1.'),
    measuredGrossMwh: z
      .number()
      .describe('Power curve energy in MWh of the hours with a valid value only, without filling.'),
    interpolatedHours: z
      .number()
      .int()
      .describe(
        'Hours in a gap of up to 3 hours: the wind speed is interpolated linearly between the neighbouring hours.',
      ),
    monthMeanHours: z
      .number()
      .int()
      .describe(
        'Hours in a longer gap: they get the mean energy of the valid hours of the same calendar month.',
      ),
    meanHubWindSpeedMs: z
      .number()
      .describe('Mean wind speed at hub height of the valid hours, m/s.'),
    capacityFactor: z
      .number()
      .describe('Full-load hours divided by the hours of the window, share 0–1, from P50.'),
    fullLoadHours: z.number().describe('P50 divided by the rated power, in hours per year.'),
  })
  .openapi('YieldResult');

export const yieldInputsSchema = z
  .object({
    mast: z.object({
      id: z.string(),
      name: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      measurementHeightM: z.number().describe('Measurement height above ground, m.'),
    }),
    turbine: z.object({
      id: z.string(),
      name: z.string(),
      ratedPowerKw: z.number().describe('Rated power, kW.'),
      hubHeightM: z.number().describe('Hub height above ground, m.'),
      rotorDiameterM: z.number().describe('Rotor diameter, m.'),
      cutInMs: z.number().describe('Below this hub wind speed the power is 0 kW, m/s.'),
      cutOutMs: z.number().describe('Above this hub wind speed the power is 0 kW, m/s.'),
      powerCurve: z
        .array(z.object({ windSpeedMs: z.number(), powerKw: z.number() }))
        .describe('Power at hub height wind speeds; linear between the points.'),
      version: z.number().int().describe('Version of the data set at the source.'),
      updatedAt: instant.describe('Last change of the data set at the source.'),
    }),
    site: z.object({
      id: z.string(),
      name: z.string(),
      shearExponent: z
        .number()
        .describe('Shear exponent α in v_hub = v_measured × (h_hub / h_measured) ^ α.'),
      losses: z
        .object({ availability: z.number(), electrical: z.number(), wake: z.number() })
        .describe('Loss shares, 0–1 (0.03 = 3 %).'),
      uncertainty: z.number().describe('Total uncertainty U as a share, 0–1.'),
      version: z.number().int().describe('Version of the data set at the source.'),
      updatedAt: instant.describe('Last change of the data set at the source.'),
    }),
  })
  .openapi('YieldInputs');

export const yieldOverviewSchema = z
  .discriminatedUnion('state', [
    z.object({
      state: z.literal('pending').describe('No result before the first complete fetch.'),
    }),
    z.object({
      state: z.literal('ready'),
      result: yieldResultSchema,
      inputs: yieldInputsSchema,
      hours: z
        .object({
          valid: z.number().int(),
          missing: z.number().int(),
          invalid: z.number().int(),
          absent: z.number().int(),
        })
        .describe(
          'Hours of the window by state: valid, delivered without a value, delivered with an invalid value, not delivered.',
        ),
    }),
  ])
  .openapi('YieldOverview');

export const yieldHistorySchema = z
  .object({
    points: z.array(
      z.object({
        computedAt: instant,
        windowEnd: instant,
        grossMwh: z.number(),
        p50Mwh: z.number(),
        p90Mwh: z.number(),
        validHours: z.number().int(),
      }),
    ),
  })
  .openapi('YieldHistory');

export const yieldBreakdownSchema = z
  .object({
    months: z.array(
      z.object({
        month: z
          .string()
          .describe('Calendar month in UTC, YYYY-MM. The first and last can be partial.'),
        expectedHours: z.number().int(),
        validHours: z.number().int(),
        grossMwh: z.number().describe('AEP gross of the month in MWh, with the gaps filled.'),
        netMwh: z.number(),
      }),
    ),
    windSpeedBins: z.array(
      z.object({
        fromMs: z.number().describe('Lower limit of the 1 m/s class of the hub wind speed.'),
        hours: z.number().int().describe('Hours with a valid value in this class.'),
        grossMwh: z.number(),
      }),
    ),
  })
  .openapi('YieldBreakdown');

export const dataQualitySchema = z
  .object({
    unusableHours: z.array(
      z.object({
        measuredAt: instant,
        status: z.enum(['missing', 'invalid']),
        reason: z
          .string()
          .nullable()
          .describe(
            'not_numeric, unknown_unit, negative or implausible; null for a missing value.',
          ),
        rawValue: z.string().nullable().describe('The value as the source sent it.'),
        rawUnit: z.string(),
        version: z.number().int(),
      }),
    ),
    corrections: z.array(
      z.object({
        measuredAt: instant,
        revisions: z.number().int(),
        latestVersion: z.number().int(),
        firstWindSpeedMs: z.number().nullable(),
        currentWindSpeedMs: z.number().nullable(),
        correctedAt: instant,
      }),
    ),
    rejectedRows: z.array(
      z.object({
        reason: z
          .string()
          .describe('schema, unparseable, missing_offset, not_on_hour or in_future.'),
        payload: z.string().describe('The row as the source sent it, as JSON text.'),
        firstSeenAt: instant,
        lastSeenAt: instant,
      }),
    ),
    masterDataVersions: z.array(
      z.object({
        kind: z.enum(MASTER_DATA_KINDS),
        accepted: z.boolean(),
        rejectReason: z.string().nullable(),
        upstreamVersion: z.number().int().nullable(),
        upstreamUpdatedAt: instant.nullable(),
        fetchedAt: instant,
      }),
    ),
  })
  .openapi('DataQuality');

export const statusSchema = z
  .object({
    version: z.string().describe('Git commit of the running release.'),
    startedAt: instant.describe('Start of the API process.'),
    now: instant,
    dataFreshness: z
      .enum(['fresh', 'stale', 'empty'])
      .describe(
        'fresh while the latest valid measurement hour is at most 150 minutes old; empty before the first data.',
      ),
    dataAgeMinutes: z
      .number()
      .nullable()
      .describe('Minutes since the start of the latest valid hour.'),
    latestValidMeasurementAt: instant.nullable(),
    rejectedMasterData: z
      .array(z.enum(MASTER_DATA_KINDS))
      .describe('Kinds whose latest version from the source is not plausible and not used.'),
    lastPollSuccessAt: instant.nullable().describe('Last measurement fetch without an error.'),
    lastReconcileAt: instant.nullable().describe('Last complete read of the full list.'),
    runsLast24h: z.object({ total: z.number().int(), failed: z.number().int() }),
    runs: z.array(
      z.object({
        kind: z.enum(INGEST_RUN_KINDS),
        startedAt: instant,
        durationMs: z.number().int(),
        outcome: z.enum(INGEST_RUN_OUTCOMES),
        errorMessage: z.string().nullable(),
        rowsNew: z.number().int(),
        rowsCorrected: z.number().int(),
        rowsRejected: z.number().int(),
      }),
    ),
  })
  .openapi('Status');

export const healthSchema = z.object({ status: z.literal('ok') }).openapi('Health');

export type YieldOverview = z.infer<typeof yieldOverviewSchema>;
export type ReadyYieldOverview = Extract<YieldOverview, { state: 'ready' }>;
export type YieldHistory = z.infer<typeof yieldHistorySchema>;
export type YieldBreakdownResponse = z.infer<typeof yieldBreakdownSchema>;
export type DataQuality = z.infer<typeof dataQualitySchema>;
export type Status = z.infer<typeof statusSchema>;

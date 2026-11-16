import { z } from 'zod';

const optionalUrl = z.preprocess((value) => (value === '' ? undefined : value), z.url().optional());

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  WINDIQ_BASE_URL: z.url(),
  WINDIQ_CLIENT_ID: z.string().min(1),
  WINDIQ_CLIENT_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(8080),
  METRICS_PORT: z.coerce.number().int().positive().default(9464),
  POLL_INTERVAL_SECONDS: z.coerce.number().positive().default(60),
  MASTER_DATA_INTERVAL_SECONDS: z.coerce.number().positive().default(600),
  RECONCILE_INTERVAL_SECONDS: z.coerce.number().positive().default(86_400),
  STALE_AFTER_MINUTES: z.coerce.number().positive().default(150),
  HEARTBEAT_PUSH_URL: optionalUrl,
  APP_VERSION: z.string().default('dev'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export interface Config {
  readonly databaseUrl: string;
  readonly windIq: {
    readonly baseUrl: string;
    readonly clientId: string;
    readonly clientSecret: string;
  };
  readonly port: number;
  readonly metricsPort: number;
  readonly pollIntervalMs: number;
  readonly masterDataIntervalMs: number;
  readonly reconcileIntervalMs: number;
  readonly staleAfterMs: number;
  readonly heartbeatPushUrl: string | null;
  readonly appVersion: string;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export function loadConfig(environment: NodeJS.ProcessEnv): Config {
  const env = environmentSchema.parse(environment);

  return {
    databaseUrl: env.DATABASE_URL,
    windIq: {
      baseUrl: env.WINDIQ_BASE_URL,
      clientId: env.WINDIQ_CLIENT_ID,
      clientSecret: env.WINDIQ_CLIENT_SECRET,
    },
    port: env.PORT,
    metricsPort: env.METRICS_PORT,
    pollIntervalMs: env.POLL_INTERVAL_SECONDS * 1000,
    masterDataIntervalMs: env.MASTER_DATA_INTERVAL_SECONDS * 1000,
    reconcileIntervalMs: env.RECONCILE_INTERVAL_SECONDS * 1000,
    staleAfterMs: env.STALE_AFTER_MINUTES * 60_000,
    heartbeatPushUrl: env.HEARTBEAT_PUSH_URL ?? null,
    appVersion: env.APP_VERSION,
    logLevel: env.LOG_LEVEL,
  };
}

import { referenceMast, referenceSite, referenceTurbine } from './reference-data.ts';

export interface FakeMeasurement {
  timestamp: unknown;
  wind_speed: unknown;
  unit: unknown;
  wind_direction_deg: unknown;
  version: unknown;
  updated_at: unknown;
}

export interface FailureFault {
  status: number;
  remaining: number;
  retryAfterSeconds: number | null;
  pathPrefix: string;
}

export interface RequestRecord {
  readonly method: string;
  readonly path: string;
  readonly status: number;
}

export interface FakeUpstreamState {
  clientId: string;
  clientSecret: string;
  tokenLifetimeSeconds: number;
  mast: unknown;
  turbine: unknown;
  site: unknown;
  measurements: FakeMeasurement[];
  failure: FailureFault | null;
  delayMs: number;
  repeatCursor: boolean;
  now: () => Date;
  readonly tokens: Map<string, number>;
  readonly requests: RequestRecord[];
}

export function createState(overrides: Partial<FakeUpstreamState> = {}): FakeUpstreamState {
  return {
    clientId: 'wiq_fake',
    clientSecret: 'fake-secret',
    tokenLifetimeSeconds: 3600,
    mast: structuredClone(referenceMast),
    turbine: structuredClone(referenceTurbine),
    site: structuredClone(referenceSite),
    measurements: [],
    failure: null,
    delayMs: 0,
    repeatCursor: false,
    now: () => new Date(),
    tokens: new Map(),
    requests: [],
    ...overrides,
  };
}

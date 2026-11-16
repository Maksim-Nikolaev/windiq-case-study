import { createApp, createFetch } from './app.ts';
import { createState, type FakeUpstreamState } from './state.ts';

export { referenceMast, referenceSite, referenceTurbine } from './reference-data.ts';
export { hourlyMeasurement, seedMeasurements } from './seed.ts';
export type { FakeMeasurement, FakeUpstreamState } from './state.ts';

export function createFakeUpstream(overrides: Partial<FakeUpstreamState> = {}) {
  const state = createState(overrides);
  const app = createApp(state);

  return { state, app, fetch: createFetch(state, app) };
}

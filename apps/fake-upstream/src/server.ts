import { serve } from '@hono/node-server';
import { createFakeUpstream, hourlyMeasurement, seedMeasurements } from './index.ts';
import { HOUR_MS } from './seed.ts';

const HOURS_PER_YEAR = 8760;
const port = Number(process.env.PORT ?? 4010);

function currentHour(): Date {
  return new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
}

const upstream = createFakeUpstream({
  measurements: seedMeasurements({
    lastHour: currentHour(),
    hours: HOURS_PER_YEAR,
    seed: 20261116,
  }),
});
let latestHourMs = currentHour().getTime();

setInterval(() => {
  const hour = currentHour();

  if (hour.getTime() > latestHourMs) {
    latestHourMs = hour.getTime();
    upstream.state.measurements.push(
      hourlyMeasurement(hour, 3 + Math.random() * 9, Math.random() * 360),
    );
  }
}, 30_000).unref();

serve({ fetch: upstream.app.fetch, port, hostname: process.env.HOST ?? '127.0.0.1' }, () => {
  console.log(`fake upstream listens on port ${port}`);
});

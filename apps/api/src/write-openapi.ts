import { writeFile } from 'node:fs/promises';
import { createEventBus } from './infrastructure/event-bus.ts';
import { createHttpApp } from './interface/http.ts';

const unavailable = (): never => {
  throw new Error('the specification export does not read data');
};

const app = createHttpApp({
  readModels: {
    yieldOverview: unavailable,
    yieldHistory: unavailable,
    yieldBreakdown: unavailable,
    dataQuality: unavailable,
    status: unavailable,
    isDatabaseReachable: unavailable,
  },
  bus: createEventBus(),
  now: () => new Date(),
  onSseClients: () => {},
});
const response = await app.request('/api/openapi.json');
const target = new URL('../openapi.json', import.meta.url);

await writeFile(target, `${JSON.stringify(await response.json(), null, 2)}\n`);
console.log(`wrote ${target.pathname}`);

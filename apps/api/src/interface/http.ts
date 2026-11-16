import { swaggerUI } from '@hono/swagger-ui';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import type { EventBus } from '../infrastructure/event-bus.ts';
import type { ReadModels } from './read-models.ts';
import {
  dataQualitySchema,
  healthSchema,
  statusSchema,
  yieldBreakdownSchema,
  yieldHistorySchema,
  yieldOverviewSchema,
} from './schemas.ts';

export interface HttpDependencies {
  readonly readModels: ReadModels;
  readonly bus: EventBus;
  readonly now: () => Date;
  readonly onSseClients: (change: 1 | -1) => void;
}

type Tag = 'Yield' | 'Data quality' | 'Operations';

interface JsonRoute<Schema extends z.ZodType> {
  readonly path: string;
  readonly tag: Tag;
  readonly summary: string;
  readonly description: string;
  readonly schema: Schema;
}

const HEARTBEAT_MS = 20_000;
const HEALTHY: z.infer<typeof healthSchema> = { status: 'ok' };

const TAGS: readonly { readonly name: Tag; readonly description: string }[] = [
  { name: 'Yield', description: 'The annual energy production and its parts.' },
  {
    name: 'Data quality',
    description: 'What the source delivered and what the service did with it.',
  },
  { name: 'Operations', description: 'Health, ingest state and the live event stream.' },
];

function jsonRoute<Schema extends z.ZodType>(route: JsonRoute<Schema>) {
  return createRoute({
    method: 'get',
    path: route.path,
    tags: [route.tag],
    summary: route.summary,
    description: route.description,
    responses: {
      200: {
        description: route.summary,
        content: { 'application/json': { schema: route.schema } },
      },
    },
  });
}

const readyRoute = createRoute({
  method: 'get',
  path: '/readyz',
  tags: ['Operations'],
  summary: 'The process can reach the database',
  description:
    'Docker and Traefik use this check. It does not depend on the WindIQ API, so an outage of the source does not remove the service.',
  responses: {
    200: { description: 'Ready', content: { 'application/json': { schema: healthSchema } } },
    503: { description: 'The database is not reachable' },
  },
});

const eventsRoute = createRoute({
  method: 'get',
  path: '/events',
  tags: ['Operations'],
  summary: 'Live events (server-sent events)',
  description:
    'A text/event-stream. Events: `ready` once after the connection opens, `data.changed` when a new result exists, `cycle.finished` after each ingest cycle (about each 60 s), `ping` each 20 s. The data of each event is the server time (ISO 8601). Clients fetch the changed data from the JSON endpoints.',
  responses: {
    200: {
      description: 'An open event stream',
      content: { 'text/event-stream': { schema: z.string() } },
    },
  },
});

export function createHttpApp(deps: HttpDependencies): OpenAPIHono {
  const api = new OpenAPIHono();
  const { readModels } = deps;

  api.openapi(
    jsonRoute({
      path: '/healthz',
      tag: 'Operations',
      summary: 'The process is alive',
      description:
        'Answers while the process runs. It checks neither the database nor the WindIQ API.',
      schema: healthSchema,
    }),
    (context) => context.json(HEALTHY),
  );

  api.openapi(readyRoute, async (context) => {
    if (await readModels.isDatabaseReachable()) {
      return context.json(HEALTHY, 200);
    }

    return context.body(null, 503);
  });

  api.openapi(
    jsonRoute({
      path: '/yield',
      tag: 'Yield',
      summary: 'Current annual yield with inputs',
      description:
        'AEP gross, AEP net, P50 and P90 of the latest 12 months, with the mast, turbine and site data that the calculation used and the hours by state. The state is pending until the first complete fetch.',
      schema: yieldOverviewSchema,
    }),
    async (context) => context.json(await readModels.yieldOverview()),
  );

  api.openapi(
    jsonRoute({
      path: '/yield/history',
      tag: 'Yield',
      summary: 'Yield results of the last 30 days',
      description:
        'One point for each new result: a new measurement hour, a correction or new master data. Unchanged results are not stored again.',
      schema: yieldHistorySchema,
    }),
    async (context) => context.json(await readModels.yieldHistory()),
  );

  api.openapi(
    jsonRoute({
      path: '/yield/breakdown',
      tag: 'Yield',
      summary: 'Yield by month and wind speed',
      description:
        'Gross and net energy per calendar month of the window, and valid hours and gross energy per 1 m/s class of the hub wind speed.',
      schema: yieldBreakdownSchema,
    }),
    async (context) => context.json(await readModels.yieldBreakdown()),
  );

  api.openapi(
    jsonRoute({
      path: '/quality',
      tag: 'Data quality',
      summary: 'Unusable hours, corrections and rejected rows',
      description:
        'The newest 100 entries of each list: hours without a valid value, hours that the source corrected, rows that the service rejected, and the versions of the master data.',
      schema: dataQualitySchema,
    }),
    async (context) => context.json(await readModels.dataQuality()),
  );

  api.openapi(
    jsonRoute({
      path: '/status',
      tag: 'Operations',
      summary: 'Ingest state and data freshness',
      description:
        'Age of the latest valid measurement hour, rejected master data, the last 30 ingest runs and the failures of the last 24 hours. The page /status shows the same data.',
      schema: statusSchema,
    }),
    async (context) => context.json(await readModels.status(deps.now())),
  );

  api.openAPIRegistry.registerPath(eventsRoute);

  api.get('/events', (context) => {
    context.header('X-Accel-Buffering', 'no');

    return streamSSE(context, async (stream) => {
      let open = true;
      const unsubscribe = deps.bus.subscribe((event) => {
        void stream.writeSSE({ event: event.type, data: deps.now().toISOString() });
      });

      deps.onSseClients(1);
      stream.onAbort(() => {
        open = false;
        unsubscribe();
        deps.onSseClients(-1);
      });

      await stream.writeSSE({ event: 'ready', data: deps.now().toISOString() });

      while (open) {
        await stream.sleep(HEARTBEAT_MS);
        await stream.writeSSE({ event: 'ping', data: deps.now().toISOString() });
      }
    });
  });

  api.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'WindIQ case study – yield API',
      version: '1.0.0',
      description:
        'Read-only API of the yield service. The service stores the hourly mast measurements and calculates AEP, P50 and P90.',
    },
    servers: [{ url: '/api' }],
    tags: [...TAGS],
  });

  api.get('/docs', swaggerUI({ url: '/api/openapi.json', title: 'WindIQ yield API' }));

  const app = new OpenAPIHono();
  app.route('/api', api);

  return app;
}

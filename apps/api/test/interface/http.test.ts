import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createEventBus } from '../../src/infrastructure/event-bus.ts';
import { createHttpApp } from '../../src/interface/http.ts';

const unavailable = (): never => {
  throw new Error('the documentation does not read data');
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
  now: () => new Date('2026-11-17T12:00:00Z'),
  onSseClients: () => {},
});

const specificationSchema = z.object({
  tags: z.array(z.object({ name: z.string() })).optional(),
  paths: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({
        tags: z.array(z.string()).optional(),
        description: z.string().optional(),
        responses: z.record(
          z.string(),
          z.object({ content: z.record(z.string(), z.unknown()).optional() }),
        ),
      }),
    ),
  ),
  components: z.object({
    schemas: z.record(
      z.string(),
      z.object({
        properties: z
          .record(z.string(), z.object({ description: z.string().optional() }))
          .optional(),
      }),
    ),
  }),
});

async function specification() {
  return specificationSchema.parse(await (await app.request('/api/openapi.json')).json());
}

describe('API documentation', () => {
  it('serves a readable page that loads the specification', async () => {
    const response = await app.request('/api/docs');
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(page).toContain('/api/openapi.json');
  });

  it('documents the event stream with its event names', async () => {
    const events = (await specification()).paths['/events']?.get;

    expect(events?.responses['200']?.content).toHaveProperty(['text/event-stream']);
    expect(events?.description).toContain('data.changed');
    expect(events?.description).toContain('cycle.finished');
  });

  it('groups each operation under a declared tag and describes it', async () => {
    const spec = await specification();
    const declared = new Set(spec.tags?.map((tag) => tag.name));
    const operations = Object.values(spec.paths).flatMap((methods) => Object.values(methods));

    expect(operations.length).toBeGreaterThanOrEqual(8);

    for (const operation of operations) {
      expect(operation.tags?.length).toBe(1);
      expect(declared.has(operation.tags?.[0] ?? '')).toBe(true);
      expect(operation.description?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it('describes the fields that need a unit or a meaning', async () => {
    const schemas = (await specification()).components.schemas;
    const described = (schema: string, field: string) =>
      schemas[schema]?.properties?.[field]?.description ?? '';

    expect(described('YieldResult', 'coverage')).toMatch(/share/i);
    expect(described('YieldResult', 'p90Mwh')).toMatch(/1\.282/);
    expect(described('YieldResult', 'windowEnd')).toMatch(/start/i);
    expect(described('Status', 'dataFreshness')).toMatch(/150/);
  });
});

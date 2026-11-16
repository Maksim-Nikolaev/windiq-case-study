import { randomUUID } from 'node:crypto';
import { type Context, Hono } from 'hono';
import type { FakeMeasurement, FakeUpstreamState } from './state.ts';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function instantMs(value: unknown): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;

  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function jsonResponse(
  value: unknown,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function encodeCursor(offset: number): string {
  return Buffer.from(`offset:${offset}`).toString('base64url');
}

function decodeCursor(cursor: string): number | null {
  const match = /^offset:(\d+)$/.exec(Buffer.from(cursor, 'base64url').toString());

  return match === null ? null : Number(match[1]);
}

function hasValidToken(state: FakeUpstreamState, header: string | undefined): boolean {
  const expiresAtMs = state.tokens.get(header?.replace(/^Bearer /, '') ?? '');

  return expiresAtMs !== undefined && expiresAtMs > state.now().getTime();
}

function selectMeasurements(
  state: FakeUpstreamState,
  since: number | null,
  updatedSince: number | null,
): FakeMeasurement[] {
  const key = (row: FakeMeasurement) =>
    updatedSince === null ? instantMs(row.timestamp) : instantMs(row.updated_at);

  return state.measurements
    .filter((row) => since === null || instantMs(row.timestamp) >= since)
    .filter((row) => updatedSince === null || instantMs(row.updated_at) >= updatedSince)
    .sort((left, right) => key(left) - key(right));
}

function listMeasurements(state: FakeUpstreamState, context: Context) {
  const { since, updated_since: updatedSince, limit, cursor } = context.req.query();
  const sinceMs = since === undefined ? null : Date.parse(since);
  const updatedSinceMs = updatedSince === undefined ? null : Date.parse(updatedSince);
  const pageSize = limit === undefined ? DEFAULT_LIMIT : Number(limit);

  if (
    Number.isNaN(sinceMs) ||
    Number.isNaN(updatedSinceMs) ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_LIMIT
  ) {
    return context.json(
      { detail: [{ loc: ['query'], msg: 'invalid parameter', type: 'value_error' }] },
      422,
    );
  }

  const offset = cursor === undefined ? 0 : decodeCursor(cursor);

  if (offset === null) {
    return context.json({ detail: 'invalid cursor' }, 400);
  }

  const rows = selectMeasurements(state, sinceMs, updatedSinceMs);
  const nextOffset = offset + pageSize;
  const nextCursor = state.repeatCursor ? encodeCursor(0) : encodeCursor(nextOffset);

  return context.json({
    data: rows.slice(offset, nextOffset),
    next_cursor: nextOffset < rows.length || state.repeatCursor ? nextCursor : null,
  });
}

export function createApp(state: FakeUpstreamState): Hono {
  const app = new Hono();

  app.use(async (context, next) => {
    await next();
    state.requests.push({
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
    });
  });

  app.use(async (context, next) => {
    const failure = state.failure;

    if (
      failure === null ||
      failure.remaining <= 0 ||
      !context.req.path.startsWith(failure.pathPrefix)
    ) {
      return next();
    }

    failure.remaining -= 1;

    return jsonResponse(
      { detail: 'injected fault' },
      failure.status,
      failure.retryAfterSeconds === null
        ? {}
        : { 'retry-after': String(failure.retryAfterSeconds) },
    );
  });

  app.post('/auth/token', async (context) => {
    const isJson = context.req.header('content-type')?.includes('application/json') ?? false;
    const body: Record<string, unknown> = isJson
      ? await context.req.json()
      : await context.req.parseBody();

    if (body.client_id !== state.clientId || body.client_secret !== state.clientSecret) {
      return context.json({ detail: 'invalid client credentials' }, 401);
    }

    const accessToken = randomUUID();
    state.tokens.set(accessToken, state.now().getTime() + state.tokenLifetimeSeconds * 1000);

    return context.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: state.tokenLifetimeSeconds,
    });
  });

  app.use('/v1/*', async (context, next) => {
    if (!hasValidToken(state, context.req.header('authorization'))) {
      return context.json({ detail: 'invalid or expired token' }, 401);
    }

    return next();
  });

  app.get('/v1/mast', () => jsonResponse(state.mast));
  app.get('/v1/turbine', () => jsonResponse(state.turbine));
  app.get('/v1/site', () => jsonResponse(state.site));
  app.get('/v1/measurements', (context) => listMeasurements(state, context));

  app.post('/_control/measurements', async (context) => {
    const rows: FakeMeasurement[] = await context.req.json();
    state.measurements.push(...rows);

    return context.json({ count: state.measurements.length });
  });

  app.post('/_control/site', async (context) => {
    state.site = await context.req.json();

    return jsonResponse(state.site);
  });

  app.post('/_control/failure', async (context) => {
    state.failure = await context.req.json();

    return context.json({ ok: true });
  });

  return app;
}

function waitFor(durationMs: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, durationMs);

    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

export function createFetch(state: FakeUpstreamState, app: Hono): typeof fetch {
  return async (input, init) => {
    if (state.delayMs > 0) {
      await waitFor(state.delayMs, init?.signal);
    }

    return app.request(input instanceof Request ? input : String(input), init);
  };
}

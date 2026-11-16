import { measurementPageSchema, tokenResponseSchema } from './schemas.ts';

export type UpstreamFailure = 'http' | 'network' | 'timeout' | 'invalid_response' | 'pagination';

export class UpstreamError extends Error {
  readonly failure: UpstreamFailure;
  readonly status: number | null;

  constructor(failure: UpstreamFailure, message: string, status: number | null = null) {
    super(message);
    this.name = 'UpstreamError';
    this.failure = failure;
    this.status = status;
  }
}

export interface UpstreamObservation {
  readonly path: string;
  readonly status: number | null;
  readonly durationMs: number;
}

export interface WindIqClientOptions {
  readonly baseUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly sleep: (durationMs: number) => Promise<void>;
  readonly observe: (observation: UpstreamObservation) => void;
  readonly requestTimeoutMs: number;
  readonly maxAttempts: number;
}

export interface MeasurementQuery {
  readonly updatedSince?: Date;
}

export interface WindIqClient {
  get(path: string): Promise<unknown>;
  measurementPages(query: MeasurementQuery): AsyncGenerator<readonly unknown[]>;
}

interface Token {
  readonly value: string;
  readonly expiresAtMs: number;
}

const PAGE_SIZE = 500;
const MAX_PAGES = 200;
const TOKEN_SAFETY_MARGIN_MS = 30_000;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function retryAfterMs(response: Response, now: Date): number | null {
  const header = response.headers.get('retry-after');

  if (header === null) {
    return null;
  }

  const seconds = Number(header);

  if (Number.isFinite(seconds)) {
    return seconds * 1000;
  }

  const date = Date.parse(header);

  return Number.isNaN(date) ? null : date - now.getTime();
}

function backoffMs(attempt: number, response: Response | null, now: Date): number {
  const exponential = BASE_BACKOFF_MS * 2 ** (attempt - 1) * (1 + Math.random() / 2);
  const requested = response === null ? null : retryAfterMs(response, now);

  return Math.min(MAX_BACKOFF_MS, Math.max(0, requested ?? exponential));
}

export function createWindIqClient(options: WindIqClientOptions): WindIqClient {
  let token: Token | null = null;
  let pendingToken: Promise<Token> | null = null;

  async function send(path: string, init: RequestInit): Promise<Response> {
    const startedAtMs = performance.now();

    try {
      const response = await options.fetch(new URL(path, options.baseUrl), {
        ...init,
        signal: AbortSignal.timeout(options.requestTimeoutMs),
      });
      options.observe({
        path: new URL(path, options.baseUrl).pathname,
        status: response.status,
        durationMs: performance.now() - startedAtMs,
      });

      return response;
    } catch (error) {
      options.observe({
        path: new URL(path, options.baseUrl).pathname,
        status: null,
        durationMs: performance.now() - startedAtMs,
      });

      const timedOut = error instanceof Error && error.name === 'TimeoutError';

      throw new UpstreamError(
        timedOut ? 'timeout' : 'network',
        `${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function sendWithRetry(path: string, init: () => Promise<RequestInit>): Promise<Response> {
    for (let attempt = 1; ; attempt += 1) {
      const lastAttempt = attempt >= options.maxAttempts;

      try {
        const response = await send(path, await init());

        if (!isRetryable(response.status) || lastAttempt) {
          return response;
        }

        await options.sleep(backoffMs(attempt, response, options.now()));
      } catch (error) {
        if (lastAttempt) {
          throw error;
        }

        await options.sleep(backoffMs(attempt, null, options.now()));
      }
    }
  }

  async function readJson(path: string, response: Response): Promise<unknown> {
    if (!response.ok) {
      throw new UpstreamError('http', `${path}: HTTP ${response.status}`, response.status);
    }

    try {
      return await response.json();
    } catch {
      throw new UpstreamError('invalid_response', `${path}: body is not JSON`, response.status);
    }
  }

  async function requestToken(): Promise<Token> {
    const path = '/auth/token';
    const requestedAtMs = options.now().getTime();
    const response = await sendWithRetry(path, async () => ({
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        grant_type: 'client_credentials',
      }),
    }));
    const parsed = tokenResponseSchema.safeParse(await readJson(path, response));

    if (!parsed.success) {
      throw new UpstreamError('invalid_response', `${path}: unexpected token response`);
    }

    return {
      value: parsed.data.access_token,
      expiresAtMs: requestedAtMs + parsed.data.expires_in * 1000,
    };
  }

  function currentToken(): Promise<string> {
    if (token !== null && options.now().getTime() < token.expiresAtMs - TOKEN_SAFETY_MARGIN_MS) {
      return Promise.resolve(token.value);
    }

    pendingToken ??= requestToken()
      .then((fresh) => {
        token = fresh;

        return fresh;
      })
      .finally(() => {
        pendingToken = null;
      });

    return pendingToken.then((fresh) => fresh.value);
  }

  async function authorised(path: string) {
    let tokenValue = '';
    const response = await sendWithRetry(path, async () => {
      tokenValue = await currentToken();

      return { headers: { authorization: `Bearer ${tokenValue}`, accept: 'application/json' } };
    });

    return { response, tokenValue };
  }

  async function get(path: string): Promise<unknown> {
    const first = await authorised(path);

    if (first.response.status !== 401) {
      return readJson(path, first.response);
    }

    if (token?.value === first.tokenValue) {
      token = null;
    }

    const second = await authorised(path);

    return readJson(path, second.response);
  }

  async function* measurementPages(query: MeasurementQuery): AsyncGenerator<readonly unknown[]> {
    const seenCursors = new Set<string>();
    let cursor: string | null = null;

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });

      if (query.updatedSince !== undefined) {
        params.set('updated_since', query.updatedSince.toISOString());
      }

      if (cursor !== null) {
        params.set('cursor', cursor);
      }

      const path = `/v1/measurements?${params}`;
      const parsed = measurementPageSchema.safeParse(await get(path));

      if (!parsed.success) {
        throw new UpstreamError('invalid_response', `${path}: unexpected page format`);
      }

      yield parsed.data.data;

      cursor = parsed.data.next_cursor;

      if (cursor === null) {
        return;
      }

      if (seenCursors.has(cursor)) {
        throw new UpstreamError('pagination', `${path}: cursor repeats`);
      }

      seenCursors.add(cursor);
    }

    throw new UpstreamError('pagination', `more than ${MAX_PAGES} pages`);
  }

  return { get, measurementPages };
}

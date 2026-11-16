import createClient from 'openapi-fetch';
import type { components, paths } from '../api-schema.d.ts';

export type YieldOverview = components['schemas']['YieldOverview'];
export type ReadyYieldOverview = Extract<YieldOverview, { state: 'ready' }>;
export type YieldResult = components['schemas']['YieldResult'];
export type YieldInputs = components['schemas']['YieldInputs'];
export type YieldHistory = components['schemas']['YieldHistory'];
export type YieldBreakdown = components['schemas']['YieldBreakdown'];
export type DataQuality = components['schemas']['DataQuality'];
export type Status = components['schemas']['Status'];

const client = createClient<paths>({
  baseUrl: `${process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:8090'}/api`,
  cache: 'no-store',
});

function unwrap<Body>(response: { data?: Body; response: Response }, path: string): Body {
  if (response.data === undefined) {
    throw new Error(`${path}: HTTP ${response.response.status}`);
  }

  return response.data;
}

export async function fetchYieldOverview(): Promise<YieldOverview> {
  return unwrap(await client.GET('/yield'), '/yield');
}

export async function fetchYieldHistory(): Promise<YieldHistory> {
  return unwrap(await client.GET('/yield/history'), '/yield/history');
}

export async function fetchYieldBreakdown(): Promise<YieldBreakdown> {
  return unwrap(await client.GET('/yield/breakdown'), '/yield/breakdown');
}

export async function fetchDataQuality(): Promise<DataQuality> {
  return unwrap(await client.GET('/quality'), '/quality');
}

export async function fetchStatus(): Promise<Status> {
  return unwrap(await client.GET('/status'), '/status');
}

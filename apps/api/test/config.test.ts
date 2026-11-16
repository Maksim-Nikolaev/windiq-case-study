import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

const REQUIRED = {
  DATABASE_URL: 'postgres://windiq:windiq@127.0.0.1:5442/windiq',
  WINDIQ_BASE_URL: 'http://127.0.0.1:4010',
  WINDIQ_CLIENT_ID: 'wiq_fake',
  WINDIQ_CLIENT_SECRET: 'fake-secret',
};

describe('loadConfig', () => {
  it('treats an empty heartbeat URL as not set', () => {
    expect(loadConfig({ ...REQUIRED, HEARTBEAT_PUSH_URL: '' }).heartbeatPushUrl).toBeNull();
  });

  it('keeps a heartbeat URL', () => {
    const url = 'https://status.example.org/api/push/abc';

    expect(loadConfig({ ...REQUIRED, HEARTBEAT_PUSH_URL: url }).heartbeatPushUrl).toBe(url);
  });

  it('rejects a heartbeat value that is not a URL', () => {
    expect(() => loadConfig({ ...REQUIRED, HEARTBEAT_PUSH_URL: 'push' })).toThrow();
  });
});

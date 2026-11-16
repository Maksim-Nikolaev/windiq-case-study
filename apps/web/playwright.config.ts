import { defineConfig } from '@playwright/test';

const channel = process.env.E2E_CHANNEL;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3091',
    locale: 'de-DE',
    ...(channel === undefined ? {} : { channel }),
  },
});

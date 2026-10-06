import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/preview',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:5189',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5189 --outDir dist-preview',
    url: 'http://127.0.0.1:5189',
    reuseExistingServer: false,
  },
});

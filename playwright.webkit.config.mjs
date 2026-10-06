import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';

// The in-app browser is Chromium; use WebKit separately for Apple control sizing.
export default defineConfig({
  ...base,
  testMatch: 'admin-date-layout.spec.mjs',
  use: {
    ...base.use,
    ...devices['iPhone 13'],
    browserName: 'webkit',
    channel: undefined,
    locale: 'zh-CN',
  },
});

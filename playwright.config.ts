import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10000,
    ignoreHTTPSErrors: true
  },
  webServer: {
    command: 'npx http-server ./ -p 8000 -c-1',
    port: 8000,
    timeout: 20 * 1000,
    reuseExistingServer: true
  }
});
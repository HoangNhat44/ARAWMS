import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', outputDir: './test-results', fullyParallel: false, workers: 1, timeout: 90000,
  expect: { timeout: 10000 }, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5197', channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/ui-test-server.mjs', url: 'http://127.0.0.1:5197', reuseExistingServer: false, timeout: 30000 },
});

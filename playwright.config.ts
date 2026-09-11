import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 20000,
  use: { baseURL: 'http://localhost:3390', channel: 'chrome', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: `${process.execPath} run dev --host localhost --port 3390 --strictPort`, url: 'http://localhost:3390', reuseExistingServer: true },
});

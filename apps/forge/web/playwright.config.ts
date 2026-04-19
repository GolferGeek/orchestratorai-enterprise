import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:6201/forge';
const SERVER_URL = process.env.BASE_URL
  ? process.env.BASE_URL.replace(/\/[a-z-]+\/?$/, '/') // strip path prefix for server check
  : 'http://localhost:6201/forge/';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,        // legal-department tests are async/long — run sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                  // one browser at a time — avoids job queue contention
  reporter: process.env.CI ? 'line' : 'html',
  timeout: 600_000,            // per-test: 10 min (HITL up to 2min + post-approval up to 5min)
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev:http',
    url: SERVER_URL,
    reuseExistingServer: true, // always reuse — tests run against already-running dev server
    timeout: 30_000,
  },
});

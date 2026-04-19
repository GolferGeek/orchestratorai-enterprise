import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:6201';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,        // legal-department tests are async/long — run sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                  // one browser at a time — avoids job queue contention
  reporter: process.env.CI ? 'line' : 'html',
  timeout: 360_000,            // per-test: 6 min (HITL + post-approval completion)
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
    url: BASE_URL,
    reuseExistingServer: true, // always reuse — tests run against already-running dev server
    timeout: 30_000,
  },
});

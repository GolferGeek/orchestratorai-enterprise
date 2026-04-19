/**
 * Matters (Case Team) E2E Test
 *
 * Persistent case team management — create matters, navigate to detail.
 *
 * Run: BASE_URL=http://localhost:6201 npx playwright test matters
 */

import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import {
  DEBUG, BASE_URL,
  login, screenshot,
} from './helpers';

const PAGE_URL = `${BASE_URL}/app/agents/legal-department/matters`;

let browser: Browser;
let context: BrowserContext;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.launch({ headless: !DEBUG, slowMo: DEBUG ? 200 : 0 });
});

test.afterAll(async () => {
  await browser.close();
});

test.beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[browser]', msg.text());
  });
  page.on('requestfailed', (req) => {
    console.warn('[network-fail]', req.url(), req.failure()?.errorText);
  });
});

test.afterEach(async () => {
  await context.close();
});

// ============================================================
// MA-1: Page Load
// ============================================================
test('MA-1: matters page loads without errors', async () => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
  });

  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  // Title: "Case Team"
  await expect(page.locator('ion-title').filter({ hasText: /Case Team/i })).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator('ion-toolbar ion-button').filter({ hasText: /New Matter/i }).last()
  ).toBeVisible({ timeout: 5_000 });

  await screenshot(page, 'ma-1-loaded');

  const critical = errors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
});

// ============================================================
// MA-2: Create matter modal opens
// ============================================================
test('MA-2: new matter modal opens', async () => {
  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /New Matter/i }).last();
  await newBtn.click();

  // A modal or form should appear
  await expect(
    page.locator('ion-modal').first()
  ).toBeVisible({ timeout: 5_000 });

  await screenshot(page, 'ma-2-modal');
});

// ============================================================
// MA-3: Matter list or empty state renders
// ============================================================
test('MA-3: matter list renders on page load', async () => {
  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  // Either list with items or empty state
  await expect(
    page.locator('ion-list, .empty-state, .matter-list-container').first()
  ).toBeVisible({ timeout: 10_000 });

  await screenshot(page, 'ma-3-list');
});

// ============================================================
// MA-4: Console health check
// ============================================================
test('MA-4: no unhandled JS errors or 5xx responses on page load', async () => {
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
  });
  page.on('response', (res) => {
    if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
  });

  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  await expect(page.locator('ion-title').filter({ hasText: /Case Team/i })).toBeVisible({ timeout: 10_000 });

  const critical = consoleErrors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
  expect(serverErrors).toHaveLength(0);
});

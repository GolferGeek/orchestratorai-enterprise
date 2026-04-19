/**
 * Portfolio Sentinel E2E Test
 *
 * Continuous contract monitoring — sources, alerts, signals.
 *
 * Run: BASE_URL=http://localhost:6201 npx playwright test sentinel
 */

import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import {
  DEBUG, BASE_URL,
  login, screenshot,
} from './helpers';

const PAGE_URL = `${BASE_URL}/app/agents/legal-department/sentinel`;

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
// SE-1: Page Load
// ============================================================
test('SE-1: portfolio sentinel page loads without errors', async () => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
  });

  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  // Title: "Portfolio Sentinel"
  await expect(page.locator('ion-title').filter({ hasText: /Portfolio Sentinel/i })).toBeVisible({ timeout: 10_000 });

  await screenshot(page, 'se-1-loaded');

  const critical = errors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
});

// ============================================================
// SE-2: Tab navigation works (Alerts / Signals / Portfolio / Sources)
// ============================================================
test('SE-2: sentinel tabs are visible and navigable', async () => {
  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  // All four segment buttons present
  await expect(
    page.locator('ion-segment-button').filter({ hasText: /alerts/i }).first()
  ).toBeVisible({ timeout: 5_000 });

  await expect(
    page.locator('ion-segment-button').filter({ hasText: /signals/i }).first()
  ).toBeVisible({ timeout: 5_000 });

  await expect(
    page.locator('ion-segment-button').filter({ hasText: /portfolio/i }).first()
  ).toBeVisible({ timeout: 5_000 });

  await expect(
    page.locator('ion-segment-button').filter({ hasText: /sources/i }).first()
  ).toBeVisible({ timeout: 5_000 });

  // Click through tabs
  await page.locator('ion-segment-button').filter({ hasText: /signals/i }).first().click();
  await page.waitForTimeout(300);
  await screenshot(page, 'se-2-signals-tab');

  await page.locator('ion-segment-button').filter({ hasText: /sources/i }).first().click();
  await page.waitForTimeout(300);
  await screenshot(page, 'se-2-sources-tab');
});

// ============================================================
// SE-3: Add source modal accessible from Sources tab
// ============================================================
test('SE-3: Sources tab shows add source button', async () => {
  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  // Navigate to sources tab
  await page.locator('ion-segment-button').filter({ hasText: /sources/i }).first().click();
  await page.waitForTimeout(500);

  // Add source button should be visible
  await expect(
    page.locator('ion-button').filter({ hasText: /Add Source|add.*source/i }).first()
  ).toBeVisible({ timeout: 5_000 });

  await screenshot(page, 'se-3-sources');
});

// ============================================================
// SE-4: Console health check
// ============================================================
test('SE-4: no unhandled JS errors or 5xx responses on page load', async () => {
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

  await expect(page.locator('ion-title').filter({ hasText: /Portfolio Sentinel/i })).toBeVisible({ timeout: 10_000 });

  const critical = consoleErrors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
  expect(serverErrors).toHaveLength(0);
});

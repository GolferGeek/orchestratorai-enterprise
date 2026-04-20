/**
 * DD Room Comparison E2E Test
 *
 * Cross-room comparison of Due Diligence rooms — room selector, comparison trigger.
 *
 * Run: BASE_URL=http://localhost:6201 npx playwright test dd-comparison
 */

import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import {
  DEBUG, BASE_URL,
  login, screenshot,
} from './helpers';

const PAGE_URL = `${BASE_URL}/app/agents/legal-department/compare`;

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
// DC-1: Page Load
// ============================================================
test('DC-1: DD comparison page loads without errors', async () => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
  });

  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('ion-title').filter({ hasText: /Compare DD Rooms/i })).toBeVisible({ timeout: 10_000 });

  await screenshot(page, 'dc-1-loaded');

  const critical = errors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
});

// ============================================================
// DC-2: Room selector or empty state renders
// ============================================================
test('DC-2: room selector or empty state renders', async () => {
  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('ion-title').filter({ hasText: /Compare DD Rooms/i })).toBeVisible({ timeout: 10_000 });

  // Either the room list, a spinner, or an empty state should appear
  await expect(
    page.locator('.room-list, .empty-state, .loading-center, ion-spinner').first()
  ).toBeVisible({ timeout: 10_000 });

  await screenshot(page, 'dc-2-selector');
});

// ============================================================
// DC-3: Compare button is disabled when fewer than 2 rooms selected
// ============================================================
test('DC-3: Compare button is disabled with no rooms selected', async () => {
  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('ion-title').filter({ hasText: /Compare DD Rooms/i })).toBeVisible({ timeout: 10_000 });

  // Wait for loading to settle
  await page.waitForTimeout(2_000);

  const compareBtn = page.locator('ion-button').filter({ hasText: /Compare/i }).first();
  await compareBtn.waitFor({ timeout: 5_000 });

  // Button should be disabled (0 or 1 rooms selected)
  const disabled = await compareBtn.getAttribute('disabled');
  expect(disabled).not.toBeNull();

  await screenshot(page, 'dc-3-compare-btn-disabled');
});

// ============================================================
// DC-4: Console health check
// ============================================================
test('DC-4: no unhandled JS errors or 5xx responses on page load', async () => {
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
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('ion-title').filter({ hasText: /Compare DD Rooms/i })).toBeVisible({ timeout: 10_000 });

  const critical = consoleErrors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
  expect(serverErrors).toHaveLength(0);
});

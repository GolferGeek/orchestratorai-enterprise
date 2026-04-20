/**
 * Deal Memo E2E Test
 *
 * Acquisition agreement memo drafted from a completed DD Room.
 * Deal Memo is accessed from within a DD Room (not standalone),
 * so these tests cover: the DD Room page (generate-memo path) and
 * the Deal Memo workspace with known job IDs.
 *
 * Run: BASE_URL=http://localhost:6201 npx playwright test deal-memo
 */

import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import {
  DEBUG, BASE_URL,
  login, screenshot,
} from './helpers';

const DD_PAGE_URL = `${BASE_URL}/app/agents/legal-department/due-diligence`;

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
// DM-1: Due Diligence page loads (entry point for Deal Memo)
// ============================================================
test('DM-1: due diligence page loads — entry point for deal memo generation', async () => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
  });

  await login(page);
  await page.goto(DD_PAGE_URL);
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('ion-title').filter({ hasText: /Due Diligence/i })).toBeVisible({ timeout: 10_000 });

  await screenshot(page, 'dm-1-dd-page');

  const critical = errors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
});

// ============================================================
// DM-2: DD Room list or empty state renders
// ============================================================
test('DM-2: DD room list or empty state renders on due diligence page', async () => {
  await login(page);
  await page.goto(DD_PAGE_URL);
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('ion-title').filter({ hasText: /Due Diligence/i })).toBeVisible({ timeout: 10_000 });

  // Either a room list, spinner, or empty state
  await expect(
    page.locator('ion-list, .empty-state, .room-grid, ion-item').first()
  ).toBeVisible({ timeout: 10_000 });

  await screenshot(page, 'dm-2-room-list');
});

// ============================================================
// DM-3: Create DD Room button is present
// ============================================================
test('DM-3: create DD room button visible on due diligence page', async () => {
  await login(page);
  await page.goto(DD_PAGE_URL);
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('ion-title').filter({ hasText: /Due Diligence/i })).toBeVisible({ timeout: 10_000 });

  // New room button
  await expect(
    page.locator('ion-button').filter({ hasText: /New Room|Create|Add/i }).first()
  ).toBeVisible({ timeout: 5_000 });

  await screenshot(page, 'dm-3-new-room-btn');
});

// ============================================================
// DM-4: Deal Memo workspace loads from route (handles missing job gracefully)
// ============================================================
test('DM-4: deal memo workspace page loads and shows title', async () => {
  await login(page);
  // Navigate with placeholder IDs — page should render its shell even without valid IDs
  const placeholderUrl = `${BASE_URL}/app/agents/legal-department/dd/placeholder-parent/memo/placeholder-memo`;
  await page.goto(placeholderUrl);
  await page.waitForLoadState('domcontentloaded');

  await expect(
    page.locator('ion-title').filter({ hasText: /Deal Memo/i })
  ).toBeVisible({ timeout: 10_000 });

  await screenshot(page, 'dm-4-workspace');
});

// ============================================================
// DM-5: Console health check
// ============================================================
test('DM-5: no unhandled JS errors or 5xx responses on DD page load', async () => {
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
  });
  page.on('response', (res) => {
    if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
  });

  await login(page);
  await page.goto(DD_PAGE_URL);
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('ion-title').filter({ hasText: /Due Diligence/i })).toBeVisible({ timeout: 10_000 });

  const critical = consoleErrors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
  expect(serverErrors).toHaveLength(0);
});

/**
 * Monte Carlo Trial Simulator E2E Test
 *
 * Case record setup → probabilistic trial simulation → HITL results review
 *
 * Run: BASE_URL=http://localhost:6201 npx playwright test monte-carlo
 */

import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import {
  DEBUG, BASE_URL,
  HITL_TIMEOUT, COMPLETE_TIMEOUT, JOB_PROCESSING_TIMEOUT,
  login, screenshot,
} from './helpers';

const PAGE_URL = `${BASE_URL}/app/agents/legal-department/monte-carlo`;

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
// MC-1: Page Load
// ============================================================
test('MC-1: monte carlo trial simulator page loads without errors', async () => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
  });

  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  // Title: "Trial Simulator"
  await expect(page.locator('ion-title').filter({ hasText: /Trial Simulator/i })).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator('ion-toolbar ion-button').filter({ hasText: /Run New Simulation/i }).last()
  ).toBeVisible({ timeout: 5_000 });

  await screenshot(page, 'mc-1-loaded');

  const critical = errors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
});

// ============================================================
// MC-2: Case record form is accessible
// ============================================================
test('MC-2: clicking "Run New Simulation" shows case record form', async () => {
  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /Run New Simulation/i }).last();
  await newBtn.click();

  // CaseRecordForm modal opens with "New Trial Simulation" title
  await expect(
    page.locator('ion-title').filter({ hasText: /New Trial Simulation/i })
  ).toBeVisible({ timeout: 5_000 });

  await screenshot(page, 'mc-2-form');
});

// ============================================================
// MC-3: Job list loads (activity list)
// ============================================================
test('MC-3: activity list renders on page load', async () => {
  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  // Either a job list or empty state should be present
  await expect(
    page.locator('ion-list, .empty-state, .empty, ion-item').first()
  ).toBeVisible({ timeout: 10_000 });

  await screenshot(page, 'mc-3-list');
});

// ============================================================
// MC-4: Console health check
// ============================================================
test('MC-4: no unhandled JS errors or 5xx responses on page load', async () => {
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

  await expect(page.locator('ion-title').filter({ hasText: /Trial Simulator/i })).toBeVisible({ timeout: 10_000 });

  const critical = consoleErrors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
  expect(serverErrors).toHaveLength(0);
});

/**
 * Due Diligence Room E2E Test
 *
 * Multi-document room workflow — create rooms, upload documents, run analysis.
 *
 * Run: BASE_URL=http://localhost:6201 npx playwright test due-diligence
 */

import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEBUG, BASE_URL,
  HITL_TIMEOUT, COMPLETE_TIMEOUT, JOB_PROCESSING_TIMEOUT,
  createTestTextFile, login, screenshot,
} from './helpers';

const PAGE_URL = `${BASE_URL}/app/agents/legal-department/due-diligence`;

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
// DD-1: Page Load
// ============================================================
test('DD-1: due diligence room page loads without errors', async () => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
  });

  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  await expect(page.locator('ion-title').filter({ hasText: /Due Diligence/i })).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator('ion-toolbar ion-button').filter({ hasText: /New Room/i }).last()
  ).toBeVisible({ timeout: 5_000 });

  await screenshot(page, 'dd-1-loaded');

  const critical = errors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
});

// ============================================================
// DD-2: Create room modal opens
// ============================================================
test('DD-2: create DD room modal opens', async () => {
  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /New Room/i }).last();
  await newBtn.click();

  // Modal opens — verify it's visible
  await expect(
    page.locator('ion-modal').filter({ hasText: /room|matter|create/i }).first()
  ).toBeVisible({ timeout: 5_000 });

  await screenshot(page, 'dd-2-modal');
});

// ============================================================
// DD-3: Room creation submits a job
// ============================================================
test('DD-3: creating a DD room creates a queued job that moves to processing', async () => {
  const testFile = createTestTextFile('due-diligence-doc.txt');
  try {
    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');

    const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /New Room/i }).last();
    await newBtn.click();

    // Wait for modal
    await page.waitForTimeout(1_000);

    // Fill room name (ion-input)
    const nameInput = page.locator('ion-input').first().locator('input');
    await nameInput.fill('E2E Test DD Room');

    // Upload document if the modal has a file input
    const fileInput = page.locator('input[type="file"]');
    const fileInputCount = await fileInput.count();
    if (fileInputCount > 0) {
      await fileInput.first().setInputFiles(testFile);
      await page.waitForTimeout(300);
    }

    // Click create/submit button
    const submitBtn = page.locator('ion-button').filter({ hasText: /Create|Start|Launch|Submit/i }).last();
    await submitBtn.click();

    // A job or room appears
    await expect(
      page.locator('ion-badge, ion-item').filter({ hasText: /queued|processing|active|E2E Test/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    await screenshot(page, 'dd-3-submitted');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// DD-4: Console health check
// ============================================================
test('DD-4: no unhandled JS errors or 5xx responses on page load', async () => {
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

  await expect(page.locator('ion-title').filter({ hasText: /Due Diligence/i })).toBeVisible({ timeout: 10_000 });

  const critical = consoleErrors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
  expect(serverErrors).toHaveLength(0);
});

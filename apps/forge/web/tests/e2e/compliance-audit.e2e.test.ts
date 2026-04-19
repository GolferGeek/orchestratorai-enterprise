/**
 * Compliance Audit E2E Test
 *
 * File upload → regulatory scan → HITL "Submit decision" → audit report
 *
 * Run: BASE_URL=http://localhost:6201 npx playwright test compliance-audit
 */

import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEBUG, BASE_URL,
  HITL_TIMEOUT, COMPLETE_TIMEOUT, JOB_PROCESSING_TIMEOUT,
  createTestTextFile, login, screenshot,
  submitJobAndWaitForHITL, approveHITL,
} from './helpers';

const PAGE_URL = `${BASE_URL}/app/agents/legal-department/compliance-audit`;

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
// CA-1: Page Load
// ============================================================
test('CA-1: compliance audit page loads without errors', async () => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
  });

  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  await expect(page.locator('ion-title').filter({ hasText: /Compliance Audit/i })).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator('ion-toolbar ion-button').filter({ hasText: /New Audit/i }).last()
  ).toBeVisible({ timeout: 5_000 });

  await screenshot(page, 'ca-1-loaded');

  const critical = errors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
});

// ============================================================
// CA-2: Create modal opens with file upload
// ============================================================
test('CA-2: create compliance audit modal opens and accepts a file', async () => {
  const testFile = createTestTextFile();
  try {
    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');

    const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /New Audit/i }).last();
    await newBtn.click();

    // Modal title: "Create Compliance Audit"
    await expect(
      page.locator('ion-title').filter({ hasText: /Create Compliance Audit/i })
    ).toBeVisible({ timeout: 5_000 });

    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);

    // File count badge shows 1 file
    await expect(
      page.locator('ion-modal').filter({ hasText: /1 file|test-document/i })
    ).toBeVisible({ timeout: 5_000 });

    await screenshot(page, 'ca-2-file-selected');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// CA-3: Job submission creates a queued job that moves to processing
// ============================================================
test('CA-3: submitting files creates a queued job that moves to processing', async () => {
  const testFile = createTestTextFile();
  try {
    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');

    const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /New Audit/i }).last();
    await newBtn.click();
    await page.locator('ion-title').filter({ hasText: /Create Compliance Audit/i }).waitFor({ timeout: 5_000 });
    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);

    // Submit (button says "Run Compliance Scan" or "Run Full Audit" depending on mode)
    await page.locator('ion-button').filter({ hasText: /Run Compliance Scan|Run Full Audit/i }).first().click();

    await expect(
      page.locator('ion-badge').filter({ hasText: /queued|processing/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.locator('ion-badge').filter({ hasText: /processing/i }).first()
    ).toBeVisible({ timeout: JOB_PROCESSING_TIMEOUT });

    await screenshot(page, 'ca-3-processing');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// CA-4: HITL approve path (Submit decision)
// ============================================================
test('CA-4: job reaches awaiting_review, HITL modal opens, approve completes job', async () => {
  const testFile = createTestTextFile();
  try {
    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');

    const initialCount = await page.locator('ion-item').filter({
      has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
    }).count();

    // Submit
    const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /New Audit/i }).last();
    await newBtn.click();
    await page.locator('ion-title').filter({ hasText: /Create Compliance Audit/i }).waitFor({ timeout: 5_000 });
    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);
    await page.locator('ion-button').filter({ hasText: /Run Compliance Scan|Run Full Audit/i }).first().click();

    // Wait for new awaiting_review row
    await page.waitForFunction(
      (init) => {
        const rows = document.querySelectorAll('ion-item');
        let count = 0;
        for (const row of rows) {
          for (const b of row.querySelectorAll('ion-badge')) {
            if (b.textContent?.includes('awaiting_review')) count++;
          }
        }
        return count > init;
      },
      initialCount,
      { timeout: HITL_TIMEOUT },
    );
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'ca-4-awaiting-review');

    // Uses LegalJobReviewModal → DocumentAnalysisReviewSection → "Submit decision"
    await page.locator('ion-item').filter({
      has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
    }).first().click();

    await page.locator('ion-title').filter({ hasText: /HITL Review/i }).waitFor({ timeout: 10_000 });
    const submitBtn = page.locator('ion-button').filter({ hasText: /submit decision/i }).first();
    await submitBtn.waitFor({ timeout: 15_000 });
    await screenshot(page, 'ca-4-review-modal');
    await submitBtn.click();

    await page.locator('ion-title').filter({ hasText: /HITL Review/i }).waitFor({ state: 'hidden', timeout: 30_000 });

    await expect(
      page.locator('ion-badge').filter({ hasText: /completed/i }).first()
    ).toBeVisible({ timeout: COMPLETE_TIMEOUT });

    await screenshot(page, 'ca-4-completed');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// CA-5: Console health check
// ============================================================
test('CA-5: no unhandled JS errors or 5xx responses during submit flow', async () => {
  const testFile = createTestTextFile();
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];

  try {
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
    });
    page.on('response', (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
    });

    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');

    const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /New Audit/i }).last();
    await newBtn.click();
    await page.locator('ion-title').filter({ hasText: /Create Compliance Audit/i }).waitFor({ timeout: 5_000 });
    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);
    await page.locator('ion-button').filter({ hasText: /Run Compliance Scan|Run Full Audit/i }).first().click();

    await expect(
      page.locator('ion-badge').filter({ hasText: /queued|processing/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    const critical = consoleErrors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
    expect(critical).toHaveLength(0);
    expect(serverErrors).toHaveLength(0);
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

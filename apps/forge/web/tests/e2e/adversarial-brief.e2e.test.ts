/**
 * Adversarial Brief (Brief Stress Test) E2E Test
 *
 * File upload → debate rounds (Blue/Red/Judge) → HITL "Approve Without Changes" → fortified brief
 *
 * Run: BASE_URL=http://localhost:6201 npx playwright test adversarial-brief
 */

import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEBUG, BASE_URL,
  HITL_TIMEOUT, COMPLETE_TIMEOUT, JOB_PROCESSING_TIMEOUT,
  createTestTextFile, login, screenshot,
} from './helpers';

const PAGE_URL = `${BASE_URL}/app/agents/legal-department/adversarial-brief`;

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
// AB-1: Page Load
// ============================================================
test('AB-1: adversarial brief page loads without errors', async () => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
  });

  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('load');

  // Title is "Brief Stress Test"
  await expect(page.locator('ion-title').filter({ hasText: /Brief Stress Test/i })).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last()
  ).toBeVisible({ timeout: 5_000 });

  await screenshot(page, 'ab-1-loaded');

  const critical = errors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
});

// ============================================================
// AB-2: Create modal opens with file upload
// ============================================================
test('AB-2: stress test create modal opens and accepts a file', async () => {
  const testFile = createTestTextFile();
  try {
    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('load');

    const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
    await newBtn.click();

    // Modal title: "Stress-Test a Brief"
    await expect(
      page.locator('ion-title').filter({ hasText: /Stress-Test a Brief/i })
    ).toBeVisible({ timeout: 5_000 });

    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);

    // File count shows 1 file selected
    await expect(
      page.locator('ion-modal').filter({ hasText: /test-document|1 file/i })
    ).toBeVisible({ timeout: 5_000 });

    await screenshot(page, 'ab-2-file-selected');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// AB-3: Job submission creates a queued job that moves to processing
// ============================================================
test('AB-3: submitting a file creates a queued job that moves to processing', async () => {
  const testFile = createTestTextFile();
  try {
    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('load');

    const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
    await newBtn.click();
    await page.locator('ion-title').filter({ hasText: /Stress-Test a Brief/i }).waitFor({ timeout: 5_000 });
    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);
    // Set maxRounds=1 so the workflow completes faster in testing
    await page.locator('.config-header').filter({ hasText: /Debate Configuration/i }).click();
    await page.locator('input[type="number"]').first().fill('1');
    await page.locator('ion-button').filter({ hasText: /Start Stress Test/i }).first().click();

    // Fast workflows may skip queued/processing and land at awaiting_review
    await expect(
      page.locator('ion-badge').filter({ hasText: /queued|processing|awaiting_review/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    await screenshot(page, 'ab-3-processing');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// AB-4: HITL approve path (Approve Without Changes)
// ============================================================
test('AB-4: job reaches awaiting_review, stress test review modal opens, approve completes', async () => {
  const testFile = createTestTextFile();
  try {
    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('load');

    const initialCount = await page.locator('ion-item').filter({
      has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
    }).count();

    // Only submit a new job if there is no job already in-flight from a prior test.
    // The worker has ollama concurrency=1, so submitting a second job while AB-3's
    // job is still running would push the wait time past HITL_TIMEOUT.
    const inFlightCount = await page.locator('ion-badge')
      .filter({ hasText: /queued|processing/i }).count();

    if (inFlightCount === 0) {
      const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
      await newBtn.click();
      await page.locator('ion-title').filter({ hasText: /Stress-Test a Brief/i }).waitFor({ timeout: 5_000 });
      await page.locator('input[type="file"]').setInputFiles(testFile);
      await page.waitForTimeout(300);
      // Set maxRounds=1 so the workflow completes faster in testing
      await page.locator('.config-header').filter({ hasText: /Debate Configuration/i }).click();
      await page.locator('input[type="number"]').first().fill('1');
      await page.locator('ion-button').filter({ hasText: /Start Stress Test/i }).first().click();
    }

    // Wait for an awaiting_review row (either from this submission or AB-3's in-flight job)
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
    await page.waitForLoadState('load');
    await screenshot(page, 'ab-4-awaiting-review');

    // Click the job row — AdversarialBriefPage handles routing
    await page.locator('ion-item').filter({
      has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
    }).first().click();

    // Review modal title: "Review Stress Test"
    await page.locator('ion-title').filter({ hasText: /Review Stress Test/i }).waitFor({ timeout: 10_000 });

    // Approve without changes (simplest path)
    const approveBtn = page.locator('ion-button').filter({ hasText: /Approve Without Changes/i }).first();
    await approveBtn.waitFor({ timeout: 45_000 });
    await screenshot(page, 'ab-4-review-modal');
    await approveBtn.click();

    // Modal closes
    await page.locator('ion-title').filter({ hasText: /Review Stress Test/i }).waitFor({ state: 'hidden', timeout: 30_000 });

    // Job completes
    await expect(
      page.locator('ion-badge').filter({ hasText: /completed/i }).first()
    ).toBeVisible({ timeout: COMPLETE_TIMEOUT });

    await screenshot(page, 'ab-4-completed');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// AB-5: Console health check
// ============================================================
test('AB-5: no unhandled JS errors or 5xx responses during submit flow', async () => {
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
    await page.waitForLoadState('load');

    const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
    await newBtn.click();
    await page.locator('ion-title').filter({ hasText: /Stress-Test a Brief/i }).waitFor({ timeout: 5_000 });
    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);
    await page.locator('ion-button').filter({ hasText: /Start Stress Test/i }).first().click();

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

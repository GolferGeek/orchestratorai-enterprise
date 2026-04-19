/**
 * Contract Review E2E Test
 *
 * Validates the full contract-review workflow:
 * file upload → async job → SSE/StageLadder → HITL approve → redline + risk tabs
 *
 * Run: BASE_URL=http://localhost:6201 npx playwright test contract-review
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

const PAGE_URL = `${BASE_URL}/app/agents/legal-department/contract-review`;

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
// CR-1: Page Load
// ============================================================
test('CR-1: contract review page loads without errors', async () => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) {
      errors.push(msg.text());
    }
  });

  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('domcontentloaded');

  // Title present
  await expect(page.locator('ion-title').filter({ hasText: /contract review/i })).toBeVisible({ timeout: 10_000 });

  // "New" upload button visible
  await expect(
    page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last()
  ).toBeVisible({ timeout: 5_000 });

  await screenshot(page, 'cr-1-loaded');

  const criticalErrors = errors.filter(
    e => !e.includes('net::ERR') && !e.includes('favicon') && !e.includes('5150'),
  );
  expect(criticalErrors).toHaveLength(0);
});

// ============================================================
// CR-2: Upload modal opens and accepts a file
// ============================================================
test('CR-2: upload modal opens and accepts a text file', async () => {
  const testFile = createTestTextFile();
  try {
    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    const uploadBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
    await uploadBtn.click();

    // Modal opens — verify file input is present
    await expect(page.locator('input[type="file"]')).toBeAttached({ timeout: 5_000 });

    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);

    // File name appears somewhere in the upload modal
    const uploadModal = page.locator('ion-modal').filter({ hasText: /test-document/i });
    await expect(uploadModal).toBeVisible({ timeout: 5_000 });

    await screenshot(page, 'cr-2-file-selected');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// CR-3: Job submission creates a queued job that moves to processing
// ============================================================
test('CR-3: submitting a file creates a queued job that moves to processing', async () => {
  const testFile = createTestTextFile();
  try {
    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    const uploadBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
    await uploadBtn.click();
    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);
    await page.locator('ion-button').filter({ hasText: /queue job/i }).first().click();

    // A queued or processing badge appears
    await expect(
      page.locator('ion-badge').filter({ hasText: /queued|processing/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    // Transitions to processing within 30s
    await expect(
      page.locator('ion-badge').filter({ hasText: /processing/i }).first()
    ).toBeVisible({ timeout: JOB_PROCESSING_TIMEOUT });

    await screenshot(page, 'cr-3-processing');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// CR-4: SSE stream connection is established
// ============================================================
test('CR-4: SSE stream connection is established after job submission', async () => {
  const testFile = createTestTextFile();
  const sseRequests: string[] = [];

  page.on('request', (req) => {
    if (req.url().includes('/stream') || req.url().includes('observability')) {
      sseRequests.push(req.url());
    }
  });

  try {
    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    const uploadBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
    await uploadBtn.click();
    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);
    await page.locator('ion-button').filter({ hasText: /queue job/i }).first().click();

    // Wait for processing state
    await expect(
      page.locator('ion-badge').filter({ hasText: /processing/i }).first()
    ).toBeVisible({ timeout: JOB_PROCESSING_TIMEOUT });

    await page.waitForTimeout(3_000);

    expect(sseRequests.length).toBeGreaterThan(0);
    await screenshot(page, 'cr-4-sse');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// CR-5: HITL approve path
// ============================================================
test('CR-5: job reaches awaiting_review, HITL modal opens, approve completes job', async () => {
  const testFile = createTestTextFile();
  try {
    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    await submitJobAndWaitForHITL(page, testFile);
    await screenshot(page, 'cr-5-awaiting-review');

    await approveHITL(page);
    await screenshot(page, 'cr-5-approved');

    // Job completes
    await expect(
      page.locator('ion-badge').filter({ hasText: /completed/i }).first()
    ).toBeVisible({ timeout: COMPLETE_TIMEOUT });

    await screenshot(page, 'cr-5-completed');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// CR-6: Completed job shows Risk Assessment and Redlined Contract tabs
// ============================================================
test('CR-6: completed contract review job shows both result tabs', async () => {
  const testFile = createTestTextFile();
  try {
    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    await submitJobAndWaitForHITL(page, testFile);
    await approveHITL(page);

    // Wait for completion
    await expect(
      page.locator('ion-badge').filter({ hasText: /completed/i }).first()
    ).toBeVisible({ timeout: COMPLETE_TIMEOUT });

    // Open the completed job's detail modal
    const completedRow = page.locator('ion-item').filter({
      has: page.locator('ion-badge', { hasText: /completed/i }),
    }).first();
    await completedRow.click();

    const detailModal = page.locator('ion-modal.job-detail-modal');
    await expect(detailModal).toBeVisible({ timeout: 8_000 });

    await screenshot(page, 'cr-6-detail-modal');

    // Both segment tabs must be visible
    await expect(
      detailModal.locator('ion-segment-button').filter({ hasText: /risk assessment/i }).first()
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      detailModal.locator('ion-segment-button').filter({ hasText: /redlined contract/i }).first()
    ).toBeVisible({ timeout: 5_000 });

    // No [object Object] in the modal
    const rawJson = await detailModal.locator('text=/\\[object Object\\]/').count();
    expect(rawJson).toBe(0);

    await screenshot(page, 'cr-6-tabs');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// CR-7: Console health check
// ============================================================
test('CR-7: no unhandled JS errors or 5xx responses during full flow', async () => {
  const testFile = createTestTextFile();
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];

  try {
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        consoleErrors.push(msg.text());
      }
    });
    page.on('response', (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
    });

    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    const uploadBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
    await uploadBtn.click();
    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);
    await page.locator('ion-button').filter({ hasText: /queue job/i }).first().click();

    await expect(
      page.locator('ion-badge').filter({ hasText: /queued|processing/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    const criticalErrors = consoleErrors.filter(
      e => !e.includes('net::ERR') && !e.includes('favicon') && !e.includes('5150'),
    );
    expect(criticalErrors).toHaveLength(0);
    expect(serverErrors).toHaveLength(0);
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

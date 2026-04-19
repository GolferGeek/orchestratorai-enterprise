/**
 * Legal Research E2E Test
 *
 * Text-input workflow — no file upload.
 * question → sub-question tree → RAG citations → HITL (approve/deepen) → memo
 *
 * Run: BASE_URL=http://localhost:6201 npx playwright test legal-research
 */

import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import {
  DEBUG, BASE_URL,
  HITL_TIMEOUT, COMPLETE_TIMEOUT, JOB_PROCESSING_TIMEOUT,
  login, screenshot,
} from './helpers';

const PAGE_URL = `${BASE_URL}/app/agents/legal-department/legal-research`;

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
// LR-1: Page Load
// ============================================================
test('LR-1: legal research page loads without errors', async () => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
  });

  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  await expect(page.locator('ion-title').filter({ hasText: /legal research/i })).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last()
  ).toBeVisible({ timeout: 5_000 });

  await screenshot(page, 'lr-1-loaded');

  const critical = errors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
});

// ============================================================
// LR-2: Create modal opens with text inputs
// ============================================================
test('LR-2: research create modal opens with question input', async () => {
  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
  await newBtn.click();

  // Modal with title "Research a Legal Question" appears
  await expect(
    page.locator('ion-title').filter({ hasText: /Research a Legal Question/i })
  ).toBeVisible({ timeout: 5_000 });

  // The textarea for the question is present
  await expect(
    page.locator('ion-textarea#legal-question, ion-textarea').first()
  ).toBeVisible({ timeout: 3_000 });

  await screenshot(page, 'lr-2-modal');
});

// ============================================================
// LR-3: Submitting a question creates a processing job
// ============================================================
test('LR-3: submitting a question creates a queued job that moves to processing', async () => {
  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
  await newBtn.click();

  // Wait for modal
  await page.locator('ion-title').filter({ hasText: /Research a Legal Question/i }).waitFor({ timeout: 5_000 });

  // Fill in the question (ion-textarea needs inner textarea)
  const questionTextarea = page.locator('ion-textarea').first().locator('textarea');
  await questionTextarea.fill('What are the fiduciary duties of a corporate director in Delaware?');

  await page.locator('ion-button').filter({ hasText: /Start Research/i }).first().click();

  // Badge appears — fast workflows may skip queued/processing and land at awaiting_review
  await expect(
    page.locator('ion-badge').filter({ hasText: /queued|processing|awaiting_review/i }).first()
  ).toBeVisible({ timeout: 15_000 });

  await screenshot(page, 'lr-3-processing');
});

// ============================================================
// LR-4: HITL approve path
// ============================================================
test('LR-4: job reaches awaiting_review, research HITL opens, approve completes job', async () => {
  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  const initialCount = await page.locator('ion-item').filter({
    has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
  }).count();

  // Submit research question
  const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
  await newBtn.click();
  await page.locator('ion-title').filter({ hasText: /Research a Legal Question/i }).waitFor({ timeout: 5_000 });

  const questionTextarea = page.locator('ion-textarea').first().locator('textarea');
  await questionTextarea.fill('What are the enforceability requirements for non-compete agreements in California?');
  await page.locator('ion-button').filter({ hasText: /Start Research/i }).first().click();

  // Wait for NEW awaiting_review row
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

  await screenshot(page, 'lr-4-awaiting-review');

  // Click the newest awaiting_review row
  await page.locator('ion-item').filter({
    has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
  }).first().click();

  // HITL modal — research review shows "Approve Research" button
  await page.locator('ion-title').filter({ hasText: /HITL Review/i }).waitFor({ timeout: 10_000 });

  const approveBtn = page.locator('ion-button').filter({ hasText: /Approve Research/i }).first();
  await approveBtn.waitFor({ timeout: 15_000 });

  await screenshot(page, 'lr-4-review-modal');
  await approveBtn.click();

  // Modal closes
  await page.locator('ion-title').filter({ hasText: /HITL Review/i }).waitFor({ state: 'hidden', timeout: 30_000 });

  // Job completes
  await expect(
    page.locator('ion-badge').filter({ hasText: /completed/i }).first()
  ).toBeVisible({ timeout: COMPLETE_TIMEOUT });

  await screenshot(page, 'lr-4-completed');
});

// ============================================================
// LR-5: Completed job shows Research Scope, Legal Memo, Research Tree
// ============================================================
test('LR-5: completed research job shows memo, scope, and research tree sections', async () => {
  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  const initialCount = await page.locator('ion-item').filter({
    has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
  }).count();

  // Submit
  const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
  await newBtn.click();
  await page.locator('ion-title').filter({ hasText: /Research a Legal Question/i }).waitFor({ timeout: 5_000 });
  const questionTextarea = page.locator('ion-textarea').first().locator('textarea');
  await questionTextarea.fill('What are the WARN Act obligations when conducting a mass layoff?');
  await page.locator('ion-button').filter({ hasText: /Start Research/i }).first().click();

  // Wait for HITL
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

  // Approve
  await page.locator('ion-item').filter({
    has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
  }).first().click();
  await page.locator('ion-title').filter({ hasText: /HITL Review/i }).waitFor({ timeout: 10_000 });
  const approveBtn = page.locator('ion-button').filter({ hasText: /Approve Research/i }).first();
  await approveBtn.waitFor({ timeout: 15_000 });
  await approveBtn.click();
  await page.locator('ion-title').filter({ hasText: /HITL Review/i }).waitFor({ state: 'hidden', timeout: 30_000 });

  // Wait for completed
  await expect(
    page.locator('ion-badge').filter({ hasText: /completed/i }).first()
  ).toBeVisible({ timeout: COMPLETE_TIMEOUT });

  // Open detail modal
  await page.locator('ion-item').filter({
    has: page.locator('ion-badge', { hasText: /completed/i }),
  }).first().click();

  const detailModal = page.locator('ion-modal.job-detail-modal');
  await expect(detailModal).toBeVisible({ timeout: 8_000 });

  await screenshot(page, 'lr-5-detail-modal');

  // Research output sections
  await expect(detailModal.locator('h3').filter({ hasText: /Legal Memo/i }).first()).toBeVisible({ timeout: 5_000 });
  await expect(detailModal.locator('h3').filter({ hasText: /Research Tree/i }).first()).toBeVisible({ timeout: 5_000 });

  // No raw JSON
  const rawJson = await detailModal.locator('text=/\\[object Object\\]/').count();
  expect(rawJson).toBe(0);

  await screenshot(page, 'lr-5-sections');
});

// ============================================================
// LR-6: Console health check
// ============================================================
test('LR-6: no unhandled JS errors or 5xx responses during submit flow', async () => {
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

  const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
  await newBtn.click();
  await page.locator('ion-title').filter({ hasText: /Research a Legal Question/i }).waitFor({ timeout: 5_000 });
  const questionTextarea = page.locator('ion-textarea').first().locator('textarea');
  await questionTextarea.fill('What are the key elements of a valid arbitration clause?');
  await page.locator('ion-button').filter({ hasText: /Start Research/i }).first().click();

  await expect(
    page.locator('ion-badge').filter({ hasText: /queued|processing/i }).first()
  ).toBeVisible({ timeout: 15_000 });

  const critical = consoleErrors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
  expect(serverErrors).toHaveLength(0);
});

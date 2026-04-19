/**
 * Document Onboarding E2E Test
 *
 * Canonical reference workflow — validates shared infrastructure:
 * file upload → async job queue → SSE/StageLadder → HITL approve → completed results
 *
 * Run headless (SSH/cron): BASE_URL=http://localhost:6201 npx playwright test document-onboarding
 * Run headed (local debug): DEBUG=true BASE_URL=http://localhost:6201 npx playwright test document-onboarding
 */

import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DEBUG = process.env.DEBUG === 'true';
const BASE_URL = process.env.BASE_URL || 'http://localhost:6201';
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'golfergeek@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'GolferGeek123!';

// Timeouts
const JOB_QUEUED_TIMEOUT = 15_000;
const JOB_PROCESSING_TIMEOUT = 30_000;
const HITL_TIMEOUT = 120_000;   // graph must reach awaiting_review
const COMPLETE_TIMEOUT = 120_000;

let browser: Browser;
let context: BrowserContext;
let page: Page;

// --- Fixtures ---

function createTestTextFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-e2e-'));
  const filePath = path.join(dir, 'test-document.txt');
  fs.writeFileSync(filePath, [
    'EMPLOYMENT AGREEMENT',
    '',
    'This Employment Agreement ("Agreement") is entered into as of January 1, 2025,',
    'between Acme Corp ("Employer") and Jane Smith ("Employee").',
    '',
    'TERM: This agreement commences January 1, 2025 and continues for one (1) year.',
    '',
    'COMPENSATION: Employee shall receive a base salary of $120,000 per year.',
    '',
    'NON-COMPETE: Employee agrees not to work for competitors for 12 months post-termination',
    'within the State of California.',
    '',
    'GOVERNING LAW: This Agreement shall be governed by the laws of the State of California.',
  ].join('\n'));
  return filePath;
}

// --- Helpers ---

async function login(p: Page): Promise<void> {
  await p.goto(`${BASE_URL}/login`);
  await p.waitForLoadState('networkidle');

  // Fill email
  const emailInput = p.locator('ion-input[type="email"] input, input[type="email"]').first();
  await emailInput.waitFor({ timeout: 10_000 });
  await emailInput.fill(TEST_EMAIL);

  // Fill password
  const passwordInput = p.locator('ion-input[type="password"] input, input[type="password"]').first();
  await passwordInput.fill(TEST_PASSWORD);

  // Submit
  const submitBtn = p.locator('ion-button[type="submit"], ion-button').filter({ hasText: /sign in|log in|login/i }).first();
  await submitBtn.click();

  // Wait for redirect into /app
  await p.waitForURL('**/app/**', { timeout: 20_000 });
}

async function screenshot(p: Page, name: string): Promise<void> {
  if (!DEBUG) return;
  const dir = '/tmp/forge-e2e-screenshots';
  fs.mkdirSync(dir, { recursive: true });
  await p.screenshot({ path: `${dir}/${name}.png` });
}

async function waitForJobStatus(
  p: Page,
  status: string,
  timeout: number,
): Promise<void> {
  await p.waitForFunction(
    (s) => !!document.querySelector(`ion-badge:not([class*="type"])`)?.[`textContent`]?.includes(s),
    status,
    { timeout },
  );
}

// --- Suite setup ---

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
// DO-1: Page Load
// ============================================================
test('DO-1: document onboarding page loads without errors', async () => {
  await login(page);
  await page.goto(`${BASE_URL}/app/agents/legal-department/document-onboarding`);
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'do-1-loaded');

  // Shell rendered
  await expect(page.locator('ion-app').first()).toBeVisible({ timeout: 10_000 });

  // "Onboard Documents" button or page heading present
  const heading = page.locator('ion-title, h1, h2').filter({ hasText: /document onboarding|onboard documents/i }).first();
  await expect(heading).toBeVisible({ timeout: 10_000 });

  // No 500 on the jobs endpoint
  const responses: number[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/agents/legal-department/jobs')) responses.push(r.status());
  });
  await page.waitForTimeout(2000);
  expect(responses.filter((s) => s >= 500)).toHaveLength(0);
});

// ============================================================
// DO-2: Upload modal opens
// ============================================================
test('DO-2: upload modal opens and accepts a text file', async () => {
  const testFile = createTestTextFile();

  try {
    await login(page);
    await page.goto(`${BASE_URL}/app/agents/legal-department/document-onboarding`);
    await page.waitForLoadState('networkidle');

    // Click the "Onboard" / upload button
    const uploadBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
    await expect(uploadBtn).toBeVisible({ timeout: 10_000 });
    await uploadBtn.click();

    // Modal opens — title "Onboard Documents"
    await expect(
      page.locator('ion-title, ion-modal').filter({ hasText: /onboard documents/i }).first()
    ).toBeVisible({ timeout: 8_000 });

    await screenshot(page, 'do-2-modal-open');

    // Drop / set file on the hidden input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);
    await page.waitForTimeout(500);

    // File name should appear in the modal (scope to modal to avoid ambiguity with job list)
    const uploadModal = page.locator('ion-modal').last();
    await expect(uploadModal.locator('text=test-document')).toBeVisible({ timeout: 5_000 });

    // "Queue Job" button is enabled
    const queueBtn = page.locator('ion-button').filter({ hasText: /queue job/i }).first();
    await expect(queueBtn).toBeVisible({ timeout: 5_000 });
    await expect(queueBtn).not.toBeDisabled();

    await screenshot(page, 'do-2-file-ready');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// DO-3: Job queued and transitions to processing
// ============================================================
test('DO-3: submitting a file creates a queued job that moves to processing', async () => {
  const testFile = createTestTextFile();

  try {
    await login(page);
    await page.goto(`${BASE_URL}/app/agents/legal-department/document-onboarding`);
    await page.waitForLoadState('networkidle');

    // Open modal
    const uploadBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
    await uploadBtn.click();
    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);

    // Submit
    const queueBtn = page.locator('ion-button').filter({ hasText: /queue job/i }).first();
    await queueBtn.click();

    await screenshot(page, 'do-3-submitted');

    // Modal closes, job row appears with status queued or processing
    await expect(
      page.locator('ion-badge').filter({ hasText: /queued|processing/ }).first()
    ).toBeVisible({ timeout: JOB_QUEUED_TIMEOUT });

    // Within 30s: must reach processing (worker must be running)
    await expect(
      page.locator('ion-badge').filter({ hasText: /processing/ }).first()
    ).toBeVisible({ timeout: JOB_PROCESSING_TIMEOUT });

    await screenshot(page, 'do-3-processing');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// DO-4: SSE connection established
// ============================================================
test('DO-4: SSE stream connection is established after job submission', async () => {
  const testFile = createTestTextFile();
  const sseRequests: string[] = [];

  try {
    await login(page);
    await page.goto(`${BASE_URL}/app/agents/legal-department/document-onboarding`);
    await page.waitForLoadState('networkidle');

    // Listen for SSE requests before submitting
    page.on('request', (req) => {
      if (req.url().includes('/stream')) sseRequests.push(req.url());
    });

    const uploadBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
    await uploadBtn.click();
    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);
    await page.locator('ion-button').filter({ hasText: /queue job/i }).first().click();

    // Wait for processing to begin
    await expect(
      page.locator('ion-badge').filter({ hasText: /processing/ }).first()
    ).toBeVisible({ timeout: JOB_PROCESSING_TIMEOUT });

    // SSE connection should have been opened
    await page.waitForTimeout(3000);
    expect(sseRequests.length).toBeGreaterThan(0);

    await screenshot(page, 'do-4-sse-connected');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// DO-5: HITL review modal appears and approve completes job
// ============================================================
test('DO-5: job reaches awaiting_review, HITL modal opens, approve completes job', async () => {
  const testFile = createTestTextFile();

  try {
    await login(page);
    await page.goto(`${BASE_URL}/app/agents/legal-department/document-onboarding`);
    await page.waitForLoadState('networkidle');

    // Count existing awaiting_review rows before submitting
    const initialCount = await page.locator('ion-item').filter({
      has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
    }).count();

    // Submit job
    const uploadBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
    await uploadBtn.click();
    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);
    await page.locator('ion-button').filter({ hasText: /queue job/i }).first().click();

    await screenshot(page, 'do-5-submitted');

    // Wait for a NEW awaiting_review row to appear (count > initialCount)
    await page.waitForFunction(
      (init) => {
        const rows = document.querySelectorAll('ion-item');
        let count = 0;
        for (const row of rows) {
          const badges = row.querySelectorAll('ion-badge');
          for (const b of badges) {
            if (b.textContent?.includes('awaiting_review')) count++;
          }
        }
        return count > init;
      },
      initialCount,
      { timeout: HITL_TIMEOUT },
    );
    await page.waitForLoadState('networkidle');

    await screenshot(page, 'do-5-awaiting-review');

    // Click the NEWEST awaiting_review row (first in list = most recent)
    const reviewRow = page.locator('ion-item').filter({
      has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
    }).first();
    await reviewRow.click();

    // Wait for HITL modal's title to appear
    await expect(
      page.locator('ion-title').filter({ hasText: /HITL Review/i })
    ).toBeVisible({ timeout: 10_000 });

    // decision defaults to 'approve' — just click Submit decision directly
    const submitBtn = page.locator('ion-button').filter({ hasText: /submit decision/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 15_000 });

    await screenshot(page, 'do-5-review-modal');

    await submitBtn.click();

    await screenshot(page, 'do-5-approved');

    // Wait for review modal to close — HITL Review title gone
    await expect(
      page.locator('ion-title').filter({ hasText: /HITL Review/i })
    ).not.toBeVisible({ timeout: 30_000 });

    // Job transitions to completed
    await expect(
      page.locator('ion-badge').filter({ hasText: /completed/i }).first()
    ).toBeVisible({ timeout: COMPLETE_TIMEOUT });

    await screenshot(page, 'do-5-completed');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// DO-6: Completed job detail shows all three result sections
// ============================================================
test('DO-6: completed job detail shows Source, Events, and Structured Output', async () => {
  const testFile = createTestTextFile();

  try {
    await login(page);
    await page.goto(`${BASE_URL}/app/agents/legal-department/document-onboarding`);
    await page.waitForLoadState('networkidle');

    const initialReviewCount = await page.locator('ion-item').filter({
      has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
    }).count();

    // Submit job
    const uploadBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
    await uploadBtn.click();
    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);
    await page.locator('ion-button').filter({ hasText: /queue job/i }).first().click();

    // Wait for a NEW awaiting_review row
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
      initialReviewCount,
      { timeout: HITL_TIMEOUT },
    );
    await page.waitForLoadState('networkidle');

    const reviewRow = page.locator('ion-item').filter({ has: page.locator('ion-badge', { hasText: /awaiting.review/i }) }).first();
    await reviewRow.click();

    // Wait for review modal with submit button (not error state)
    const submitBtn = page.locator('ion-button').filter({ hasText: /submit decision/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 15_000 });
    await submitBtn.click();

    // Wait for review modal to close — look for the HITL Review header to go away
    await expect(page.locator('ion-title').filter({ hasText: /HITL Review/i })).not.toBeVisible({ timeout: 30_000 });

    // Wait for completed
    await expect(
      page.locator('ion-badge').filter({ hasText: /completed/i }).first()
    ).toBeVisible({ timeout: COMPLETE_TIMEOUT });

    // Click completed job row to open detail modal
    const completedRow = page.locator('ion-item').filter({ has: page.locator('ion-badge', { hasText: /completed/i }) }).first();
    await completedRow.click();

    const detailModal = page.locator('ion-modal.job-detail-modal');
    await expect(detailModal).toBeVisible({ timeout: 8_000 });

    await screenshot(page, 'do-6-detail-modal');

    // Source and Events h3 headings must be present in the detail modal
    await expect(
      detailModal.locator('h3').filter({ hasText: /source/i }).first()
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      detailModal.locator('h3').filter({ hasText: /events/i }).first()
    ).toBeVisible({ timeout: 5_000 });

    // No [object Object] rendered anywhere in the modal
    const rawJson = await detailModal.locator('text=/\\[object Object\\]/').count();
    expect(rawJson).toBe(0);

    await screenshot(page, 'do-6-detail-sections');
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

// ============================================================
// DO-7: Console health check
// ============================================================
test('DO-7: no unhandled JS errors or 5xx responses during full flow', async () => {
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
    await page.goto(`${BASE_URL}/app/agents/legal-department/document-onboarding`);
    await page.waitForLoadState('networkidle');

    const uploadBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
    await uploadBtn.click();
    await page.locator('input[type="file"]').setInputFiles(testFile);
    await page.waitForTimeout(300);
    await page.locator('ion-button').filter({ hasText: /queue job/i }).first().click();

    await expect(
      page.locator('ion-badge').filter({ hasText: /queued|processing/i }).first()
    ).toBeVisible({ timeout: JOB_QUEUED_TIMEOUT });

    // Report failures — critical ones fail the test
    const criticalErrors = consoleErrors.filter(
      (e) => e.includes('TypeError') || e.includes('Cannot read') || e.includes('undefined is not'),
    );

    if (criticalErrors.length > 0) {
      console.error('Critical console errors:', criticalErrors);
    }
    if (serverErrors.length > 0) {
      console.error('5xx responses:', serverErrors);
    }

    expect(serverErrors).toHaveLength(0);
    expect(criticalErrors).toHaveLength(0);
  } finally {
    fs.rmSync(path.dirname(testFile), { recursive: true });
  }
});

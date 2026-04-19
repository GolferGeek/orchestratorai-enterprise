/**
 * Deposition Prep E2E Test
 *
 * Witness analysis → outline generation → cross-exam prediction
 * Accessed via LegalDepartmentWorkspace "Prep a Deposition" button.
 *
 * Run: BASE_URL=http://localhost:6201 npx playwright test deposition-prep
 */

import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  DEBUG, BASE_URL,
  HITL_TIMEOUT, COMPLETE_TIMEOUT, JOB_PROCESSING_TIMEOUT,
  login, screenshot,
} from './helpers';

const WORKSPACE_URL = `${BASE_URL}/app/agents/legal-department`;

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

function createDepositionFiles(): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-dep-'));
  const transcript = path.join(dir, 'deposition_transcript.txt');
  fs.writeFileSync(transcript, [
    'DEPOSITION OF JOHN SMITH',
    'Case: Acme Corp v. Smith',
    '',
    'Q: What was your role at Acme Corp?',
    'A: I was VP of Engineering from 2020 to 2023.',
    '',
    'Q: Were you involved in the product decision?',
    'A: Yes, I attended all product meetings.',
    '',
    'Q: What was the timeline for the project?',
    'A: We started in Q1 2022 and launched in Q4 2022.',
  ].join('\n'));
  return [transcript];
}

// ============================================================
// DP-1: Legal Department Workspace loads (entry point for deposition)
// ============================================================
test('DP-1: legal department workspace loads and shows Prep a Deposition button', async () => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
  });

  await login(page);
  await page.goto(WORKSPACE_URL);
  await page.waitForLoadState('networkidle');

  await expect(page.locator('ion-title').filter({ hasText: /Legal Department/i })).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator('ion-button').filter({ hasText: /Prep a Deposition/i })
  ).toBeVisible({ timeout: 5_000 });

  await screenshot(page, 'dp-1-workspace');

  const critical = errors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
});

// ============================================================
// DP-2: Prep Deposition modal opens
// ============================================================
test('DP-2: clicking Prep a Deposition opens the modal', async () => {
  await login(page);
  await page.goto(WORKSPACE_URL);
  await page.waitForLoadState('networkidle');

  const prepBtn = page.locator('ion-button').filter({ hasText: /Prep a Deposition/i });
  await prepBtn.waitFor({ timeout: 5_000 });
  await prepBtn.click();

  // Modal title: "Prep a Deposition"
  await expect(
    page.locator('ion-title').filter({ hasText: /Prep a Deposition/i })
  ).toBeVisible({ timeout: 5_000 });

  // File input present
  await expect(page.locator('input[type="file"]')).toBeAttached({ timeout: 3_000 });

  await screenshot(page, 'dp-2-modal');
});

// ============================================================
// DP-3: Job submission creates a queued job
// ============================================================
test('DP-3: submitting a deposition transcript creates a queued job', async () => {
  const files = createDepositionFiles();
  const dir = path.dirname(files[0]);
  try {
    await login(page);
    await page.goto(WORKSPACE_URL);
    await page.waitForLoadState('networkidle');

    const prepBtn = page.locator('ion-button').filter({ hasText: /Prep a Deposition/i });
    await prepBtn.click();

    await page.locator('ion-title').filter({ hasText: /Prep a Deposition/i }).waitFor({ timeout: 5_000 });

    // Fill witness name
    const witnessInput = page.locator('ion-input').first().locator('input');
    await witnessInput.fill('John Smith');

    // Upload transcript
    await page.locator('input[type="file"]').setInputFiles(files);
    await page.waitForTimeout(300);

    // Click Generate
    await page.locator('ion-button').filter({ hasText: /Generate/i }).first().click();

    // Job appears in list
    await expect(
      page.locator('ion-badge').filter({ hasText: /queued|processing/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    await screenshot(page, 'dp-3-submitted');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

// ============================================================
// DP-4: HITL approve path
// ============================================================
test('DP-4: deposition prep job reaches awaiting_review, HITL approve completes job', async () => {
  const files = createDepositionFiles();
  const dir = path.dirname(files[0]);
  try {
    await login(page);
    await page.goto(WORKSPACE_URL);
    await page.waitForLoadState('networkidle');

    const initialCount = await page.locator('ion-item').filter({
      has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
    }).count();

    // Submit
    const prepBtn = page.locator('ion-button').filter({ hasText: /Prep a Deposition/i });
    await prepBtn.click();
    await page.locator('ion-title').filter({ hasText: /Prep a Deposition/i }).waitFor({ timeout: 5_000 });

    const witnessInput = page.locator('ion-input').first().locator('input');
    await witnessInput.fill('Jane Doe');
    await page.locator('input[type="file"]').setInputFiles(files);
    await page.waitForTimeout(300);
    await page.locator('ion-button').filter({ hasText: /Generate/i }).first().click();

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
    await screenshot(page, 'dp-4-awaiting-review');

    // Click awaiting_review row
    await page.locator('ion-item').filter({
      has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
    }).first().click();

    // HITL Review modal via LegalJobReviewModal → DocumentAnalysisReviewSection
    await page.locator('ion-title').filter({ hasText: /HITL Review/i }).waitFor({ timeout: 10_000 });
    const submitBtn = page.locator('ion-button').filter({ hasText: /submit decision/i }).first();
    await submitBtn.waitFor({ timeout: 15_000 });
    await screenshot(page, 'dp-4-review-modal');
    await submitBtn.click();

    await page.locator('ion-title').filter({ hasText: /HITL Review/i }).waitFor({ state: 'hidden', timeout: 30_000 });

    await expect(
      page.locator('ion-badge').filter({ hasText: /completed/i }).first()
    ).toBeVisible({ timeout: COMPLETE_TIMEOUT });

    await screenshot(page, 'dp-4-completed');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

// ============================================================
// DP-5: Console health check
// ============================================================
test('DP-5: no unhandled JS errors or 5xx responses on workspace load', async () => {
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
  });
  page.on('response', (res) => {
    if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
  });

  await login(page);
  await page.goto(WORKSPACE_URL);
  await page.waitForLoadState('networkidle');

  await expect(page.locator('ion-title').filter({ hasText: /Legal Department/i })).toBeVisible({ timeout: 10_000 });

  const critical = consoleErrors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
  expect(serverErrors).toHaveLength(0);
});

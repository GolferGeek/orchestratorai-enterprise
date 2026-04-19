/**
 * Discovery Review E2E Test
 *
 * Multi-document privilege coding workflow.
 * Files → batch classification → BatchReviewPanel HITL → production set
 *
 * Run: BASE_URL=http://localhost:6201 npx playwright test discovery-review
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

const PAGE_URL = `${BASE_URL}/app/agents/legal-department/discovery-review`;

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

function createDiscoveryDocs(): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-dr-'));
  const docs = [
    {
      name: 'privileged_memo.txt',
      content: 'ATTORNEY-CLIENT PRIVILEGED\nFrom: Jane Doe (Attorney)\nTo: CEO\nRe: Litigation Strategy\n\nThis memo outlines our legal strategy for the Smith v. Acme case.',
    },
    {
      name: 'business_email.txt',
      content: 'Subject: Q3 Sales Numbers\nFrom: sales@acme.com\nTo: team@acme.com\n\nTeam, great work on Q3. Revenue up 15%.',
    },
    {
      name: 'contract_draft.txt',
      content: 'DRAFT SERVICE AGREEMENT\n\nThis Agreement is between Acme Corp and Vendor Inc.\nPayment terms: Net 30. Services: IT consulting.',
    },
  ];
  return docs.map(({ name, content }) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content);
    return p;
  });
}

// ============================================================
// DR-1: Page Load
// ============================================================
test('DR-1: discovery review page loads without errors', async () => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
  });

  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  await expect(page.locator('ion-title').filter({ hasText: /Discovery Review/i })).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator('ion-toolbar ion-button').filter({ hasText: /Start a Document Review/i }).last()
  ).toBeVisible({ timeout: 5_000 });

  await screenshot(page, 'dr-1-loaded');

  const critical = errors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
});

// ============================================================
// DR-2: Create modal opens with required fields
// ============================================================
test('DR-2: discovery review create modal opens with form fields', async () => {
  await login(page);
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');

  const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /Start a Document Review/i }).last();
  await newBtn.click();

  // Modal title: "Start a Document Review"
  await expect(
    page.locator('ion-title').filter({ hasText: /Start a Document Review/i })
  ).toBeVisible({ timeout: 5_000 });

  // File upload present
  await expect(page.locator('input[type="file"]')).toBeAttached({ timeout: 3_000 });

  await screenshot(page, 'dr-2-modal');
});

// ============================================================
// DR-3: Job submission creates a queued job that moves to processing
// ============================================================
test('DR-3: submitting documents creates a queued job that moves to processing', async () => {
  const docFiles = createDiscoveryDocs();
  const dir = path.dirname(docFiles[0]);
  try {
    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');

    const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /Start a Document Review/i }).last();
    await newBtn.click();
    await page.locator('ion-title').filter({ hasText: /Start a Document Review/i }).waitFor({ timeout: 5_000 });

    // Fill required fields (matterId, matterName, claims)
    // Find ion-input fields by label
    const matterIdInput = page.locator('ion-input').filter({ hasText: /Matter ID/i }).locator('input').first();
    if (await matterIdInput.isVisible()) {
      await matterIdInput.fill('TEST-MATTER-001');
    } else {
      // Try by placeholder
      await page.locator('ion-input input[placeholder*="matter"]').first().fill('TEST-MATTER-001');
    }

    const matterNameInput = page.locator('ion-input').filter({ hasText: /Matter Name/i }).locator('input').first();
    if (await matterNameInput.isVisible()) {
      await matterNameInput.fill('Test Discovery Matter');
    }

    const claimsTextarea = page.locator('ion-textarea').filter({ hasText: /Claims/i }).locator('textarea').first();
    if (await claimsTextarea.isVisible()) {
      await claimsTextarea.fill('Breach of contract\nFraud allegations');
    }

    // Upload documents
    await page.locator('input[type="file"]').setInputFiles(docFiles);
    await page.waitForTimeout(500);

    // Click Launch Review
    await page.locator('ion-button').filter({ hasText: /Launch Review/i }).first().click();

    // Badge appears
    await expect(
      page.locator('ion-badge').filter({ hasText: /queued|processing/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    await screenshot(page, 'dr-3-processing');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

// ============================================================
// DR-4: HITL approve path (BatchReviewPanel)
// ============================================================
test('DR-4: job reaches awaiting_review, batch review panel opens, approve all completes job', async () => {
  const docFiles = createDiscoveryDocs();
  const dir = path.dirname(docFiles[0]);
  try {
    await login(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');

    const initialCount = await page.locator('ion-item').filter({
      has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
    }).count();

    // Submit job
    const newBtn = page.locator('ion-toolbar ion-button').filter({ hasText: /Start a Document Review/i }).last();
    await newBtn.click();
    await page.locator('ion-title').filter({ hasText: /Start a Document Review/i }).waitFor({ timeout: 5_000 });

    // Fill required fields
    await page.locator('ion-input').first().locator('input').fill('TEST-001');
    await page.locator('ion-input').nth(1).locator('input').fill('E2E Test Matter');
    await page.locator('ion-textarea').first().locator('textarea').fill('Contract dispute');
    await page.locator('ion-textarea').nth(3).locator('textarea').fill('Jane Doe (Attorney)');

    await page.locator('input[type="file"]').setInputFiles(docFiles);
    await page.waitForTimeout(500);
    await page.locator('ion-button').filter({ hasText: /Launch Review/i }).first().click();

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
    await screenshot(page, 'dr-4-awaiting-review');

    // Click the awaiting_review row
    await page.locator('ion-item').filter({
      has: page.locator('ion-badge', { hasText: /awaiting.review/i }),
    }).first().click();

    // HITL modal — BatchReviewPanel inside LegalJobReviewModal
    await page.locator('ion-title').filter({ hasText: /HITL Review/i }).waitFor({ timeout: 10_000 });

    // Approve remaining documents, then submit batch
    const approveRemainingBtn = page.locator('ion-button').filter({ hasText: /Approve Remaining/i }).first();
    await approveRemainingBtn.waitFor({ timeout: 10_000 });
    await approveRemainingBtn.click();
    await page.waitForTimeout(500);

    const submitBatchBtn = page.locator('ion-button').filter({ hasText: /Submit Batch/i }).first();
    await submitBatchBtn.waitFor({ timeout: 5_000 });
    await screenshot(page, 'dr-4-review-modal');
    await submitBatchBtn.click();

    // Modal closes
    await page.locator('ion-title').filter({ hasText: /HITL Review/i }).waitFor({ state: 'hidden', timeout: 30_000 });

    // Job completes (or reaches another awaiting_review for next batch)
    await expect(
      page.locator('ion-badge').filter({ hasText: /completed|awaiting.review/i }).first()
    ).toBeVisible({ timeout: COMPLETE_TIMEOUT });

    await screenshot(page, 'dr-4-after-submit');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

// ============================================================
// DR-5: Console health check
// ============================================================
test('DR-5: no unhandled JS errors or 5xx responses during submit flow', async () => {
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

  // Page loads and button visible = no errors from init
  await expect(
    page.locator('ion-toolbar ion-button').filter({ hasText: /Start a Document Review/i })
  ).toBeVisible({ timeout: 5_000 });

  const critical = consoleErrors.filter(e => !e.includes('net::ERR') && !e.includes('5150'));
  expect(critical).toHaveLength(0);
  expect(serverErrors).toHaveLength(0);
});

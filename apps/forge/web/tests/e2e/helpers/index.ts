/**
 * Shared Playwright helpers for Legal Department e2e tests.
 * Every workflow spec imports from here.
 */

import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const DEBUG = process.env.DEBUG === 'true';
export const BASE_URL = process.env.BASE_URL || 'http://localhost:6201/forge';
export const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'golfergeek@orchestratorai.io';
export const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'GolferGeek123!';

export const JOB_QUEUED_TIMEOUT = 15_000;
export const JOB_PROCESSING_TIMEOUT = 30_000;
export const HITL_TIMEOUT = 120_000;
export const COMPLETE_TIMEOUT = 300_000;

export function createTestTextFile(name = 'test-document.txt'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-e2e-'));
  const filePath = path.join(dir, name);
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

export async function login(p: Page): Promise<void> {
  await p.goto(`${BASE_URL}/login`);
  await p.waitForLoadState('networkidle');

  const emailInput = p.locator('ion-input[type="email"] input, input[type="email"]').first();
  await emailInput.waitFor({ timeout: 10_000 });
  await emailInput.fill(TEST_EMAIL);

  const passwordInput = p.locator('ion-input[type="password"] input, input[type="password"]').first();
  await passwordInput.fill(TEST_PASSWORD);

  const submitBtn = p.locator('ion-button[type="submit"], ion-button').filter({ hasText: /sign in|log in|login/i }).first();
  await submitBtn.click();

  await p.waitForURL('**/app/**', { timeout: 20_000 });
}

export async function screenshot(p: Page, name: string): Promise<void> {
  if (!DEBUG) return;
  const dir = '/tmp/forge-e2e-screenshots';
  fs.mkdirSync(dir, { recursive: true });
  await p.screenshot({ path: `${dir}/${name}.png` });
}

/**
 * Submit a job via the upload modal and wait for it to enter awaiting_review.
 * Returns after the new awaiting_review row appears.
 */
export async function submitJobAndWaitForHITL(
  p: Page,
  testFile: string,
): Promise<void> {
  const initialCount = await p.locator('ion-item').filter({
    has: p.locator('ion-badge', { hasText: /awaiting.review/i }),
  }).count();

  const uploadBtn = p.locator('ion-toolbar ion-button').filter({ hasText: /new/i }).last();
  await uploadBtn.click();
  await p.locator('input[type="file"]').setInputFiles(testFile);
  await p.waitForTimeout(300);
  await p.locator('ion-button').filter({ hasText: /queue job/i }).first().click();

  await p.waitForFunction(
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
  // Give the list a moment to re-render after the count change
  await p.waitForTimeout(1_000);
}

/**
 * Click the first awaiting_review row, wait for HITL modal, approve, and wait for close.
 */
export async function approveHITL(p: Page): Promise<void> {
  const reviewRow = p.locator('ion-item').filter({
    has: p.locator('ion-badge', { hasText: /awaiting.review/i }),
  }).first();
  await reviewRow.click();

  await p.locator('ion-title').filter({ hasText: /HITL Review/i }).waitFor({ timeout: 10_000 });

  const submitBtn = p.locator('ion-button').filter({ hasText: /submit decision/i }).first();
  await submitBtn.waitFor({ timeout: 15_000 });
  // Use dispatchEvent to bypass Ionic animation instability during re-renders
  await submitBtn.dispatchEvent('click');

  await p.locator('ion-title').filter({ hasText: /HITL Review/i }).waitFor({ state: 'hidden', timeout: 30_000 });
}

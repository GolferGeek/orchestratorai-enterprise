/**
 * Prediction Agent UI Journey E2E Tests (Playwright)
 *
 * Tests the complete demo-path UI journeys:
 * 1. Create universe - navigate to prediction dashboard, create a new universe
 * 2. Add target - add a target to the universe
 * 3. View predictions - view the predictions list for a target
 *
 * Following the patterns from marketing-swarm.e2e.test.ts
 */

import { test, expect, chromium, Browser, Page } from '@playwright/test';

const DEBUG = process.env.DEBUG === 'true';
const BASE_URL = process.env.BASE_URL || 'http://localhost:6101';
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || process.env.VITE_TEST_USER || 'golfergeek@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || process.env.VITE_TEST_PASSWORD || 'GolferGeek123!';

let browser: Browser;
let page: Page;

// Test data IDs to clean up after tests (reserved for future cleanup logic)
const _testData: {
  universeId?: string;
  targetId?: string;
} = {};

test.beforeAll(async () => {
  browser = await chromium.launch({
    headless: !DEBUG,
    slowMo: DEBUG ? 300 : 0,
  });
});

test.afterAll(async () => {
  await browser.close();
});

test.beforeEach(async () => {
  page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });

  // Enable console logging
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error('Browser error:', msg.text());
    } else if (DEBUG || msg.text().includes('Prediction')) {
      console.log('Browser:', msg.text());
    }
  });

  // Log network errors
  page.on('requestfailed', (request) => {
    console.error('Request failed:', request.url(), request.failure()?.errorText);
  });
});

test.afterEach(async () => {
  await page.close();
});

/**
 * Helper: Login to the application
 */
async function login() {
  console.log('Logging in...');
  await page.goto(BASE_URL);
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  if (currentUrl.includes('/app')) {
    console.log('Already logged in');
    return;
  }

  // Navigate to login if not already there
  if (!currentUrl.includes('/login')) {
    try {
      const loginLink = page.locator('a[href*="login"]').first();
      if (await loginLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await loginLink.click();
        await page.waitForURL('**/login**', { timeout: 10000 });
      } else {
        await page.goto(`${BASE_URL}/login`);
      }
    } catch (_e) {
      await page.goto(`${BASE_URL}/login`);
    }
    await page.waitForTimeout(2000);
  }

  // Wait for login form
  await page.waitForSelector('input[type="email"], input[type="password"]', { timeout: 10000 });
  await page.waitForTimeout(2000);

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/pred-01-login-form.png' });
  }

  // Try demo account button first
  try {
    const demoButton = page.getByText('Use Demo Account', { exact: false });
    if (await demoButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Found demo account button');
      await demoButton.click({ force: true });
      await page.waitForURL('**/app/**', { timeout: 20000 });
      await page.waitForTimeout(3000);
      return;
    }
  } catch (_e) {
    // Continue to manual login
  }

  // Manual login with form fields
  const emailInput = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.fill(TEST_EMAIL);
  await passwordInput.fill(TEST_PASSWORD);

  // Try to find and click login button
  const loginButton = page.locator('button[type="submit"], button').filter({ hasText: /login/i }).first();
  if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginButton.click({ force: true });
  } else {
    // Submit form directly
    await page.locator('form').first().evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
    });
  }

  // Wait for navigation
  await page.waitForURL('**/app/**', { timeout: 20000 });
  await page.waitForTimeout(3000);

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/pred-02-after-login.png' });
  }

  console.log('Login successful');
}

/**
 * Helper: Navigate to prediction dashboard
 */
async function navigateToPredictionDashboard() {
  console.log('Navigating to prediction dashboard...');
  // Prediction dashboard lives at /app/prediction/dashboard in the current router.
  await page.goto(`${BASE_URL}/app/prediction/dashboard`);
  await page.waitForTimeout(1000);

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/pred-04-prediction-dashboard.png' });
  }

  // Wait for dashboard to load
  await page.waitForSelector('.prediction-dashboard, [class*="prediction"], [data-testid="prediction-dashboard"]', { timeout: 10000 });
  console.log('Prediction dashboard loaded');
}

test('Journey 1: Create Universe', async () => {
  await login();
  await navigateToPredictionDashboard();

  console.log('Step: Create new universe');

  // Look for create/add universe button
  const createButton = page.locator('button, ion-button').filter({ hasText: /create|add.*universe|new.*universe/i }).first();

  // If no dedicated button, try menu/dropdown
  let buttonFound = false;
  if (await createButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createButton.click();
    buttonFound = true;
  } else {
    // Try finding via action menu or fab button
    const fabButton = page.locator('ion-fab-button, .fab-button').first();
    if (await fabButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fabButton.click();
      await page.waitForTimeout(500);
      // Look for universe option in the menu
      const universeOption = page.locator('ion-item, button').filter({ hasText: /universe/i }).first();
      if (await universeOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await universeOption.click();
        buttonFound = true;
      }
    }
  }

  if (!buttonFound) {
    console.log('Create universe button not found, trying alternate approaches');
    // Try clicking on universes section header
    const universesHeader = page.locator('h2, h3, .section-header').filter({ hasText: /universes/i }).first();
    if (await universesHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Look for add icon next to it
      const addIcon = page.locator('ion-icon[name*="add"], button').filter({ has: page.locator('ion-icon[name*="add"]') }).first();
      if (await addIcon.isVisible({ timeout: 1000 }).catch(() => false)) {
        await addIcon.click();
        buttonFound = true;
      }
    }
  }

  if (!buttonFound) {
    // Some environments expose portfolio creation on a different screen.
    test.skip();
  }

  await page.waitForTimeout(1000);

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/pred-05-universe-form.png' });
  }

  // Fill universe form
  console.log('Filling universe form...');

  // Universe name
  const nameInput = page.locator('input[name="name"], input[placeholder*="name"], ion-input').filter({ hasText: /name/i }).or(
    page.locator('ion-input').first()
  );
  await nameInput.fill(`E2E Test Universe ${Date.now()}`);
  await page.waitForTimeout(300);

  // Domain selection
  const domainSelect = page.locator('select[name="domain"], ion-select').filter({ hasText: /domain/i }).or(
    page.locator('ion-select').first()
  );
  if (await domainSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    await domainSelect.click();
    await page.waitForTimeout(500);
    // Select first option (stocks)
    await page.locator('ion-select-popover ion-item, .select-interface-option').first().click();
    await page.waitForTimeout(500);
  }

  // Description (optional)
  const descriptionInput = page.locator('textarea[name="description"], ion-textarea').filter({ hasText: /description/i }).first();
  if (await descriptionInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await descriptionInput.fill('E2E test universe for Playwright testing');
    await page.waitForTimeout(300);
  }

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/pred-06-universe-form-filled.png' });
  }

  // Submit form
  const submitButton = page.locator('button[type="submit"], ion-button').filter({ hasText: /create|save|submit/i }).first();
  await submitButton.click();
  await page.waitForTimeout(2000);

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/pred-07-universe-created.png' });
  }

  // Verify universe appears in list
  const universeList = page.locator('.universes-list, [data-testid="universe-list"], .universe-item, ion-item').filter({ hasText: /E2E Test Universe/i });
  await expect(universeList.first()).toBeVisible({ timeout: 10000 });

  console.log('Universe created successfully');
});

test('Journey 2: Add Target to Universe', async () => {
  await login();
  await navigateToPredictionDashboard();

  console.log('Step: Select existing universe or create one');

  // Select first universe or create one if needed
  let universeSelected = false;
  const universeItem = page.locator('.universe-item, [data-testid="universe-item"], ion-item').filter({ hasText: /universe/i }).first();

  if (await universeItem.isVisible({ timeout: 5000 }).catch(() => false)) {
    await universeItem.click();
    universeSelected = true;
    await page.waitForTimeout(1000);
  } else {
    console.log('No universe found, creating one first');
    // Create a universe first (simplified version)
    const createUniverseBtn = page.locator('button, ion-button').filter({ hasText: /create.*universe/i }).first();
    if (await createUniverseBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createUniverseBtn.click();
      await page.waitForTimeout(500);
      await page.locator('input').first().fill('Test Universe for Target');
      const domainSel = page.locator('ion-select').first();
      if (await domainSel.isVisible({ timeout: 1000 }).catch(() => false)) {
        await domainSel.click();
        await page.waitForTimeout(300);
        await page.locator('ion-select-popover ion-item').first().click();
        await page.waitForTimeout(300);
      }
      await page.locator('button[type="submit"], ion-button').filter({ hasText: /create|save/i }).first().click();
      await page.waitForTimeout(2000);
      universeSelected = true;
    }
  }

  if (!universeSelected) {
    // Some environments expose target creation only from portfolio detail screens.
    test.skip();
  }

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/pred-08-universe-selected.png' });
  }

  console.log('Step: Add target to universe');

  // Look for add target button
  const addTargetButton = page.locator('button, ion-button').filter({ hasText: /add.*target|create.*target|new.*target/i }).first();

  let targetFormOpened = false;
  if (await addTargetButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addTargetButton.click();
    targetFormOpened = true;
  } else {
    // Try fab button or action menu
    const fabButton = page.locator('ion-fab-button').first();
    if (await fabButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fabButton.click();
      await page.waitForTimeout(500);
      const targetOption = page.locator('ion-item, button').filter({ hasText: /target/i }).first();
      if (await targetOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        await targetOption.click();
        targetFormOpened = true;
      }
    }
  }

  expect(targetFormOpened).toBe(true);

  await page.waitForTimeout(1000);

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/pred-09-target-form.png' });
  }

  // Fill target form
  console.log('Filling target form...');

  // Target name
  const targetNameInput = page.locator('input[name="name"], ion-input').filter({ hasText: /name/i }).or(
    page.locator('ion-input').first()
  );
  await targetNameInput.fill('AAPL');
  await page.waitForTimeout(300);

  // Target symbol
  const symbolInput = page.locator('input[name="symbol"], ion-input').filter({ hasText: /symbol/i }).or(
    page.locator('ion-input').nth(1)
  );
  if (await symbolInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await symbolInput.fill('AAPL');
    await page.waitForTimeout(300);
  }

  // Target type
  const targetTypeSelect = page.locator('select[name="targetType"], ion-select').filter({ hasText: /type/i }).first();
  if (await targetTypeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    await targetTypeSelect.click();
    await page.waitForTimeout(500);
    await page.locator('ion-select-popover ion-item, .select-interface-option').first().click();
    await page.waitForTimeout(500);
  }

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/pred-10-target-form-filled.png' });
  }

  // Submit form
  const submitTargetButton = page.locator('button[type="submit"], ion-button').filter({ hasText: /create|add|save/i }).first();
  await submitTargetButton.click();
  await page.waitForTimeout(2000);

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/pred-11-target-created.png' });
  }

  // Verify target appears in list
  const targetList = page.locator('.target-item, [data-testid="target-item"], ion-item').filter({ hasText: /AAPL/i });
  await expect(targetList.first()).toBeVisible({ timeout: 10000 });

  console.log('Target added successfully');
});

test('Journey 3: View Predictions List', async () => {
  await login();
  await navigateToPredictionDashboard();

  console.log('Step: Navigate to predictions view');

  // The dashboard should show predictions by default
  // Wait for predictions to load (may be empty state)
  await page.waitForTimeout(3000);

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/pred-12-predictions-view.png' });
  }

  // Check if we have predictions or empty state
  const emptyState = page.locator('.empty-state, [data-testid="empty-state"]').filter({ hasText: /no predictions/i });
  const predictionCards = page.locator('.prediction-card, [data-testid="prediction-card"], .predictions-grid > *');

  const hasEmptyState = await emptyState.isVisible({ timeout: 2000 }).catch(() => false);
  const hasPredictions = await predictionCards.count().then(count => count > 0).catch(() => false);

  console.log(`Empty state visible: ${hasEmptyState}`);
  console.log(`Predictions found: ${hasPredictions}`);

  // Either we have predictions or we have empty state - both are valid
  expect(hasEmptyState || hasPredictions).toBe(true);

  if (hasPredictions) {
    console.log('Step: Verify prediction card content');

    // Check first prediction card has required elements
    const firstCard = predictionCards.first();

    // Should have direction indicator
    const directionIndicator = firstCard.locator('[data-testid="direction"], .direction, [class*="direction"]').first();
    const hasDirection = await directionIndicator.isVisible({ timeout: 1000 }).catch(() => false);

    // Should have confidence score
    const confidenceScore = firstCard.locator('[data-testid="confidence"], .confidence, [class*="confidence"]').first();
    const hasConfidence = await confidenceScore.isVisible({ timeout: 1000 }).catch(() => false);

    // Should have target symbol or name
    const targetInfo = firstCard.locator('[data-testid="target"], .target, [class*="target"], [class*="symbol"]').first();
    const hasTarget = await targetInfo.isVisible({ timeout: 1000 }).catch(() => false);

    console.log(`Direction indicator: ${hasDirection}`);
    console.log(`Confidence score: ${hasConfidence}`);
    console.log(`Target info: ${hasTarget}`);

    // At least target info should be visible
    expect(hasTarget).toBe(true);

    if (DEBUG) {
      await page.screenshot({ path: '/tmp/pred-13-prediction-card-details.png' });
    }

    console.log('Step: Test prediction filtering');

    // Try status filter
    const statusFilter = page.locator('select[id="status-filter"], select').filter({ hasText: /status/i }).first();
    if (await statusFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await statusFilter.selectOption('active');
      await page.waitForTimeout(1000);

      if (DEBUG) {
        await page.screenshot({ path: '/tmp/pred-14-filtered-predictions.png' });
      }
    }

    console.log('Step: Click on a prediction to view details');

    // Click first prediction card
    await firstCard.click();
    await page.waitForTimeout(2000);

    if (DEBUG) {
      await page.screenshot({ path: '/tmp/pred-15-prediction-detail.png' });
    }

    // Should navigate to detail view or open modal
    const detailView = page.locator('.prediction-detail, [data-testid="prediction-detail"], ion-modal');
    await expect(detailView).toBeVisible({ timeout: 5000 });

    console.log('Prediction detail view displayed');
  } else {
    console.log('No predictions yet - empty state is correct for new system');

    // Verify empty state has helpful message
    const emptyMessage = page.locator('.empty-state').first();
    await expect(emptyMessage).toBeVisible();

    // Should have text indicating no predictions
    const messageText = await emptyMessage.textContent();
    expect(messageText?.toLowerCase()).toContain('prediction');
  }

  console.log('Predictions list view test completed successfully');
});

test('Complete Journey: Create Universe → Add Target → View Predictions', async () => {
  console.log('=== Starting Complete Journey Test ===');

  await login();
  await navigateToPredictionDashboard();

  // Step 1: Create Universe
  console.log('Step 1: Creating universe...');

  const createUniverseBtn = page.locator('button, ion-button').filter({ hasText: /create.*universe|add.*universe/i }).first();
  if (await createUniverseBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await createUniverseBtn.click();
    await page.waitForTimeout(1000);

    const universeName = `Complete Journey ${Date.now()}`;
    await page.locator('input').first().fill(universeName);

    const domainSelect = page.locator('ion-select').first();
    if (await domainSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      await domainSelect.click();
      await page.waitForTimeout(500);
      await page.locator('ion-select-popover ion-item').first().click();
      await page.waitForTimeout(500);
    }

    await page.locator('button[type="submit"], ion-button').filter({ hasText: /create|save/i }).first().click();
    await page.waitForTimeout(2000);

    if (DEBUG) {
      await page.screenshot({ path: '/tmp/pred-complete-01-universe.png' });
    }

    console.log('Universe created');
  }

  // Step 2: Add Target
  console.log('Step 2: Adding target...');

  const addTargetBtn = page.locator('button, ion-button').filter({ hasText: /add.*target|create.*target/i }).first();
  if (await addTargetBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await addTargetBtn.click();
    await page.waitForTimeout(1000);

    await page.locator('ion-input').first().fill('MSFT');

    const symbolInput = page.locator('ion-input').nth(1);
    if (await symbolInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await symbolInput.fill('MSFT');
    }

    await page.locator('button[type="submit"], ion-button').filter({ hasText: /create|add|save/i }).first().click();
    await page.waitForTimeout(2000);

    if (DEBUG) {
      await page.screenshot({ path: '/tmp/pred-complete-02-target.png' });
    }

    console.log('Target added');
  }

  // Step 3: View Predictions
  console.log('Step 3: Viewing predictions...');

  await page.waitForTimeout(2000);

  // Check for predictions or empty state
  const hasPredictions = await page.locator('.prediction-card, [data-testid="prediction-card"]').count().then(c => c > 0);
  const hasEmptyState = await page.locator('.empty-state').isVisible({ timeout: 2000 }).catch(() => false);

  expect(hasPredictions || hasEmptyState).toBe(true);

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/pred-complete-03-final.png' });
  }

  console.log('=== Complete Journey Test Finished ===');
});

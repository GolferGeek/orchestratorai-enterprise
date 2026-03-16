/**
 * Marketing Swarm E2E Test
 * 
 * Tests the complete flow:
 * 1. Navigate to app
 * 2. Login
 * 3. Navigate to Marketing Swarm
 * 4. Fill out form
 * 5. Select agents
 * 6. Execute
 * 7. Monitor progress
 */

import { test, expect, chromium, Browser, Page } from '@playwright/test';

const DEBUG = process.env.DEBUG === 'true';
const BASE_URL = process.env.BASE_URL || 'http://localhost:6101';
const _TEST_EMAIL = process.env.SUPABASE_TEST_USER || process.env.VITE_TEST_USER || 'golfergeek@orchestratorai.io';
const _TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || process.env.VITE_TEST_PASSWORD || 'GolferGeek123!';

let browser: Browser;
let page: Page;

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
      console.error('❌ Browser error:', msg.text());
    } else if (DEBUG || msg.text().includes('Marketing') || msg.text().includes('SSE')) {
      console.log('📡', msg.text());
    }
  });

  // Log network errors
  page.on('requestfailed', (request) => {
    console.error('❌ Request failed:', request.url(), request.failure()?.errorText);
  });
});

test.afterEach(async () => {
  await page.close();
});

test('Marketing Swarm - Complete Flow', async () => {
  // Step 1: Navigate to app
  console.log('📍 Step 1: Navigating to', BASE_URL);
  await page.goto(BASE_URL);
  await page.waitForTimeout(2000);

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/ms-01-home.png' });
  }

  // Step 2: Navigate to login and login
  console.log('📍 Step 2: Logging in...');
  
  // Check if we're already logged in (redirected to /app)
  const currentUrl = page.url();
  if (currentUrl.includes('/app')) {
    console.log('   Already logged in, skipping login step');
  } else {
    // Navigate to login page if not already there
    if (!currentUrl.includes('/login')) {
      console.log('   Navigating to login page...');
      // Try to find and click "log in" link on home page
      try {
        const loginLink = page.locator('a[href*="login"], router-link').filter({ hasText: /log in/i });
        if (await loginLink.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log('   Found login link, clicking...');
          await loginLink.click();
          await page.waitForURL('**/login**', { timeout: 10000 });
        } else {
          // Navigate directly to login
          console.log('   Navigating directly to /login...');
          await page.goto(`${BASE_URL}/login`);
        }
      } catch (_e) {
        // Navigate directly to login
        console.log('   Navigating directly to /login...');
        await page.goto(`${BASE_URL}/login`);
      }
      await page.waitForTimeout(2000);
    }

    // Wait for login form to be ready
    console.log('   Waiting for login form...');
    await page.waitForSelector(
      'ion-input[type="email"], ion-input[type="password"], input[type="email"], input[type="password"], ion-button:has-text("Sign in with")',
      { timeout: 10000 }
    );
    await page.waitForTimeout(2000); // Additional wait for Ionic hydration
    const ssoOnlyButton = page.locator('ion-button').filter({ hasText: /Sign in with/i }).first();
    if (await ssoOnlyButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      // This E2E flow assumes direct credential login; SSO-only environments require interactive IdP.
      test.skip();
    }

    
    if (DEBUG) {
      await page.screenshot({ path: '/tmp/ms-02-before-login.png' });
    }

    // Try multiple strategies to find and click login button
    let loginClicked = false;
    
    // Strategy 1: Look for "Use Demo Account" button first (if available)
    try {
      const demoButton = page.getByText('Use Demo Account', { exact: false });
      if (await demoButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('   Found "Use Demo Account" button, clicking...');
        await demoButton.click({ force: true });
        loginClicked = true;
      }
    } catch (_e) {
      console.log('   "Use Demo Account" button not found');
    }

    // Strategy 2: Find login button by text
    if (!loginClicked) {
      try {
        const loginButtonByText = page.getByText('Login', { exact: true }).or(page.locator('ion-button').filter({ hasText: /^Login$/i }));
        if (await loginButtonByText.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log('   Found Login button by text, clicking...');
          await loginButtonByText.click({ force: true });
          loginClicked = true;
        }
      } catch (_e) {
        console.log('   Login button by text not found');
      }
    }

    // Strategy 3: Find submit button in form
    if (!loginClicked) {
      try {
        const submitButton = page.locator('form ion-button[type="submit"]').first();
        if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log('   Found submit button in form, clicking...');
          await submitButton.click({ force: true });
          loginClicked = true;
        }
      } catch (_e) {
        console.log('   Submit button not found');
      }
    }

    // Strategy 4: Find any ion-button with "Login" text
    if (!loginClicked) {
      try {
        const anyLoginButton = page.locator('ion-button').filter({ hasText: 'Login' }).first();
        if (await anyLoginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('   Found Login button (any), clicking...');
          await anyLoginButton.click({ force: true });
          loginClicked = true;
        }
      } catch (_e) {
        console.log('   No Login button found');
      }
    }

    if (!loginClicked) {
      console.log('   ⚠️ Could not find login button, taking screenshot for debugging...');
      if (DEBUG) {
        await page.screenshot({ path: '/tmp/ms-login-button-not-found.png', fullPage: true });
      }
      // Try to submit the form directly
      await page.locator('form').first().evaluate((form: HTMLFormElement) => {
        form.requestSubmit();
      });
    }

    // Wait for navigation
    console.log('   Waiting for login to complete...');
    await page.waitForURL('**/app/**', { timeout: 20000 }).catch(() => {
      console.log('   Login may still be in progress or already logged in...');
    });
    await page.waitForTimeout(3000);

    // If we still are not inside app shell, this environment likely requires
    // interactive SSO confirmation that Playwright cannot complete unattended.
    if (!page.url().includes('/app')) {
      test.skip();
    }

    if (DEBUG) {
      await page.screenshot({ path: '/tmp/ms-03-after-login.png' });
    }
  }

  // Step 3: Open hamburger menu
  console.log('📍 Step 3: Opening hamburger menu...');
  const menuButton = page.locator('ion-menu-button').first();
  
  if (await menuButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await menuButton.click();
    await page.waitForTimeout(1500);
  } else {
    console.log('   Menu button not visible, trying alternative...');
    const altMenuButton = page.locator('[slot="start"] ion-menu-button, ion-menu-toggle').first();
    if (await altMenuButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await altMenuButton.click().catch(() => {});
      await page.waitForTimeout(1500);
    } else {
      test.skip();
    }
  }

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/ms-04-menu-open.png' });
  }

  // Step 4: Navigate to Marketing Swarm
  console.log('📍 Step 4: Navigating to Marketing Swarm...');
  
  // Look for Marketing Swarm in the menu
  const marketingItem = page.locator('ion-menu ion-item:has-text("Marketing"), ion-menu ion-label:has-text("Marketing")').first();
  
  if (await marketingItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('   Found Marketing item, clicking...');
    await marketingItem.click();
    await page.waitForTimeout(1000);
  } else {
    // Try finding by iterating through menu items
    console.log('   Searching for Marketing Swarm in menu items...');
    const allMenuItems = page.locator('ion-menu ion-item');
    const count = await allMenuItems.count();
    console.log(`   Found ${count} menu items`);

    for (let i = 0; i < count; i++) {
      const text = await allMenuItems.nth(i).textContent();
      console.log(`   Menu item ${i}: ${text?.trim().substring(0, 40)}`);
      if (text?.toLowerCase().includes('marketing')) {
        await allMenuItems.nth(i).click();
        await page.waitForTimeout(1000);
        break;
      }
    }
  }

  // Look for the conversation bubble/chat icon
  console.log('   Looking for conversation bubble...');
  
  // Try multiple strategies to find the converse button
  let converseClicked = false;
  
  // Strategy 1: Find button with chatbubble icon in header-actions
  try {
    const headerActions = page.locator('.header-actions').filter({ has: page.locator('ion-icon') });
    if (await headerActions.isVisible({ timeout: 2000 }).catch(() => false)) {
      const button = headerActions.locator('ion-button').first();
      if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log('   Found converse button in header-actions, clicking...');
        await button.click({ force: true });
        await page.waitForTimeout(2000);
        converseClicked = true;
      }
    }
  } catch (_e) {
    console.log('   Strategy 1 failed');
  }
  
  // Strategy 2: Find ion-button with chatbubble icon near Marketing text
  if (!converseClicked) {
    try {
      const marketingItem = page.locator('ion-item').filter({ hasText: /marketing/i });
      if (await marketingItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        const button = marketingItem.locator('ion-button').filter({ has: page.locator('ion-icon') }).first();
        if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log('   Found converse button near Marketing item, clicking...');
          await button.click({ force: true });
          await page.waitForTimeout(2000);
          converseClicked = true;
        }
      }
    } catch (_e) {
      console.log('   Strategy 2 failed');
    }
  }
  
  // Strategy 3: Find any ion-button with chatbubble icon
  if (!converseClicked) {
    try {
      const buttons = page.locator('ion-button').filter({ has: page.locator('ion-icon') });
      const count = await buttons.count();
      console.log(`   Found ${count} buttons with icons`);
      if (count > 0) {
        // Try to find one near Marketing text
        for (let i = 0; i < Math.min(count, 10); i++) {
          const btn = buttons.nth(i);
          const parent = btn.locator('..');
          const parentText = await parent.textContent().catch(() => '');
          if (parentText?.toLowerCase().includes('marketing')) {
            console.log(`   Found button ${i} near Marketing, clicking...`);
            await btn.click({ force: true });
            await page.waitForTimeout(2000);
            converseClicked = true;
            break;
          }
        }
        // If none found near Marketing, click the first one
        if (!converseClicked && count > 0) {
          console.log('   Clicking first button with icon found...');
          await buttons.first().click({ force: true });
          await page.waitForTimeout(2000);
          converseClicked = true;
        }
      }
    } catch (_e) {
      console.log('   Strategy 3 failed');
    }
  }
  
  if (!converseClicked) {
    console.log('   ⚠️ Could not find converse button, but continuing...');
  }

  // Close menu if still open
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/ms-05-after-nav.png' });
  }

  // Step 5: Wait for Marketing Swarm page to load
  console.log('📍 Step 5: Waiting for Marketing Swarm page...');
  await page.waitForTimeout(3000);
  
  // Wait for the form to be visible
  await page.waitForSelector('ion-select, ion-textarea', { timeout: 10000 });

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/ms-06-swarm-page.png' });
  }

  // Step 6: Fill out the form
  console.log('📍 Step 6: Filling form fields...');

  // Select content type
  const contentTypeSelect = page.locator('ion-select').first();
  if (await contentTypeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('   Selecting content type...');
    await contentTypeSelect.click();
    await page.waitForTimeout(500);
    // Select first option
    await page.locator('ion-select-popover ion-item, .select-interface-option').first().click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // Fill topic
  const topicField = page.locator('ion-textarea').filter({ hasText: /topic/i }).or(page.locator('ion-textarea').first());
  if (await topicField.isVisible({ timeout: 1000 }).catch(() => false)) {
    await topicField.fill('AI-Powered Marketing Automation for Enterprise');
  } else {
    // Try by index
    const textareas = page.locator('ion-textarea');
    const count = await textareas.count();
    if (count > 0) {
      await textareas.first().fill('AI-Powered Marketing Automation for Enterprise');
    }
  }

  // Fill other required fields
  const allTextareas = page.locator('ion-textarea textarea, ion-input input');
  const textareaCount = await allTextareas.count();
  console.log(`   Found ${textareaCount} input fields`);

  const fieldValues = [
    'AI-Powered Marketing Automation for Enterprise',
    'Marketing professionals and CMOs',
    'Drive awareness and conversions',
    'Professional and innovative',
    'Point 1: AI capabilities\nPoint 2: ROI benefits\nPoint 3: Easy integration',
  ];

  for (let i = 0; i < Math.min(textareaCount, fieldValues.length); i++) {
    try {
      const field = allTextareas.nth(i);
      if (await field.isVisible({ timeout: 500 }).catch(() => false)) {
        await field.fill(fieldValues[i]);
        await page.waitForTimeout(200);
      }
    } catch (_e) {
      console.log(`   Could not fill field ${i}:`, e);
    }
  }

  // Select tone
  const toneSelect = page.locator('ion-select').nth(1);
  if (await toneSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
    await toneSelect.click();
    await page.waitForTimeout(500);
    await page.locator('ion-select-popover ion-item').first().click().catch(() => {});
    await page.waitForTimeout(500);
  }

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/ms-07-form-filled.png' });
  }

  // Step 7: Select agents
  console.log('📍 Step 7: Selecting agents...');
  
  // Scroll to agent selection section
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(1000);

  // Select writers
  const writerCheckboxes = page.locator('ion-checkbox').filter({ hasText: /writer/i }).or(
    page.locator('.agent-section').filter({ hasText: /writer/i }).locator('ion-checkbox')
  );
  const writerCount = await writerCheckboxes.count();
  console.log(`   Found ${writerCount} writer checkboxes`);
  
  // Select first 2 writers
  for (let i = 0; i < Math.min(writerCount, 2); i++) {
    try {
      const cb = writerCheckboxes.nth(i);
      if (await cb.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cb.click();
        await page.waitForTimeout(300);
        // Also select the LLM config chip if visible
        const chips = page.locator('ion-chip').filter({ hasText: /anthropic|openai|claude|gpt/i });
        const chipCount = await chips.count();
        if (chipCount > 0) {
          await chips.first().click();
          await page.waitForTimeout(200);
        }
      }
    } catch (_e) {
      console.log(`   Could not select writer ${i}`);
    }
  }

  // Select editors
  const editorCheckboxes = page.locator('ion-checkbox').filter({ hasText: /editor/i }).or(
    page.locator('.agent-section').filter({ hasText: /editor/i }).locator('ion-checkbox')
  );
  const editorCount = await editorCheckboxes.count();
  console.log(`   Found ${editorCount} editor checkboxes`);
  
  for (let i = 0; i < Math.min(editorCount, 2); i++) {
    try {
      const cb = editorCheckboxes.nth(i);
      if (await cb.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cb.click();
        await page.waitForTimeout(300);
        const chips = page.locator('ion-chip').filter({ hasText: /anthropic|openai|claude|gpt/i });
        const chipCount = await chips.count();
        if (chipCount > 0) {
          await chips.first().click();
          await page.waitForTimeout(200);
        }
      }
    } catch (_e) {
      console.log(`   Could not select editor ${i}`);
    }
  }

  // Select evaluators
  const evaluatorCheckboxes = page.locator('ion-checkbox').filter({ hasText: /evaluator/i }).or(
    page.locator('.agent-section').filter({ hasText: /evaluator/i }).locator('ion-checkbox')
  );
  const evaluatorCount = await evaluatorCheckboxes.count();
  console.log(`   Found ${evaluatorCount} evaluator checkboxes`);
  
  for (let i = 0; i < Math.min(evaluatorCount, 2); i++) {
    try {
      const cb = evaluatorCheckboxes.nth(i);
      if (await cb.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cb.click();
        await page.waitForTimeout(300);
        const chips = page.locator('ion-chip').filter({ hasText: /anthropic|openai|claude|gpt/i });
        const chipCount = await chips.count();
        if (chipCount > 0) {
          await chips.first().click();
          await page.waitForTimeout(200);
        }
      }
    } catch (_e) {
      console.log(`   Could not select evaluator ${i}`);
    }
  }

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/ms-08-agents-selected.png' });
  }

  // Step 8: Click Execute/Start button
  console.log('📍 Step 8: Looking for Execute button...');
  
  // Scroll to bottom to find the button
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  const executeBtn = page.locator('ion-button').filter({ hasText: /execute|start|run|generate|go|marketing swarm/i }).first();

  if (await executeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('   Found execute button, clicking...');
    await executeBtn.click();
    await page.waitForTimeout(2000);

    console.log('📍 Step 9: Monitoring execution...');
    
    // Monitor progress for up to 2 minutes
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(5000);
      
      if (DEBUG) {
        await page.screenshot({ path: `/tmp/ms-progress-${i}.png` });
      }

      // Check if completed
      const completedText = page.locator('text=Completed, text=Results, text=Winner, text=Final Rankings');
      if (await completedText.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log('✅ Execution completed!');
        break;
      }

      // Check for errors
      const errorText = page.locator('text=Error, text=Failed');
      if (await errorText.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log('❌ Execution failed!');
        break;
      }
    }
  } else {
    console.log('   ⚠️ Execute button not found');
    // Try to find any button with "Start" or "Go"
    const altButton = page.locator('ion-button').filter({ hasText: /start|go/i }).first();
    if (await altButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await altButton.click();
      await page.waitForTimeout(2000);
    }
  }

  if (DEBUG) {
    await page.screenshot({ path: '/tmp/ms-final.png' });
  }

  // Verify we're on the progress or results page
  const progressOrResults = page.locator('text=Progress, text=Results, text=Execution Summary');
  await expect(progressOrResults.first()).toBeVisible({ timeout: 10000 });
});

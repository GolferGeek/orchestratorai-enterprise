import { chromium } from 'playwright';

if (!process.env.BASE_URL) {
  console.error('ERROR: BASE_URL environment variable is required');
  process.exit(1);
}
const BASE_URL = process.env.BASE_URL;

async function testMarketingSwarm() {
  console.log('🚀 Starting Marketing Swarm browser test...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 300
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();

  // Enable console logging from the browser
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('❌ Browser error:', msg.text());
    } else if (msg.text().includes('Marketing') || msg.text().includes('SSE') || msg.text().includes('swarm')) {
      console.log('📡', msg.text());
    }
  });

  try {
    // Step 1: Navigate to the app
    console.log('📍 Step 1: Navigating to http://localhost:6101...');
    await page.goto('http://localhost:6101');
    await page.waitForTimeout(2000);

    // Step 2: Navigate to login page if needed
    console.log('📍 Step 2: Navigating to login page...');
    
    // Check current URL - if we're on home page, navigate to login
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      console.log('   Already on login page');
    } else {
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

    // Wait for login form to be ready - use more flexible selectors
    console.log('   Waiting for login form...');
    
    // Wait for the page to load and Ionic to hydrate
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      console.log('   Network idle timeout, continuing anyway...');
    });
    await page.waitForTimeout(3000); // Give Ionic time to hydrate
    
    // Try multiple selectors to find the login form
    const formSelectors = [
      'ion-input[type="email"]',
      'ion-input[type="password"]',
      'ion-input',
      'form',
      'ion-list',
    ];
    
    let formFound = false;
    for (const selector of formSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000, state: 'visible' });
        console.log(`   Found login form element: ${selector}`);
        formFound = true;
        break;
      } catch (_e) {
        // Try next selector
      }
    }
    
    if (!formFound) {
      console.log('   ⚠️ Login form not found with standard selectors, taking screenshot...');
      await page.screenshot({ path: '/tmp/ms-login-form-not-found.png', fullPage: true });
    }

    // Take a debug screenshot to see what's on the page
    await page.screenshot({ path: '/tmp/ms-before-login.png' });
    console.log('   📸 Pre-login screenshot: /tmp/ms-before-login.png');

    // Log the HTML to debug
    const html = await page.content();
    console.log('   Page has ion-button:', html.includes('ion-button'));
    console.log('   Page has Login text:', html.includes('Login'));

    // Try multiple strategies to find and click login button
    let loginClicked = false;
    
    // Strategy 1: Look for "Use Demo Account" button first (if available)
    try {
      const demoButton = page.locator('ion-button').filter({ hasText: /Use Demo Account/i });
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
        const loginButtonByText = page.locator('ion-button').filter({ hasText: /^Login$/i });
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

    // Strategy 4: Fallback - submit form directly
    if (!loginClicked) {
      console.log('   ⚠️ Could not find login button, submitting form directly...');
      await page.locator('form').first().evaluate((form: HTMLFormElement) => {
        form.requestSubmit();
      });
    }

    // Wait for navigation after login
    console.log('   Waiting for login to complete...');
    await page.waitForURL('**/app/**', { timeout: 20000 }).catch(() => {
      console.log('   Login may still be in progress...');
    });
    await page.waitForTimeout(3000);

    // Check if we're past login
    const url = page.url();
    console.log(`   Current URL: ${url}`);

    // Take screenshot to see where we are
    await page.screenshot({ path: '/tmp/ms-after-login.png' });
    console.log('   📸 Screenshot: /tmp/ms-after-login.png');

    // Step 3: Open the hamburger menu (left side nav)
    console.log('📍 Step 3: Opening hamburger menu...');
    const menuButton = page.locator('ion-menu-button').first();
    if (await menuButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await menuButton.click();
      await page.waitForTimeout(1500);
    } else {
      console.log('   Menu button not visible, trying alternative...');
      // Try clicking on the menu icon directly
      await page.locator('[slot="start"] ion-menu-button, ion-menu-toggle').first().click().catch(() => {});
      await page.waitForTimeout(1500);
    }

    await page.screenshot({ path: '/tmp/ms-menu-open.png' });
    console.log('   📸 Screenshot: /tmp/ms-menu-open.png');

    // Step 4: Find and click Marketing Swarm in the left nav
    console.log('📍 Step 4: Looking for Marketing Swarm in left nav...');

    // Look for text containing "Marketing" in the sidebar
    const marketingItem = page.locator('ion-menu ion-item:has-text("Marketing"), ion-menu ion-label:has-text("Marketing")').first();
    if (await marketingItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('   Found Marketing item, clicking...');
      await marketingItem.click();
      await page.waitForTimeout(1000);
    } else {
      // Try scrolling the menu and looking for it
      console.log('   Looking for Marketing Swarm link...');
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

    // Look for the chat/converse bubble icon next to Marketing Swarm
    console.log('   Looking for converse bubble...');
    
    // Wait a bit for the menu to fully render
    await page.waitForTimeout(1000);
    
    // Try multiple strategies to find the converse button
    let converseClicked = false;
    
    // Strategy 1: Find Marketing Swarm agent item, then find the button in its header-actions
    try {
      // Find the ion-item that contains "Marketing" text
      const marketingItems = page.locator('ion-item').filter({ hasText: /marketing/i });
      const marketingCount = await marketingItems.count();
      console.log(`   Found ${marketingCount} items with Marketing text`);
      
      for (let i = 0; i < marketingCount; i++) {
        const item = marketingItems.nth(i);
        const itemText = await item.textContent().catch(() => '');
        console.log(`   Item ${i} text: ${itemText?.substring(0, 60)}`);
        
        // Check if this item has a header-actions div with a button
        const headerActions = item.locator('.header-actions');
        if (await headerActions.isVisible({ timeout: 1000 }).catch(() => false)) {
          const button = headerActions.locator('ion-button.header-action-btn, ion-button').first();
          if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
            console.log(`   Found converse button in Marketing item ${i}, clicking...`);
            await button.click({ force: true });
            await page.waitForTimeout(2000);
            converseClicked = true;
            break;
          }
        }
      }
    } catch (_e) {
      console.log('   Strategy 1 failed:', e);
    }
    
    // Strategy 2: Find all header-action-btn buttons and check which one is near Marketing
    if (!converseClicked) {
      try {
        const allActionButtons = page.locator('.header-action-btn, ion-button').filter({ has: page.locator('ion-icon') });
        const buttonCount = await allActionButtons.count();
        console.log(`   Found ${buttonCount} action buttons`);
        
        for (let i = 0; i < Math.min(buttonCount, 20); i++) {
          const btn = allActionButtons.nth(i);
          // Get the parent ion-item to check if it's Marketing related
          const parentItem = btn.locator('..').locator('ion-item').first();
          if (await parentItem.isVisible({ timeout: 500 }).catch(() => false)) {
            const parentText = await parentItem.textContent().catch(() => '');
            if (parentText?.toLowerCase().includes('marketing')) {
              console.log(`   Found Marketing-related button ${i}, clicking...`);
              await btn.click({ force: true });
              await page.waitForTimeout(2000);
              converseClicked = true;
              break;
            }
          }
        }
      } catch (_e) {
        console.log('   Strategy 2 failed:', e);
      }
    }
    
    // Strategy 3: Find any button with chatbubble icon and click it if near Marketing
    if (!converseClicked) {
      try {
        // Look for buttons that have an icon (chatbubble icons)
        const buttons = page.locator('ion-button').filter({ has: page.locator('ion-icon') });
        const count = await buttons.count();
        console.log(`   Found ${count} buttons with icons`);
        
        for (let i = 0; i < Math.min(count, 15); i++) {
          const btn = buttons.nth(i);
          // Check if button is visible and near Marketing text
          if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
            // Get surrounding context
            const context = btn.locator('..').or(btn.locator('../..'));
            const contextText = await context.textContent().catch(() => '');
            if (contextText?.toLowerCase().includes('marketing')) {
              console.log(`   Found button ${i} in Marketing context, clicking...`);
              await btn.click({ force: true });
              await page.waitForTimeout(2000);
              converseClicked = true;
              break;
            }
          }
        }
      } catch (_e) {
        console.log('   Strategy 3 failed:', e);
      }
    }
    
    if (!converseClicked) {
      console.log('   ⚠️ Could not find converse button');
      // Take a screenshot for debugging
      await page.screenshot({ path: '/tmp/ms-converse-button-not-found.png', fullPage: true });
      console.log('   📸 Debug screenshot: /tmp/ms-converse-button-not-found.png');
    } else {
      console.log('   ✅ Successfully clicked converse button');
    }

    await page.screenshot({ path: '/tmp/ms-after-nav.png' });
    console.log('   📸 Screenshot: /tmp/ms-after-nav.png');

    // Close menu by clicking outside or pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Step 5: We should now be on the Marketing Swarm page
    console.log('📍 Step 5: On Marketing Swarm page...');
    
    // Wait for the Marketing Swarm page to fully load
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      console.log('   Network idle timeout, continuing...');
    });
    await page.waitForTimeout(3000); // Give Vue/Ionic time to render
    
    await page.screenshot({ path: '/tmp/ms-swarm-page.png' });
    console.log('   📸 Screenshot: /tmp/ms-swarm-page.png');

    // Step 6: Fill in the form fields
    console.log('📍 Step 6: Filling form fields...');

    // Wait for form to be fully loaded - look for content type select or any form element
    await page.waitForSelector('ion-select, ion-textarea, .swarm-config-form', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Content Type dropdown - find by label
    try {
      const contentTypeLabel = page.locator('ion-label').filter({ hasText: /content type/i });
      if (await contentTypeLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
        const contentTypeSelect = contentTypeLabel.locator('..').locator('ion-select').first();
        if (await contentTypeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('   Clicking content type select...');
          await contentTypeSelect.click();
          await page.waitForTimeout(1000);
          // Select first option in the popover
          const option = page.locator('ion-select-popover ion-item, ion-popover ion-item, .select-interface-option').first();
          if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
            await option.click();
            await page.waitForTimeout(1000);
          }
        }
      }
    } catch (_e) {
      console.log('   Could not select content type:', e);
    }

    // Fill form fields by finding ion-item with label, then the input inside
    const fieldMappings = [
      { label: /^topic/i, value: 'AI-Powered Marketing Automation for Enterprise', type: 'textarea' },
      { label: /target audience/i, value: 'Marketing professionals and CMOs', type: 'textarea' },
      { label: /^goal/i, value: 'Drive awareness and conversions', type: 'textarea' },
      { label: /key points/i, value: 'Point 1: AI capabilities\nPoint 2: ROI benefits\nPoint 3: Easy integration', type: 'textarea' },
      { label: /^tone/i, value: 'professional', type: 'select' },
    ];

    for (const mapping of fieldMappings) {
      try {
        // Find ion-item that contains a label with the text
        const item = page.locator('ion-item').filter({ has: page.locator('ion-label').filter({ hasText: mapping.label }) });
        
        if (await item.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`   Found field: ${mapping.label}`);
          
          if (mapping.type === 'select') {
            const select = item.locator('ion-select').first();
            if (await select.isVisible({ timeout: 1000 }).catch(() => false)) {
              await select.click();
              await page.waitForTimeout(1000);
              // Find option by text
              const option = page.locator('ion-select-popover ion-item, ion-popover ion-item').filter({ hasText: new RegExp(mapping.value, 'i') }).first();
              if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
                await option.click();
                await page.waitForTimeout(500);
                console.log(`   Selected: ${mapping.value}`);
              }
            }
          } else {
            // Find textarea or input
            const textarea = item.locator('ion-textarea').first();
            if (await textarea.isVisible({ timeout: 1000 }).catch(() => false)) {
              const nativeTextarea = textarea.locator('textarea').first();
              if (await nativeTextarea.isVisible({ timeout: 1000 }).catch(() => false)) {
                await nativeTextarea.click();
                await nativeTextarea.fill(mapping.value);
                await page.waitForTimeout(300);
                console.log(`   Filled: ${mapping.label}`);
              }
            }
          }
        }
      } catch (_e) {
        console.log(`   Could not fill field with label ${mapping.label}:`, e);
      }
    }

    await page.screenshot({ path: '/tmp/ms-form-filled.png' });
    console.log('   📸 Screenshot: /tmp/ms-form-filled.png');

    // Step 7: Select agents (writers, editors, evaluators)
    console.log('📍 Step 7: Selecting agents...');
    
    // Scroll to agent selection section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1000);

    // Scroll to agent selection section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1000);
    
    // Find agent sections - try multiple strategies
    const agentSections = ['Writers', 'Editors', 'Evaluators'];
    
    for (const sectionName of agentSections) {
      try {
        // Strategy 1: Find by h3 heading in agent-section
        let heading = page.locator('.agent-section h3').filter({ hasText: new RegExp(sectionName, 'i') });
        let found = await heading.isVisible({ timeout: 2000 }).catch(() => false);
        
        // Strategy 2: Find any h3 with the text
        if (!found) {
          heading = page.locator('h3').filter({ hasText: new RegExp(sectionName, 'i') });
          found = await heading.isVisible({ timeout: 2000 }).catch(() => false);
        }
        
        // Strategy 3: Find by text content anywhere
        if (!found) {
          heading = page.locator('*').filter({ hasText: new RegExp(`^${sectionName}$`, 'i') });
          found = await heading.isVisible({ timeout: 2000 }).catch(() => false);
        }
        
        if (found) {
          console.log(`   Found ${sectionName} section`);
          
          // Find checkboxes near this heading - try multiple approaches
          const checkboxes = page.locator('ion-checkbox');
          const allCheckboxes = await checkboxes.count();
          console.log(`   Total checkboxes on page: ${allCheckboxes}`);
          
          // Try to find checkboxes in the same card or section as the heading
          const card = heading.locator('..').locator('..').or(page.locator('ion-card').filter({ has: heading }));
          const sectionCheckboxes = card.locator('ion-checkbox');
          const sectionCount = await sectionCheckboxes.count();
          console.log(`   Checkboxes in ${sectionName} section: ${sectionCount}`);
          
          // Use section checkboxes if found, otherwise use all checkboxes
          const checkboxesToUse = sectionCount > 0 ? sectionCheckboxes : checkboxes;
          const count = sectionCount > 0 ? sectionCount : Math.min(allCheckboxes, 6);
          
          // Select first 2 agents in each section
          for (let i = 0; i < Math.min(count, 2); i++) {
            try {
              const cb = checkboxesToUse.nth(i);
              if (await cb.isVisible({ timeout: 1000 }).catch(() => false)) {
                await cb.click();
                await page.waitForTimeout(500);
                console.log(`   Selected ${sectionName} ${i + 1}`);
                
                // Wait for LLM configs to appear, then click first chip
                await page.waitForTimeout(500);
                const agentItem = cb.locator('..').or(page.locator('.agent-item').filter({ has: cb }));
                const chips = agentItem.locator('ion-chip').first();
                if (await chips.isVisible({ timeout: 1000 }).catch(() => false)) {
                  await chips.click();
                  await page.waitForTimeout(300);
                  console.log(`   Selected LLM config for ${sectionName} ${i + 1}`);
                }
              }
            } catch (_e) {
              console.log(`   Could not select ${sectionName} ${i}:`, e);
            }
          }
        } else {
          console.log(`   ${sectionName} section not found - trying to find any checkboxes...`);
          // Fallback: just try to click some checkboxes
          const allCheckboxes = page.locator('ion-checkbox');
          const count = await allCheckboxes.count();
          console.log(`   Found ${count} total checkboxes, selecting first 2...`);
          for (let i = 0; i < Math.min(count, 2); i++) {
            try {
              const cb = allCheckboxes.nth(i);
              if (await cb.isVisible({ timeout: 1000 }).catch(() => false)) {
                await cb.click();
                await page.waitForTimeout(500);
              }
            } catch {
              // Checkbox click failed, continue
            }
          }
        }
      } catch (_e) {
        console.log(`   Error finding ${sectionName} section:`, e);
      }
    }

    await page.screenshot({ path: '/tmp/ms-agents-selected.png' });
    console.log('   📸 Screenshot: /tmp/ms-agents-selected.png');

    // Step 8: Click Execute/Start button
    console.log('📍 Step 8: Looking for Execute button...');
    
    // Scroll to bottom to find the button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    
    // Try multiple button text patterns
    const buttonTexts = [
      /start marketing swarm/i,
      /execute/i,
      /start/i,
      /go/i,
      /run/i,
      /generate/i,
    ];
    
    let buttonClicked = false;
    for (const textPattern of buttonTexts) {
      try {
        const executeBtn = page.locator('ion-button').filter({ hasText: textPattern }).first();
        if (await executeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`   Found execute button with pattern ${textPattern}, clicking...`);
          await executeBtn.click();
          buttonClicked = true;
          break;
        }
      } catch (_e) {
        // Try next pattern
      }
    }
    
    if (!buttonClicked) {
      // Try finding any button in the execution summary card
      const summaryCard = page.locator('ion-card').filter({ hasText: /execution summary|summary/i });
      if (await summaryCard.isVisible({ timeout: 2000 }).catch(() => false)) {
        const btn = summaryCard.locator('ion-button').first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('   Found button in summary card, clicking...');
          await btn.click();
          buttonClicked = true;
        }
      }
    }

    if (buttonClicked) {

      console.log('📍 Step 9: Watching execution...');
      // Monitor progress for up to 2 minutes
      for (let i = 0; i < 24; i++) {
        await page.waitForTimeout(5000);
        await page.screenshot({ path: `/tmp/ms-progress-${i}.png` });
        console.log(`   📸 Progress screenshot ${i}`);

        // Check if completed
        const completedText = page.locator('text=Completed, text=Results, text=Winner');
        if (await completedText.isVisible({ timeout: 500 }).catch(() => false)) {
          console.log('✅ Execution completed!');
          break;
        }
      }
    } else {
      console.log('   ⚠️ Execute button not found, taking final screenshot...');
    }

    await page.screenshot({ path: '/tmp/ms-final.png' });
    console.log('📸 Final screenshot: /tmp/ms-final.png');

    // Keep browser open for manual inspection
    console.log('\n🔍 Browser open for 2 minutes for inspection...');
    console.log('   You can interact with the browser manually now.');
    await page.waitForTimeout(120000);

  } catch (error) {
    console.error('❌ Error:', error);
    await page.screenshot({ path: '/tmp/ms-error.png' });
  } finally {
    await browser.close();
  }
}

testMarketingSwarm();

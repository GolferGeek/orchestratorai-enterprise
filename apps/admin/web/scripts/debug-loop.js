
import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({
        headless: true,
    });
    const page = await browser.newPage();

    // Stream console logs to stdout
    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        console.log(`[Browser Console] [${type.toUpperCase()}] ${text}`);
    });

    page.on('pageerror', err => {
        console.error(`[Browser Error] ${err}`);
    });

    if (!process.env.URL) {
        console.error('ERROR: URL environment variable is required');
        process.exit(1);
    }
    const baseUrl = process.env.URL;
    console.log(`Navigating to ${baseUrl}...`);

    try {
        // 1. Go to home/login
        await page.goto(baseUrl);
        await page.waitForLoadState('networkidle');

        // 2. Login
        console.log('Logging in...');

        // Check if we are already logged in
        const menuButton = page.locator('ion-menu-button');
        if (await menuButton.isVisible()) {
            console.log('Already logged in (menu button visible)');
        } else {
            // Try to find "Login" or "Enter app"
            try {
                const loginBtn = page.getByText('Login', { exact: true }).or(page.getByText('Enter app'));
                if (await loginBtn.isVisible()) {
                    await loginBtn.click({ force: true });
                    console.log('Clicked Login/Enter app on home page');
                    await page.waitForTimeout(1000);
                }
            } catch (e) {
                console.log('Login/Enter app button not found on home page');
            }

            // Wait for login form
            try {
                // Check for "USE DEMO ACCOUNT" button
                const demoBtn = page.getByText('USE DEMO ACCOUNT');
                if (await demoBtn.isVisible()) {
                    console.log('Found USE DEMO ACCOUNT button, clicking...');
                    await demoBtn.click({ force: true });
                } else {
                    // Try standard login button
                    const submitBtn = page.locator('ion-button').filter({ hasText: 'Login' });
                    if (await submitBtn.isVisible()) {
                        await submitBtn.click({ force: true });
                        console.log('Clicked Login on login form');
                    }
                }
            } catch (e) {
                console.log('Error interacting with login form:', e);
            }
        }

        // Wait for navigation to dashboard
        console.log('Waiting for dashboard...');
        await page.waitForTimeout(5000);
        console.log('Current URL:', page.url());

        // 3. Navigate to HR Assistant
        console.log('Navigating to HR Assistant...');

        // Open menu if needed
        if (await menuButton.isVisible()) {
            const hrItem = page.getByText('HR Policy Assistant');
            if (!await hrItem.isVisible()) {
                console.log('Opening menu...');
                await menuButton.click({ force: true });
                await page.waitForTimeout(1000);
            }
        }

        // Click HR Policy Assistant
        console.log('Clicking HR Policy Assistant...');
        const hrItem = page.getByText('HR Policy Assistant');
        if (await hrItem.isVisible()) {
            await hrItem.click({ force: true });
        } else {
            console.log('HR Policy Assistant not visible. Dumping page text:');
            const text = await page.evaluate(() => document.body.innerText);
            console.log(text.substring(0, 500) + '...');
            throw new Error('HR Policy Assistant not found');
        }
        await page.waitForTimeout(1000);

        // Click Converse bubble
        console.log('Clicking Converse bubble...');
        const hrItemLocator = page.locator('ion-item').filter({ hasText: 'HR Policy Assistant' });
        const chatButton = hrItemLocator.locator('ion-button').first();

        if (await chatButton.isVisible()) {
            await chatButton.click({ force: true });
        } else {
            console.log('Chat button not found, trying to click text again...');
            await page.getByText('HR Policy Assistant').click({ force: true });
        }

        await page.waitForTimeout(3000);

        // 4. Submit Query
        console.log('Submitting query...');
        const query = "Hey, I have a new employee coming this week, can you help me with ideas about onboarding?";

        // Find textarea
        const textarea = page.locator('ion-textarea textarea, textarea').first();
        await textarea.waitFor({ state: 'visible', timeout: 10000 });
        await textarea.fill(query);

        // Click Build mode button first
        console.log('Selecting Build mode...');
        const buildModeBtn = page.locator('ion-button').filter({ hasText: 'Build' }).first();
        if (await buildModeBtn.isVisible()) {
            await buildModeBtn.click({ force: true });
        } else {
            // Try finding by title
            await page.locator('ion-button[title="Build"]').click({ force: true });
        }
        await page.waitForTimeout(500);

        // Then click Send
        console.log('Clicking Send...');
        const sendButton = page.locator('.send-button');
        await sendButton.click({ force: true });

        console.log('Query submitted. Listening for logs...');

        // Wait for a while to capture logs
        await page.waitForTimeout(20000);

    } catch (e) {
        console.error('Script error:', e);
        // Take screenshot on error
        await page.screenshot({ path: 'debug-error.png' });
    }
})();

import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    supportFile: 'tests/e2e/support/e2e.{js,jsx,ts,tsx}',
    specPattern: 'tests/e2e/specs/**/*.cy.{js,jsx,ts,tsx}',
    videosFolder: 'tests/e2e/videos',
    screenshotsFolder: 'tests/e2e/screenshots',
    baseUrl: 'http://localhost:9001',
    
    // Test configuration for real API integration
    defaultCommandTimeout: 10000,
    requestTimeout: 15000,
    responseTimeout: 15000,
    taskTimeout: 30000,
    
    // Browser configuration
    viewportWidth: 1280,
    viewportHeight: 720,
    
    // Video and screenshot settings
    video: false, // Disabled for faster execution
    screenshotOnRunFailure: true,
    
    // Retry configuration for CI/CD
    retries: {
      runMode: 2,
      openMode: 0
    },
    
    // Environment variables
    env: {
      // Test user credentials (from .env file)
      TEST_USER_EMAIL: 'testuser@golfergeek.com',
      TEST_USER_PASSWORD: 'testuser01!',
      TEST_USER_ID: 'db94682e-5184-496f-93fd-dc739aa0f9e7',
      
      // API endpoints
      API_BASE_URL: 'http://localhost:9000',
      APP_BASE_URL: 'http://localhost:5173',
      
      // Test configuration
      REAL_API_INTEGRATION: true,
      SKIP_AUTH_TESTS: false,
      SKIP_PII_TESTS: false,
      SKIP_DEMO_TESTS: false
    },
    
     
    setupNodeEvents(on, config) {
      // Task definitions for custom commands
      on('task', {
        log(message) {
          console.log(message);
          return null;
        },
        
        // Generate test data
        generateTestData() {
          return {
            timestamp: Date.now(),
            testId: `test-${Math.random().toString(36).substr(2, 9)}`,
            samplePII: {
              emails: ['john.doe@example.com', 'jane.smith@test.org'],
              phones: ['(555) 123-4567', '+1-800-555-0199'],
              names: ['John Doe', 'Jane Smith'],
              ssns: ['123-45-6789']
            }
          };
        },
        
        // Cleanup test data
        cleanupTestData(options) {
          console.log('Cleanup requested for:', options);
          // In a real implementation, this would clean up test artifacts
          return { cleaned: true };
        }
      });
      
      // Browser launch configuration
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.name === 'chrome') {
          // Chrome-specific settings for better test stability
          launchOptions.args.push('--disable-dev-shm-usage');
          launchOptions.args.push('--disable-gpu');
          launchOptions.args.push('--no-sandbox');
        }
        
        return launchOptions;
      });
      
      // Note: uncaught:exception handler is in support/e2e.ts, not here
      
      return config;
    },
  },
  
  // Component testing configuration (if needed)
  component: {
    devServer: {
      framework: 'vue',
      bundler: 'vite',
    },
    specPattern: 'src/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'tests/e2e/support/component.ts'
  }
});

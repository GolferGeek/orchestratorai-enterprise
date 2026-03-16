/**
 * Jest Integration Test Setup
 *
 * Loads environment variables and configures the test environment
 * for integration tests that hit real external APIs.
 */

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Also load from root .env if exists
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Log which API keys are available (without revealing them)
const apiKeys = {
  POLYGON_API_KEY: !!process.env.POLYGON_API_KEY,
  ALPHA_VANTAGE_API_KEY: !!process.env.ALPHA_VANTAGE_API_KEY,
  COINGECKO_API_KEY: !!process.env.COINGECKO_API_KEY,
  ETHERSCAN_API_KEY: !!process.env.ETHERSCAN_API_KEY,
  WHALE_ALERT_API_KEY: !!process.env.WHALE_ALERT_API_KEY,
  NEWSAPI_API_KEY: !!process.env.NEWSAPI_API_KEY,
  FIRECRAWL_API_KEY: !!process.env.FIRECRAWL_API_KEY,
};

console.log('\n=== Integration Test Environment ===');
console.log('Available API Keys:');
Object.entries(apiKeys).forEach(([key, available]) => {
  const status = available ? '✓' : '✗';
  console.log(`  ${status} ${key}`);
});
console.log('===================================\n');

// Warn about missing keys that will skip tests
const missingKeys = Object.entries(apiKeys)
  .filter(([, available]) => !available)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.log('⚠️  Some tests will be skipped due to missing API keys.');
  console.log('   Set the following environment variables to run all tests:');
  missingKeys.forEach((key) => console.log(`   - ${key}`));
  console.log('');
}

// Increase timeout for all tests
jest.setTimeout(60000);

// Global test utilities
global.testUtils = {
  // Check if we should skip a test based on missing API key
  skipIfMissing: (keyName) => {
    if (!process.env[keyName]) {
      console.log(`Skipping test: ${keyName} not set`);
      return true;
    }
    return false;
  },

  // Log test section headers
  logSection: (title) => {
    console.log(`\n--- ${title} ---`);
  },

  // Retry helper for flaky external API calls
  retry: async (fn, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1) throw error;
        console.log(`Retry ${i + 1}/${retries} after error: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  },
};

// Rate limiting helper - delay between tests
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 200; // 200ms between requests

global.rateLimit = async () => {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - elapsed)
    );
  }
  lastRequestTime = Date.now();
};

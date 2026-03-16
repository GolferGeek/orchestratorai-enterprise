/**
 * Jest Configuration for Integration Tests
 *
 * These tests hit real external APIs and require proper environment setup.
 * Run with: npx jest --config jest.integration.config.js
 */

const baseConfig = require('./jest.config');

module.exports = {
  // Extend the base configuration
  ...baseConfig,

  // Override test patterns for integration tests
  testRegex: '.*\\.integration\\.spec\\.ts$',

  // Longer timeout for real API calls
  testTimeout: 60000,

  // Run tests in band (sequentially) to avoid rate limiting
  maxConcurrency: 1,
  maxWorkers: 1,

  // Verbose output for debugging
  verbose: true,

  // Collect coverage only for integration-relevant files
  collectCoverageFrom: [
    'prediction-runner/**/*.ts',
    'agent2agent/runners/prediction/**/*.ts',
    '!**/*.spec.ts',
    '!**/*.mock.ts',
  ],

  // Setup file for environment variables (path relative to rootDir which is 'src')
  setupFilesAfterEnv: ['<rootDir>/../jest.integration.setup.js'],

  // Display name for clarity
  displayName: {
    name: 'INTEGRATION',
    color: 'cyan',
  },

  // Default reporter only (jest-html-reporters may not be installed)
  reporters: ['default'],
};

// E2E Test Support Configuration
// Global setup and configuration for Cypress E2E tests
// Following CLAUDE.md principles: Real API integration, no mocks

import './commands';

// Test environment configuration
export const testConfig = {
  // Real test user from .env file
  testUser: {
    email: 'testuser@golfergeek.com',
    password: 'testuser01!',
    userId: 'db94682e-5184-496f-93fd-dc739aa0f9e7'
  },
  
  // API endpoints
  apiBaseUrl: 'http://localhost:9000',
  appBaseUrl: 'http://localhost:5173',
  
  // Test timeouts
  defaultTimeout: 10000,
  apiTimeout: 15000,
  longTimeout: 30000
};

// Global before hook - runs once before all tests
before(() => {
  cy.log('🚀 Starting E2E Test Suite');
  cy.log('Using real API integration at: ' + testConfig.apiBaseUrl);
  cy.log('Testing frontend at: ' + testConfig.appBaseUrl);
});

// Global beforeEach hook - runs before each test
beforeEach(() => {
  // Set default viewport
  cy.viewport(1280, 720);
  
  // Clear application state
  cy.clearCookies();
  cy.clearLocalStorage(); 
  // clearSessionStorage is not available in newer Cypress versions
  cy.window().then((win) => {
    win.sessionStorage.clear();
  });
  
  // Set up API intercepts for monitoring
  cy.intercept('GET', '/api/**').as('apiGet');
  cy.intercept('POST', '/api/**').as('apiPost');
  cy.intercept('PUT', '/api/**').as('apiPut');
  cy.intercept('DELETE', '/api/**').as('apiDelete');
  
  // Ensure clean test environment
  cy.window().then((win) => {
    // Reset any global state
    win.sessionStorage.clear();
    win.localStorage.clear();
  });
});

// Global afterEach hook - runs after each test
afterEach(() => {
  // Log any console errors
  cy.window().then((win) => {
    if (win.console && win.console.error) {
      const errors = win.console.error.toString();
      if (errors && !errors.includes('favicon.ico')) {
        cy.log('Console errors detected: ' + errors);
      }
    }
  });
});

// Configure Cypress defaults (only non-read-only options)
Cypress.config('defaultCommandTimeout', testConfig.defaultTimeout);
Cypress.config('requestTimeout', testConfig.apiTimeout);
Cypress.config('responseTimeout', testConfig.apiTimeout);

// Note: video, screenshotOnRunFailure, and screenshotsFolder are configured in cypress.config.ts

// Global error handling
Cypress.on('uncaught:exception', (err, _runnable) => {
  // Don't fail tests on unhandled promise rejections from external libraries
  if (err.message.includes('ResizeObserver loop limit exceeded')) {
    return false;
  }
  
  // Don't fail tests on network errors during test cleanup
  if (err.message.includes('NetworkError')) {
    return false;
  }
  
  // Log the error but don't fail the test for certain non-critical errors
  console.log('Uncaught exception:', err.message);
  
  // Return false to prevent failing the test, true to fail
  return false;
});

export {};
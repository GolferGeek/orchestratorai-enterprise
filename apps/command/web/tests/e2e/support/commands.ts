/// <reference types="cypress" />
// Custom Cypress Commands for E2E Testing
// Reusable commands for authentication, navigation, and common actions
// Following CLAUDE.md principles: Real API integration, no mocks

import { testConfig } from './e2e';

// Login command - uses real test user credentials
Cypress.Commands.add('login', (email?: string, password?: string) => {
  const loginEmail = email || testConfig.testUser.email;
  const loginPassword = password || testConfig.testUser.password;

  cy.session([loginEmail, loginPassword], () => {
    cy.visit('/login');
    cy.get('[data-cy=email-input]').type(loginEmail);
    cy.get('[data-cy=password-input]').type(loginPassword);
    cy.get('[data-cy=login-button]').click();
    
    // Wait for successful login
    cy.url().should('not.include', '/login');
    cy.get('[data-cy=user-avatar]', { timeout: testConfig.apiTimeout }).should('be.visible');
  });
});

// Login as test user specifically
Cypress.Commands.add('loginAsTestUser', () => {
  cy.login(testConfig.testUser.email, testConfig.testUser.password);
});

// Login as admin user (assumes admin user exists)
Cypress.Commands.add('loginAsAdmin', () => {
  cy.login('admin@example.com', 'admin123');
});

// Logout command
Cypress.Commands.add('logout', () => {
  cy.get('[data-cy=user-menu]').click();
  cy.get('[data-cy=logout-button]').click();
  cy.url().should('not.include', '/app');
});

// Wait for page to fully load
Cypress.Commands.add('waitForPageLoad', () => {
  // Wait for main page content to be visible
  cy.get('[data-cy=page-content]', { timeout: testConfig.defaultTimeout }).should('be.visible');
  
  // Wait for any loading spinners to disappear
  cy.get('[data-cy=loading-spinner]').should('not.exist');
  
  // Wait for ionic components to be ready
  cy.get('ion-content').should('be.visible');
});

// Wait for specific API response
Cypress.Commands.add('waitForApiResponse', (alias: string) => {
  cy.wait(`@${alias}`, { timeout: testConfig.apiTimeout });
});

// Accessibility check helper
Cypress.Commands.add('checkAccessibility', () => {
  // Check for basic accessibility requirements
  cy.get('main').should('exist'); // Main landmark
  cy.get('h1, h2, h3').should('exist'); // Heading structure
  
  // Check for alt text on images
  cy.get('img').each(($img) => {
    cy.wrap($img).should('have.attr', 'alt');
  });
  
  // Check for form labels
  cy.get('input[type="text"], input[type="email"], input[type="password"]').each(($input) => {
    const id = $input.attr('id');
    if (id) {
      cy.get(`label[for="${id}"]`).should('exist');
    }
  });
});

// Verify no console errors
Cypress.Commands.add('verifyNoConsoleErrors', () => {
  cy.window().then((win) => {
    if (win.console && win.console.error) {
      const errorSpy = cy.spy(win.console, 'error');
      expect(errorSpy).not.to.have.been.called;
    }
  });
});

// Wait for Ionic components to be ready
Cypress.Commands.add('waitForIonic', () => {
  cy.window().then((win) => {
    return new Promise((resolve) => {
      if (win.document.readyState === 'complete') {
        resolve();
      } else {
        win.addEventListener('load', resolve);
      }
    });
  });
});

// Fill PII pattern form
Cypress.Commands.add('fillPIIPatternForm', (pattern: { name: string; dataType: string; regex: string; description?: string }) => {
  cy.get('[data-cy=pattern-name-input]').type(pattern.name);
  cy.get('[data-cy=pattern-type-select]').select(pattern.dataType);
  cy.get('[data-cy=pattern-regex-input]').type(pattern.regex);
  
  if (pattern.description) {
    cy.get('[data-cy=pattern-description-input]').type(pattern.description);
  }
  
  if (pattern.enabled !== undefined) {
    if (pattern.enabled) {
      cy.get('[data-cy=pattern-enabled-checkbox]').check();
    } else {
      cy.get('[data-cy=pattern-enabled-checkbox]').uncheck();
    }
  }
});

// Fill pseudonym dictionary form
Cypress.Commands.add('fillDictionaryForm', (dictionary: { name: string; dataType: string; category: string; words?: string[] }) => {
  cy.get('[data-cy=dictionary-name-input]').type(dictionary.name);
  cy.get('[data-cy=dictionary-type-select]').select(dictionary.dataType);
  cy.get('[data-cy=dictionary-category-input]').type(dictionary.category);
  
  if (dictionary.words && Array.isArray(dictionary.words)) {
    cy.get('[data-cy=dictionary-words-textarea]').type(dictionary.words.join('\n'));
  }
  
  if (dictionary.description) {
    cy.get('[data-cy=dictionary-description-input]').type(dictionary.description);
  }
});

// Navigate to admin section (requires admin login)
Cypress.Commands.add('navigateToAdmin', (section: string) => {
  cy.visit(`/app/admin/${section}`);
  cy.waitForPageLoad();
});

// Check for loading states
Cypress.Commands.add('checkLoadingState', (shouldBeLoading: boolean = false) => {
  if (shouldBeLoading) {
    cy.get('[data-cy=loading-spinner]').should('be.visible');
  } else {
    cy.get('[data-cy=loading-spinner]').should('not.exist');
  }
});

// Wait for and check success message
Cypress.Commands.add('expectSuccessMessage', (message?: string) => {
  cy.get('[data-cy=success-message]').should('be.visible');
  
  if (message) {
    cy.get('[data-cy=success-message]').should('contain', message);
  }
});

// Wait for and check error message
Cypress.Commands.add('expectErrorMessage', (message?: string) => {
  cy.get('[data-cy=error-message]').should('be.visible');
  
  if (message) {
    cy.get('[data-cy=error-message]').should('contain', message);
  }
});

// Declare global types for TypeScript
declare global {
  namespace Cypress {
    interface Chainable {
      login(email?: string, password?: string): Chainable<void>;
      loginAsTestUser(): Chainable<void>;
      loginAsAdmin(): Chainable<void>;
      logout(): Chainable<void>;
      waitForPageLoad(): Chainable<void>;
      waitForApiResponse(alias: string): Chainable<void>;
      checkAccessibility(): Chainable<void>;
      verifyNoConsoleErrors(): Chainable<void>;
      waitForIonic(): Chainable<void>;
      fillPIIPatternForm(pattern: { name: string; dataType: string; regex: string; description?: string }): Chainable<void>;
      fillDictionaryForm(dictionary: { name: string; dataType: string; category: string; words?: string[] }): Chainable<void>;
      navigateToAdmin(section: string): Chainable<void>;
      checkLoadingState(shouldBeLoading?: boolean): Chainable<void>;
      expectSuccessMessage(message?: string): Chainable<void>;
      expectErrorMessage(message?: string): Chainable<void>;
    }
  }
}
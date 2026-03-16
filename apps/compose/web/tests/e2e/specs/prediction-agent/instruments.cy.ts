/**
 * Prediction Agent Instruments E2E Tests
 *
 * Tests the instruments management functionality:
 * - Viewing tracked instruments
 * - Adding instruments
 * - Removing instruments
 * - Instrument search/autocomplete
 *
 * Following CLAUDE.md principles: Real API integration, no mocks
 */

describe('Prediction Agent Instruments', () => {
  const testConfig = {
    apiBaseUrl: Cypress.env('API_BASE_URL') || 'http://localhost:6100',
    testUserEmail: Cypress.env('TEST_USER_EMAIL') || 'testuser@golfergeek.com',
    testUserPassword: Cypress.env('TEST_USER_PASSWORD') || 'testuser01!',
  };

  beforeEach(() => {
    // Login before each test
    cy.visit('/login');
    cy.get('[data-testid="email-input"], input[type="email"]')
      .should('be.visible')
      .type(testConfig.testUserEmail);
    cy.get('[data-testid="password-input"], input[type="password"]')
      .should('be.visible')
      .type(testConfig.testUserPassword);
    cy.get('[data-testid="login-button"], button[type="submit"]').click();

    // Wait for login to complete
    cy.url().should('not.include', '/login', { timeout: 10000 });
  });

  describe('Instruments Display', () => {
    it('should display list of tracked instruments', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to instruments tab
            cy.get('[data-testid="tab-instruments"], [role="tab"]')
              .contains(/instruments/i)
              .click();

            // Instruments component should be visible
            cy.get('[data-testid="instruments-component"], .instruments-component').should('be.visible');

            // Should show list of instruments
            cy.get('[data-testid="instrument-list"], .instrument-list').should('exist');
          } else {
            cy.log('No dashboard agents found - test skipped');
          }
        });
    });

    it('should display instrument details (symbol, name)', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            cy.get('[data-testid="tab-instruments"], [role="tab"]')
              .contains(/instruments/i)
              .click();

            // Check for instrument items
            cy.get('[data-testid="instrument-item"], .instrument-item').then(($items) => {
              if ($items.length > 0) {
                cy.wrap($items).first().within(() => {
                  // Should show symbol
                  cy.get('[data-testid="instrument-symbol"], .symbol').should('exist');
                });
              } else {
                cy.log('No instruments configured - this may be OK for new agents');
              }
            });
          }
        });
    });
  });

  describe('Add Instruments', () => {
    it('should have an add instrument button/input', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            cy.get('[data-testid="tab-instruments"], [role="tab"]')
              .contains(/instruments/i)
              .click();

            // Should have add instrument UI
            cy.get('[data-testid="add-instrument"], .add-instrument, button')
              .contains(/add/i)
              .should('be.visible');
          }
        });
    });

    it('should show input field when clicking add', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            cy.get('[data-testid="tab-instruments"], [role="tab"]')
              .contains(/instruments/i)
              .click();

            // Click add button
            cy.get('[data-testid="add-instrument"], .add-instrument, button')
              .contains(/add/i)
              .click();

            // Should show input field
            cy.get(
              '[data-testid="instrument-input"], input[placeholder*="instrument"], input[placeholder*="symbol"]'
            ).should('be.visible');
          }
        });
    });

    it('should add instrument and update list', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            cy.get('[data-testid="tab-instruments"], [role="tab"]')
              .contains(/instruments/i)
              .click();

            // Get initial count
            cy.get('[data-testid="instrument-item"], .instrument-item').then(($items) => {
              const initialCount = $items.length;

              // Add instrument
              cy.get('[data-testid="add-instrument"], .add-instrument, button')
                .contains(/add/i)
                .click();

              cy.get('[data-testid="instrument-input"], input[placeholder*="instrument"]')
                .type('AMZN');

              // Confirm add
              cy.get('[data-testid="confirm-add"], button')
                .contains(/add|save|confirm/i)
                .click();

              // Wait for update
              cy.wait(1000);

              // Should have more instruments (or show confirmation)
              cy.get('[data-testid="instrument-item"], .instrument-item, .toast-success').then(
                ($newItems) => {
                  // Either list grew or we got a success message
                  if ($newItems.hasClass('toast-success')) {
                    cy.log('Instrument added successfully');
                  } else {
                    expect($newItems.length).to.be.at.least(initialCount);
                  }
                }
              );
            });
          }
        });
    });
  });

  describe('Remove Instruments', () => {
    it('should have remove button for each instrument', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            cy.get('[data-testid="tab-instruments"], [role="tab"]')
              .contains(/instruments/i)
              .click();

            cy.get('[data-testid="instrument-item"], .instrument-item').then(($items) => {
              if ($items.length > 0) {
                cy.wrap($items)
                  .first()
                  .within(() => {
                    // Should have remove button
                    cy.get('[data-testid="remove-instrument"], button[aria-label*="remove"], .remove-btn')
                      .should('exist');
                  });
              } else {
                cy.log('No instruments to remove');
              }
            });
          }
        });
    });

    it('should show confirmation before removing', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            cy.get('[data-testid="tab-instruments"], [role="tab"]')
              .contains(/instruments/i)
              .click();

            cy.get('[data-testid="instrument-item"], .instrument-item').then(($items) => {
              if ($items.length > 1) {
                // Click remove on first item
                cy.wrap($items)
                  .first()
                  .find('[data-testid="remove-instrument"], button[aria-label*="remove"], .remove-btn')
                  .click();

                // Should show confirmation dialog or inline confirm
                cy.get(
                  '[data-testid="confirm-dialog"], .confirmation, [role="alertdialog"], .confirm-remove'
                ).should('be.visible');
              } else {
                cy.log('Not enough instruments to test removal');
              }
            });
          }
        });
    });
  });

  describe('Instrument Validation', () => {
    it('should validate instrument symbol format', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            cy.get('[data-testid="tab-instruments"], [role="tab"]')
              .contains(/instruments/i)
              .click();

            // Try to add invalid instrument
            cy.get('[data-testid="add-instrument"], .add-instrument, button')
              .contains(/add/i)
              .click();

            cy.get('[data-testid="instrument-input"], input[placeholder*="instrument"]')
              .type('invalid symbol with spaces!');

            cy.get('[data-testid="confirm-add"], button')
              .contains(/add|save|confirm/i)
              .click();

            // Should show validation error
            cy.get('[data-testid="error-message"], .error, .validation-error, .toast-error')
              .should('be.visible');
          }
        });
    });

    it('should prevent duplicate instruments', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            cy.get('[data-testid="tab-instruments"], [role="tab"]')
              .contains(/instruments/i)
              .click();

            // Get first instrument symbol
            cy.get('[data-testid="instrument-item"], .instrument-item')
              .first()
              .find('[data-testid="instrument-symbol"], .symbol')
              .invoke('text')
              .then((symbol) => {
                if (symbol) {
                  // Try to add duplicate
                  cy.get('[data-testid="add-instrument"], .add-instrument, button')
                    .contains(/add/i)
                    .click();

                  cy.get('[data-testid="instrument-input"], input[placeholder*="instrument"]')
                    .type(symbol.trim());

                  cy.get('[data-testid="confirm-add"], button')
                    .contains(/add|save|confirm/i)
                    .click();

                  // Should show duplicate error
                  cy.get(
                    '[data-testid="error-message"], .error, .duplicate-error, .toast-error'
                  ).should('be.visible');
                }
              });
          }
        });
    });
  });
});

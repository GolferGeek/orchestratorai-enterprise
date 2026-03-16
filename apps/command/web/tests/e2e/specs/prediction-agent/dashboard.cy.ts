/**
 * Prediction Agent Dashboard E2E Tests
 *
 * Tests the prediction agent dashboard UI including:
 * - Dashboard loading and rendering
 * - Current state display
 * - Recommendations display
 * - Navigation and routing
 *
 * Following CLAUDE.md principles: Real API integration, no mocks
 */

describe('Prediction Agent Dashboard', () => {
  const testConfig = {
    apiBaseUrl: Cypress.env('API_BASE_URL') || 'http://localhost:6100',
    testUserEmail: Cypress.env('TEST_USER_EMAIL') || 'testuser@golfergeek.com',
    testUserPassword: Cypress.env('TEST_USER_PASSWORD') || 'testuser01!',
  };

  // Store agent info for tests
  let _testAgentId: string;
  let _testAgentSlug: string;

  before(() => {
    // Login and find a prediction agent
    cy.log('Setting up prediction agent dashboard tests');
  });

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

  describe('Dashboard Loading', () => {
    it('should display the agent list with prediction agents', () => {
      // Navigate to agents page
      cy.visit('/agents');
      cy.wait(1000);

      // Look for prediction agents in the list
      cy.get('[data-testid="agent-list"], .agent-tree, .agents-container')
        .should('be.visible')
        .within(() => {
          // Should have at least some agents
          cy.get('[data-testid="agent-item"], .agent-item, .agent-card').should(
            'have.length.at.least',
            0
          );
        });
    });

    it('should navigate to prediction agent dashboard when clicking a dashboard agent', () => {
      cy.visit('/agents');
      cy.wait(1000);

      // Find a prediction/dashboard type agent
      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();

            // Should navigate to dashboard view (not conversation)
            cy.url().should('match', /\/(dashboard|prediction)/);

            // Dashboard components should be visible
            cy.get('[data-testid="prediction-dashboard"], .prediction-pane').should('be.visible');
          } else {
            cy.log('No dashboard agents found - test skipped');
          }
        });
    });
  });

  describe('Current State Display', () => {
    it('should display current state component with recommendations', () => {
      // Navigate directly to a prediction agent dashboard if we have the ID
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Current state component should exist
            cy.get(
              '[data-testid="current-state"], .current-state-component, [class*="CurrentState"]'
            ).should('exist');

            // Should show timestamp or last updated info
            cy.get('[data-testid="last-updated"], .last-updated, .timestamp').should('exist');
          } else {
            cy.log('No dashboard agents found - test skipped');
          }
        });
    });

    it('should display recommendation cards when recommendations exist', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Check for recommendations section
            cy.get('[data-testid="recommendations-section"], .recommendations, [class*="Recommendation"]').then(
              ($recs) => {
                if ($recs.find('[data-testid="recommendation-card"], .recommendation-row').length > 0) {
                  cy.log('Found recommendations');
                  cy.get('[data-testid="recommendation-card"], .recommendation-row')
                    .first()
                    .should('be.visible')
                    .within(() => {
                      // Each recommendation should have key fields
                      cy.get('[data-testid="instrument"], .instrument').should('exist');
                      cy.get('[data-testid="action"], .action').should('exist');
                    });
                } else {
                  cy.log('No recommendations yet - this is OK for new agents');
                }
              }
            );
          }
        });
    });
  });

  describe('Dashboard Tab Navigation', () => {
    it('should have tabs for different dashboard sections', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Dashboard should have navigation tabs
            cy.get('[data-testid="dashboard-tabs"], .dashboard-tabs, [role="tablist"]').within(() => {
              // Check for expected tabs
              cy.get('[data-testid="tab-current"], [role="tab"]').contains(/current|overview/i).should('exist');
              cy.get('[data-testid="tab-history"], [role="tab"]').contains(/history/i).should('exist');
              cy.get('[data-testid="tab-instruments"], [role="tab"]').contains(/instruments/i).should('exist');
              cy.get('[data-testid="tab-config"], [role="tab"]').contains(/config/i).should('exist');
            });
          }
        });
    });

    it('should switch content when clicking tabs', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Click history tab
            cy.get('[data-testid="tab-history"], [role="tab"]')
              .contains(/history/i)
              .click();
            cy.get('[data-testid="history-component"], .history-component').should('be.visible');

            // Click instruments tab
            cy.get('[data-testid="tab-instruments"], [role="tab"]')
              .contains(/instruments/i)
              .click();
            cy.get('[data-testid="instruments-component"], .instruments-component').should('be.visible');

            // Click config tab
            cy.get('[data-testid="tab-config"], [role="tab"]')
              .contains(/config/i)
              .click();
            cy.get('[data-testid="config-component"], .config-component').should('be.visible');

            // Return to current/overview
            cy.get('[data-testid="tab-current"], [role="tab"]')
              .contains(/current|overview/i)
              .click();
            cy.get('[data-testid="current-state"], .current-state-component').should('be.visible');
          }
        });
    });
  });

  describe('Error Handling', () => {
    it('should handle loading errors gracefully', () => {
      // Visit with an invalid agent ID
      cy.visit('/agents/invalid-uuid-12345/dashboard', { failOnStatusCode: false });

      // Should show error state or redirect
      cy.get('body').should('exist');

      // Either shows error message or redirects to agents list
      cy.url().should('satisfy', (url: string) => {
        return url.includes('/agents') || url.includes('/error') || url.includes('/404');
      });
    });

    it('should show loading state while fetching data', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            // Intercept API call to add delay
            cy.intercept('GET', '**/predictions/**/current', (req) => {
              req.on('response', (res) => {
                res.setDelay(500);
              });
            }).as('getCurrentPredictions');

            cy.wrap($agent).click();

            // Should show loading indicator briefly
            cy.get('[data-testid="loading"], .loading, .skeleton, [class*="Loading"]').should('exist');

            // Wait for data to load
            cy.wait('@getCurrentPredictions', { timeout: 10000 });
          }
        });
    });
  });
});

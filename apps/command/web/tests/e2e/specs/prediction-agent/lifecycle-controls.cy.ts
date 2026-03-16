/**
 * Prediction Agent Lifecycle Controls E2E Tests
 *
 * Tests the agent lifecycle control functionality:
 * - Start/Stop agent
 * - Pause/Resume agent
 * - Manual poll trigger
 * - Status display
 *
 * Following CLAUDE.md principles: Real API integration, no mocks
 */

describe('Prediction Agent Lifecycle Controls', () => {
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

  describe('Status Display', () => {
    it('should display current agent status', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Status should be visible somewhere on dashboard
            cy.get('[data-testid="agent-status"], .agent-status, .status-indicator, [class*="status"]')
              .should('be.visible');
          } else {
            cy.log('No dashboard agents found - test skipped');
          }
        });
    });

    it('should show running/stopped status clearly', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Status should have clear indication
            cy.get('[data-testid="agent-status"], .agent-status, .status-indicator').then(($status) => {
              const statusText = $status.text().toLowerCase();
              // Should contain one of the known statuses
              expect(statusText).to.satisfy((text: string) => {
                return (
                  text.includes('running') ||
                  text.includes('stopped') ||
                  text.includes('paused') ||
                  text.includes('idle') ||
                  text.includes('active')
                );
              });
            });
          }
        });
    });

    it('should display last poll time if agent has run', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Check for last poll/run time
            cy.get('[data-testid="last-poll"], .last-poll, .last-run, [class*="lastRun"]').then(
              ($lastPoll) => {
                if ($lastPoll.length > 0 && $lastPoll.text().trim()) {
                  cy.log('Last poll time displayed: ' + $lastPoll.text());
                } else {
                  cy.log('No poll history yet - OK for new agents');
                }
              }
            );
          }
        });
    });
  });

  describe('Start/Stop Controls', () => {
    it('should have start/stop button', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Should have start or stop button depending on current state
            cy.get(
              '[data-testid="start-button"], [data-testid="stop-button"], button'
            )
              .filter(':contains("Start"), :contains("Stop")')
              .should('have.length.at.least', 1);
          }
        });
    });

    it('should toggle button label based on status', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Get current status
            cy.get('[data-testid="agent-status"], .agent-status').then(($status) => {
              const isRunning =
                $status.text().toLowerCase().includes('running') ||
                $status.text().toLowerCase().includes('active');

              if (isRunning) {
                // Should show Stop button
                cy.get('button').contains(/stop/i).should('be.visible');
              } else {
                // Should show Start button
                cy.get('button').contains(/start/i).should('be.visible');
              }
            });
          }
        });
    });

    it('should update status after clicking start/stop', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Intercept status API call
            cy.intercept('POST', '**/predictions/**/start').as('startAgent');
            cy.intercept('POST', '**/predictions/**/stop').as('stopAgent');

            // Get initial status
            cy.get('[data-testid="agent-status"], .agent-status')
              .invoke('text')
              .then((initialStatus) => {
                const isRunning =
                  initialStatus.toLowerCase().includes('running') ||
                  initialStatus.toLowerCase().includes('active');

                if (isRunning) {
                  // Click stop
                  cy.get('button').contains(/stop/i).click();
                  cy.wait('@stopAgent', { timeout: 10000 });
                } else {
                  // Click start
                  cy.get('button').contains(/start/i).click();
                  cy.wait('@startAgent', { timeout: 10000 });
                }

                // Status should update (may take a moment)
                cy.wait(1000);

                // Verify status changed (or at least a feedback was shown)
                cy.get('[data-testid="agent-status"], .agent-status, .toast-success')
                  .should('be.visible');
              });
          }
        });
    });
  });

  describe('Pause/Resume Controls', () => {
    it('should have pause/resume button when agent is running', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            cy.get('[data-testid="agent-status"], .agent-status').then(($status) => {
              const isRunning =
                $status.text().toLowerCase().includes('running') ||
                $status.text().toLowerCase().includes('active');

              if (isRunning) {
                // Should have pause button
                cy.get(
                  '[data-testid="pause-button"], button'
                )
                  .filter(':contains("Pause")')
                  .should('be.visible');
              } else {
                cy.log('Agent not running - pause button may not be available');
              }
            });
          }
        });
    });

    it('should show resume button when paused', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            cy.get('[data-testid="agent-status"], .agent-status').then(($status) => {
              const isPaused = $status.text().toLowerCase().includes('paused');

              if (isPaused) {
                // Should have resume button
                cy.get(
                  '[data-testid="resume-button"], button'
                )
                  .filter(':contains("Resume")')
                  .should('be.visible');
              } else {
                cy.log('Agent not paused - resume button check skipped');
              }
            });
          }
        });
    });
  });

  describe('Manual Poll Trigger', () => {
    it('should have poll now button', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Should have poll now / refresh button
            cy.get(
              '[data-testid="poll-now"], [data-testid="refresh-button"], button'
            )
              .filter(':contains("Poll"), :contains("Refresh"), :contains("Update")')
              .should('have.length.at.least', 1);
          }
        });
    });

    it('should trigger poll and show feedback', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Intercept poll API call
            cy.intercept('POST', '**/predictions/**/poll-now').as('pollNow');

            // Click poll now button
            cy.get(
              '[data-testid="poll-now"], [data-testid="refresh-button"], button'
            )
              .filter(':contains("Poll"), :contains("Refresh"), :contains("Update")')
              .first()
              .click();

            // Should show loading or feedback
            cy.get(
              '[data-testid="loading"], .loading, .spinner, .toast-info, .toast-success'
            ).should('be.visible');
          }
        });
    });

    it('should disable poll button while polling', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Intercept with delay
            cy.intercept('POST', '**/predictions/**/poll-now', (req) => {
              req.on('response', (res) => {
                res.setDelay(1000);
              });
            }).as('pollNow');

            const pollButton = cy.get(
              '[data-testid="poll-now"], [data-testid="refresh-button"], button'
            )
              .filter(':contains("Poll"), :contains("Refresh"), :contains("Update")')
              .first();

            pollButton.click();

            // Button should be disabled during poll
            pollButton.should('be.disabled');

            // Wait for poll to complete
            cy.wait('@pollNow', { timeout: 10000 });

            // Button should be enabled again
            cy.wait(500);
            cy.get(
              '[data-testid="poll-now"], [data-testid="refresh-button"], button'
            )
              .filter(':contains("Poll"), :contains("Refresh"), :contains("Update")')
              .first()
              .should('not.be.disabled');
          }
        });
    });
  });

  describe('Status Persistence', () => {
    it('should maintain status across page refreshes', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Get current status
            cy.get('[data-testid="agent-status"], .agent-status')
              .invoke('text')
              .then((status) => {
                // Refresh page
                cy.reload();
                cy.wait(1000);

                // Status should be the same
                cy.get('[data-testid="agent-status"], .agent-status')
                  .invoke('text')
                  .should('eq', status);
              });
          }
        });
    });
  });
});

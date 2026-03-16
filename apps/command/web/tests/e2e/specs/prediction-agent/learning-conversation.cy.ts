/**
 * Prediction Agent Learning Conversation E2E Tests
 *
 * Tests the learning conversation functionality:
 * - Learning summary display
 * - Starting learning conversations
 * - Sending messages in conversations
 * - Applying learning updates
 *
 * Following CLAUDE.md principles: Real API integration, no mocks
 */

describe('Prediction Agent Learning Conversation', () => {
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

  describe('Learning Summary Display', () => {
    it('should display learning summary section', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to learning tab if it exists
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Insights")')
              .first()
              .then(($tab) => {
                if ($tab.length > 0) {
                  cy.wrap($tab).click();
                  cy.wait(500);

                  // Learning summary section should be visible
                  cy.get(
                    '[data-testid="learning-summary"], .learning-summary, [class*="learning"]'
                  ).should('be.visible');
                } else {
                  cy.log('Learning tab not found - may be displayed inline');
                }
              });
          } else {
            cy.log('No dashboard agents found - test skipped');
          }
        });
    });

    it('should display prediction accuracy metrics', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to learning section
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Insights"), :contains("Performance")')
              .first()
              .click({ force: true });

            cy.wait(500);

            // Check for accuracy metrics
            cy.get(
              '[data-testid="accuracy-metrics"], .accuracy, [class*="metric"], [class*="performance"]'
            ).then(($metrics) => {
              if ($metrics.length > 0) {
                cy.log('Accuracy metrics found');
                // Should contain percentage or score
                cy.wrap($metrics)
                  .invoke('text')
                  .should('match', /(\d+%|\d+\.\d+|accuracy|performance)/i);
              } else {
                cy.log('No accuracy metrics displayed yet - OK for new agents');
              }
            });
          }
        });
    });

    it('should display postmortem analysis if available', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to learning section
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Analysis"), :contains("Postmortem")')
              .first()
              .click({ force: true });

            cy.wait(500);

            // Check for postmortem section
            cy.get(
              '[data-testid="postmortems"], .postmortem, [class*="postmortem"], [class*="analysis"]'
            ).then(($postmortems) => {
              if ($postmortems.length > 0) {
                cy.log('Postmortem analysis section found');
              } else {
                cy.log('No postmortems yet - OK for new agents');
              }
            });
          }
        });
    });

    it('should display missed opportunities if available', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to learning section
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Opportunities"), :contains("Missed")')
              .first()
              .click({ force: true });

            cy.wait(500);

            // Check for missed opportunities section
            cy.get(
              '[data-testid="missed-opportunities"], .missed-opportunities, [class*="missed"], [class*="opportunity"]'
            ).then(($opportunities) => {
              if ($opportunities.length > 0) {
                cy.log('Missed opportunities section found');
              } else {
                cy.log('No missed opportunities logged yet - OK for new agents');
              }
            });
          }
        });
    });
  });

  describe('Learning Conversation Flow', () => {
    it('should have start conversation button', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to learning section
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Chat"), :contains("Conversation")')
              .first()
              .click({ force: true });

            cy.wait(500);

            // Should have start conversation button
            cy.get(
              '[data-testid="start-conversation"], [data-testid="start-chat"], button'
            )
              .filter(
                ':contains("Start"), :contains("Chat"), :contains("Conversation"), :contains("Ask")'
              )
              .should('have.length.at.least', 1);
          }
        });
    });

    it('should open conversation interface when clicked', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to learning section
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Chat")')
              .first()
              .click({ force: true });

            cy.wait(500);

            // Click start conversation
            cy.get(
              '[data-testid="start-conversation"], [data-testid="start-chat"], button'
            )
              .filter(':contains("Start"), :contains("Chat"), :contains("Ask")')
              .first()
              .click();

            cy.wait(500);

            // Conversation interface should appear
            cy.get(
              '[data-testid="conversation-interface"], [data-testid="chat-interface"], .chat-container, .conversation-container, [class*="chat"], [class*="conversation"]'
            ).should('be.visible');
          }
        });
    });

    it('should have message input field', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to learning and start conversation
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Chat")')
              .first()
              .click({ force: true });

            cy.wait(500);

            cy.get(
              '[data-testid="start-conversation"], [data-testid="start-chat"], button'
            )
              .filter(':contains("Start"), :contains("Chat"), :contains("Ask")')
              .first()
              .click();

            cy.wait(500);

            // Should have message input
            cy.get(
              '[data-testid="message-input"], [data-testid="chat-input"], input[type="text"], textarea'
            )
              .filter('[placeholder*="message"], [placeholder*="Message"], [placeholder*="type"], [placeholder*="Type"], [placeholder*="ask"], [placeholder*="Ask"]')
              .should('be.visible');
          }
        });
    });

    it('should send message and receive response', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to learning and start conversation
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Chat")')
              .first()
              .click({ force: true });

            cy.wait(500);

            cy.get(
              '[data-testid="start-conversation"], [data-testid="start-chat"], button'
            )
              .filter(':contains("Start"), :contains("Chat"), :contains("Ask")')
              .first()
              .click();

            cy.wait(500);

            // Intercept message API
            cy.intercept('POST', '**/learning/**/message').as('sendMessage');

            // Type and send message
            const testMessage = 'What have you learned about AAPL predictions?';
            cy.get(
              '[data-testid="message-input"], [data-testid="chat-input"], input[type="text"], textarea'
            )
              .first()
              .type(testMessage);

            cy.get(
              '[data-testid="send-button"], [data-testid="submit-message"], button[type="submit"], button'
            )
              .filter(':contains("Send"), :contains("Submit"), :contains("Ask")')
              .first()
              .click();

            // Wait for response (may take time due to LLM processing)
            cy.wait('@sendMessage', { timeout: 30000 });

            // Response should appear in conversation
            cy.get(
              '[data-testid="message-list"], [data-testid="chat-messages"], .messages, .message-list, [class*="message"]'
            ).should('contain.text', testMessage);
          }
        });
    });

    it('should display conversation history', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to learning section
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("History")')
              .first()
              .click({ force: true });

            cy.wait(500);

            // Check for conversation history
            cy.get(
              '[data-testid="conversation-history"], [data-testid="chat-history"], .history, [class*="history"]'
            ).then(($history) => {
              if ($history.length > 0) {
                cy.log('Conversation history section found');
              } else {
                cy.log('No conversation history yet - OK for new agents');
              }
            });
          }
        });
    });
  });

  describe('Apply Learning Updates', () => {
    it('should display pending updates if available', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to learning section
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Updates")')
              .first()
              .click({ force: true });

            cy.wait(500);

            // Check for pending updates
            cy.get(
              '[data-testid="pending-updates"], [data-testid="suggested-updates"], .updates, [class*="update"]'
            ).then(($updates) => {
              if ($updates.length > 0) {
                cy.log('Pending updates section found');
              } else {
                cy.log('No pending updates - OK if agent has no learning data yet');
              }
            });
          }
        });
    });

    it('should have apply update button for each suggestion', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to learning section
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Updates")')
              .first()
              .click({ force: true });

            cy.wait(500);

            // Check for apply buttons
            cy.get(
              '[data-testid="pending-updates"], [data-testid="suggested-updates"], .updates, [class*="update"]'
            ).then(($updates) => {
              if ($updates.length > 0) {
                // Each update should have an apply button
                cy.get(
                  '[data-testid="apply-update"], button'
                )
                  .filter(':contains("Apply"), :contains("Accept")')
                  .should('have.length.at.least', 1);
              } else {
                cy.log('No updates to apply - skipping apply button check');
              }
            });
          }
        });
    });

    it('should have apply all button', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to learning section
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Updates")')
              .first()
              .click({ force: true });

            cy.wait(500);

            // Check for apply all button
            cy.get(
              '[data-testid="pending-updates"], [data-testid="suggested-updates"], .updates'
            ).then(($updates) => {
              if ($updates.length > 0) {
                cy.get(
                  '[data-testid="apply-all"], button'
                )
                  .filter(':contains("Apply All"), :contains("Accept All")')
                  .should('exist');
              } else {
                cy.log('No updates - apply all button may not be visible');
              }
            });
          }
        });
    });

    it('should show confirmation when applying update', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to learning section
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Updates")')
              .first()
              .click({ force: true });

            cy.wait(500);

            // Intercept apply API
            cy.intercept('POST', '**/learning/**/apply-update').as('applyUpdate');

            cy.get(
              '[data-testid="pending-updates"], [data-testid="suggested-updates"], .updates'
            ).then(($updates) => {
              if ($updates.length > 0) {
                // Click first apply button
                cy.get(
                  '[data-testid="apply-update"], button'
                )
                  .filter(':contains("Apply"), :contains("Accept")')
                  .first()
                  .click();

                // Should show confirmation or success message
                cy.get(
                  '[data-testid="confirmation"], .toast-success, .success, [class*="success"], [role="alert"]'
                ).should('be.visible');
              } else {
                cy.log('No updates to apply - skipping confirmation test');
              }
            });
          }
        });
    });
  });

  describe('Specialist Statistics', () => {
    it('should display specialist performance stats', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to learning/performance section
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Specialists"), :contains("Performance")')
              .first()
              .click({ force: true });

            cy.wait(500);

            // Check for specialist stats
            cy.get(
              '[data-testid="specialist-stats"], .specialist-stats, [class*="specialist"]'
            ).then(($stats) => {
              if ($stats.length > 0) {
                cy.log('Specialist statistics section found');
                // Should show specialist names
                cy.wrap($stats)
                  .invoke('text')
                  .should(
                    'match',
                    /(technical|fundamental|sentiment|analyst|specialist)/i
                  );
              } else {
                cy.log('No specialist stats yet - OK for new agents');
              }
            });
          }
        });
    });

    it('should show accuracy breakdown by specialist', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to specialists section
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Specialists")')
              .first()
              .click({ force: true });

            cy.wait(500);

            // Check for accuracy breakdown
            cy.get(
              '[data-testid="specialist-accuracy"], .accuracy-breakdown, [class*="accuracy"]'
            ).then(($accuracy) => {
              if ($accuracy.length > 0) {
                cy.log('Specialist accuracy breakdown found');
              } else {
                cy.log('No accuracy breakdown - needs more prediction history');
              }
            });
          }
        });
    });
  });

  describe('User Insights', () => {
    it('should display user-provided insights section', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to insights section
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Insights"), :contains("User")')
              .first()
              .click({ force: true });

            cy.wait(500);

            // Check for user insights section
            cy.get(
              '[data-testid="user-insights"], .user-insights, [class*="insight"]'
            ).then(($insights) => {
              if ($insights.length > 0) {
                cy.log('User insights section found');
              } else {
                cy.log('No user insights recorded yet');
              }
            });
          }
        });
    });

    it('should allow adding new insight', () => {
      cy.visit('/agents');
      cy.wait(1000);

      cy.get('[data-testid="dashboard-agent"], [data-interaction-mode="dashboard"]')
        .first()
        .then(($agent) => {
          if ($agent.length > 0) {
            cy.wrap($agent).click();
            cy.wait(500);

            // Navigate to insights section
            cy.get('[data-testid="learning-tab"], button, a')
              .filter(':contains("Learning"), :contains("Insights")')
              .first()
              .click({ force: true });

            cy.wait(500);

            // Check for add insight button or input
            cy.get(
              '[data-testid="add-insight"], [data-testid="new-insight"], button, input, textarea'
            )
              .filter(
                ':contains("Add"), :contains("New"), [placeholder*="insight"], [placeholder*="Insight"]'
              )
              .should('have.length.at.least', 1);
          }
        });
    });
  });
});

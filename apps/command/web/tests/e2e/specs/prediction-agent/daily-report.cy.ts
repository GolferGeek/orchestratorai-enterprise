describe('Prediction Daily Report Dashboard Flow', () => {
  const dailyReportPath = '/app/prediction/daily-report?agentSlug=us-tech-stocks';

  const testConfig = {
    testUserEmail:
      Cypress.env('TEST_USER_EMAIL') || 'golfergeek@orchestratorai.io',
    testUserPassword: Cypress.env('TEST_USER_PASSWORD') || 'GolferGeek123!',
  };

  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();

    cy.request({
      method: 'POST',
      url: 'http://localhost:8100/auth/login',
      body: {
        email: testConfig.testUserEmail,
        password: testConfig.testUserPassword,
      },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('accessToken');

      cy.visit('/');
      cy.window().then((win) => {
        win.localStorage.setItem('authToken', response.body.accessToken);
        if (response.body.refreshToken) {
          win.localStorage.setItem('refreshToken', response.body.refreshToken);
        }
        // Ensure prediction dashboard does not run under global "*" org context.
        win.localStorage.setItem('currentOrganization', 'finance');
      });

      cy.visit(dailyReportPath);
      cy.url({ timeout: 15000 }).should(
        'include',
        '/app/prediction/daily-report',
      );
    });
  });

  const waitForDailyReportShell = () => {
    cy.url().should('include', '/app/prediction/daily-report');
    cy.contains('h1, h2, ion-title', 'Daily Report', { timeout: 15000 }).should(
      'be.visible',
    );
    cy.contains('h2', 'Recent Runs', { timeout: 15000 }).should('be.visible');
    cy.contains('button', 'Run Daily Report', { timeout: 15000 }).should(
      'be.visible',
    );
    cy.get('.run-item, .state', { timeout: 15000 }).should(
      'have.length.greaterThan',
      0,
    );
  };

  it('opens Daily Report route directly', () => {
    waitForDailyReportShell();
  });

  it('renders recommendation action controls when run data exists', () => {
    waitForDailyReportShell();

    cy.get('body').then(($body) => {
      const runItems = $body.find('.run-item');
      if (runItems.length === 0) {
        cy.log('No runnable report entries present; asserting deterministic empty/error state branch');
        cy.get('.state').should('be.visible');
        cy.contains('h2', 'Recommendation Actions').should('not.exist');
        return;
      }

      cy.get('.run-item').first().should('be.visible').click({ force: true });
      cy.contains('h2', 'Summary', { timeout: 15000 }).should('be.visible');
      cy.contains('h2', 'Recommendation Actions').should('be.visible');
      cy.contains('h2', 'Action Audit Timeline').should('be.visible');
      cy.contains('button', /Review Pending|Apply Ready|Escalated/i).should(
        'be.visible',
      );
      cy.contains('button', /Approve Pending Context Updates/i).should(
        'be.visible',
      );
      cy.contains('button', /Reject Low-Confidence Sources/i).should(
        'be.visible',
      );
      cy.contains('button', /Apply Approved AI Instrument Updates/i).should(
        'be.visible',
      );
    });
  });
});

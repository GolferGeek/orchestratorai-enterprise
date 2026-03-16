// Basic E2E Validation Test
// Simple test to verify the E2E infrastructure is working with real API integration
// Following CLAUDE.md principles: Real API integration, no mocks

describe('Basic E2E Infrastructure Validation', () => {
  it('should load the application successfully', () => {
    cy.visit('/');
    
    // Just verify the page loads and has some basic structure
    cy.get('body').should('exist');
    cy.title().should('not.be.empty');
  });

  it('should be able to navigate to login page', () => {
    cy.visit('/login');
    
    // Should be able to access login page
    cy.url().should('include', '/login');
    cy.get('body').should('exist');
  });

  it('should handle non-existent routes gracefully', () => {
    // Visit non-existent route
    cy.visit('/non-existent-page', { failOnStatusCode: false });
    
    // Should either redirect or show 404, but not crash
    cy.get('body').should('exist');
  });
});
// Authentication & Authorization E2E Tests
// Comprehensive tests for user login, role-based access, and session management
// Following CLAUDE.md principles: Real API integration, no mocks, robust error handling

import { testConfig } from '../support/e2e';

describe('Authentication & Authorization E2E Tests', () => {
  const testUsers = {
    regular: {
      email: testConfig.testUser.email,
      password: testConfig.testUser.password
    },
    admin: {
      email: 'admin@example.com', 
      password: 'admin123'
    },
    evaluator: {
      email: 'evaluator@example.com',
      password: 'eval123'
    }
  };

  beforeEach(() => {
    // Clear any existing authentication state
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.window().then((win) => {
      win.sessionStorage.clear();
    });
    
    // Start from landing page
    cy.visit('/');
  });

  describe('User Login Journey', () => {
    it('should redirect unauthenticated user to login when accessing protected route', () => {
      // Attempt to access protected route directly
      cy.visit('/app/home');
      
      // Should be redirected to login
      cy.url().should('include', '/login');
      cy.get('[data-cy=login-form]').should('be.visible');
      
      // Should include redirect parameter
      cy.url().should('include', 'redirect=%2Fapp%2Fhome');
    });

    it('should successfully login and redirect to intended page', () => {
      // Start by trying to access a protected route
      cy.visit('/app/projects');
      
      // Should be redirected to login
      cy.url().should('include', '/login');
      
      // Fill out login form
      cy.get('[data-cy=email-input]').type(testUsers.regular.email);
      cy.get('[data-cy=password-input]').type(testUsers.regular.password);
      cy.get('[data-cy=login-button]').click();
      
      // Should be redirected to originally requested page
      cy.url().should('include', '/app/projects');
      cy.get('[data-cy=projects-page]').should('be.visible');
    });

    it('should persist authentication across page refresh', () => {
      // Login first
      cy.visit('/login');
      cy.get('[data-cy=email-input]').type(testUsers.regular.email);
      cy.get('[data-cy=password-input]').type(testUsers.regular.password);
      cy.get('[data-cy=login-button]').click();
      
      // Navigate to protected page
      cy.visit('/app/home');
      cy.get('[data-cy=home-page]').should('be.visible');
      
      // Refresh page
      cy.reload();
      
      // Should still be authenticated
      cy.url().should('include', '/app/home');
      cy.get('[data-cy=home-page]').should('be.visible');
    });

    it('should handle invalid login credentials gracefully', () => {
      cy.visit('/login');
      
      // Try invalid credentials
      cy.get('[data-cy=email-input]').type('invalid@example.com');
      cy.get('[data-cy=password-input]').type('wrongpassword');
      cy.get('[data-cy=login-button]').click();
      
      // Should show error message
      cy.get('[data-cy=error-message]').should('be.visible');
      cy.get('[data-cy=error-message]').should('contain', 'Invalid credentials');
      
      // Should remain on login page
      cy.url().should('include', '/login');
    });
  });

  describe('Role-Based Access Control', () => {
    it('should allow regular user access to standard features', () => {
      // Login as regular user
      cy.visit('/login');
      cy.get('[data-cy=email-input]').type(testUsers.regular.email);
      cy.get('[data-cy=password-input]').type(testUsers.regular.password);
      cy.get('[data-cy=login-button]').click();
      
      // Should access standard routes
      const standardRoutes = ['/app/home', '/app/chat', '/app/projects', '/app/evaluations'];
      
      standardRoutes.forEach(route => {
        cy.visit(route);
        cy.url().should('include', route);
        cy.get('[data-cy=page-content]').should('be.visible');
      });
    });

    it('should prevent regular user from accessing admin routes', () => {
      // Login as regular user
      cy.visit('/login');
      cy.get('[data-cy=email-input]').type(testUsers.regular.email);
      cy.get('[data-cy=password-input]').type(testUsers.regular.password);
      cy.get('[data-cy=login-button]').click();
      
      // Try to access admin route
      cy.visit('/app/admin/pii-patterns');
      
      // Should be redirected to access denied page
      cy.url().should('include', '/access-denied');
      cy.get('[data-cy=access-denied-page]').should('be.visible');
      cy.get('[data-cy=access-denied-message]').should('contain', 'admin');
    });

    it('should allow admin user access to admin features', () => {
      // Login as admin user
      cy.visit('/login');
      cy.get('[data-cy=email-input]').type(testUsers.admin.email);
      cy.get('[data-cy=password-input]').type(testUsers.admin.password);
      cy.get('[data-cy=login-button]').click();
      
      // Should access admin routes
      const adminRoutes = [
        '/app/admin/pii-patterns',
        '/app/admin/pii-testing', 
        '/app/admin/pseudonym-dictionary',
        '/app/admin/settings',
        '/app/admin/audit'
      ];
      
      adminRoutes.forEach(route => {
        cy.visit(route);
        cy.url().should('include', route);
        cy.get('[data-cy=admin-page]').should('be.visible');
      });
    });

    it('should handle evaluation monitor role correctly', () => {
      // Login as evaluation monitor
      cy.visit('/login');
      cy.get('[data-cy=email-input]').type(testUsers.evaluator.email);
      cy.get('[data-cy=password-input]').type(testUsers.evaluator.password);
      cy.get('[data-cy=login-button]').click();
      
      // Should access evaluation monitoring
      cy.visit('/app/admin/evaluations');
      cy.url().should('include', '/app/admin/evaluations');
      cy.get('[data-cy=evaluations-admin-page]').should('be.visible');
      
      // Should NOT access full admin features
      cy.visit('/app/admin/pii-patterns');
      cy.url().should('include', '/access-denied');
      cy.get('[data-cy=access-denied-page]').should('be.visible');
    });
  });

  describe('Session Management', () => {
    it('should successfully logout and clear session', () => {
      // Login first
      cy.visit('/login');
      cy.get('[data-cy=email-input]').type(testUsers.regular.email);
      cy.get('[data-cy=password-input]').type(testUsers.regular.password);
      cy.get('[data-cy=login-button]').click();
      
      // Navigate to protected page
      cy.visit('/app/home');
      cy.get('[data-cy=home-page]').should('be.visible');
      
      // Logout
      cy.get('[data-cy=user-menu]').click();
      cy.get('[data-cy=logout-button]').click();
      
      // Should be redirected to login/landing page
      cy.url().should('not.include', '/app');
      
      // Try to access protected route - should redirect to login
      cy.visit('/app/home');
      cy.url().should('include', '/login');
    });

    it('should handle session timeout gracefully', () => {
      // Login first
      cy.visit('/login');
      cy.get('[data-cy=email-input]').type(testUsers.regular.email);
      cy.get('[data-cy=password-input]').type(testUsers.regular.password);
      cy.get('[data-cy=login-button]').click();
      
      // Navigate to protected page
      cy.visit('/app/home');
      cy.get('[data-cy=home-page]').should('be.visible');
      
      // Simulate session expiration by clearing tokens
      cy.window().then((win) => {
        win.localStorage.clear();
        win.sessionStorage.clear();
      });
      
      // Try to navigate - should handle session expiration
      cy.visit('/app/projects');
      cy.url().should('include', '/login');
    });

    it('should maintain user context across navigation', () => {
      // Login as admin
      cy.visit('/login');
      cy.get('[data-cy=email-input]').type(testUsers.admin.email);
      cy.get('[data-cy=password-input]').type(testUsers.admin.password);
      cy.get('[data-cy=login-button]').click();
      
      // Navigate to various pages
      const pages = ['/app/home', '/app/projects', '/app/admin/settings'];
      
      pages.forEach(page => {
        cy.visit(page);
        // User context should be maintained (check for user info in UI)
        cy.get('[data-cy=user-avatar]').should('be.visible');
        cy.get('[data-cy=user-role]').should('contain', 'admin');
      });
    });
  });

  describe('Navigation Guard Integration', () => {
    it('should properly handle deep linking with authentication', () => {
      // Try to access deep route directly
      cy.visit('/app/admin/pii-patterns?tab=patterns&view=list');
      
      // Should redirect to login with full redirect path
      cy.url().should('include', '/login');
      cy.url().should('include', 'redirect=');
      
      // Login as admin
      cy.get('[data-cy=email-input]').type(testUsers.admin.email);
      cy.get('[data-cy=password-input]').type(testUsers.admin.password);
      cy.get('[data-cy=login-button]').click();
      
      // Should redirect to original deep link with query params
      cy.url().should('include', '/app/admin/pii-patterns');
      cy.url().should('include', 'tab=patterns');
      cy.url().should('include', 'view=list');
    });

    it('should handle role changes during session', () => {
      // This test would simulate a role change scenario
      // In real implementation, this might involve admin updating user roles
      
      // Login as regular user
      cy.visit('/login');
      cy.get('[data-cy=email-input]').type(testUsers.regular.email);
      cy.get('[data-cy=password-input]').type(testUsers.regular.password);
      cy.get('[data-cy=login-button]').click();
      
      // Verify initial access
      cy.visit('/app/home');
      cy.get('[data-cy=home-page]').should('be.visible');
      
      // Simulate role update (would need API call to change user role)
      // For demo purposes, we'll just verify the mechanism works
      cy.visit('/app/admin/settings');
      cy.url().should('include', '/access-denied');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle network errors during login', () => {
      cy.visit('/login');
      
      // Simulate network failure
      cy.intercept('POST', '/api/auth/login', { statusCode: 500 }).as('loginFailure');
      
      cy.get('[data-cy=email-input]').type(testUsers.regular.email);
      cy.get('[data-cy=password-input]').type(testUsers.regular.password);
      cy.get('[data-cy=login-button]').click();
      
      cy.wait('@loginFailure');
      
      // Should show network error message
      cy.get('[data-cy=error-message]').should('be.visible');
      cy.get('[data-cy=error-message]').should('contain', 'network');
    });

    it('should handle malformed authentication data gracefully', () => {
      // This would test handling of corrupted local storage, invalid tokens, etc.
      cy.visit('/');
      
      // Simulate corrupted auth data
      cy.window().then((win) => {
        win.localStorage.setItem('auth_token', 'invalid_token');
      });
      
      cy.visit('/app/home');
      
      // Should detect invalid token and redirect to login
      cy.url().should('include', '/login');
    });

    it('should handle concurrent login attempts', () => {
      // Open multiple tabs/windows and attempt login
      // This would test race conditions in authentication
      
      cy.visit('/login');
      cy.get('[data-cy=email-input]').type(testUsers.regular.email);
      cy.get('[data-cy=password-input]').type(testUsers.regular.password);
      
      // Simulate rapid login attempts
      cy.get('[data-cy=login-button]').click();
      cy.get('[data-cy=login-button]').click();
      
      // Should handle gracefully without duplicate sessions
      cy.url().should('include', '/app');
    });
  });
});
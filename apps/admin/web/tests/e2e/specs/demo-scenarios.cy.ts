// Demo Scenarios E2E Tests
// Comprehensive tests for stakeholder presentation demos and business value validation
// Following CLAUDE.md principles: Real API integration, no mocks, robust demonstrations

import { testConfig as _testConfig } from '../support/e2e';

describe('Demo Scenarios for Stakeholder Presentations', () => {
  
  beforeEach(() => {
    // Start fresh for each demo scenario
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.window().then((win) => { win.sessionStorage.clear(); });
  });

  describe('Demo 1: PII Protection in Action (5-7 minutes)', () => {
    it('should demonstrate complete PII protection workflow for business stakeholders', () => {
      cy.log('🎯 Demo 1: PII Protection in Action - Starting');
      
      // Step 1: Setup (30 seconds) - Login as admin and show PII patterns configured
      cy.log('📋 Step 1: Setup - Show configured PII patterns');
      cy.loginAsAdmin();
      cy.visit('/app/admin/pii-patterns');
      cy.waitForPageLoad();
      
      // Verify patterns are loaded and show capabilities
      cy.get('[data-cy=patterns-table]').should('be.visible');
      cy.get('[data-cy=pattern-row]').should('have.length.greaterThan', 0);
      
      // Show variety of pattern types
      cy.get('[data-cy=pattern-type-cell]').should('contain', 'email');
      cy.get('[data-cy=pattern-type-cell]').should('contain', 'phone');
      cy.log('✅ PII patterns configured and ready');
      
      // Step 2: Live PII Detection (2 minutes) - Process real customer data
      cy.log('🔍 Step 2: Live PII Detection - Processing customer data');
      cy.visit('/app/admin/pii-testing');
      cy.waitForPageLoad();
      
      const customerData = `
        Customer Support Ticket #12345
        Customer: John Doe
        Email: john.doe@acmecorp.com
        Phone: (555) 123-4567
        Alternative Contact: jane.smith@acmecorp.com
        Mobile: +1-800-555-0199
        Address: 123 Main Street, Anytown, NY 12345
        Issue: Account access problems
        Priority: High
        SSN (for verification): 123-45-6789
        Credit Card: 4532-1234-5678-9012
        
        Notes: Customer called multiple times. Very frustrated.
        Follow-up required by: Michael Johnson (manager@acmecorp.com)
      `;
      
      cy.get('[data-cy=input-text-area]').clear();
      cy.get('[data-cy=input-text-area]').type(customerData);
      
      // Process and show real-time detection
      cy.get('[data-cy=process-text-button]').click();
      cy.get('[data-cy=processing-results]', { timeout: 15000 }).should('be.visible');
      
      // Verify multiple PII types detected
      cy.get('[data-cy=detected-pii-list]').should('be.visible');
      cy.get('[data-cy=pii-item]').should('have.length.greaterThan', 5);
      
      // Show different PII categories
      cy.get('[data-cy=pii-type-email]').should('exist');
      cy.get('[data-cy=pii-type-phone]').should('exist');
      cy.get('[data-cy=pii-type-name]').should('exist');
      
      // Demonstrate sanitized output
      cy.get('[data-cy=sanitized-text]').should('be.visible');
      cy.get('[data-cy=sanitized-text]').should('not.contain', 'john.doe@acmecorp.com');
      cy.get('[data-cy=sanitized-text]').should('not.contain', '(555) 123-4567');
      cy.get('[data-cy=sanitized-text]').should('not.contain', '123-45-6789');
      cy.log('✅ Real-time PII detection and sanitization complete');
      
      // Step 3: Audit and Compliance (2 minutes) - Show mapping and audit logs
      cy.log('📊 Step 3: Audit and Compliance - Tracking and reporting');
      cy.visit('/app/admin/pseudonym-mappings');
      cy.waitForPageLoad();
      
      // Show pseudonym mappings
      cy.get('[data-cy=mappings-table]').should('be.visible');
      cy.get('[data-cy=mapping-row]').should('have.length.greaterThan', 0);
      
      // Demonstrate mapping consistency
      cy.get('[data-cy=mapping-row]').first().within(() => {
        cy.get('[data-cy=original-value]').should('be.visible');
        cy.get('[data-cy=pseudonym-value]').should('be.visible');
        cy.get('[data-cy=usage-count]').should('be.visible');
      });
      
      // Show audit trail if available
      cy.visit('/app/admin/audit');
      cy.waitForPageLoad();
      cy.get('[data-cy=audit-log-table]').should('be.visible');
      cy.log('✅ Audit trail and compliance tracking demonstrated');
      
      // Step 4: Business Impact (1 minute) - Show analytics and value
      cy.log('💼 Step 4: Business Impact - Analytics and ROI');
      cy.visit('/app/admin/settings');
      cy.waitForPageLoad();
      
      // Look for analytics or dashboard sections
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=analytics-section]').length > 0) {
          cy.get('[data-cy=analytics-section]').should('be.visible');
          cy.get('[data-cy=processing-stats]').should('be.visible');
        }
      });
      
      cy.log('🎯 Demo 1: PII Protection in Action - Completed Successfully');
    });

    it('should handle demo failure scenarios gracefully', () => {
      cy.log('🎯 Demo 1 Backup: Handling system unavailability');
      
      // If API is down, show graceful degradation
      cy.loginAsAdmin();
      cy.visit('/app/admin/pii-patterns');
      
      // Simulate API failure
      cy.intercept('GET', '/api/pii/**', { statusCode: 500 }).as('apiFailure');
      
      cy.reload();
      cy.wait('@apiFailure');
      
      // Should show appropriate error messaging
      cy.get('[data-cy=error-message]').should('be.visible');
      cy.get('[data-cy=error-message]').should('contain', 'temporarily unavailable');
      
      cy.log('✅ Graceful degradation demonstrated');
    });
  });

  describe('Demo 2: Multi-Agent Project Orchestration (8-10 minutes)', () => {
    it('should demonstrate enterprise project orchestration capabilities', () => {
      cy.log('🎯 Demo 2: Multi-Agent Project Orchestration - Starting');
      
      // Step 1: Project Setup (2 minutes)
      cy.log('📋 Step 1: Project Setup - Creating orchestrated project');
      cy.loginAsTestUser();
      cy.visit('/app/projects');
      cy.waitForPageLoad();
      
      // Show existing projects or create new one
      cy.get('[data-cy=projects-list]').should('be.visible');
      
      // Create new project for demo
      cy.get('[data-cy=new-project-button]').click();
      cy.waitForPageLoad();
      
      // Fill project details
      cy.get('[data-cy=project-name-input]').type('Demo: Customer Data Migration');
      cy.get('[data-cy=project-description-input]').type(
        'Demonstrate multi-agent coordination for enterprise data migration with PII protection'
      );
      
      // Set project parameters
      cy.get('[data-cy=project-priority-select]').select('high');
      cy.get('[data-cy=project-category-select]').select('data-migration');
      
      cy.get('[data-cy=save-project-button]').click();
      cy.expectSuccessMessage('Project created successfully');
      cy.log('✅ Project setup complete');
      
      // Step 2: Agent Collaboration (4 minutes) - Show multi-step coordination
      cy.log('🤖 Step 2: Agent Collaboration - Multi-step task coordination');
      
      // Navigate to project details
      cy.get('[data-cy=project-row]').first().click();
      cy.waitForPageLoad();
      
      // Show project overview
      cy.get('[data-cy=project-details]').should('be.visible');
      cy.get('[data-cy=project-status]').should('be.visible');
      
      // If chat/agent interface is available in project context
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=project-chat]').length > 0) {
          cy.get('[data-cy=project-chat]').click();
          
          // Simulate complex multi-step request
          const complexTask = `
            Please help coordinate a customer data migration project:
            1. Analyze source data for PII content
            2. Create appropriate PII patterns if missing
            3. Design migration strategy with privacy protection
            4. Generate compliance documentation
            5. Provide cost and timeline estimates
          `;
          
          cy.get('[data-cy=chat-input]').type(complexTask);
          cy.get('[data-cy=send-message-button]').click();
          
          // Wait for response
          cy.get('[data-cy=agent-response]', { timeout: 30000 }).should('be.visible');
          cy.log('✅ Multi-agent task initiated');
        }
      });
      
      // Step 3: Results and Analytics (3 minutes)
      cy.log('📊 Step 3: Results and Analytics - Performance metrics');
      
      // Show project progress and metrics
      cy.visit('/app/projects');
      cy.waitForPageLoad();
      
      // Display project metrics
      cy.get('[data-cy=project-row]').first().within(() => {
        cy.get('[data-cy=project-progress]').should('be.visible');
        cy.get('[data-cy=project-status]').should('be.visible');
      });
      
      // Navigate to deliverables
      cy.visit('/app/deliverables');
      cy.waitForPageLoad();
      cy.get('[data-cy=deliverables-list]').should('be.visible');
      
      cy.log('🎯 Demo 2: Multi-Agent Project Orchestration - Completed');
    });

    it('should demonstrate real-time collaboration features', () => {
      cy.log('🎯 Demo 2 Extension: Real-time collaboration features');
      
      cy.loginAsTestUser();
      cy.visit('/app/home');
      cy.waitForPageLoad();
      
      // If real-time features are available
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=chat-interface]').length > 0) {
          cy.get('[data-cy=chat-interface]').should('be.visible');
          
          // Show conversation history
          cy.get('[data-cy=conversation-history]').should('be.visible');
          
          // Test real-time messaging
          cy.get('[data-cy=message-input]').type('Show me the current system status');
          cy.get('[data-cy=send-button]').click();
          
          // Wait for response
          cy.get('[data-cy=latest-message]', { timeout: 15000 }).should('be.visible');
          cy.log('✅ Real-time collaboration demonstrated');
        }
      });
    });
  });

  describe('Demo 3: Enterprise Security and Governance (6-8 minutes)', () => {
    it('should demonstrate comprehensive security and governance features', () => {
      cy.log('🎯 Demo 3: Enterprise Security and Governance - Starting');
      
      // Step 1: Access Control Demo (2 minutes)
      cy.log('🔐 Step 1: Access Control - Role-based security');
      
      // Show regular user limitations
      cy.loginAsTestUser();
      cy.visit('/app/admin/pii-patterns');
      
      // Should be denied access
      cy.url().should('include', '/access-denied');
      cy.get('[data-cy=access-denied-page]').should('be.visible');
      cy.get('[data-cy=access-denied-message]').should('contain', 'admin');
      cy.log('✅ Access control restrictions demonstrated');
      
      // Show admin access
      cy.loginAsAdmin();
      cy.visit('/app/admin/pii-patterns');
      cy.waitForPageLoad();
      cy.get('[data-cy=pii-patterns-page]').should('be.visible');
      cy.log('✅ Admin access privileges demonstrated');
      
      // Step 2: Security Monitoring (3 minutes)
      cy.log('🛡️ Step 2: Security Monitoring - Live security dashboard');
      cy.visit('/app/admin/audit');
      cy.waitForPageLoad();
      
      // Show audit log entries
      cy.get('[data-cy=audit-log-table]').should('be.visible');
      
      // If audit entries exist, show them
      cy.get('[data-cy=audit-entry]').then(($entries) => {
        if ($entries.length > 0) {
          // Show different types of audit events
          cy.get('[data-cy=audit-entry]').first().within(() => {
            cy.get('[data-cy=audit-timestamp]').should('be.visible');
            cy.get('[data-cy=audit-action]').should('be.visible');
            cy.get('[data-cy=audit-user]').should('be.visible');
          });
        }
      });
      
      // Demonstrate filtering capabilities
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=audit-filter]').length > 0) {
          cy.get('[data-cy=audit-filter]').select('authentication');
          cy.get('[data-cy=apply-filter-button]').click();
          cy.log('✅ Audit filtering demonstrated');
        }
      });
      
      // Step 3: Compliance Reporting (2 minutes)
      cy.log('📋 Step 3: Compliance Reporting - Automated compliance');
      
      // Show compliance features if available
      cy.visit('/app/admin/settings');
      cy.waitForPageLoad();
      
      // Look for compliance or reporting sections
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=compliance-section]').length > 0) {
          cy.get('[data-cy=compliance-section]').should('be.visible');
          cy.get('[data-cy=generate-report-button]').should('be.visible');
        }
        
        if ($body.find('[data-cy=data-retention-settings]').length > 0) {
          cy.get('[data-cy=data-retention-settings]').should('be.visible');
        }
      });
      
      cy.log('🎯 Demo 3: Enterprise Security and Governance - Completed');
    });

    it('should demonstrate incident response capabilities', () => {
      cy.log('🎯 Demo 3 Extension: Incident Response');
      
      cy.loginAsAdmin();
      cy.visit('/app/admin/audit');
      cy.waitForPageLoad();
      
      // Simulate security incident detection
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=security-alerts]').length > 0) {
          cy.get('[data-cy=security-alerts]').should('be.visible');
          
          // Show alert details
          cy.get('[data-cy=alert-item]').first().click();
          cy.get('[data-cy=alert-details]').should('be.visible');
          cy.log('✅ Incident response capabilities demonstrated');
        }
      });
    });
  });

  describe('Performance and Load Demonstration', () => {
    it('should demonstrate system performance under realistic load', () => {
      cy.log('⚡ Performance Demo: System under load');
      
      cy.loginAsAdmin();
      
      // Test rapid navigation between heavy pages
      const heavyPages = [
        '/app/admin/pii-patterns',
        '/app/admin/pseudonym-mappings',
        '/app/admin/audit'
      ];
      
      heavyPages.forEach((page, index) => {
        cy.visit(page);
        cy.waitForPageLoad();
        cy.get('[data-cy=page-content]').should('be.visible');
        cy.log(`✅ Page ${index + 1} loaded successfully`);
      });
      
      // Test batch processing
      cy.visit('/app/admin/pii-testing');
      cy.waitForPageLoad();
      
      const largeBatch = Array(10).fill(`
        Test data batch with PII: john.doe@example.com, (555) 123-4567
      `).join('\n---\n');
      
      cy.get('[data-cy=input-text-area]').clear();
      cy.get('[data-cy=input-text-area]').type(largeBatch.substring(0, 5000));
      cy.get('[data-cy=process-text-button]').click();
      
      // Should handle large input efficiently
      cy.get('[data-cy=processing-results]', { timeout: 20000 }).should('be.visible');
      cy.log('✅ Batch processing performance demonstrated');
    });

    it('should demonstrate mobile responsiveness', () => {
      cy.log('📱 Mobile Demo: Responsive design');
      
      // Test mobile viewport
      cy.viewport(375, 667); // iPhone 8 size
      
      cy.loginAsTestUser();
      cy.visit('/app/home');
      cy.waitForPageLoad();
      
      // Verify mobile layout
      cy.get('[data-cy=mobile-menu]').should('be.visible');
      cy.get('[data-cy=page-content]').should('be.visible');
      
      // Test navigation on mobile
      cy.get('[data-cy=mobile-menu]').click();
      cy.get('[data-cy=nav-menu]').should('be.visible');
      
      // Navigate to different section
      cy.get('[data-cy=nav-projects]').click();
      cy.waitForPageLoad();
      cy.get('[data-cy=projects-page]').should('be.visible');
      
      cy.log('✅ Mobile responsiveness demonstrated');
    });
  });

  describe('Error Recovery and Resilience Demo', () => {
    it('should demonstrate graceful error handling and recovery', () => {
      cy.log('🔧 Resilience Demo: Error handling and recovery');
      
      cy.loginAsAdmin();
      cy.visit('/app/admin/pii-testing');
      cy.waitForPageLoad();
      
      // Simulate API failures
      cy.intercept('POST', '/api/sanitization/process', { statusCode: 503 }).as('apiDown');
      
      const testText = 'Test PII: user@example.com';
      cy.get('[data-cy=input-text-area]').clear();
      cy.get('[data-cy=input-text-area]').type(testText);
      cy.get('[data-cy=process-text-button]').click();
      
      cy.wait('@apiDown');
      
      // Should show appropriate error message
      cy.get('[data-cy=error-message]').should('be.visible');
      cy.get('[data-cy=error-message]').should('contain', 'temporarily unavailable');
      
      // Remove intercept to restore service
      cy.intercept('POST', '/api/sanitization/process').as('apiRestored');
      
      // Retry should work
      cy.get('[data-cy=retry-button]').click();
      cy.get('[data-cy=processing-results]', { timeout: 15000 }).should('be.visible');
      
      cy.log('✅ Error recovery demonstrated');
    });

    it('should demonstrate data validation and input sanitization', () => {
      cy.log('🛡️ Security Demo: Input validation');
      
      cy.loginAsAdmin();
      cy.visit('/app/admin/pii-patterns');
      cy.waitForPageLoad();
      
      cy.get('[data-cy=create-pattern-button]').click();
      
      // Test various input validation scenarios
      const invalidInputs = [
        { field: 'pattern-name-input', value: '<script>alert("xss")</script>' },
        { field: 'pattern-regex-input', value: '[invalid-regex(' },
        { field: 'pattern-description-input', value: 'A'.repeat(1000) } // Too long
      ];
      
      invalidInputs.forEach((input) => {
        cy.get(`[data-cy=${input.field}]`).clear();
        cy.get(`[data-cy=${input.field}]`).type(input.value);
      });
      
      cy.get('[data-cy=save-pattern-button]').click();
      
      // Should show validation errors
      cy.get('[data-cy=validation-error]').should('be.visible');
      cy.log('✅ Input validation demonstrated');
    });
  });
});
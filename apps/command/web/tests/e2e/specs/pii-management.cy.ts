// PII Management Workflow E2E Tests
// Comprehensive tests for PII pattern management, pseudonym dictionaries, and real-time processing
// Following CLAUDE.md principles: Real API integration, no mocks, robust error handling

describe('PII Management Workflow E2E Tests', () => {
  const adminUser = {
    email: 'admin@example.com',
    password: 'admin123'
  };

  const _testPIIData = {
    emails: ['john.doe@company.com', 'jane.smith@example.org'],
    phones: ['(555) 123-4567', '+1-800-555-0199'],
    names: ['John Doe', 'Jane Smith', 'Michael Johnson'],
    addresses: ['123 Main St, Anytown, NY 12345'],
    ssns: ['123-45-6789'] // Test format only
  };

  const sampleText = `
    Contact Information:
    Name: John Doe
    Email: john.doe@company.com
    Phone: (555) 123-4567
    Address: 123 Main St, Anytown, NY 12345
    SSN: 123-45-6789
  `;

  beforeEach(() => {
    // Clear authentication state and login as admin
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.window().then((win) => {
      win.sessionStorage.clear();
    });
    
    // Login as admin user
    cy.visit('/login');
    cy.get('[data-cy=email-input]').type(adminUser.email);
    cy.get('[data-cy=password-input]').type(adminUser.password);
    cy.get('[data-cy=login-button]').click();
    
    // Wait for successful login
    cy.url().should('not.include', '/login');
  });

  describe('PII Pattern Management Journey', () => {
    it('should display existing PII patterns correctly', () => {
      cy.visit('/app/admin/pii-patterns');
      
      // Page should load successfully
      cy.get('[data-cy=pii-patterns-page]').should('be.visible');
      cy.get('[data-cy=patterns-list]').should('be.visible');
      
      // Should display patterns table/list
      cy.get('[data-cy=patterns-table]').should('be.visible');
      
      // Check for expected columns
      cy.get('[data-cy=pattern-name-header]').should('be.visible');
      cy.get('[data-cy=pattern-type-header]').should('be.visible');
      cy.get('[data-cy=pattern-status-header]').should('be.visible');
    });

    it('should create new PII pattern successfully', () => {
      cy.visit('/app/admin/pii-patterns');
      
      // Click create new pattern button
      cy.get('[data-cy=create-pattern-button]').click();
      
      // Fill out pattern creation form
      cy.get('[data-cy=pattern-name-input]').type('Test Email Pattern');
      cy.get('[data-cy=pattern-type-select]').select('email');
      cy.get('[data-cy=pattern-regex-input]').type('^[\\\\w\\\\.-]+@[\\\\w\\\\.-]+\\\\.[a-zA-Z]{2,}$');
      cy.get('[data-cy=pattern-description-input]').type('Test email pattern for E2E testing');
      cy.get('[data-cy=pattern-enabled-checkbox]').check();
      
      // Save pattern
      cy.get('[data-cy=save-pattern-button]').click();
      
      // Should show success message
      cy.get('[data-cy=success-message]').should('be.visible');
      cy.get('[data-cy=success-message]').should('contain', 'Pattern created successfully');
      
      // Should redirect back to patterns list
      cy.url().should('include', '/app/admin/pii-patterns');
      
      // New pattern should appear in list
      cy.get('[data-cy=patterns-table]').should('contain', 'Test Email Pattern');
    });

    it('should validate pattern input correctly', () => {
      cy.visit('/app/admin/pii-patterns');
      cy.get('[data-cy=create-pattern-button]').click();
      
      // Try to save without required fields
      cy.get('[data-cy=save-pattern-button]').click();
      
      // Should show validation errors
      cy.get('[data-cy=pattern-name-error]').should('be.visible');
      cy.get('[data-cy=pattern-regex-error]').should('be.visible');
      
      // Fill invalid regex
      cy.get('[data-cy=pattern-name-input]').type('Invalid Pattern');
      cy.get('[data-cy=pattern-regex-input]').type('[invalid-regex');
      cy.get('[data-cy=save-pattern-button]').click();
      
      // Should show regex validation error
      cy.get('[data-cy=pattern-regex-error]').should('contain', 'Invalid regex pattern');
    });

    it('should edit existing pattern successfully', () => {
      cy.visit('/app/admin/pii-patterns');
      
      // Find first pattern and click edit
      cy.get('[data-cy=pattern-row]').first().within(() => {
        cy.get('[data-cy=edit-pattern-button]').click();
      });
      
      // Modify pattern details
      cy.get('[data-cy=pattern-description-input]').clear();
      cy.get('[data-cy=pattern-description-input]').type('Updated description');
      
      // Save changes
      cy.get('[data-cy=save-pattern-button]').click();
      
      // Should show success message
      cy.get('[data-cy=success-message]').should('be.visible');
      
      // Should reflect changes in list
      cy.get('[data-cy=patterns-table]').should('contain', 'Updated description');
    });

    it('should toggle pattern enabled/disabled state', () => {
      cy.visit('/app/admin/pii-patterns');
      
      // Find first pattern and check current state
      cy.get('[data-cy=pattern-row]').first().within(() => {
        cy.get('[data-cy=pattern-status]').then(($status) => {
          const isEnabled = $status.text().includes('Enabled');
          
          // Toggle the state
          cy.get('[data-cy=toggle-pattern-button]').click();
          
          // Verify state changed
          cy.get('[data-cy=pattern-status]').should('contain', isEnabled ? 'Disabled' : 'Enabled');
        });
      });
      
      // Should show status change message
      cy.get('[data-cy=success-message]').should('be.visible');
    });

    it('should delete pattern with confirmation', () => {
      cy.visit('/app/admin/pii-patterns');
      
      // Get initial pattern count
      cy.get('[data-cy=pattern-row]').then(($rows) => {
        const initialCount = $rows.length;
        
        // Delete first pattern
        cy.get('[data-cy=pattern-row]').first().within(() => {
          cy.get('[data-cy=delete-pattern-button]').click();
        });
        
        // Confirm deletion
        cy.get('[data-cy=confirm-delete-modal]').should('be.visible');
        cy.get('[data-cy=confirm-delete-button]').click();
        
        // Should show success message
        cy.get('[data-cy=success-message]').should('be.visible');
        
        // Pattern count should decrease
        cy.get('[data-cy=pattern-row]').should('have.length', initialCount - 1);
      });
    });
  });

  describe('PII Testing Integration', () => {
    it('should test pattern functionality in PII Testing page', () => {
      // First ensure we have at least one pattern
      cy.visit('/app/admin/pii-patterns');
      cy.get('[data-cy=patterns-table]').should('be.visible');
      
      // Navigate to PII Testing
      cy.visit('/app/admin/pii-testing');
      cy.get('[data-cy=pii-testing-page]').should('be.visible');
      
      // Input sample text containing PII
      cy.get('[data-cy=input-text-area]').clear();
      cy.get('[data-cy=input-text-area]').type(sampleText);
      
      // Process text
      cy.get('[data-cy=process-text-button]').click();
      
      // Should show processing results
      cy.get('[data-cy=processing-results]').should('be.visible');
      
      // Should detect PII items
      cy.get('[data-cy=detected-pii-list]').should('be.visible');
      cy.get('[data-cy=pii-item]').should('have.length.greaterThan', 0);
      
      // Should show sanitized output
      cy.get('[data-cy=sanitized-output]').should('be.visible');
      cy.get('[data-cy=sanitized-text]').should('not.contain', 'john.doe@company.com');
    });

    it('should handle text with no PII correctly', () => {
      cy.visit('/app/admin/pii-testing');
      
      const cleanText = 'This text contains no personal information at all.';
      cy.get('[data-cy=input-text-area]').clear();
      cy.get('[data-cy=input-text-area]').type(cleanText);
      
      cy.get('[data-cy=process-text-button]').click();
      
      // Should show no PII detected
      cy.get('[data-cy=no-pii-message]').should('be.visible');
      cy.get('[data-cy=no-pii-message]').should('contain', 'No PII detected');
      
      // Output should be same as input
      cy.get('[data-cy=sanitized-text]').should('contain', cleanText);
    });

    it('should show processing statistics', () => {
      cy.visit('/app/admin/pii-testing');
      
      cy.get('[data-cy=input-text-area]').clear();
      cy.get('[data-cy=input-text-area]').type(sampleText);
      cy.get('[data-cy=process-text-button]').click();
      
      // Should display processing statistics
      cy.get('[data-cy=processing-stats]').should('be.visible');
      cy.get('[data-cy=processing-time]').should('be.visible');
      cy.get('[data-cy=pii-count]').should('be.visible');
      cy.get('[data-cy=patterns-matched]').should('be.visible');
    });
  });

  describe('Pseudonym Dictionary Management', () => {
    it('should display existing dictionaries', () => {
      cy.visit('/app/admin/pseudonym-dictionary');
      
      cy.get('[data-cy=dictionary-page]').should('be.visible');
      cy.get('[data-cy=dictionaries-list]').should('be.visible');
      
      // Should show dictionary table
      cy.get('[data-cy=dictionaries-table]').should('be.visible');
    });

    it('should create new pseudonym dictionary', () => {
      cy.visit('/app/admin/pseudonym-dictionary');
      
      cy.get('[data-cy=create-dictionary-button]').click();
      
      // Fill dictionary form
      cy.get('[data-cy=dictionary-name-input]').type('Test Names Dictionary');
      cy.get('[data-cy=dictionary-type-select]').select('name');
      cy.get('[data-cy=dictionary-category-input]').type('test-category');
      
      // Add words to dictionary
      cy.get('[data-cy=dictionary-words-textarea]').type('TestName1\nTestName2\nTestName3');
      cy.get('[data-cy=dictionary-description-input]').type('Test dictionary for E2E testing');
      
      // Save dictionary
      cy.get('[data-cy=save-dictionary-button]').click();
      
      // Should show success message
      cy.get('[data-cy=success-message]').should('be.visible');
      
      // Should appear in dictionaries list
      cy.get('[data-cy=dictionaries-table]').should('contain', 'Test Names Dictionary');
    });

    it('should validate dictionary data types match PII patterns', () => {
      cy.visit('/app/admin/pseudonym-dictionary');
      cy.get('[data-cy=create-dictionary-button]').click();
      
      // Select data type
      cy.get('[data-cy=dictionary-type-select]').select('email');
      
      // Should show relevant PII patterns for this type
      cy.get('[data-cy=related-patterns]').should('be.visible');
      cy.get('[data-cy=pattern-info]').should('contain', 'email');
    });

    it('should edit existing dictionary', () => {
      cy.visit('/app/admin/pseudonym-dictionary');
      
      // Edit first dictionary
      cy.get('[data-cy=dictionary-row]').first().within(() => {
        cy.get('[data-cy=edit-dictionary-button]').click();
      });
      
      // Add more words
      cy.get('[data-cy=dictionary-words-textarea]').then(($textarea) => {
        const currentWords = $textarea.val();
        cy.get('[data-cy=dictionary-words-textarea]').clear();
        cy.get('[data-cy=dictionary-words-textarea]').type(currentWords + '\nNewTestWord');
      });
      
      cy.get('[data-cy=save-dictionary-button]').click();
      
      // Should show success message
      cy.get('[data-cy=success-message]').should('be.visible');
    });
  });

  describe('Real-time PII Processing Demo', () => {
    it('should demonstrate end-to-end PII sanitization workflow', () => {
      // First verify patterns and dictionaries exist
      cy.visit('/app/admin/pii-patterns');
      cy.get('[data-cy=pattern-row]').should('have.length.greaterThan', 0);
      
      cy.visit('/app/admin/pseudonym-dictionary');
      cy.get('[data-cy=dictionary-row]').should('have.length.greaterThan', 0);
      
      // Now test the full workflow
      cy.visit('/app/admin/pii-testing');
      
      // Input complex text with multiple PII types
      const complexPIIText = `
        Customer Data:
        Name: John Doe
        Email: john.doe@company.com
        Phone: (555) 123-4567
        Secondary Contact: jane.smith@example.org
        Phone 2: +1-800-555-0199
        Address: 123 Main St, Anytown, NY 12345
        Emergency Contact: Michael Johnson
        SSN: 123-45-6789
      `;
      
      cy.get('[data-cy=input-text-area]').clear();
      cy.get('[data-cy=input-text-area]').type(complexPIIText);
      
      // Process with real API
      cy.get('[data-cy=process-text-button]').click();
      
      // Should detect multiple PII items
      cy.get('[data-cy=detected-pii-list]').should('be.visible');
      cy.get('[data-cy=pii-item]').should('have.length.greaterThan', 3);
      
      // Should show different PII types
      cy.get('[data-cy=pii-type-email]').should('be.visible');
      cy.get('[data-cy=pii-type-phone]').should('be.visible');
      cy.get('[data-cy=pii-type-name]').should('be.visible');
      
      // Sanitized output should replace PII with pseudonyms
      cy.get('[data-cy=sanitized-text]').should('be.visible');
      cy.get('[data-cy=sanitized-text]').should('not.contain', 'john.doe@company.com');
      cy.get('[data-cy=sanitized-text]').should('not.contain', '(555) 123-4567');
      
      // Should maintain text structure
      cy.get('[data-cy=sanitized-text]').should('contain', 'Customer Data:');
      cy.get('[data-cy=sanitized-text]').should('contain', 'Name:');
      cy.get('[data-cy=sanitized-text]').should('contain', 'Email:');
    });

    it('should maintain mapping consistency across multiple processes', () => {
      cy.visit('/app/admin/pii-testing');
      
      const testText = 'Contact john.doe@company.com for more information.';
      
      // Process first time
      cy.get('[data-cy=input-text-area]').clear();
      cy.get('[data-cy=input-text-area]').type(testText);
      cy.get('[data-cy=process-text-button]').click();
      
      // Store first result
      cy.get('[data-cy=sanitized-text]').then(($firstResult) => {
        const firstSanitized = $firstResult.text();
        
        // Process same text again
        cy.get('[data-cy=input-text-area]').clear();
        cy.get('[data-cy=input-text-area]').type(testText);
        cy.get('[data-cy=process-text-button]').click();
        
        // Should produce same result (consistent mapping)
        cy.get('[data-cy=sanitized-text]').should('contain', firstSanitized);
      });
    });

    it('should handle batch processing correctly', () => {
      cy.visit('/app/admin/pii-testing');
      
      // Enable batch mode if available
      cy.get('[data-cy=batch-mode-toggle]').then(($toggle) => {
        if ($toggle.length > 0) {
          cy.wrap($toggle).click();
        }
      });
      
      // Input multiple separate texts
      const batchTexts = [
        'Email john.doe@company.com',
        'Phone (555) 123-4567',
        'Contact jane.smith@example.org'
      ];
      
      cy.get('[data-cy=batch-input-area]').clear();
      cy.get('[data-cy=batch-input-area]').type(batchTexts.join('\n---\n'));
      
      cy.get('[data-cy=process-batch-button]').click();
      
      // Should process all items
      cy.get('[data-cy=batch-results]').should('be.visible');
      cy.get('[data-cy=batch-result-item]').should('have.length', 3);
    });
  });

  describe('Pseudonym Mappings Integration', () => {
    it('should display pseudonym mappings correctly', () => {
      // First create some mappings by processing text
      cy.visit('/app/admin/pii-testing');
      cy.get('[data-cy=input-text-area]').clear();
      cy.get('[data-cy=input-text-area]').type(sampleText);
      cy.get('[data-cy=process-text-button]').click();
      
      // Now check mappings page
      cy.visit('/app/admin/pseudonym-mappings');
      cy.get('[data-cy=mappings-page]').should('be.visible');
      
      // Should show mappings table
      cy.get('[data-cy=mappings-table]').should('be.visible');
      cy.get('[data-cy=mapping-row]').should('have.length.greaterThan', 0);
      
      // Should show original and pseudonym columns
      cy.get('[data-cy=original-value-header]').should('be.visible');
      cy.get('[data-cy=pseudonym-value-header]').should('be.visible');
      cy.get('[data-cy=usage-count-header]').should('be.visible');
    });

    it('should filter mappings by data type', () => {
      cy.visit('/app/admin/pseudonym-mappings');
      
      // Apply email filter
      cy.get('[data-cy=data-type-filter]').select('email');
      
      // Should only show email mappings
      cy.get('[data-cy=mapping-row]').each(($row) => {
        cy.wrap($row).find('[data-cy=data-type-cell]').should('contain', 'email');
      });
    });

    it('should show mapping usage history', () => {
      cy.visit('/app/admin/pseudonym-mappings');
      
      // Click on first mapping for details
      cy.get('[data-cy=mapping-row]').first().click();
      
      // Should show usage history
      cy.get('[data-cy=usage-history-panel]').should('be.visible');
      cy.get('[data-cy=usage-timestamp]').should('be.visible');
      cy.get('[data-cy=usage-context]').should('be.visible');
    });
  });

  describe('Analytics and Audit Trail', () => {
    it('should track PII processing analytics', () => {
      // Process some text to generate analytics data
      cy.visit('/app/admin/pii-testing');
      cy.get('[data-cy=input-text-area]').clear();
      cy.get('[data-cy=input-text-area]').type(sampleText);
      cy.get('[data-cy=process-text-button]').click();
      
      // Check if analytics are available (might be on different page)
      cy.visit('/app/admin/settings');
      
      // Look for analytics section or dashboard
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=analytics-section]').length > 0) {
          cy.get('[data-cy=analytics-section]').should('be.visible');
          cy.get('[data-cy=total-processed]').should('be.visible');
          cy.get('[data-cy=pii-detected-count]').should('be.visible');
        }
      });
    });

    it('should maintain audit logs for PII operations', () => {
      cy.visit('/app/admin/audit');
      
      // Should show audit log entries
      cy.get('[data-cy=audit-log-table]').should('be.visible');
      
      // Look for PII-related audit entries
      cy.get('[data-cy=audit-entry]').then(($entries) => {
        if ($entries.length > 0) {
          // Check for PII operation entries
          cy.get('[data-cy=audit-entry]').should('contain.text', 'PII');
        }
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle API errors gracefully', () => {
      cy.visit('/app/admin/pii-testing');
      
      // Simulate API failure
      cy.intercept('POST', '/api/sanitization/process', { statusCode: 500 }).as('processFailure');
      
      cy.get('[data-cy=input-text-area]').clear();
      cy.get('[data-cy=input-text-area]').type(sampleText);
      cy.get('[data-cy=process-text-button]').click();
      
      cy.wait('@processFailure');
      
      // Should show error message
      cy.get('[data-cy=error-message]').should('be.visible');
      cy.get('[data-cy=error-message]').should('contain', 'processing failed');
    });

    it('should handle large text input appropriately', () => {
      cy.visit('/app/admin/pii-testing');
      
      // Create large text with PII
      const largeText = sampleText.repeat(100);
      
      cy.get('[data-cy=input-text-area]').clear();
      cy.get('[data-cy=input-text-area]').type(largeText.substring(0, 10000)); // Limit for testing
      
      cy.get('[data-cy=process-text-button]').click();
      
      // Should handle large input
      cy.get('[data-cy=processing-results]', { timeout: 15000 }).should('be.visible');
    });

    it('should validate pattern regex in real-time', () => {
      cy.visit('/app/admin/pii-patterns');
      cy.get('[data-cy=create-pattern-button]').click();
      
      // Enter invalid regex
      cy.get('[data-cy=pattern-regex-input]').type('[invalid');
      
      // Should show real-time validation
      cy.get('[data-cy=regex-validation-error]').should('be.visible');
      
      // Fix regex
      cy.get('[data-cy=pattern-regex-input]').clear();
      cy.get('[data-cy=pattern-regex-input]').type('[a-zA-Z]+');
      
      // Error should disappear
      cy.get('[data-cy=regex-validation-error]').should('not.exist');
    });
  });
});
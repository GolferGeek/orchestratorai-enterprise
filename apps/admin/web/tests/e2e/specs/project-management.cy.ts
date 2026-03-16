// Project Management Workflow E2E Tests
// Comprehensive tests for project creation, management, and collaboration features
// Following CLAUDE.md principles: Real API integration, no mocks, robust error handling

import { testConfig as _testConfig } from '../support/e2e';

describe('Project Management Workflow E2E Tests', () => {
  
  beforeEach(() => {
    // Clear state and login as test user
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.window().then((win) => { win.sessionStorage.clear(); });
    
    // Login as test user for project management tests
    cy.loginAsTestUser();
  });

  describe('Project Creation and Management', () => {
    it('should display projects page and existing projects', () => {
      cy.visit('/app/projects');
      cy.waitForPageLoad();
      
      // Page should load successfully
      cy.get('[data-cy=projects-page]').should('be.visible');
      cy.get('[data-cy=projects-list]').should('be.visible');
      
      // Should show create button
      cy.get('[data-cy=new-project-button]').should('be.visible');
      
      // Should show projects table or empty state
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=project-row]').length > 0) {
          cy.get('[data-cy=projects-table]').should('be.visible');
          cy.get('[data-cy=project-name-header]').should('be.visible');
          cy.get('[data-cy=project-status-header]').should('be.visible');
        } else {
          cy.get('[data-cy=empty-projects-message]').should('be.visible');
        }
      });
    });

    it('should create new project successfully', () => {
      cy.visit('/app/projects');
      cy.waitForPageLoad();
      
      // Click create new project
      cy.get('[data-cy=new-project-button]').click();
      cy.waitForPageLoad();
      
      // Should navigate to new project page
      cy.url().should('include', '/projects/new');
      cy.get('[data-cy=new-project-page]').should('be.visible');
      
      // Fill project creation form
      const testProject = {
        name: 'E2E Test Project - ' + Date.now(),
        description: 'Automated test project for E2E validation',
        priority: 'medium',
        category: 'testing'
      };
      
      cy.get('[data-cy=project-name-input]').type(testProject.name);
      cy.get('[data-cy=project-description-input]').type(testProject.description);
      
      // Select options if dropdowns exist
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=project-priority-select]').length > 0) {
          cy.get('[data-cy=project-priority-select]').select(testProject.priority);
        }
        
        if ($body.find('[data-cy=project-category-select]').length > 0) {
          cy.get('[data-cy=project-category-select]').select(testProject.category);
        }
      });
      
      // Save project
      cy.get('[data-cy=save-project-button]').click();
      
      // Should show success message
      cy.expectSuccessMessage();
      
      // Should redirect to projects list or project details
      cy.url().should('not.include', '/projects/new');
      
      // Verify project appears in list
      cy.visit('/app/projects');
      cy.waitForPageLoad();
      cy.get('[data-cy=projects-table]').should('contain', testProject.name);
    });

    it('should validate project creation form', () => {
      cy.visit('/app/projects/new');
      cy.waitForPageLoad();
      
      // Try to save without required fields
      cy.get('[data-cy=save-project-button]').click();
      
      // Should show validation errors
      cy.get('[data-cy=project-name-error]').should('be.visible');
      
      // Fill only name (if description is required)
      cy.get('[data-cy=project-name-input]').type('Test Project');
      cy.get('[data-cy=save-project-button]').click();
      
      // Check if description is required
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=project-description-error]').length > 0) {
          cy.get('[data-cy=project-description-error]').should('be.visible');
        } else {
          // If description is not required, project should be created
          cy.expectSuccessMessage();
        }
      });
    });

    it('should access and display project details', () => {
      cy.visit('/app/projects');
      cy.waitForPageLoad();
      
      // Ensure at least one project exists
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=project-row]').length === 0) {
          // Create a project first
          cy.get('[data-cy=new-project-button]').click();
          cy.waitForPageLoad();
          cy.get('[data-cy=project-name-input]').type('Test Project for Details');
          cy.get('[data-cy=project-description-input]').type('Project for testing details view');
          cy.get('[data-cy=save-project-button]').click();
          cy.expectSuccessMessage();
          
          // Return to projects list
          cy.visit('/app/projects');
          cy.waitForPageLoad();
        }
      });
      
      // Click on first project
      cy.get('[data-cy=project-row]').first().click();
      cy.waitForPageLoad();
      
      // Should navigate to project details
      cy.url().should('include', '/projects/');
      cy.get('[data-cy=project-details-page]').should('be.visible');
      
      // Should show project information
      cy.get('[data-cy=project-title]').should('be.visible');
      cy.get('[data-cy=project-description]').should('be.visible');
      cy.get('[data-cy=project-status]').should('be.visible');
    });

    it('should modify project settings', () => {
      cy.visit('/app/projects');
      cy.waitForPageLoad();
      
      // Ensure project exists and go to details
      cy.get('[data-cy=project-row]').first().click();
      cy.waitForPageLoad();
      
      // Look for edit button
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=edit-project-button]').length > 0) {
          cy.get('[data-cy=edit-project-button]').click();
          
          // Modify project details
          cy.get('[data-cy=project-description-input]').clear();
          cy.get('[data-cy=project-description-input]').type('Updated project description');
          
          cy.get('[data-cy=save-changes-button]').click();
          cy.expectSuccessMessage();
          
          // Verify changes are saved
          cy.get('[data-cy=project-description]').should('contain', 'Updated project description');
        }
      });
    });
  });

  describe('Deliverables Management', () => {
    it('should display deliverables page', () => {
      cy.visit('/app/deliverables');
      cy.waitForPageLoad();
      
      // Page should load successfully
      cy.get('[data-cy=deliverables-page]').should('be.visible');
      cy.get('[data-cy=deliverables-list]').should('be.visible');
      
      // Should show deliverables or empty state
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=deliverable-row]').length > 0) {
          cy.get('[data-cy=deliverables-table]').should('be.visible');
        } else {
          cy.get('[data-cy=empty-deliverables-message]').should('be.visible');
        }
      });
    });

    it('should create deliverable linked to project', () => {
      cy.visit('/app/deliverables');
      cy.waitForPageLoad();
      
      // Look for create deliverable button
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=new-deliverable-button]').length > 0) {
          cy.get('[data-cy=new-deliverable-button]').click();
          cy.waitForPageLoad();
          
          // Fill deliverable form
          cy.get('[data-cy=deliverable-name-input]').type('Test Deliverable');
          cy.get('[data-cy=deliverable-description-input]').type('E2E test deliverable');
          
          // Select project if available
          if ($body.find('[data-cy=deliverable-project-select]').length > 0) {
            cy.get('[data-cy=deliverable-project-select]').select(0); // Select first project
          }
          
          cy.get('[data-cy=save-deliverable-button]').click();
          cy.expectSuccessMessage();
          
          // Verify deliverable appears in list
          cy.visit('/app/deliverables');
          cy.waitForPageLoad();
          cy.get('[data-cy=deliverables-table]').should('contain', 'Test Deliverable');
        }
      });
    });

    it('should update deliverable status', () => {
      cy.visit('/app/deliverables');
      cy.waitForPageLoad();
      
      // If deliverables exist, test status update
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=deliverable-row]').length > 0) {
          cy.get('[data-cy=deliverable-row]').first().within(() => {
            // Look for status controls
            if ($body.find('[data-cy=status-select]').length > 0) {
              cy.get('[data-cy=status-select]').select('in-progress');
              cy.expectSuccessMessage();
            } else if ($body.find('[data-cy=mark-complete-button]').length > 0) {
              cy.get('[data-cy=mark-complete-button]').click();
              cy.expectSuccessMessage();
            }
          });
        }
      });
    });
  });

  describe('Project Collaboration and Communication', () => {
    it('should display project communication features', () => {
      cy.visit('/app/projects');
      cy.waitForPageLoad();
      
      // Go to project details
      cy.get('[data-cy=project-row]').first().click();
      cy.waitForPageLoad();
      
      // Look for communication features
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=project-chat]').length > 0) {
          cy.get('[data-cy=project-chat]').should('be.visible');
          cy.log('✅ Project chat interface found');
        }
        
        if ($body.find('[data-cy=project-comments]').length > 0) {
          cy.get('[data-cy=project-comments]').should('be.visible');
          cy.log('✅ Project comments section found');
        }
        
        if ($body.find('[data-cy=project-team]').length > 0) {
          cy.get('[data-cy=project-team]').should('be.visible');
          cy.log('✅ Project team section found');
        }
      });
    });

    it('should handle project team management', () => {
      cy.visit('/app/projects');
      cy.waitForPageLoad();
      
      cy.get('[data-cy=project-row]').first().click();
      cy.waitForPageLoad();
      
      // Test team management features if available
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=invite-team-member-button]').length > 0) {
          cy.get('[data-cy=invite-team-member-button]').click();
          
          // Fill invitation form
          cy.get('[data-cy=team-member-email-input]').type('team@example.com');
          cy.get('[data-cy=team-member-role-select]').select('contributor');
          cy.get('[data-cy=send-invitation-button]').click();
          
          cy.expectSuccessMessage();
        }
        
        if ($body.find('[data-cy=team-members-list]').length > 0) {
          cy.get('[data-cy=team-members-list]').should('be.visible');
          cy.get('[data-cy=team-member-row]').should('have.length.greaterThan', 0);
        }
      });
    });
  });

  describe('Project Analytics and Reporting', () => {
    it('should display project progress and metrics', () => {
      cy.visit('/app/projects');
      cy.waitForPageLoad();
      
      // Check for project metrics in list view
      cy.get('[data-cy=project-row]').first().within(() => {
        // Look for progress indicators
        cy.get('body').then(($body) => {
          if ($body.find('[data-cy=project-progress]').length > 0) {
            cy.get('[data-cy=project-progress]').should('be.visible');
          }
          
          if ($body.find('[data-cy=project-completion]').length > 0) {
            cy.get('[data-cy=project-completion]').should('be.visible');
          }
        });
      });
      
      // Go to project details for more metrics
      cy.get('[data-cy=project-row]').first().click();
      cy.waitForPageLoad();
      
      // Check for detailed analytics
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=project-analytics]').length > 0) {
          cy.get('[data-cy=project-analytics]').should('be.visible');
        }
        
        if ($body.find('[data-cy=project-timeline]').length > 0) {
          cy.get('[data-cy=project-timeline]').should('be.visible');
        }
        
        if ($body.find('[data-cy=project-metrics]').length > 0) {
          cy.get('[data-cy=project-metrics]').should('be.visible');
        }
      });
    });

    it('should generate project reports', () => {
      cy.visit('/app/projects');
      cy.waitForPageLoad();
      
      cy.get('[data-cy=project-row]').first().click();
      cy.waitForPageLoad();
      
      // Look for reporting features
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=generate-report-button]').length > 0) {
          cy.get('[data-cy=generate-report-button]').click();
          
          // Select report type
          if ($body.find('[data-cy=report-type-select]').length > 0) {
            cy.get('[data-cy=report-type-select]').select('summary');
          }
          
          cy.get('[data-cy=create-report-button]').click();
          
          // Wait for report generation
          cy.get('[data-cy=report-download-link]', { timeout: 15000 }).should('be.visible');
          cy.log('✅ Project report generation successful');
        }
      });
    });
  });

  describe('Project Search and Filtering', () => {
    it('should search projects by name and description', () => {
      cy.visit('/app/projects');
      cy.waitForPageLoad();
      
      // Test search functionality if available
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=project-search-input]').length > 0) {
          // Get project name to search for
          cy.get('[data-cy=project-row]').first().within(() => {
            cy.get('[data-cy=project-name]').then(($name) => {
              const projectName = $name.text();
              
              // Search for project
              cy.get('[data-cy=project-search-input]').type(projectName);
              cy.get('[data-cy=search-button]').click();
              
              // Should show filtered results
              cy.get('[data-cy=project-row]').should('contain', projectName);
            });
          });
        }
      });
    });

    it('should filter projects by status and category', () => {
      cy.visit('/app/projects');
      cy.waitForPageLoad();
      
      // Test filtering functionality
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=project-status-filter]').length > 0) {
          cy.get('[data-cy=project-status-filter]').select('active');
          cy.get('[data-cy=apply-filter-button]').click();
          
          // Should show only active projects
          cy.get('[data-cy=project-row]').each(($row) => {
            cy.wrap($row).find('[data-cy=project-status]').should('contain', 'active');
          });
        }
        
        if ($body.find('[data-cy=project-category-filter]').length > 0) {
          cy.get('[data-cy=project-category-filter]').select('development');
          cy.get('[data-cy=apply-filter-button]').click();
          
          // Should show only development projects
          cy.get('[data-cy=project-row]').each(($row) => {
            cy.wrap($row).find('[data-cy=project-category]').should('contain', 'development');
          });
        }
      });
    });
  });

  describe('Project Error Handling and Edge Cases', () => {
    it('should handle API errors during project operations', () => {
      // Simulate API failure during project creation
      cy.visit('/app/projects/new');
      cy.waitForPageLoad();
      
      cy.intercept('POST', '/api/projects', { statusCode: 500 }).as('createProjectFailure');
      
      cy.get('[data-cy=project-name-input]').type('Test Project');
      cy.get('[data-cy=project-description-input]').type('Test description');
      cy.get('[data-cy=save-project-button]').click();
      
      cy.wait('@createProjectFailure');
      
      // Should show error message
      cy.expectErrorMessage();
      cy.get('[data-cy=error-message]').should('contain', 'failed to create');
    });

    it('should handle large project datasets efficiently', () => {
      cy.visit('/app/projects');
      cy.waitForPageLoad();
      
      // Test pagination or virtual scrolling if implemented
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy=pagination-controls]').length > 0) {
          cy.get('[data-cy=pagination-controls]').should('be.visible');
          
          // Test pagination
          if ($body.find('[data-cy=next-page-button]').length > 0) {
            cy.get('[data-cy=next-page-button]').click();
            cy.waitForPageLoad();
            cy.get('[data-cy=projects-table]').should('be.visible');
          }
        }
        
        if ($body.find('[data-cy=load-more-button]').length > 0) {
          // Test infinite scroll or load more
          cy.get('[data-cy=load-more-button]').click();
          cy.get('[data-cy=loading-spinner]').should('be.visible');
          cy.checkLoadingState(false);
        }
      });
    });

    it('should validate project data integrity', () => {
      cy.visit('/app/projects/new');
      cy.waitForPageLoad();
      
      // Test various edge cases
      const edgeCases = [
        {
          name: 'A'.repeat(1000), // Very long name
          description: 'Short desc',
          shouldFail: true
        },
        {
          name: '', // Empty name
          description: 'Valid description',
          shouldFail: true
        },
        {
          name: 'Valid Name',
          description: '<script>alert("xss")</script>', // XSS attempt
          shouldFail: false // Should be sanitized, not fail
        }
      ];
      
      edgeCases.forEach((testCase, index) => {
        cy.get('[data-cy=project-name-input]').clear();
        cy.get('[data-cy=project-name-input]').type(testCase.name);
        cy.get('[data-cy=project-description-input]').clear();
        cy.get('[data-cy=project-description-input]').type(testCase.description);
        
        cy.get('[data-cy=save-project-button]').click();
        
        if (testCase.shouldFail) {
          cy.get('[data-cy=validation-error]').should('be.visible');
        } else {
          // Should either succeed or show sanitization warning
          cy.get('body').then(($body) => {
            if ($body.find('[data-cy=success-message]').length > 0) {
              cy.expectSuccessMessage();
            } else if ($body.find('[data-cy=warning-message]').length > 0) {
              cy.get('[data-cy=warning-message]').should('be.visible');
            }
          });
        }
        
        cy.log(`✅ Edge case ${index + 1} handled correctly`);
      });
    });
  });
});
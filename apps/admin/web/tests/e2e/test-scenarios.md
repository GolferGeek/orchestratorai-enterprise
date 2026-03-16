# End-to-End Test Scenarios for User Flows and Demo Scenarios

## Overview
This document outlines comprehensive E2E test scenarios for the Orchestrator AI application, covering critical user journeys and demo scenarios that validate system functionality from end-to-end.

## Test Infrastructure
- **Framework**: Cypress E2E testing
- **Base URL**: http://localhost:5173 (dev server)
- **API URL**: http://localhost:9000 (backend API)
- **Test Environment**: Real API integration following CLAUDE.md principles

## Critical User Flows

### 1. Authentication & Authorization Flows

#### 1.1 User Login Journey
**Scenario**: New user attempts to access protected pages and goes through authentication
- Start at landing page (/)
- Attempt to access protected route (/app/home)
- Redirected to login page
- Enter valid credentials
- Successfully redirected to intended page
- Navigation persists across page refresh

#### 1.2 Role-Based Access Control
**Scenario**: Users with different roles access appropriate features
- Login as regular user - access standard features only
- Login as admin - access admin-only features
- Attempt admin access as regular user - see access denied page
- Role persistence across sessions

#### 1.3 Session Management
**Scenario**: Authentication state management
- Login and verify session persistence
- Logout and verify cleanup
- Session timeout handling
- Concurrent session management

### 2. PII Management Workflow (Core Feature)

#### 2.1 PII Pattern Management Journey
**Scenario**: Admin manages PII detection patterns end-to-end
1. Login as admin user
2. Navigate to PII Management page (/app/admin/pii-patterns)
3. View existing patterns list
4. Create new PII pattern:
   - Fill out pattern form (name, type, regex, description)
   - Validate pattern structure
   - Save successfully
5. Test pattern functionality:
   - Navigate to PII Testing page
   - Input sample text containing PII
   - Verify pattern detects PII correctly
6. Edit existing pattern:
   - Modify regex or settings
   - Save changes
   - Verify changes applied
7. Disable/enable patterns
8. Delete pattern (with confirmation)

#### 2.2 Pseudonym Dictionary Management
**Scenario**: Complete pseudonym dictionary lifecycle
1. Access Pseudonym Dictionary page (/app/admin/pseudonym-dictionary)
2. Create new dictionary:
   - Select data type (matching PII patterns)
   - Add category and words
   - Save dictionary
3. Test dictionary integration:
   - Navigate to PII Testing
   - Process text that triggers pseudonym replacement
   - Verify pseudonyms are applied correctly
4. View pseudonym mappings:
   - Navigate to Pseudonym Mappings page
   - Review mapping history
   - Verify data consistency

#### 2.3 Real-time PII Processing Demo
**Scenario**: End-to-end PII sanitization workflow
1. Setup: Ensure patterns and dictionaries are configured
2. Input processing:
   - Enter text with various PII types (email, phone, names)
   - Process through sanitization API
   - View sanitized output
   - Verify original-to-pseudonym mappings
3. Audit trail:
   - Check processing logs
   - Verify analytics data updated
   - Review usage metrics

### 3. Project Management Workflow

#### 3.1 Project Creation and Management
**Scenario**: Complete project lifecycle management
1. Navigate to Projects page (/app/projects)
2. Create new project:
   - Fill project details
   - Set permissions and access
   - Save project
3. Access project details:
   - Navigate to project detail page
   - View project information
   - Modify project settings
4. Project collaboration:
   - Invite team members
   - Manage permissions
   - Track project progress

#### 3.2 Deliverables Management
**Scenario**: Managing project deliverables
1. Access Deliverables page (/app/deliverables)
2. Create deliverable linked to project
3. Update deliverable status
4. Review deliverable history

### 4. Agent Interaction Workflow

#### 4.1 Chat Interface Journey
**Scenario**: User interacts with AI agents
1. Access chat interface (/app/chat or /app/home)
2. Start conversation with agent
3. Send various types of requests:
   - Simple questions
   - Complex multi-step tasks
   - File processing requests
4. Verify responses and handling
5. Review conversation history
6. Test conversation persistence

#### 4.2 Agent Evaluation System
**Scenario**: Evaluate agent responses and performance
1. Navigate to Evaluations page (/app/evaluations)
2. Review completed evaluations
3. Submit new evaluation
4. Admin access: Review all evaluations (/app/admin/evaluations)

### 5. Admin Dashboard Workflows

#### 5.1 LLM Usage Monitoring
**Scenario**: Admin monitors LLM usage and costs
1. Access LLM Usage dashboard (/app/admin/llm-usage)
2. Review usage statistics:
   - Total requests and costs
   - Provider breakdown
   - Model performance metrics
3. Filter by date ranges
4. Export usage reports
5. Set alerts and thresholds

#### 5.2 System Audit and Security
**Scenario**: Admin reviews security and access logs
1. Access Audit Dashboard (/app/admin/audit)
2. Review access attempts
3. Monitor security events
4. Review user activity logs
5. Generate compliance reports

#### 5.3 System Settings Management
**Scenario**: Configure system-wide settings
1. Access Admin Settings (/app/admin/settings)
2. Configure API endpoints
3. Update system parameters
4. Manage security settings
5. Test configuration changes

### 6. Performance and Error Handling

#### 6.1 Application Performance Under Load
**Scenario**: Test application responsiveness
- Navigate between pages rapidly
- Load large datasets (patterns, projects, logs)
- Test concurrent user interactions
- Verify smooth transitions and loading states

#### 6.2 Error Recovery and Graceful Degradation
**Scenario**: Handle various error conditions
- API service unavailable
- Network connectivity issues
- Invalid input handling
- Permission errors
- Session expiration

#### 6.3 Mobile Responsiveness
**Scenario**: Application works on mobile devices
- Test on different viewport sizes
- Verify touch interactions
- Check responsive layouts
- Validate mobile-specific features

## Demo Scenarios for Stakeholder Presentations

### Demo 1: PII Protection in Action
**Duration**: 5-7 minutes
**Audience**: Business stakeholders, compliance teams

1. **Setup** (30 seconds):
   - Login as admin
   - Show PII patterns configured

2. **Live PII Detection** (2 minutes):
   - Paste sample customer data with PII
   - Process through system
   - Show real-time sanitization

3. **Audit and Compliance** (2 minutes):
   - Show mapping of original to pseudonyms
   - Display audit logs
   - Export compliance report

4. **Business Impact** (1 minute):
   - Show analytics dashboard
   - Highlight cost savings
   - Demonstrate scalability

### Demo 2: Multi-Agent Project Orchestration
**Duration**: 8-10 minutes
**Audience**: Technical teams, project managers

1. **Project Setup** (2 minutes):
   - Create new project
   - Define objectives and scope
   - Set up team access

2. **Agent Collaboration** (4 minutes):
   - Initiate multi-step task
   - Show agents coordinating
   - Real-time progress tracking
   - Error handling and recovery

3. **Results and Analytics** (3 minutes):
   - Review completed work
   - Show performance metrics
   - Cost analysis
   - Quality assessments

### Demo 3: Enterprise Security and Governance
**Duration**: 6-8 minutes
**Audience**: Security teams, IT leadership

1. **Access Control Demo** (2 minutes):
   - Show role-based permissions
   - Demonstrate access restrictions
   - Multi-factor authentication

2. **Security Monitoring** (3 minutes):
   - Live security dashboard
   - Access attempt logs
   - Threat detection
   - Incident response

3. **Compliance Reporting** (2 minutes):
   - Generate compliance reports
   - Audit trail demonstration
   - Data retention policies

## Test Data Requirements

### User Accounts
- **Regular User**: test@example.com / password123
- **Admin User**: admin@example.com / admin123
- **Evaluation Monitor**: evaluator@example.com / eval123

### Sample PII Data
- Email addresses: john.doe@company.com, jane.smith@example.org
- Phone numbers: (555) 123-4567, +1-800-555-0199  
- Names: John Doe, Jane Smith, Michael Johnson
- Addresses: 123 Main St, Anytown, NY 12345
- SSNs: 123-45-6789 (test format only)

### Sample Project Data
- Project names with realistic scenarios
- Various deliverable types
- Team member assignments
- Realistic timelines and milestones

## Success Criteria

### Functional Requirements
- ✅ All user flows complete without errors
- ✅ Real API integration works correctly
- ✅ Authentication and authorization function properly
- ✅ PII detection and sanitization work accurately
- ✅ Data persistence across sessions
- ✅ Performance meets acceptable thresholds

### Non-Functional Requirements  
- ✅ Pages load within 3 seconds
- ✅ No JavaScript errors in console
- ✅ Responsive design works on all screen sizes
- ✅ Accessibility standards met
- ✅ Error messages are user-friendly
- ✅ Data validation prevents invalid inputs

### Demo Success Metrics
- ✅ Scenarios complete within time limits
- ✅ Real-time data processing works
- ✅ Visual appeal and professional presentation
- ✅ Error recovery demonstrates robustness
- ✅ Value proposition clearly demonstrated

## Implementation Notes

### Test Environment Setup
1. Start backend API server (npm run start:dev in apps/api)
2. Start frontend dev server (npm run dev in apps/web)
3. Ensure database is populated with test data
4. Configure environment variables for testing

### Test Execution Strategy
1. **Smoke Tests**: Basic functionality verification
2. **Critical Path Tests**: Core user journeys
3. **Integration Tests**: Cross-component functionality
4. **Demo Rehearsal Tests**: Stakeholder presentation scenarios
5. **Performance Tests**: Load and stress testing
6. **Accessibility Tests**: WCAG compliance verification

### Continuous Testing Integration
- Run E2E tests on code commits
- Automated demo scenario validation
- Performance regression testing
- Cross-browser compatibility testing
- Mobile device testing matrix
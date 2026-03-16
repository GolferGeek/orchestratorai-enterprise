# Workflow Integration Tests

This directory contains comprehensive workflow tests that validate end-to-end functionality across the orchestrator system.

## Tests Available

### `projects-workflow.test.js`
Comprehensive test of the Projects system including:
- ProjectsService functionality 
- Hierarchical project creation and management
- Conversation integration with orchestrators
- Database operations and validation

#### How to Run
```bash
# From the API directory
cd apps/api

# Ensure the backend is built
npm run build

# Run the projects workflow test
node test/workflows/projects-workflow.test.js
```

#### Prerequisites
- Backend API must be built (`npm run build`)
- Database must be running and migrated
- Required environment variables must be set

## Test Structure

These workflow tests use the NestJS application context to test:
1. **Service Integration** - Direct service method calls
2. **Database Operations** - Real CRUD operations 
3. **Cross-Service Communication** - Service-to-service interactions
4. **End-to-End Workflows** - Complete user workflows

Unlike unit tests, these integration tests validate the entire stack working together with real database operations and service interactions.
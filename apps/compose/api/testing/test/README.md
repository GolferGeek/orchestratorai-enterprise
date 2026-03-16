# E2E Tests

This directory contains end-to-end integration tests for the Orchestrator AI API.

## Running Tests

### Prerequisites

1. Ensure Supabase is running:
```bash
npx supabase start
```

2. Ensure the API server is running:
```bash
npm run start:dev
```

3. Set required environment variables:
```bash
export ADMIN_PASSWORD="your-admin-password"
export API_BASE_URL="http://localhost:6100"
```

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run Specific Test Suites

**User Management Tests:**
```bash
npm run test:e2e:user-management
```

**Health Check Tests:**
```bash
npm run test:e2e -- health.e2e-spec
```

**Integration Tests:**
```bash
npm run test:e2e -- integration/
```

## Test Suites

### User Management (`user-management.e2e-spec.ts`)

Tests the complete user lifecycle including:

- **Authentication**: Admin login with JWT tokens
- **User Creation**: Create users with email, password, display name, roles, and organization access
- **User Verification**: Verify users exist in organizations
- **Role Management**:
  - Get user roles
  - Assign new roles
  - Revoke roles
  - Verify role changes
- **Password Management**:
  - Admin password change
  - Login verification with new password
- **User Deletion**:
  - Delete user
  - Verify deletion
  - Verify removal from organizations
- **Error Handling**:
  - Duplicate email rejection
  - Self-deletion prevention
  - Weak password rejection

**Required Environment Variables:**
- `ADMIN_PASSWORD`: Password for admin user (golfergeek@orchestratorai.io)
- `API_BASE_URL`: API base URL (default: http://localhost:6100)

**Test Data:**
- Creates user: `golfer@orchestratorai.io`
- Password: `Golfer123!`
- Display Name: `Golfer`
- Initial Role: `member`
- Organization: `finance`

### Health Check (`health.e2e-spec.ts`)

Basic health check tests to verify API is running.

### Integration Tests (`integration/`)

Various integration tests for:
- Agent runners
- Blog post writer
- Conversation streaming
- HITL (Human-in-the-Loop)
- LLM architecture
- Observability SSE

## Manual Testing

For manual testing outside of the Jest framework, use the standalone script:

```bash
ADMIN_PASSWORD=your-password ts-node scripts/test-user-management.ts
```

This script performs the same workflow as the e2e tests with console output showing each step.

## CI/CD Integration

The tests are integrated into the GitHub Actions workflow at `.github/workflows/api-tests.yml`.

The workflow:
1. Sets up PostgreSQL database
2. Installs dependencies
3. Runs linter and build
4. Starts Supabase
5. Runs unit tests
6. Runs E2E tests
7. Uploads coverage reports

## Writing New Tests

To add a new e2e test:

1. Create a file following the naming pattern: `*.e2e-spec.ts`
2. Place it in `testing/test/` or a subdirectory
3. Use the existing tests as templates
4. Include proper setup/teardown in `beforeAll`/`afterAll` hooks
5. Add cleanup logic to ensure tests don't leave artifacts

Example structure:

```typescript
import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:6100';

describe('My Feature E2E Test', () => {
  let apiClient: AxiosInstance;
  let authToken: string;

  beforeAll(async () => {
    apiClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
    });

    // Authenticate
    const response = await apiClient.post('/auth/login', {
      email: 'admin@example.com',
      password: process.env.ADMIN_PASSWORD,
    });
    authToken = response.data.accessToken;
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
  });

  afterAll(async () => {
    // Cleanup
  });

  it('should do something', async () => {
    // Test implementation
  });
});
```

## Troubleshooting

**Tests fail with 403 errors:**
- Verify `x-organization-slug` header is set correctly
- Check that admin user has proper permissions
- Ensure API server is running with latest code

**Tests timeout:**
- Increase timeout in jest config (currently 120s)
- Check database connection
- Verify Supabase is running

**Database state issues:**
- Tests should clean up after themselves in `afterAll`
- Use unique test data to avoid conflicts
- Consider resetting database between test runs

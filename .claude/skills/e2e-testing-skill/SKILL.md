---
name: e2e-testing-skill
description: E2E testing principles emphasizing NO MOCKING, real database work, real API calls, and real authentication. Use when writing E2E tests, integration tests, or any tests that should use real services. Keywords: e2e test, integration test, real database, real api, no mocking, real authentication, supabase test user.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# E2E Testing Skill

## Purpose

This skill provides **CRITICAL** principles for E2E (End-to-End) testing. The core principle is: **NO MOCKING IN E2E TESTS**. E2E tests must use real services, real databases, real API calls, and real authentication.

## Core Principle: NO MOCKING

### ABSOLUTELY FORBIDDEN IN E2E TESTS

- NO mocks of database operations
- NO mocks of API calls
- NO mocks of authentication
- NO mocks of external services
- NO fake data or stubs
- NO test doubles or spies

### REQUIRED IN E2E TESTS

- Real database connections and queries
- Real API calls (HTTP requests to actual endpoints)
- Real authentication (Supabase test user credentials)
- Real services running (API server, database, etc.)
- Real data in database (test data, not mocks)
- Real responses from all services

## Why No Mocking?

**Mocking in E2E tests is harmful because:**
1. **Hides real problems** - Tests pass but production fails
2. **False confidence** - System appears to work but doesn't
3. **Integration gaps** - Misses real integration issues
4. **Configuration errors** - Doesn't catch misconfigured services
5. **Data flow issues** - Doesn't validate real data transformations
6. **Authentication bugs** - Doesn't catch auth flow problems

**E2E tests must reveal REAL problems, not hide them.**

## Test User Credentials

**Always use real Supabase test user credentials from `.env`:**

```typescript
// CORRECT: Use environment variables
const testEmail = process.env.SUPABASE_TEST_USER || 'demo.user@playground.com';
const testPassword = process.env.SUPABASE_TEST_PASSWORD || 'demouser';

// FORBIDDEN: Hardcoded credentials
const testEmail = 'test@example.com'; // NO
```

## Real Authentication Pattern

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_ANON_KEY || '',
);

const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email: process.env.SUPABASE_TEST_USER,
  password: process.env.SUPABASE_TEST_PASSWORD,
});

if (authError) {
  throw new Error(`Real authentication failed: ${authError.message}`);
}

const authToken = authData.session.access_token;
const testUserId = authData.user.id;
```

## Real Database Work

```typescript
// Real database query - NO MOCKS
const { data, error } = await supabase
  .from('agents')
  .select('*')
  .eq('user_id', testUserId);

expect(error).toBeNull();
expect(data).toBeDefined();
```

## Real API Calls

```typescript
import axios from 'axios';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:6100';

const response = await axios.post(
  `${API_BASE}/agent-to-agent/test-org/my-agent/tasks`,
  {
    jsonrpc: '2.0',
    method: 'converse',
    id: '1',
    params: {
      context: executionContext,
      mode: 'converse',
      payload: { action: 'start' },
      userMessage: 'Test message',
    }
  },
  {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    }
  }
);

expect(response.status).toBe(200);
```

## Complete E2E Test Example

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppModule } from '../../app.module';

describe('Agent E2E Tests', () => {
  let app: INestApplication;
  let supabase: SupabaseClient;
  let authToken: string;
  let testUserId: string;

  const testEmail = process.env.SUPABASE_TEST_USER || 'demo.user@playground.com';
  const testPassword = process.env.SUPABASE_TEST_PASSWORD || 'demouser';

  beforeAll(async () => {
    supabase = createClient(
      process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
      process.env.SUPABASE_ANON_KEY || '',
    );

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    if (authError) throw new Error(`Real authentication failed: ${authError.message}`);

    authToken = authData.session.access_token;
    testUserId = authData.user.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('should execute agent with real database and real API', async () => {
    const response = await request(app.getHttpServer())
      .post('/agent-to-agent/test-org/my-agent/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        jsonrpc: '2.0',
        method: 'converse',
        id: '1',
        params: {
          context: { orgSlug: 'test-org', userId: testUserId /* ... */ },
          mode: 'converse',
          payload: { action: 'start' },
          userMessage: 'Test',
        }
      })
      .expect(200);

    expect(response.body.result).toBeDefined();
  });
});
```

## Service Requirements

**E2E tests require real services:**

1. **Supabase Database** - Must be running and accessible
2. **API Server** - Must be running (e.g., `npm run start:dev`)
3. **Web Server** (for web E2E) - Must be running (e.g., `npm run dev`)

## When Mocking is Acceptable

**Mocking is ONLY acceptable in:**
- Unit tests - Testing individual functions/components in isolation
- Service tests - Testing service logic with mocked dependencies
- Component tests - Testing Vue components with mocked services

**Mocking is FORBIDDEN in:**
- E2E tests - Must use real services
- Integration tests - Must use real services

## Common Violations

```typescript
// FORBIDDEN: Mocking database
jest.mock('@supabase/supabase-js', () => ({ /* ... */ }));

// FORBIDDEN: Mocking API calls
jest.mock('axios', () => ({ post: jest.fn(() => Promise.resolve({ data: {} })) }));

// FORBIDDEN: Mocking authentication
jest.mock('../auth', () => ({ authenticate: jest.fn(() => 'fake-token') }));
```

## Related Skills

- **web-testing-skill** - Web app E2E testing patterns
- **api-testing-skill** - API app E2E testing patterns
- **langgraph-testing-skill** - LangGraph app E2E testing patterns
- **execution-context-skill** - ExecutionContext validation (real ExecutionContext in tests)
- **transport-types-skill** - A2A protocol validation (real A2A calls in tests)

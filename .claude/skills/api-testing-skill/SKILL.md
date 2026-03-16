---
name: api-testing-skill
description: API app testing patterns for NestJS and Jest. Use when testing API app files, generating NestJS service/controller tests, testing agent runners, or running Jest tests for API. Keywords: api test, nestjs test, jest, service test, controller test, agent runner test, api app testing.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# API Testing Skill

## Purpose

This skill provides patterns and validation for testing API apps. It covers NestJS service testing, controller testing, agent runner testing, and E2E testing patterns.

## Testing Framework

- **Unit Tests**: Jest (with ts-jest)
- **E2E Tests**: Jest + Supertest
- **Testing Utilities**: @nestjs/testing
- **Coverage**: jest --coverage

## Test Commands

```bash
# Unit tests
npm test

# E2E tests (requires services running)
npm run test:e2e

# Coverage
npm run test:cov

# Watch mode
npm run test:watch
```

## File Classification

### Service Tests (`*.spec.ts`)

**Location:** `src/**/*.service.spec.ts` or alongside service

**Pattern:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MyService } from './my.service';

describe('MyService', () => {
  let service: MyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MyService],
    }).compile();

    service = module.get<MyService>(MyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should do something', () => {
    const result = service.doSomething('input');
    expect(result).toBe('expected output');
  });
});
```

### Controller Tests (`*.spec.ts`)

**Location:** `src/**/*.controller.spec.ts` or alongside controller

**Pattern:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MyController } from './my.controller';
import { MyService } from './my.service';

describe('MyController', () => {
  let controller: MyController;
  let service: MyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MyController],
      providers: [
        {
          provide: MyService,
          useValue: {
            doSomething: jest.fn().mockResolvedValue('result'),
          },
        },
      ],
    }).compile();

    controller = module.get<MyController>(MyController);
    service = module.get<MyService>(MyService);
  });

  it('should call service method', async () => {
    const result = await controller.getSomething('input');
    expect(service.doSomething).toHaveBeenCalledWith('input');
    expect(result).toBe('result');
  });
});
```

### Agent Runner Tests (`*.spec.ts`)

**Location:** `src/agent2agent/services/**/*.spec.ts`

**Pattern:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MyAgentRunner } from './my-agent-runner.service';
import { ExecutionContext } from '@orchestratorai/transport-types';

describe('MyAgentRunner', () => {
  let runner: MyAgentRunner;
  let mockExecutionContext: ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MyAgentRunner],
    }).compile();

    runner = module.get<MyAgentRunner>(MyAgentRunner);

    mockExecutionContext = {
      orgSlug: 'test-org',
      userId: 'test-user-id',
      conversationId: 'test-conversation-id',
      taskId: 'test-task-id',
      planId: '00000000-0000-0000-0000-000000000000',
      deliverableId: '00000000-0000-0000-0000-000000000000',
      agentSlug: 'test-agent',
      agentType: 'context',
      provider: '00000000-0000-0000-0000-000000000000',
      model: '00000000-0000-0000-0000-000000000000',
    };
  });

  it('should process task with ExecutionContext', async () => {
    const task = { content: 'test task' };
    const result = await runner.processTask(task, mockExecutionContext);
    expect(result.executionContext).toEqual(mockExecutionContext);
  });
});
```

### E2E Tests (`*.e2e-spec.ts`)

**Location:** `testing/test/*.e2e-spec.ts`

**CRITICAL: NO MOCKING IN E2E TESTS**

E2E tests must use **real services, real database, real API calls, and real authentication**. See `e2e-testing-skill/` for complete E2E principles.

**Pattern:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppModule } from '../../src/app.module';

describe('MyController (e2e)', () => {
  let app: INestApplication;
  let supabase: SupabaseClient;
  let authToken: string;

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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('/endpoint (GET) with real authentication', () => {
    return request(app.getHttpServer())
      .get('/endpoint')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
  });
});
```

## Testing Standards

### Coverage Requirements

- **Global**: 75% minimum
- **Critical Path**: 90% minimum (security, validation, PII)
- **Services**: 80% minimum
- **Controllers**: 80% minimum
- **Agent Runners**: 85% minimum

### Best Practices

1. **One assertion per test** (when possible)
2. **Descriptive test names** using natural language
3. **Test behavior, not implementation**
4. **Use proper setup/teardown**
5. **Mock external dependencies** in unit tests
6. **Test both happy and error paths**

## ExecutionContext in Tests

Always create a proper mock ExecutionContext:

```typescript
const mockExecutionContext: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user-id',
  conversationId: 'test-conversation-id',
  taskId: 'test-task-id',
  planId: '00000000-0000-0000-0000-000000000000',
  deliverableId: '00000000-0000-0000-0000-000000000000',
  agentSlug: 'test-agent',
  agentType: 'context',
  provider: '00000000-0000-0000-0000-000000000000',
  model: '00000000-0000-0000-0000-000000000000',
};
```

## Related Skills

- **e2e-testing-skill** - E2E testing principles (NO MOCKING) - MANDATORY for E2E tests
- **execution-context-skill** - ExecutionContext validation in tests
- **transport-types-skill** - A2A protocol validation in tests
- **api-architecture-skill** - API app structure and patterns

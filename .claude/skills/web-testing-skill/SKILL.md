---
name: web-testing-skill
description: Web app testing patterns for Vue 3, Vitest, and Cypress. Use when testing web app files, generating Vue component tests, testing stores/services/composables, or running Vitest/Cypress tests. Keywords: web test, vue test, vitest, cypress, component test, store test, service test, web app testing.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Web Testing Skill

## Purpose

This skill provides patterns and validation for testing web apps. It covers Vue 3 component testing, Vitest unit tests, Cypress E2E tests, and integration testing patterns.

## Testing Framework

- **Unit Tests**: Vitest (fast, modern, Vite-native)
- **E2E Tests**: Cypress (comprehensive browser automation)
- **Component Testing**: Vue Test Utils
- **Store Testing**: Pinia Testing utilities
- **Coverage**: @vitest/coverage-v8

## Test Commands

```bash
# Unit tests
npm run test:unit

# E2E tests (requires services running)
npm run test:e2e

# Coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## File Classification

### Component Tests (`*.test.ts` or `*.spec.ts`)

**Location:** `src/components/**/__tests__/*.test.ts` or alongside component

**Pattern:**
```typescript
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import MyComponent from '../MyComponent.vue';

describe('MyComponent', () => {
  it('should render correctly', () => {
    const wrapper = mount(MyComponent, {
      props: { title: 'Test Title' }
    });
    expect(wrapper.text()).toContain('Test Title');
  });
});
```

### Store Tests (`*.test.ts`)

**Location:** `src/stores/__tests__/*.test.ts`

**Pattern:**
```typescript
import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach } from 'vitest';
import { useMyStore } from '../myStore';

describe('MyStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should initialize with default state', () => {
    const store = useMyStore();
    expect(store.count).toBe(0);
  });
});
```

### Service Tests (`*.test.ts`)

**Location:** `src/services/__tests__/*.test.ts`

**Pattern:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { myService } from '../myService';

describe('MyService', () => {
  it('should call API correctly', async () => {
    const mockResponse = { data: 'test' };
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    } as Response);

    const result = await myService.fetchData();
    expect(result).toEqual(mockResponse);
  });
});
```

### E2E Tests (`*.cy.ts`)

**Location:** `tests/e2e/*.cy.ts`

**CRITICAL: NO MOCKING IN E2E TESTS**

E2E tests must use **real services, real database, real API calls, and real authentication**. See `e2e-testing-skill/` for complete E2E principles.

**Pattern:**
```typescript
describe('User Journey', () => {
  const testEmail = Cypress.env('SUPABASE_TEST_USER') || 'demo.user@playground.com';
  const testPassword = Cypress.env('SUPABASE_TEST_PASSWORD') || 'demouser';

  it('should complete authentication flow with real authentication', () => {
    cy.visit('/login');
    cy.get('[data-cy=email]').type(testEmail);
    cy.get('[data-cy=password]').type(testPassword);
    cy.get('[data-cy=submit]').click();
    cy.url().should('include', '/dashboard');
  });
});
```

**E2E Test Requirements:**
- Real Supabase authentication
- Real API calls to actual endpoints
- Real database queries and data
- Real services running
- NO mocks of any kind

## Testing Standards

### Coverage Requirements

- **Global**: 75% minimum (lines, functions, branches, statements)
- **Critical Path**: 90% minimum (validation, security, PII)
- **Components**: 80% minimum
- **Stores**: 85% minimum
- **Services**: 80% minimum

### Test Structure (AAA Pattern)

```typescript
it('should do something specific', () => {
  // Arrange - Set up test data and mocks
  const input = 'test input';

  // Act - Execute the code being tested
  const result = functionUnderTest(input);

  // Assert - Verify the result
  expect(result).toBe('test output');
});
```

### Best Practices

1. **One assertion per test** (when possible)
2. **Descriptive test names** using natural language
3. **Test behavior, not implementation**
4. **Use proper setup/teardown** (beforeEach, afterEach)
5. **Mock external dependencies** in unit tests
6. **Test both happy and error paths**

## ExecutionContext in Tests

```typescript
import { ExecutionContext } from '@orchestratorai/transport-types';

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
- **web-architecture-skill** - Web app structure and patterns

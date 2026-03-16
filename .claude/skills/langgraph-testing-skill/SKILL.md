---
name: langgraph-testing-skill
description: LangGraph app testing patterns for Jest. Use when testing LangGraph app files, generating LangGraph agent tests, testing workflows and state machines, or running Jest tests for LangGraph. Keywords: langgraph test, jest, agent test, workflow test, state machine test, langgraph app testing.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# LangGraph Testing Skill

## Purpose

This skill provides patterns and validation for testing LangGraph apps. It covers LangGraph agent testing, workflow testing, state machine testing, and E2E testing patterns.

## Testing Framework

- **Unit Tests**: Jest (with ts-jest)
- **E2E Tests**: Jest
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

### Agent Service Tests (`*.spec.ts`)

**Location:** `src/agents/**/*.service.spec.ts` or alongside service

**Pattern:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MyAgentService } from './my-agent.service';

describe('MyAgentService', () => {
  let service: MyAgentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MyAgentService],
    }).compile();

    service = module.get<MyAgentService>(MyAgentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should process agent workflow', async () => {
    const input = { content: 'test input' };
    const result = await service.process(input);
    expect(result).toBeDefined();
  });
});
```

### Tool Tests (`*.spec.ts`)

**Location:** `src/tools/**/*.tool.spec.ts` or alongside tool

**Pattern:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MyTool } from './my.tool';

describe('MyTool', () => {
  let tool: MyTool;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MyTool],
    }).compile();

    tool = module.get<MyTool>(MyTool);
  });

  it('should execute tool correctly', async () => {
    const result = await tool.execute({ input: 'test' });
    expect(result).toBeDefined();
  });
});
```

### E2E Tests (`*.e2e-spec.ts`)

**CRITICAL: NO MOCKING IN E2E TESTS**

E2E tests must use **real services, real database, real API calls, and real authentication**. See `e2e-testing-skill/` for complete E2E principles.

**E2E Test Requirements:**
- Real Supabase authentication
- Real database queries
- Real API calls to actual endpoints
- Real LangGraph workflows and state machines
- Real services running
- NO mocks of any kind

## Testing Standards

### Coverage Requirements

- **Global**: 75% minimum
- **Critical Path**: 90% minimum (workflows, state machines)
- **Agents**: 85% minimum
- **Tools**: 80% minimum
- **Services**: 80% minimum

### Best Practices

1. **One assertion per test** (when possible)
2. **Descriptive test names** using natural language
3. **Test behavior, not implementation**
4. **Use proper setup/teardown**
5. **Mock LLM calls and external APIs** in unit tests
6. **Test state transitions** explicitly

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

## Common Patterns

### Testing State Transitions

```typescript
describe('Workflow State Transitions', () => {
  it('should transition from start to processing', async () => {
    const initialState = { step: 'start', data: {} };
    const result = await workflow.execute(initialState);
    expect(result.step).toBe('processing');
  });
});
```

### Testing HITL Interactions

```typescript
describe('HITL Interactions', () => {
  it('should pause workflow for HITL', async () => {
    const state = { step: 'hitl_required', data: {} };
    const result = await workflow.execute(state);
    expect(result.step).toBe('paused');
    expect(result.hitlRequired).toBe(true);
  });
});
```

### Testing LLM Integration (Unit Test with Mock)

```typescript
describe('LLM Integration', () => {
  it('should call LLM service correctly', async () => {
    const mockLLMService = {
      callLLM: jest.fn().mockResolvedValue({ text: 'LLM response' }),
    };

    const service = new MyAgentService(mockLLMService);
    const result = await service.process({ input: 'test' });

    expect(mockLLMService.callLLM).toHaveBeenCalled();
    expect(result).toContain('LLM response');
  });
});
```

## Related Skills

- **e2e-testing-skill** - E2E testing principles (NO MOCKING) - MANDATORY for E2E tests
- **execution-context-skill** - ExecutionContext validation in tests
- **transport-types-skill** - A2A protocol validation in tests
- **langgraph-architecture-skill** - LangGraph app structure and patterns

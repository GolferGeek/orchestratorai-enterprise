---
name: compose-test-skill
description: Testing patterns and knowledge for the Compose product — 5 family runners, invoke dispatch, RAG pipeline, transport contract, error propagation
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Compose Test Skill

Testing knowledge for the Compose product. Use this when running, writing, or improving tests for any Compose module.

## Architecture Summary

Compose is synchronous: one request, one response. No job queue, no LangGraph. The dispatch service routes `agentSlug` → `agentType` → family runner → LLM call → typed response.

```
POST /invoke
  → InvokeController
  → InvokeDispatchService.dispatch(agentSlug, context, data)
  → AgentDefinitionService.findBySlug(agentSlug)   ← loads from DB
  → {FamilyRunner}.run(agentDef, context, data)     ← context | rag | api | external | media
  → LLM_SERVICE.call(...)                            ← via planes
  → { success, output: { content, outputType }, metadata, context }
```

## Running Tests

```bash
# All unit tests
cd apps/compose/api && npx jest --passWithNoTests 2>&1 | tail -30

# Single module
cd apps/compose/api && npx jest invoke/invoke-dispatch 2>&1 | tail -20

# Coverage
cd apps/compose/api && npx jest --coverage --coverageReporters=text-summary 2>&1 | tail -20

# E2E (needs Supabase + Compose running)
cd apps/compose/api && npx jest --config testing/test/jest-e2e.json 2>&1 | tail -30
```

## Key Files & Their Test Files

| Source | Test File |
|--------|-----------|
| `invoke/invoke-dispatch.service.ts` | `invoke/__tests__/invoke-dispatch.service.spec.ts` |
| `invoke/invoke.controller.ts` | `invoke/__tests__/invoke.controller.spec.ts` |
| `invoke/agent-definition.service.ts` | `invoke/__tests__/agent-definition.service.spec.ts` |
| `invoke/runners/context-family.runner.ts` | `invoke/runners/__tests__/context-family.runner.spec.ts` |
| `invoke/runners/rag-family.runner.ts` | `invoke/runners/__tests__/rag-family.runner.spec.ts` |
| `invoke/runners/api-family.runner.ts` | `invoke/runners/__tests__/api-family.runner.spec.ts` |
| `invoke/runners/external-family.runner.ts` | `invoke/runners/__tests__/external-family.runner.spec.ts` |
| `invoke/runners/media-family.runner.ts` | `invoke/runners/__tests__/media-family.runner.spec.ts` |
| `rag/embedding.service.ts` | `rag/__tests__/embedding.service.spec.ts` |
| `invoke/conversations.service.ts` | `invoke/__tests__/conversations.service.spec.ts` |

## Test Patterns by Module

### InvokeDispatchService

```typescript
describe('InvokeDispatchService', () => {
  it('routes to context runner for context agentType', async () => {
    mockAgentDef.agentType = 'context';
    const result = await service.dispatch('my-agent', ctx, { content: 'hi' });
    expect(mockContextRunner.run).toHaveBeenCalledOnce();
    expect(mockRagRunner.run).not.toHaveBeenCalled();
  });

  it('throws when agentSlug not found', async () => {
    mockAgentDefService.findBySlug.mockResolvedValue(null);
    await expect(service.dispatch('unknown-slug', ctx, data)).rejects.toThrow();
  });

  it('throws when agentType is unrecognized', async () => {
    mockAgentDef.agentType = 'unknown-type';
    await expect(service.dispatch('agent', ctx, data)).rejects.toThrow();
  });

  it('does not fallback on runner error', async () => {
    mockContextRunner.run.mockRejectedValue(new Error('LLM error'));
    await expect(service.dispatch('agent', ctx, data)).rejects.toThrow('LLM error');
  });
});
```

### Context Family Runner

```typescript
describe('ContextFamilyRunner', () => {
  it('calls LLM with system prompt from agentDef.context', async () => {
    const def = { ...baseAgentDef, context: 'You are a helpful assistant', agentType: 'context' };
    await runner.run(def, ctx, { content: 'Hello' });
    
    expect(mockLlmService.call).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'You are a helpful assistant',
        userMessage: 'Hello'
      })
    );
  });

  it('passes ExecutionContext whole to LLM service', async () => {
    await runner.run(agentDef, ctx, data);
    expect(mockLlmService.call).toHaveBeenCalledWith(
      expect.objectContaining({ context: ctx })
    );
  });

  it('returns outputType from agentDef', async () => {
    const def = { ...baseAgentDef, outputType: 'markdown' };
    const result = await runner.run(def, ctx, data);
    expect(result.output.outputType).toBe('markdown');
  });
});
```

### RAG Family Runner

```typescript
describe('RagFamilyRunner', () => {
  it('searches vector store with user content as query', async () => {
    await runner.run(ragAgentDef, ctx, { content: 'search query' });
    expect(mockEmbeddingService.search).toHaveBeenCalledWith(
      'search query',
      ragAgentDef.collectionSlug,
      expect.any(Number)
    );
  });

  it('throws when collectionSlug is missing', async () => {
    const def = { ...ragAgentDef, collectionSlug: undefined };
    await expect(runner.run(def, ctx, data)).rejects.toThrow();
  });

  it('throws when vector store returns empty results', async () => {
    mockEmbeddingService.search.mockResolvedValue([]);
    // Should throw or return meaningful error — not silent empty
    await expect(runner.run(ragAgentDef, ctx, data)).rejects.toThrow();
  });

  it('combines vector results with LLM call', async () => {
    mockEmbeddingService.search.mockResolvedValue([{ content: 'chunk 1' }, { content: 'chunk 2' }]);
    const result = await runner.run(ragAgentDef, ctx, data);
    expect(mockLlmService.call).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining('chunk 1')
      })
    );
  });
});
```

### API Family Runner

```typescript
describe('ApiFamilyRunner', () => {
  it('calls external endpoint with correct method and auth', async () => {
    const def = {
      ...baseAgentDef,
      endpoint: 'https://api.example.com/data',
      authConfig: { type: 'bearer', token: 'secret' }
    };
    await runner.run(def, ctx, { content: '{}' });
    expect(mockHttpClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/data',
        headers: expect.objectContaining({ Authorization: 'Bearer secret' })
      })
    );
  });

  it('throws when external API returns non-2xx', async () => {
    mockHttpClient.request.mockResolvedValue({ status: 500, body: 'Internal Server Error' });
    await expect(runner.run(def, ctx, data)).rejects.toThrow();
  });

  it('does not call LLM when skipLlm is true', async () => {
    const def = { ...baseAgentDef, skipLlm: true };
    await runner.run(def, ctx, data);
    expect(mockLlmService.call).not.toHaveBeenCalled();
  });
});
```

## Transport Contract Assertions

Add to every controller test:

```typescript
function assertJsonRpc2Shape(result: unknown) {
  expect(result).toMatchObject({
    success: true,
    output: {
      content: expect.anything(),
      outputType: expect.stringMatching(/^(text|markdown|json|image|video|audio)$/)
    }
  });
}
```

## Error Propagation Checklist

When auditing a runner, check:
- [ ] Missing agent def → throws (not returns empty)
- [ ] LLM service error → propagates (not caught and swallowed)
- [ ] External API error → propagates (not fallback to empty string)
- [ ] Vector search failure → propagates (not returns `[]`)
- [ ] Missing required config (endpoint, collectionSlug) → throws early

## ExecutionContext Checklist

When auditing a runner, verify:
- [ ] `context` is passed to LLM service as the full object
- [ ] `context` is not destructured before passing
- [ ] `context.orgSlug`, `context.userId` are not extracted and re-assembled
- [ ] `context` appears in the `metadata` or `context` field of the response

## Common Test Failures and Fixes

**"Cannot read properties of undefined (reading 'agentType')"**  
→ `AgentDefinitionService.findBySlug` returned null. Add null check test.

**"Expected mock to be called but it wasn't"**  
→ The runner is calling a real instance, not the mock. Check DI tokens in `TestingModule`.

**"Response shape missing `outputType`"**  
→ Runner is returning raw LLM string without wrapping in `{ output: { content, outputType } }`.

**E2E: "relation does not exist"**  
→ Supabase not running or migrations not applied. Run `npm run db:migrate`.

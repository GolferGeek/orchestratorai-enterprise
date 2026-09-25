---
name: agents-invoke-test-skill
description: Testing patterns for the agents invoke layer (apps/api/src/agents/invoke) — InvokeDispatchService, the 5 family runners (context, rag, api, external, media), invoke controller, transport contract, ExecutionContext pass-through, and error propagation. Use when running, writing, or auditing tests for agent invocation.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Agents Invoke Test Skill

Testing knowledge for the agents invoke layer in `apps/api/src/agents/invoke/` (formerly the Compose product). Use this when running, writing, or improving tests for invoke dispatch or any family runner.

## Architecture Summary

Synchronous by default: one request, one typed response (plus an optional SSE stream path). No job queue, no LangGraph.

```
POST /invoke                      (POST /invoke/stream for SSE)
  → InvokeController              validateA2AInvokeRequest(body, user.id, orgSlug)
  → InvokeDispatchService.invoke(context, data, metadata)
      ensureConversation(context)          ← ownership check / create
      emitInvocationEvent 'invocation.started'
      AgentDefinitionService.resolve(agentSlug, orgSlug)
      runners.get(definition.agentType).invoke(definition, context, data, metadata)
      persistMessages(...)                 ← fails closed
      emitInvocationEvent 'invocation.completed' | 'invocation.failed'
  → { jsonrpc: '2.0', id, result: { success: true, output: { content, outputType, metadata? }, context } }
```

Runners register themselves in `runners/family-runners.module.ts` (`onModuleInit` → `dispatch.registerRunner(family, runner)`). Ambient triggers and workflows call the same `InvokeDispatchService.invoke()` in-process.

## Running Tests

Unit tests are colocated `*.spec.ts` files; jest config is `apps/api/jest.config.mjs` (`rootDir: src`).

```bash
# Whole invoke layer
cd apps/api && npx jest agents/invoke 2>&1 | tail -20

# One file
cd apps/api && npx jest agents/invoke/invoke-dispatch 2>&1 | tail -20

# Coverage for the invoke layer
cd apps/api && npx jest agents/invoke --coverage --collectCoverageFrom='agents/invoke/**/*.ts' --coverageReporters=text-summary 2>&1 | tail -20

# All API unit tests
cd apps/api && npm test
```

HTTP-level integration tests live in `tests/integration/` and need a running API (port 6700) plus Supabase (`npm run dev:all`); run from repo root with `npm run test:integration`. `03-ambient-secure-boundaries.spec.ts` covers JSON-RPC validation on `/ambient/invoke` and `/secure-conversations/invoke`.

## Source → Spec Map (`apps/api/src/agents/invoke/`)

| Source | Spec |
|--------|------|
| `invoke-dispatch.service.ts` | `invoke-dispatch.service.spec.ts` |
| `invoke.controller.ts` | `invoke.controller.spec.ts` |
| `agent-definition.service.ts` | `agent-definition.service.spec.ts` |
| `conversations.service.ts` | `conversations.service.spec.ts` |
| `runners/context-family.runner.ts` | `runners/context-family.runner.spec.ts` |
| `runners/api-family.runner.ts` | `runners/api-family.runner.spec.ts` |
| `runners/external-family.runner.ts` | `runners/external-family.runner.spec.ts` |
| `runners/media-family.runner.ts` | `runners/media-family.runner.spec.ts` |
| `runners/rag-family.runner.ts` | only `runners/execution-context-model-routing.spec.ts` (model routing) — **no dedicated spec yet** |
| `providers-models.service.ts` | none |

## Test Setup Pattern

Specs construct classes directly with plain mocks (no `TestingModule`), mock the plane module so the Symbol import resolves, and use `createMockExecutionContext()`:

```typescript
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { AgentDefinition } from '../agent-definition.types';

jest.mock('@orchestratorai/planes/llm', () => ({
  LLM_SERVICE: Symbol('LLM_SERVICE'),
}));

import { ApiFamilyRunner } from './api-family.runner';

const definition: AgentDefinition = {
  id: 'api-agent', slug: 'api-agent', name: 'API Agent',
  agentType: 'api', status: 'active', outputType: 'text',
  endpoint: 'https://api.example.test/invoke',
};

const http = { request: jest.fn() };
const llm = { generateUnifiedResponse: jest.fn() };
const outboundUrls = { assertSafe: jest.fn() };
const runner = new ApiFamilyRunner(http as never, llm as never, outboundUrls as never);
```

`InvokeDispatchService` takes `(agentDefs, observability, database)`; mock `database.from(schema, table)` to return chainable builders for `conversations` and `conversation_messages`, then `service.registerRunner('context', runner)`.

## What Each Unit Must Prove

### InvokeDispatchService
- Rejects a conversation owned by another user or org **before** the runner runs
- Creates a missing conversation with an insert (no ownership-overwriting upsert)
- Persists user + assistant messages before returning; persistence failure propagates and emits `invocation.failed`
- Throws `Agent not found: <slug>` / `No runner for agent family: <type>`; never falls back
- `invokeStream` throws when the runner has no `invokeStream` (no silent sync substitute)

### Family runners
| Runner | Deps (constructor order) | Key behaviors |
|--------|--------------------------|---------------|
| `ContextFamilyRunner` | `LLM_SERVICE`, pdf/docx/text extractors | `definition.context` as system prompt; image attachments go to `generateResponse` (vision); text path uses `generateUnifiedResponse` |
| `RagFamilyRunner` | `LLM_SERVICE`, `CollectionsService`, `QueryService` | Throws on missing `collectionSlug`, empty message, or inaccessible collection; **zero results returns a text output with `metadata.noResults: true`** (not an error) |
| `ApiFamilyRunner` | `HttpService`, `LLM_SERVICE`, `OutboundUrlValidatorService` | `assertSafe()` before the request, `maxRedirects: 0`; non-200 throws without echoing the upstream body; LLM formatting only when `definition.context` is set |
| `ExternalFamilyRunner` | `HttpService`, `OutboundUrlValidatorService` | JSON-RPC call; rejects mismatched response `id`, unsupported `outputType`, private endpoints |
| `MediaFamilyRunner` | `LLM_SERVICE`, `MEDIA_STORAGE_PROVIDER`, `OutboundUrlValidatorService` | `generateImage` / `generateVideo` + `pollVideoStatus`; stores bytes; blocks private-network download URLs |

`OutboundUrlValidatorService` lives in `apps/api/src/secure-conversations/security/`.

### InvokeController
- Full JSON-RPC envelope validated; context passed whole
- `userId` ≠ authenticated user → error; context org ≠ RBAC org → error
- Dispatcher error details are not exposed (sync and stream)

## ExecutionContext Assertions

LLM calls receive the capsule inside `options.executionContext`, and provider/model come from the context, not the definition:

```typescript
const context = Object.freeze(createMockExecutionContext());
await runner.invoke(definition, context, { content: 'hello' });

expect(llm.generateUnifiedResponse).toHaveBeenCalledWith(
  expect.objectContaining({
    provider: context.provider,
    model: context.model,
    options: expect.objectContaining({ executionContext: context }),
  }),
);
```

Freezing the context catches any runner that mutates it. Checklist:
- [ ] Context passed whole (same reference), never destructured and re-assembled
- [ ] `provider`/`model` taken from `context`, not `definition.llmConfig`
- [ ] Controller result echoes `context`

## Transport Contract Assertion

```typescript
function assertInvokeOutput(output: unknown) {
  expect(output).toMatchObject({
    content: expect.anything(),
    outputType: expect.stringMatching(/^(text|markdown|json|image|video|audio|artifact-ref)$/),
  });
}
```

## Error Propagation Checklist

- [ ] Missing agent definition / unknown family → throws
- [ ] LLM error → propagates (not swallowed)
- [ ] External/API HTTP error → propagates (no empty-string fallback)
- [ ] Missing required config (`endpoint`, `collectionSlug`) → throws early
- [ ] Message persistence failure → invocation fails
- [ ] RAG no-results → explicit `noResults` output, never a silent empty string

## Common Test Failures

**`Cannot find module .../packages/transport-types/dist/cjs/index.js`**
→ Jest maps `@orchestrator-ai/transport-types` to the built CJS output. Run `npm run build` in `packages/transport-types`.

**`LLM_SERVICE` is undefined / Nest import errors in a runner spec**
→ Add the `jest.mock('@orchestratorai/planes/llm', ...)` block before importing the runner.

**"Expected mock to be called but it wasn't"**
→ Constructor argument order is wrong; check the runner's constructor against the table above.

**Dispatch test hangs or throws on `.eq` / `.single`**
→ The `database.from()` mock isn't returning a chainable builder for that table.

---
name: execution-context-skill
description: Enforce the ExecutionContext "capsule" pattern throughout the codebase. ExecutionContext is a complete context object (orgSlug, userId, conversationId, agentSlug, agentType, provider, model, sovereignMode?) that must be passed as a whole, never as individual fields. Use when reviewing code that deals with user context, agent execution, LLM calls, or observability.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Execution Context Skill

This skill enforces the **ExecutionContext "capsule" pattern** — a critical architectural principle that ensures consistent observability and prevents context loss throughout the system.

## Core Principle: The Capsule

**ExecutionContext is a complete, immutable "capsule"** that contains all context needed for any operation. It must **always be passed as a whole**, never as individual fields.

### THE SHAPE IS FROZEN — DO NOT ADD FIELDS

The ExecutionContext interface is **frozen**. Do not add fields. Do not access fields that do not exist in this interface. If you find code accessing `context.taskId`, `context.planId`, or `context.deliverableId`, it is **WRONG** — those are product-local concerns, not part of the shared context.

### The Capsule Contents

```typescript
export interface ExecutionContext {
  orgSlug: string;           // Organization identifier
  userId: string;            // User ID (from auth)
  conversationId: string;    // Conversation ID
  agentSlug: string;         // Agent identifier
  agentType: string;         // Agent type (context, api, external, etc.)
  provider: string;          // LLM provider (or NIL_UUID)
  model: string;             // LLM model (or NIL_UUID)
  sovereignMode?: boolean;   // Optional sovereign mode flag
}
```

**Location:** `packages/transport-types/invocation/execution-context.ts`

**Key Constants:**
- `NIL_UUID = '00000000-0000-0000-0000-000000000000'` — Used for optional fields

### What Is NOT in ExecutionContext

`taskId`, `planId`, and `deliverableId` are **product-local concerns** — they are NOT part of the shared ExecutionContext. Individual products may track these in their own state, but they do not flow through the transport contract.

## Why This Pattern Exists

1. **Observability Consistency**: All events have complete context (userId, conversationId, etc.)
2. **Future-Proof**: When a new field is needed, it's already in the capsule
3. **Prevents Context Loss**: No risk of missing fields when passing between layers
4. **Simplifies APIs**: One parameter instead of many individual fields

## The Flow

### Front-End (Creation)
1. **Created once** when a conversation is selected (`useExecutionContextStore().initialize()`), and frozen
2. **Replaced, never mutated**: the only updates are the store's `setLLM()`, `setAgent()`, `setConversation()` and `setSovereignMode()`, each of which swaps in a new frozen capsule
3. **Passed with every invoke**: `executionContextStore.current` goes in `params.context`
4. **Product-local IDs live beside it**: the store keeps `taskId`/`planId`/`deliverableId` in separate refs, not in the capsule

### Back-End (Reception)
1. **Received from front-end** in every invoke request
2. **Validated**: `validateA2AInvokeRequest(body, user.id, orgSlug)` rejects unknown context keys, a `userId` that doesn't match the auth token, and an `orgSlug` outside the caller's org
3. **Passes through**: Every service, LLM call, observability event receives the full capsule

### Ambient Exception: System-Triggered Context

Ambient automation (`apps/api/src/ambient`) is the **only** sanctioned backend origin of an ExecutionContext, because triggers and scheduled workflows have no frontend user. It must go through `createSystemTriggeredContext()`; callers today are `ambient/services/trigger-executor.service.ts` and `ambient/workflows/workflow-executor.service.ts`.

```typescript
// ONLY in ambient automation — no frontend user
const context = createSystemTriggeredContext({
  orgSlug: trigger.org_slug,
  agentSlug: trigger.action_config.agentSlug,
  provider,          // from trigger config or DEFAULT_LLM_PROVIDER, never hardcoded
  model,             // from trigger config or DEFAULT_LLM_MODEL
  conversationId: randomUUID(), // optional; defaults to NIL_UUID
});
// Result: userId = NIL_UUID, agentType = 'system'
```

Use `isSystemTriggered(context)` to tell these apart from user-originated contexts, and `validateSystemContext(context)` to check one.

## Workflows with per-role models

Workflow steps call models through `WorkflowLlmClient.callForRole(scope, role, request)`,
which passes the role's provider/model (from the run's profile snapshot)
explicitly and the context whole. A context whose `provider/model` differ
from the model a step used is expected there, not a bug. Rebuilding or
spreading the context to swap the model is still a violation. See
`docs/architecture/llm-boundary.md`, "Per-role models in workflows".

## Anti-Patterns to Catch

### DON'T: Pass Individual Fields

```typescript
// BAD — Cherry-picking fields
async handleInvoke(
  userId: string,
  conversationId: string,
  dto: InvokeDto
): Promise<InvokeOutput>

// GOOD — Pass the whole capsule
async handleInvoke(
  context: ExecutionContext,
  dto: InvokeDto
): Promise<InvokeOutput>
```

### DON'T: Extract Fields Before Passing

```typescript
// BAD — Extracting fields
const userId = context.userId;
const conversationId = context.conversationId;
await service.doSomething(userId, conversationId);

// GOOD — Pass the whole capsule
await service.doSomething(context);
```

### DON'T: Construct ExecutionContext in Backend

```typescript
// BAD — Creating context in backend (except ambient system triggers)
const context: ExecutionContext = {
  userId: request.user.id,
  conversationId: request.body.conversationId,
  // ... piecing together from different sources
};

// GOOD — Use context from request
const context = request.context; // Already complete from front-end
```

### DON'T: Modify ExecutionContext After Receiving

```typescript
// BAD — Mutating context
context.userId = newUserId;

// GOOD — Context is immutable once created
```

### DON'T: Use Individual Fields for Observability

```typescript
// BAD — Missing context
await observability.logEvent('invocation.started', {
  userId: someUserId,
  // Missing conversationId, orgSlug, etc.
});

// GOOD — Full context
await observability.logEvent(context, 'invocation.started', {
  // Additional event data
});
```

## Correct Patterns

### Front-End: Create Once, Pass Always

```typescript
// In executionContextStore.ts
function initialize(params: ExecutionContextInitParams): void {
  context.value = {
    orgSlug: params.orgSlug,
    userId: params.userId,
    conversationId: params.conversationId,
    agentSlug: params.agentSlug,
    agentType: params.agentType,
    provider: params.provider,
    model: params.model,
  };
}

// In invoke call — always include context
const response = await axios.post('/invoke', {
  jsonrpc: "2.0",
  method: "invoke",
  id: generateId(),
  params: {
    context: executionContextStore.current, // Full capsule
    data: { content: userMessage },
  },
});
```

### Back-End: Receive, Validate, Pass Through

```typescript
// In controller (see apps/api/src/agents/invoke/invoke.controller.ts)
const validation = validateA2AInvokeRequest(body, user.id, request.organizationSlug);
if (!validation.valid) {
  return { jsonrpc: '2.0', id: validation.id, error: { code: JsonRpcErrorCode.INVALID_PARAMS, message: validation.message } };
}

// Use context directly — it's already complete
const context = validation.request.params.context;

// Pass to services — always whole capsule
await this.service.handleInvocation(context, validation.request.params);
```

### Services: Take Context as First Parameter

```typescript
// In LLM Service
async generateResponse(
  context: ExecutionContext,
  systemPrompt: string,
  userMessage: string,
  options?: GenerateResponseOptions,
): Promise<string> {
  // Extract provider/model from context (but still pass full context)
  const provider = context.provider;
  const model = context.model;

  // Pass full context to observability
  await this.observabilityService.emitEvent(context, 'llm.started', {
    provider,
    model,
  });

  // Make LLM call with full context
  return await this.llmProvider.call(context, systemPrompt, userMessage);
}
```

## Common Violations to Find

When reviewing code, look for:

1. **Function signatures** taking `userId: string, conversationId: string` instead of `context: ExecutionContext`
2. **Destructuring** context to extract individual fields before passing to services
3. **Construction** of ExecutionContext objects in backend code (except `createSystemTriggeredContext()` in ambient)
4. **Observability calls** missing full context (only passing userId)
5. **LLM calls** without ExecutionContext parameter
6. **Service methods** that take individual fields instead of context
7. **Adding taskId/planId/deliverableId** to ExecutionContext (those are product-local)

## How to Fix Violations

### Step 1: Update Function Signature

```typescript
// Before
async createRecord(userId: string, conversationId: string, dto: CreateDto)

// After
async createRecord(context: ExecutionContext, dto: CreateDto)
```

### Step 2: Update Function Body

```typescript
// Before
const record = await this.repository.create({
  userId,
  conversationId,
  ...dto,
});

// After
const record = await this.repository.create({
  userId: context.userId,
  conversationId: context.conversationId,
  ...dto,
});
```

### Step 3: Update All Callers

```typescript
// Before
await this.service.createRecord(userId, conversationId, dto);

// After
await this.service.createRecord(context, dto);
```

## Integration with Other Skills

- **transport-types-skill**: Ensures invoke requests include ExecutionContext
- **planes-architecture-skill**: ExecutionContext flows through plane-injected services

## Related Files

- **Definition + helpers** (`createExecutionContext`, `createMockExecutionContext`, `isExecutionContext`, `NIL_UUID`): `packages/transport-types/invocation/execution-context.ts`
- **Front-End Store**: `apps/web/src/modules/agents/stores/executionContextStore.ts`
- **Invoke validation**: `apps/api/src/common/validation/a2a-invoke-validation.ts`
- **System-triggered context**: `apps/api/src/ambient/automation-context/automation-context.ts`

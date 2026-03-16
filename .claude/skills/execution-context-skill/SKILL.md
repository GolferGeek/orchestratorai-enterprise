---
name: execution-context-skill
description: Enforce the ExecutionContext "capsule" pattern throughout the codebase. ExecutionContext is a complete context object (orgSlug, userId, conversationId, agentSlug, agentType, provider, model, sovereignMode?) that must be passed as a whole, never as individual fields. Use when reviewing code that deals with user context, agent execution, LLM calls, or observability.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Execution Context Skill

This skill enforces the **ExecutionContext "capsule" pattern** — a critical architectural principle that ensures consistent observability and prevents context loss throughout the system.

## Core Principle: The Capsule

**ExecutionContext is a complete, immutable "capsule"** that contains all context needed for any operation. It must **always be passed as a whole**, never as individual fields.

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
1. **Created once** when conversation is selected (`executionContextStore.initialize()`)
2. **Immutable**: Front-end never mutates it (except `setLLM()` for model changes)
3. **Passed with every invoke**: Included in all invoke requests

### Back-End (Reception)
1. **Received from front-end** in every invoke request
2. **Validated**: Backend validates `userId` matches auth token
3. **Passes through**: Every service, LLM call, observability event receives the full capsule

### Pulse Exception: System-Triggered Context

Pulse is the **ONLY** backend that may construct an ExecutionContext, because automation triggers have no frontend user. Pulse uses `createSystemTriggeredContext()` to build an EC for system-initiated workflows. This is the sole exception to the "never construct in backend" rule.

```typescript
// ONLY in Pulse — system automation with no frontend user
const context = createSystemTriggeredContext({
  orgSlug: trigger.orgSlug,
  agentSlug: trigger.agentSlug,
  agentType: 'automation',
  provider: 'system',
  model: 'system',
});
```

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
// BAD — Creating context in backend (except Pulse system triggers)
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
// In controller
async handleInvoke(
  @Body() body: InvokeRequest,
  @CurrentUser() currentUser: SupabaseAuthUserDto,
): Promise<InvokeResponse> {
  // Validate context matches auth
  if (body.params.context.userId !== currentUser.id) {
    throw new UnauthorizedException('userId mismatch');
  }

  // Use context directly — it's already complete
  const context = body.params.context;

  // Pass to services — always whole capsule
  await this.service.handleInvocation(context, body.params.data);
  await this.observabilityService.emitEvent(context, 'invocation.started', {});
}
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
3. **Construction** of ExecutionContext objects in backend code (except Pulse system triggers)
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

- **Definition**: `packages/transport-types/invocation/execution-context.ts`
- **Front-End Store**: `apps/command/web/src/stores/executionContextStore.ts`

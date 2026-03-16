---
name: execution-context-skill
description: Enforce the ExecutionContext "capsule" pattern throughout the codebase. ExecutionContext is a complete context object (orgSlug, userId, conversationId, taskId, planId, deliverableId, agentSlug, agentType, provider, model) that must be passed as a whole, never as individual fields. Use when reviewing code that deals with user context, task execution, LLM calls, or observability.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Execution Context Skill

This skill enforces the **ExecutionContext "capsule" pattern** - a critical architectural principle that ensures consistent observability and prevents context loss throughout the system.

## Core Principle: The Capsule

**ExecutionContext is a complete, immutable "capsule"** that contains all context needed for any operation. It must **always be passed as a whole**, never as individual fields.

### The Capsule Contents

```typescript
export interface ExecutionContext {
  orgSlug: string;           // Organization identifier
  userId: string;            // User ID (from auth)
  conversationId: string;    // Conversation ID
  taskId: string;            // Task ID
  planId: string;           // Plan ID (NIL_UUID if none)
  deliverableId: string;    // Deliverable ID (NIL_UUID if none)
  agentSlug: string;        // Agent identifier
  agentType: string;        // Agent type (context, api, external, etc.)
  provider: string;         // LLM provider (or NIL_UUID)
  model: string;            // LLM model (or NIL_UUID)
}
```

**Key Constants:**
- `NIL_UUID = '00000000-0000-0000-0000-000000000000'` - Used for optional fields

## Why This Pattern Exists

1. **Observability Consistency**: All events have complete context (userId, conversationId, taskId, etc.)
2. **Future-Proof**: When a new field is needed, it's already in the capsule
3. **Prevents Context Loss**: No risk of missing fields when passing between layers
4. **Simplifies APIs**: One parameter instead of many individual fields

## The Flow

### Front-End (Creation)
1. **Created once** when conversation is selected (`executionContextStore.initialize()`)
2. **Generated upfront**: `taskId` and `conversationId` are generated on front-end
3. **Immutable**: Front-end never mutates it (except `setLLM()` for model changes)
4. **Passed with every transport**: Included in all A2A requests

### Back-End (Reception & Creation)
1. **Received from front-end** in every A2A request
2. **Validated**: Backend validates `userId` matches auth token
3. **Creates records**: If `conversationId` or `taskId` don't exist, backend creates them
4. **Updates capsule**: Backend may add `planId` or `deliverableId` and return updated capsule
5. **Passes through**: Every service, runner, LLM call, observability event receives the full capsule

### LangGraph (Workflow Execution)
1. **Received in state**: ExecutionContext is part of LangGraph state annotation
2. **Passed to services**: LLM calls and observability events receive full context
3. **Never constructed**: LangGraph never creates ExecutionContext, only receives it

## Anti-Patterns to Catch

### DON'T: Pass Individual Fields

```typescript
// BAD - Cherry-picking fields
async createTask(
  userId: string,
  conversationId: string,
  taskId: string,
  dto: CreateTaskDto
): Promise<Task>

// GOOD - Pass the whole capsule
async createTask(
  context: ExecutionContext,
  dto: CreateTaskDto
): Promise<Task>
```

### DON'T: Extract Fields Before Passing

```typescript
// BAD - Extracting fields
const userId = context.userId;
const conversationId = context.conversationId;
await service.doSomething(userId, conversationId);

// GOOD - Pass the whole capsule
await service.doSomething(context);
```

### DON'T: Construct ExecutionContext in Backend

```typescript
// BAD - Creating context in backend
const context: ExecutionContext = {
  userId: request.user.id,
  conversationId: request.body.conversationId,
  // ... piecing together from different sources
};

// GOOD - Use context from request
const context = request.context; // Already complete from front-end
```

### DON'T: Modify ExecutionContext After Receiving

```typescript
// BAD - Mutating context
context.userId = newUserId;
context.taskId = newTaskId;

// GOOD - Context is immutable (except backend updates to planId/deliverableId)
// If you need a new taskId, front-end generates it with newTaskId()
```

### DON'T: Use Individual Fields for Observability

```typescript
// BAD - Missing context
await observability.logEvent('task.started', {
  userId: someUserId,
  taskId: someTaskId,
  // Missing conversationId, orgSlug, etc.
});

// GOOD - Full context
await observability.logEvent(context, 'task.started', {
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
    taskId: params.taskId ?? generateUUID(),
    planId: params.planId ?? NIL_UUID,
    deliverableId: params.deliverableId ?? NIL_UUID,
  };
}

// In A2A orchestrator - always include context
const response = await axios.post('/agents/.../tasks', {
  context: executionContextStore.current, // Full capsule
  message: { text: userMessage },
  mode: 'converse',
});
```

### Back-End: Receive, Validate, Pass Through

```typescript
// In controller
async executeTask(
  @Body() body: FrontendTaskRequest,
  @CurrentUser() currentUser: SupabaseAuthUserDto,
): Promise<TaskResponseDto> {
  // Validate context matches auth
  if (body.context.userId !== currentUser.id) {
    throw new UnauthorizedException('userId mismatch');
  }

  // Use context directly - it's already complete
  const context = body.context;

  // Pass to services - always whole capsule
  await this.tasksService.getOrCreateTask(context, ...);
  await this.llmService.generateResponse(context, prompt, options);
  await this.observabilityService.emitEvent(context, 'task.started', {});
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

### LangGraph: Receive in State, Pass to Services

```typescript
// In LangGraph state annotation
export const DataAnalystStateAnnotation = Annotation.Root({
  executionContext: Annotation<ExecutionContext>({
    reducer: (_, next) => next,
    default: () => ({ /* placeholder */ }),
  }),
  // ... other fields
});

// In graph node
async function startNode(state: DataAnalystState): Promise<Partial<DataAnalystState>> {
  const ctx = state.executionContext; // Get from state

  // Pass full context to services
  await observability.emitStarted(ctx, ctx.taskId, 'Starting analysis');
  const response = await llmClient.callLLM({
    context: ctx, // Full capsule
    userMessage: state.userMessage,
    callerName: 'data-analyst',
  });

  return { status: 'discovering' };
}
```

## Common Violations to Find

When reviewing code, look for:

1. **Function signatures** taking `userId: string, conversationId: string` instead of `context: ExecutionContext`
2. **Destructuring** context to extract individual fields before passing to services
3. **Construction** of ExecutionContext objects in backend code
4. **Observability calls** missing full context (only passing userId or taskId)
5. **LLM calls** without ExecutionContext parameter
6. **Service methods** that take individual fields instead of context

## How to Fix Violations

### Step 1: Update Function Signature

```typescript
// Before
async createTask(userId: string, conversationId: string, dto: CreateTaskDto)

// After
async createTask(context: ExecutionContext, dto: CreateTaskDto)
```

### Step 2: Update Function Body

```typescript
// Before
const task = await this.repository.create({
  userId,
  conversationId,
  ...dto,
});

// After
const task = await this.repository.create({
  userId: context.userId,
  conversationId: context.conversationId,
  ...dto,
});
```

### Step 3: Update All Callers

```typescript
// Before
await this.tasksService.createTask(userId, conversationId, dto);

// After
await this.tasksService.createTask(context, dto);
```

## Integration with Other Skills

- **transport-types-skill**: Ensures A2A requests include ExecutionContext
- **quality-gates-skill**: Checks for ExecutionContext violations during PR review
- **codebase-hardening-skill**: Audits codebase for ExecutionContext violations

## Related Files

- **Definition**: `packages/transport-types/core/execution-context.ts`
- **Front-End Store**: `apps/command/web/src/stores/executionContextStore.ts`
- **LangGraph State**: `apps/*/langgraph/src/hitl/hitl-base.state.ts`

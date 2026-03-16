---
name: langgraph-development-skill
description: Prescriptive patterns for building LangGraph workflows that integrate with OrchestratorAI Enterprise. Enforces ExecutionContext flow, HITL patterns, observability, and LLM service integration. Use when building or reviewing LangGraph workflows, agents, or graph nodes.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# LangGraph Development Skill

This skill enforces **prescriptive patterns** for building LangGraph workflows that integrate seamlessly with OrchestratorAI Enterprise's architecture. It ensures ExecutionContext flows correctly, HITL (Human-in-the-Loop) is implemented properly, and all LangGraph constructs are used correctly.

## Core Principle: Framework-Agnostic Integration

LangGraph workflows are **framework-agnostic** - they don't directly access the database or create entities. Instead, they:
1. **Receive ExecutionContext** from the API Runner
2. **Call back to the API** for LLM requests and observability
3. **Return structured results** that the API Runner processes
4. **Use checkpoints** for state persistence and HITL

**NEVER** construct ExecutionContext in LangGraph. **NEVER** access the database directly. **ALWAYS** pass the whole ExecutionContext capsule to services.

## ExecutionContext Flow

### CORRECT: ExecutionContext in State

```typescript
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { ExecutionContext } from "@orchestratorai/transport-types";

export const MyAgentStateAnnotation = Annotation.Root({
  // Include message history
  ...MessagesAnnotation.spec,

  // ExecutionContext - the core context capsule
  executionContext: Annotation<ExecutionContext>({
    reducer: (_, next) => next,
    default: () => ({
      orgSlug: "", userId: "", conversationId: "", taskId: "",
      planId: NIL_UUID, deliverableId: NIL_UUID,
      agentSlug: "", agentType: "", provider: "", model: "",
    }),
  }),

  // Agent-specific fields...
});
```

### CORRECT: Accessing ExecutionContext in Nodes

```typescript
async function myNode(state: MyAgentState): Promise<Partial<MyAgentState>> {
  const ctx = state.executionContext; // Get the whole capsule

  // Use ctx for all services
  await observability.emitProgress(ctx, ctx.taskId, "Processing...");
  const result = await llmClient.callLLM({
    context: ctx, // Pass whole capsule
    userMessage: "...",
    systemMessage: "...",
  });

  return { /* updated state */ };
}
```

### WRONG: Constructing or Cherry-Picking Context

```typescript
// BAD - Constructing context
const newContext: ExecutionContext = {
  orgSlug: '...', userId: '...', // DON'T DO THIS
};

// BAD - Cherry-picking fields
await service.call(userId, taskId, conversationId); // DON'T DO THIS

// GOOD - Pass whole capsule
await service.call(ctx); // DO THIS
```

## LangGraph Core Constructs

### StateGraph Builder Pattern

```typescript
import { StateGraph, END, interrupt } from "@langchain/langgraph";

export function createMyAgentGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
) {
  async function startNode(state: MyAgentState): Promise<Partial<MyAgentState>> {
    const ctx = state.executionContext;
    await observability.emitStarted(ctx, ctx.taskId, "Starting...");
    return { status: "processing", startedAt: Date.now() };
  }

  const graph = new StateGraph(MyAgentStateAnnotation)
    .addNode("start", startNode)
    .addNode("process", processNode)
    .addNode("finalize", finalizeNode)
    .addEdge("__start__", "start")
    .addEdge("start", "process")
    .addConditionalEdges("process", (state) => {
      if (state.error) return "handle_error";
      return "finalize";
    })
    .addEdge("finalize", END);

  return graph.compile({
    checkpointer: checkpointer.getSaver(),
  });
}
```

### Node Functions

**Pattern:**
- Nodes are `async` functions that take `state` and return `Partial<State>`
- Always extract `executionContext` from state first
- Use `executionContext` for all service calls
- Return partial state updates

```typescript
async function processNode(
  state: MyAgentState,
): Promise<Partial<MyAgentState>> {
  const ctx = state.executionContext;

  await observability.emitProgress(ctx, ctx.taskId, "Processing...");

  const result = await llmClient.callLLM({
    context: ctx,
    userMessage: state.userMessage,
    systemMessage: "You are a helpful assistant.",
  });

  return {
    result: result.text,
    messages: [
      ...state.messages,
      new AIMessage(result.text),
    ],
  };
}
```

## Human-in-the-Loop (HITL) Patterns

### HITL State Annotation

```typescript
import { HitlBaseStateAnnotation } from "../../hitl/hitl-base.state";

export const MyAgentStateAnnotation = Annotation.Root({
  ...HitlBaseStateAnnotation.spec, // Includes ExecutionContext + HITL fields
  // Agent-specific fields...
});
```

### Interrupt Node

```typescript
async function hitlInterruptNode(
  state: MyAgentState,
): Promise<Partial<MyAgentState>> {
  const ctx = state.executionContext;

  await observability.emitHitlWaiting(
    ctx,
    ctx.taskId,
    state.pendingContent,
    "Awaiting human review",
  );

  // interrupt() pauses the graph here
  const hitlResponse = interrupt({
    reason: "human_review",
    nodeName: "hitl_interrupt",
    content: state.pendingContent,
    message: "Please review before continuing",
  }) as HitlResponse | undefined;

  if (!hitlResponse) {
    return { hitlPending: true, status: "hitl_waiting" };
  }

  const { decision, feedback, editedContent } = hitlResponse;
  return {
    hitlPending: false,
    hitlDecision: decision,
    hitlFeedback: feedback || null,
    content: editedContent || state.content,
    status: decision === "reject" ? "rejected" : "processing",
  };
}
```

### Resuming from HITL

```typescript
import { Command, isGraphInterrupt } from "@langchain/langgraph";

async function generate(input: MyAgentInput): Promise<MyAgentResult> {
  try {
    const result = await this.graph.invoke(initialState, {
      configurable: { thread_id: input.context.taskId },
    });
    // ... handle success
  } catch (error) {
    if (isGraphInterrupt(error)) {
      const state = await this.graph.getState({
        configurable: { thread_id: input.context.taskId },
      });
      return {
        taskId: input.context.taskId,
        status: "hitl_waiting",
        pendingContent: state.values.pendingContent,
      };
    }
    throw error;
  }
}

async function resume(taskId: string, response: HitlResponse): Promise<MyAgentResult> {
  const result = await this.graph.invoke(
    new Command({ resume: response }),
    { configurable: { thread_id: taskId } },
  );
  // ... handle resumed execution
}
```

## Service Integration

### LLM Service Calls

```typescript
const result = await llmClient.callLLM({
  context: state.executionContext, // Full capsule
  userMessage: state.userMessage,
  systemMessage: "You are a helpful assistant.",
  temperature: 0.7,
  maxTokens: 3500,
  callerName: "my_agent_node",
});
```

### Observability Events

```typescript
// Started
await observability.emitStarted(ctx, ctx.taskId, "Workflow started");

// Progress
await observability.emitProgress(ctx, ctx.taskId, "Processing step 2 of 5", {
  step: "process_data",
  progress: 40,
});

// HITL
await observability.emitHitlWaiting(ctx, ctx.taskId, state.pendingContent, "Awaiting review");

// Completed
await observability.emitCompleted(ctx, ctx.taskId, { result: state.result }, Date.now() - state.startedAt);
```

## Checkpointing

```typescript
// In graph creation
return graph.compile({
  checkpointer: checkpointer.getSaver(),
});

// When invoking - use taskId as thread_id
const config = {
  configurable: {
    thread_id: context.taskId,
  },
};

const result = await graph.invoke(initialState, config);
```

## Anti-Patterns to Avoid

1. **Constructing ExecutionContext in LangGraph** - Context must come from API Runner
2. **Cherry-picking context fields** - Always pass whole `ExecutionContext` capsule
3. **Direct database access** - LangGraph is framework-agnostic
4. **Hardcoding provider/model** - Provider/model come from `ExecutionContext`
5. **Skipping observability events** - Emit events at all key workflow points
6. **Not using checkpointer** - All graphs must use checkpointer
7. **Incorrect HITL patterns** - Must emit `emitHitlWaiting` before `interrupt()`

## Integration with Other Skills

- **execution-context-skill**: Ensures ExecutionContext flows correctly
- **transport-types-skill**: Ensures A2A compliance for agent endpoints
- **langgraph-architecture-skill**: File classification and architecture patterns

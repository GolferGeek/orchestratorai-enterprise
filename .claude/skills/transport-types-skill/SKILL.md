---
name: transport-types-skill
description: Enforce A2A (Agent-to-Agent) protocol compliance and transport type contracts. All agent communication MUST follow JSON-RPC 2.0 invoke format with strict transport type adherence. Use when reviewing code that makes or handles agent calls, API endpoints for agents, or when ensuring A2A protocol compliance.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Transport Types & A2A Compliance Skill

This skill enforces **A2A (Agent-to-Agent) protocol compliance** and ensures all agent calls follow the strict transport type contracts defined in `@orchestrator-ai/transport-types`.

## Core Principle: Transport Types Are the Contract

**Transport types define the API contract between frontend and backend.** They MUST be followed exactly. Any deviation breaks A2A compliance and can cause system-wide failures.

### THE CONTRACT IS FROZEN

The invoke contract shape is frozen. Do not add mode/action routing. Do not add converse/plan/build methods. The single `invoke` method is the transport primitive:
- Method: `invoke`
- Params: `{ context: ExecutionContext, data: InvokeData, metadata? }`
- Result: `{ success: true, output: InvokeOutput, metadata?, context? }`

Any code that uses `mode.action` patterns, `converse`, `plan`, or `build` as transport methods is **WRONG**.

### Critical Rules

1. **NEVER modify transport types** without updating both frontend and backend
2. **NEVER add custom fields** to transport type payloads
3. **NEVER skip required fields** in transport types
4. **ALWAYS use types from `@orchestrator-ai/transport-types`** package
5. **ALWAYS validate** transport types at API boundaries

## What Are Transport Types?

Transport types are **shared TypeScript types** in `packages/transport-types/` that define:
- JSON-RPC 2.0 request/response structure with `invoke` method
- ExecutionContext (the context capsule)
- InvokeData and InvokeOutput typed payloads
- StreamEvent types for SSE streaming
- CapabilityCard and WellKnownListing for agent discovery

**Package:** `@orchestrator-ai/transport-types`
**Location:** `packages/transport-types/`

## Invoke Protocol Structure

All product endpoints use **JSON-RPC 2.0** format with the `invoke` method:

**Request:**
```typescript
{
  jsonrpc: "2.0",        // MUST be exactly "2.0"
  method: "invoke",      // ALWAYS "invoke" — no mode/action matrix
  id: string | number | null,
  params: {
    context: ExecutionContext,           // REQUIRED
    data: InvokeData,                   // REQUIRED
    metadata?: Record<string, unknown>  // OPTIONAL
  }
}
```

**InvokeData:**
```typescript
{
  content: unknown,          // The business payload
  contentType?: ContentType  // 'text' | 'markdown' | 'json' | 'arguments' | 'binary-ref'
}
```

**Success Response:**
```typescript
{
  jsonrpc: "2.0",
  id: string | number | null,
  result: {
    success: true,
    output: InvokeOutput,
    metadata?: Record<string, unknown>,
    context?: ExecutionContext
  }
}
```

**InvokeOutput:**
```typescript
{
  content: unknown,                    // The business result
  outputType: OutputType,              // 'text' | 'markdown' | 'json' | 'image' | 'video' | 'audio' | 'artifact-ref'
  metadata?: Record<string, unknown>   // Output-specific metadata
}
```

**Error Response:**
```typescript
{
  jsonrpc: "2.0",
  id: string | number | null,
  error: {
    code: number,              // use JsonRpcErrorCode / A2AErrorCode
    message: string,
    data?: { errorType?: string, retryable?: boolean, details?: Record<string, unknown> }
  }
}
```

## Streaming

`StreamEvent` is `{ event, requestId, context, data?, metadata?, timestamp? }`; `context` is the full capsule, never partial. `event` is one of:
- `started` — invocation has begun
- `chunk` — incremental content (`ChunkEventData`)
- `progress` — progress update (`ProgressEventData`)
- `output` — structured partial output (`OutputEventData`)
- `completed` — stream finished
- `error` — stream error (`ErrorEventData`)

`TypedStreamEvent` is the discriminated union; the observability plane owns emission.

## Discovery

- `CapabilityCard` — describes what an agent/capability can do (`isCapabilityCard()` guard)
- `WellKnownListing` / `WellKnownEntry` — lightweight listing of discoverable capabilities
- Modules serve their own card at `/<module>/.well-known/agent.json` (today: `ambient`, `secure-conversations`)

## When Transport Types Apply

### MUST Use Transport Types

- **All agent invocations** (frontend → backend `POST /invoke`, `POST /invoke/stream`, and module endpoints such as `POST /ambient/invoke`)
- **All inter-product A2A calls** (product → product via invoke)
- **All external agent calls** (calling other A2A-compatible agents)
- **All SSE streaming events** (StreamEvent types)
- **All capability discovery** (CapabilityCard, WellKnownListing)

### DON'T Use Transport Types

- **Non-invoke endpoints** (e.g., `/api/conversations`, `/api/users` — regular REST endpoints)
- **Front-end data fetching** (e.g., getting conversation list, user profile)
- **Internal service-to-service calls** (within backend, not A2A protocol)
- **Database queries** (direct database access)

**Key Distinction:** If it's an **agent invocation**, it MUST use transport types. If it's just **data retrieval** for the UI, it can use regular REST.

## Common Violations to Find

When reviewing code, look for:

1. **Custom fields** in payloads not defined in transport types
2. **Missing required fields** in invoke requests/responses
3. **Wrong JSON-RPC structure** (missing `jsonrpc: "2.0"`, wrong field names)
4. **Missing ExecutionContext** in request params
5. **Using mode/action routing** instead of the single `invoke` method
6. **Using transport types for non-invoke endpoints** (regular REST endpoints)
7. **Modifying transport types** without coordinating with frontend/backend
8. **Type assertions** that bypass transport type validation
9. **Custom response formats** instead of JSON-RPC structure with InvokeOutput

## Quick Reference

**Import transport types:**
```typescript
import type {
  ExecutionContext,
  A2AInvokeRequest,
  A2AInvokeResponse,
  InvokeData,
  InvokeOutput,
  OutputType,
  StreamEvent,
  CapabilityCard,
  WellKnownListing,
} from '@orchestrator-ai/transport-types';
import {
  isA2AInvokeRequest,
  JsonRpcErrorCode,
} from '@orchestrator-ai/transport-types';
```

**Validate at the API boundary:** `validateA2AInvokeRequest()` in `apps/api/src/common/validation/a2a-invoke-validation.ts` (shape, method, context keys, userId/org match).

## Integration with Other Skills

- **execution-context-skill**: Ensures ExecutionContext is always included in invoke requests
- **planes-architecture-skill**: Shared infrastructure provider planes

## Related Files

- **Package entry (all exports + type guards)**: `packages/transport-types/index.ts`
- **ExecutionContext**: `packages/transport-types/invocation/execution-context.ts`
- **Output / content types**: `packages/transport-types/invocation/output-types.ts`
- **Invoke request / response**: `packages/transport-types/a2a/request.types.ts`, `packages/transport-types/a2a/response.types.ts`
- **Stream types**: `packages/transport-types/a2a/stream.types.ts`
- **Capability card**: `packages/transport-types/discovery/agent-card.types.ts`
- **Well-known listing**: `packages/transport-types/discovery/well-known.types.ts`
- **Error codes**: `packages/transport-types/shared/enums.ts`

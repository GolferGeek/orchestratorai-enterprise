# Invoke Contract V2

## Purpose

Define the shared A2A invocation request and response contract for `transport-types v2`.

## Core Definition

The platform should move to a single shared `invoke` contract.

That contract should be:

- JSON-RPC 2.0
- A2A-first
- product-neutral
- typed-output oriented
- compatible with `Compose`, `Forge`, `Bridge`, and `Pulse`

It should replace the old mode-heavy request model centered on:

- `converse`
- `plan`
- `build`
- mode/action-specific payload branching

## Why V2 Exists

The old contract carries too much framework-era complexity in the shared layer:

- `mode`
- `payload.action`
- `planId`
- orchestration-specific IDs
- payload structures that vary primarily because of one product's history

That is the wrong center for the shared A2A package.

The new center should be:

- invoke one capability
- provide one execution context
- send one data payload
- receive one typed result envelope

## JSON-RPC Shape

The shared contract should remain JSON-RPC 2.0:

```typescript
interface A2AInvokeRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: 'invoke';
  params: InvokeParams;
}
```

The shared success response should be:

```typescript
interface A2AInvokeSuccessResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result: InvokeResult;
}
```

The shared error response should be:

```typescript
interface A2AInvokeErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: InvokeError;
}
```

## Method Direction

The shared method should be a simple invocation method such as:

- `invoke`

That is preferable to preserving a large matrix such as:

- `converse`
- `plan`
- `build`
- `hitl.resume`
- `tasks.*`

Product-specific workflows can still exist, but they should not define the shared transport core.

## Request Parameters

The request params should be small and intentional.

The likely direction is:

```typescript
interface InvokeParams {
  context: ExecutionContextV2;
  data: InvokeData;
  metadata?: Record<string, unknown>;
}
```

## Required Request Fields

### `context`

Required.

This is the shared `ExecutionContext v2` capsule.

### `data`

Required.

This is the business payload for the capability invocation.

It should replace the old pattern of:

- `mode`
- `payload.action`
- loosely related action-specific fields

### `metadata`

Optional.

This is where per-call descriptive metadata should live when needed.

It should stay optional and should not replace first-class fields such as `context` or `data`.

Examples may include:

- streaming preference
- caller hints
- idempotency hints
- request-local descriptive details

## Data Model

The shared data model should be intentionally thin.

The likely direction is:

```typescript
interface InvokeData {
  content: unknown;
  contentType?: 'text' | 'markdown' | 'json' | 'arguments' | 'binary-ref';
}
```

This gives the shared layer enough shape for consistency without hardcoding product-local business schemas into the common package.

## Response Result

The shared success result should focus on typed output and useful metadata.

The likely direction is:

```typescript
interface InvokeResult {
  success: true;
  output: InvokeOutput;
  metadata?: Record<string, unknown>;
  context?: ExecutionContextV2;
}
```

## Output Model

The output should be first-class and typed.

```typescript
interface InvokeOutput {
  content: unknown;
  outputType: 'text' | 'markdown' | 'json' | 'image' | 'video' | 'audio' | 'artifact-ref';
  metadata?: Record<string, unknown>;
}
```

This is the key replacement for old response semantics based on:

- mode
- action
- product-specific response branching

## Error Model

The shared error contract should remain JSON-RPC-compatible while adding a stable application-level shape.

The likely direction is:

```typescript
interface InvokeError {
  code: number;
  message: string;
  data?: {
    errorType?: string;
    retryable?: boolean;
    details?: Record<string, unknown>;
  };
}
```

This lets the platform preserve:

- JSON-RPC error compliance
- product-neutral client handling
- stable observability semantics

## What Leaves The Shared Request

The v2 invoke contract should remove these as shared first-class concepts:

- `mode`
- `payload.action`
- `sessionId`
- `planId`
- `orchestrationId`
- `orchestrationRunId`
- `orchestrationSlug`
- framework-specific prompt interpolation params

If some product still needs one of these ideas, it should carry it in product-local payloads or product-local extensions, not in the common core.

## Relationship To Compose

Compose fits this model very naturally.

Compose needs:

- one invoke method
- `ExecutionContext v2`
- a data payload
- a typed output

That is a much better fit than the old mode/action model.

## Relationship To Forge

Forge also fits this model.

Forge can send richer business input inside `data.content`, while still using the same shared envelope.

Its more complex workflows should not require a different shared transport worldview.

## Relationship To Bridge

Bridge should consume this same invoke contract for native A2A behavior.

When Bridge translates to external protocols, those translations should wrap or map to this contract rather than redefining the platform core.

## Relationship To Pulse

Pulse can use the same invoke contract for agentic execution while handling watcher/event-specific data in product-local payloads when necessary.

Pulse should not force watcher-specific transport fields into the shared invoke core unless they later prove to be truly cross-product.

## Streaming Relationship

Streaming should not change the core request shape.

Instead:

- request uses the same `invoke` envelope
- `metadata` can carry a streaming hint when needed
- stream events are handled by the shared streaming contract

This keeps streaming as an execution mode of the same invocation contract rather than a separate transport worldview.

Streaming should also be treated as an observability-plane concern in operation:

- transport-types defines the event envelope
- the observability plane handles correlation, emission, trace linkage, and monitoring

That ensures stream chunks, progress events, and completion/error events are part of the same observable execution story as the rest of the invocation.

## Design Principles

1. One shared invoke method.
2. One shared execution capsule.
3. One shared data envelope.
4. One shared typed output envelope.
5. Product-specific complexity stays out of the core.

## Success Criteria

- the shared contract uses JSON-RPC 2.0
- the shared method collapses to a simple `invoke`
- `mode` and `payload.action` are no longer shared transport primitives
- `ExecutionContext v2` is the shared request context
- `data` and optional `metadata` are the main per-call variability surfaces
- responses are centered on typed outputs
- `Compose`, `Forge`, `Bridge`, and `Pulse` can all use the same request/response envelope

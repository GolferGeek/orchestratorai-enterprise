# Streaming Event Contract V2

## Purpose

Define the shared streaming event contract for `transport-types v2` and clarify how it relates to the `observability` plane.

## Core Definition

Streaming should be modeled as a **shared event contract**, not as a separate transport worldview.

The platform should keep:

- one shared `invoke` request shape
- one shared response shape
- one shared streaming event envelope for incremental execution updates

Streaming is therefore an execution pattern of the A2A contract, not a different protocol model.

## Architectural Split

The correct split is:

- `transport-types v2` defines the stream event envelope and event kinds
- the `observability` plane owns stream emission, correlation, trace linkage, monitoring, and operational visibility

This is critical.

Streaming should not become:

- ad hoc product-local event plumbing
- a hidden side channel outside observability
- a second execution contract competing with the `invoke` contract

## Why V2 Exists

All four products may need streaming behavior:

- `Compose` for incremental agent output
- `Forge` for long-running complex capability execution
- `Bridge` for relayed or translated streaming interactions
- `Pulse` for automation/event-driven progress where appropriate

But not all of them need different stream shapes.

They need one shared envelope with product-local payload freedom where necessary.

## Core Streaming Goals

The streaming contract should answer:

1. What invocation does this event belong to?
2. What kind of stream event is this?
3. What content or progress does it carry?
4. Is the invocation still running, completed, or failed?
5. How is this event correlated to observability and tracing?

## Event Envelope

The shared envelope should remain small and stable.

The likely direction is:

```typescript
interface StreamEventV2 {
  event: StreamEventType;
  requestId: string | number | null;
  context: ExecutionContextV2;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}
```

This is illustrative, not final code.

## Required Event Fields

### `event`

Required.

Identifies what kind of stream event this is.

### `requestId`

Required.

This should correlate to the JSON-RPC request `id` for the invocation.

### `context`

Required.

Streaming events should carry the same first-class `ExecutionContext v2` capsule as the invocation.

That ensures:

- traceability
- policy-aware monitoring
- correct attribution
- correlation across products and planes

### `data`

Optional, but commonly present.

This carries the event-specific payload.

### `metadata`

Optional.

This carries event-specific descriptive details, not the execution capsule.

## Event Types

The shared contract should define a small set of event kinds such as:

- `started`
- `chunk`
- `progress`
- `output`
- `completed`
- `error`

This set is intentionally small.

It should cover the common streaming lifecycle without forcing product-specific workflows into the shared contract.

## Meaning Of Event Types

### `started`

Signals that the invocation has entered active execution.

### `chunk`

Carries incremental output content such as text tokens, partial JSON fragments, or other partial result content.

### `progress`

Carries structured progress information that is not itself final output.

Examples:

- percentage
- current stage
- step label

### `output`

Carries a structured partial output payload that is more semantic than a raw chunk.

This is useful when incremental output is not token-like.

### `completed`

Signals that streaming is finished successfully.

This should correlate cleanly with the final invocation result.

### `error`

Signals that streaming ended in failure.

This should correlate cleanly with the final error semantics of the invocation.

## Event Data Shapes

The shared contract should stay flexible, but the common event payloads likely look like:

```typescript
type StreamEventType =
  | 'started'
  | 'chunk'
  | 'progress'
  | 'output'
  | 'completed'
  | 'error';
```

And event payload examples:

```typescript
interface ChunkEventData {
  content: unknown;
  contentType?: 'text' | 'markdown' | 'json';
}

interface ProgressEventData {
  stage?: string;
  message?: string;
  percent?: number;
}

interface OutputEventData {
  outputType: 'text' | 'markdown' | 'json' | 'image' | 'video' | 'audio' | 'artifact-ref';
  content: unknown;
}

interface ErrorEventData {
  code?: string;
  message: string;
  retryable?: boolean;
}
```

## Relationship To Final Response

Streaming events should not replace the final invocation result.

The correct model is:

1. request starts with shared `invoke`
2. stream events emit during execution
3. final response or terminal error still resolves the invocation contract

That keeps streaming compatible with:

- synchronous consumers
- streaming consumers
- observability correlation
- stable transport semantics

## Relationship To Observability Plane

The `observability` plane should own the operational life of streaming.

That includes:

- event emission
- trace correlation
- request-to-stream correlation
- monitoring and alerting
- cost and model attribution where applicable
- durable event handling if needed by platform operations

The transport package should define event structure.
The observability plane should handle the runtime responsibility.

## Relationship To Compose

Compose will likely use:

- `started`
- `chunk`
- `completed`
- `error`

and sometimes `progress` when a simple agent needs structured progress updates.

Compose should not need a custom streaming protocol.

## Relationship To Forge

Forge will likely use the full shared set more heavily, especially:

- `progress`
- `output`
- `completed`
- `error`

because complex workflows often need richer stage-based execution visibility.

Even so, Forge should still remain inside the shared event contract.

## Relationship To Bridge

Bridge should consume and emit the same shared streaming envelope for native platform A2A behavior.

When Bridge translates to or from external streaming systems, it should map those systems into this shared event model rather than redefining the platform core.

## Relationship To Pulse

Pulse may use streaming more selectively, but the same event contract should apply whenever agentic execution emits incremental state.

Pulse-specific trigger metadata should remain out of the shared stream core unless it becomes a true cross-product need.

## What Should Stay Out Of The Shared Stream Core

The shared streaming contract should avoid:

- product-local workflow bookkeeping
- Pulse-only watcher fields
- Bridge-only interoperability richness
- raw observability implementation details
- UI-only rendering state

## Design Principles

1. One shared stream envelope.
2. One shared event vocabulary.
3. Streaming stays tied to the main invocation contract.
4. The observability plane owns runtime streaming responsibility.
5. Product-specific richness stays out of the shared core.

## Success Criteria

- all four products can emit or consume the same basic stream event envelope
- streaming remains tied to the shared `invoke` contract
- `ExecutionContext v2` is present in stream events
- the `observability` plane is explicitly responsible for operational streaming behavior
- product-local streaming complexity does not bloat the shared transport contract

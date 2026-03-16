# ExecutionContext V2

## Purpose

Define the lean execution identity capsule that should flow through the platform after the simplification of Compose, Forge, Bridge, and Pulse.

## Core Definition

`ExecutionContext v2` should remain a **sacred capsule**.

It should still be:

- created at the edge
- passed whole
- treated as immutable
- required for every real agent invocation
- required for every LLM and observability path

What changes in v2 is not the pattern. What changes is the amount of old framework baggage carried inside the capsule.

## Why V2 Exists

The current execution context was shaped around a heavier framework model that assumed:

- tasks
- plans
- deliverables
- broader mode-driven execution

That is no longer the right center for the platform.

The new center is:

- A2A invocation
- conversation continuity
- agent identity
- provider/model attribution
- observability and tracing

## The V2 Capsule

The shared `ExecutionContext v2` should contain:

- `orgSlug`
- `userId`
- `conversationId`
- `agentSlug`
- `agentType`
- `provider`
- `model`
- optional `sovereignMode`

## Canonical Shape

```typescript
export interface ExecutionContextV2 {
  orgSlug: string;
  userId: string;
  conversationId: string;
  agentSlug: string;
  agentType: string;
  provider: string;
  model: string;
  sovereignMode?: boolean;
}
```

## Removed From The Core

These fields should be removed from the core execution context:

- `taskId`
- `planId`
- `deliverableId`

They may still exist in product-local payloads, product-local persistence models, or product-local async workflows where they are justified.

They should not remain part of the platform-wide execution capsule by default.

## Why These Fields Stay

### `orgSlug`

Needed for tenant identity, routing, policy, and observability.

### `userId`

Needed for attribution, auth validation, auditability, and user-scoped behavior.

### `conversationId`

Needed because conversation is now the default continuity boundary, especially for Compose and other user-facing agent flows.

### `agentSlug`

Needed so every downstream layer knows which agent definition or capability was invoked.

### `agentType`

Needed for routing, runner selection, observability, analytics, and platform governance.

### `provider`

Needed for LLM selection, PII handling policy, observability, and cost attribution.

### `model`

Needed for LLM selection, reproducibility, observability, and cost attribution.

### `sovereignMode`

Useful as an optional execution guardrail when the system must restrict provider behavior based on deployment or policy.

## What Should Not Be Added Lightly

`ExecutionContext v2` should not become a dumping ground for every workflow concern.

Do not add fields for:

- task orchestration bookkeeping
- plan or deliverable lifecycle state
- transport-specific temporary metadata
- UI-only display state
- product-specific internal knobs

If a field is not needed across products for invocation identity, tracing, policy, or observability, it probably does not belong in the shared execution context.

## Frontend And Backend Responsibility

The context should still originate at the edge, not be pieced together deep in backend internals.

The expected model is:

1. the client or ingress layer establishes the execution context
2. the receiving product validates it against auth and policy
3. the product passes it through unchanged
4. services, runners, graphs, and observability consumers receive the full capsule

The backend should validate and consume the capsule, not reinvent it from scattered fields.

## Ownership Rules

The ownership model should be:

### Edge Or Frontend Creates

The edge layer or frontend establishes:

- `orgSlug`
- `userId`
- `conversationId`
- `agentSlug`
- `agentType`
- `provider`
- `model`
- optional `sovereignMode`

This is the canonical invocation capsule.

### Backend Validates

The receiving backend should validate:

- `userId` matches the authenticated caller
- `orgSlug` matches the authorized tenant scope
- `agentSlug` and `agentType` are valid for the requested capability
- `provider` and `model` are allowed by policy
- `sovereignMode`, when present, is compatible with deployment policy

### Backend Does Not Reconstruct

The backend should not rebuild the execution context from:

- request fragments
- database lookups
- route params
- session-local temporary state

It may validate the capsule. It should not redefine the capsule.

## Lifecycle Rules

`ExecutionContext v2` should be stable for the life of an invocation.

The expected lifecycle is:

1. a conversation starts or an existing conversation is resumed
2. the edge creates or reuses `conversationId`
3. the edge selects the target agent and provider/model
4. the request carries the full context into the product
5. all downstream layers use that same context for tracing, observability, and policy

If the user changes model or provider for a later turn, that later turn may carry a different `provider` or `model`, but each individual invocation still carries one complete, stable capsule.

## Passing Rules

The same capsule rules still apply:

1. pass the full context, not cherry-picked fields
2. do not destructure it for downstream service calls
3. do not reconstruct it in backend code
4. do not mutate it mid-flight
5. every LLM call receives it
6. every observability path receives it

These rules apply equally to:

- controllers
- services
- LangGraph nodes
- protocol adapters
- observability emitters
- streaming emitters

## Relationship To JSON-RPC

`ExecutionContext v2` should live inside the shared A2A request envelope as part of the invocation contract.

For correlation beyond the execution capsule:

- JSON-RPC `id` should handle request correlation
- streaming envelopes should handle event correlation
- product-local async records can handle durable job tracking where truly needed

This is one of the reasons `taskId` no longer needs to live in the shared context.

## Validation And Failure Semantics

If the execution context is invalid, the request should fail explicitly.

Examples:

- auth mismatch between `userId` and caller identity
- forbidden `orgSlug`
- invalid or unknown `agentSlug`
- provider/model not allowed by policy
- malformed context shape

The correct behavior is to reject the invocation, not to silently repair or substitute missing context values.

## Relationship To Compose

Compose is the clearest expression of the new model.

Compose should assume:

- conversation is the continuity boundary
- tasks are optional
- deliverables are optional
- typed outputs matter more than framework state bookkeeping

That makes `conversationId` a core field and `taskId` a product-local concern at most.

## Relationship To Forge

Forge still needs strong execution identity for:

- LangGraph tracing
- HITL continuity
- stream/result correlation
- observability

But that does not mean Forge should force task-heavy legacy fields into the shared capsule.

Forge-specific long-running execution records can exist outside the shared `ExecutionContext v2` if they are truly needed.

## Relationship To Bridge

Bridge should consume the same core execution capsule when participating in the platform's A2A model.

Bridge may additionally need richer external correlation and protocol metadata, but those concerns should live outside the shared capsule unless they become truly universal.

## Relationship To Pulse

Pulse should also consume the same core execution capsule when acting as an agentic participant in the shared platform model.

Watcher metadata, trigger details, and automation-specific event metadata should not be stuffed into the shared execution context unless they prove to be cross-product necessities.

## Design Principles

1. Keep the capsule whole.
2. Keep the capsule lean.
3. Keep the capsule frontend-originated or edge-originated.
4. Keep the capsule product-neutral.
5. Keep the capsule focused on identity, policy, tracing, and observability.

## Success Criteria

- `ExecutionContext v2` is smaller than the current framework-era version
- `conversationId` remains the primary continuity field
- `taskId`, `planId`, and `deliverableId` are no longer part of the shared core
- all four products can use the same execution capsule
- the capsule still supports provider/model attribution, PII handling, and observability
- the platform preserves the sacred pass-it-whole pattern without preserving old baggage

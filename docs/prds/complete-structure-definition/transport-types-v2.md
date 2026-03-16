# Transport Types V2

## Purpose

Define the next shared transport contract for the platform after the simplification of Compose, Forge, Bridge, and Pulse.

## Core Definition

`transport-types v2` should be the **shared A2A contract** for the platform.

It should define the minimum common language that all agentic products share:

- `Compose`
- `Forge`
- `Bridge`
- `Pulse`

It should not try to encode every product-specific behavior into the shared package.

## Primary Goal

The goal is to replace mode-heavy, framework-era transport semantics with a smaller A2A-first contract built around:

- invocation
- execution identity
- typed outputs
- discovery
- streaming
- errors

## What Belongs In V2

`transport-types v2` should define:

- a shared JSON-RPC 2.0 A2A request envelope
- a shared JSON-RPC 2.0 A2A success/error response envelope
- a lean `ExecutionContext v2`
- a shared typed output/result model
- shared discovery and card models where applicable
- shared streaming event primitives
- shared error semantics

The shared request/response direction should center on a single JSON-RPC `invoke` contract rather than a mode/action matrix.

See `invoke-contract-v2.md`.

## What Should Leave The Core

`transport-types v2` should stop treating older generalized framework concepts as the heart of the contract.

That means the core should move away from:

- `converse` / `plan` / `build` as dominant transport semantics
- product-local payload branching that only exists for one app
- task-heavy assumptions
- deliverable-heavy assumptions
- transport contracts that presume old generalized workflow structures

## Product Fit

### Compose

Compose needs:

- one invoke contract
- one lean execution context
- one typed output model
- one shared discovery/descriptor shape where useful

Compose does not need broad mode branching in the transport layer.

### Forge

Forge needs:

- the same core invoke contract
- the same execution identity model
- the same typed result envelope
- the same discovery/card semantics where appropriate
- streaming support for long-running capability execution

Forge may have richer product-local payloads, but it should not fork the shared transport worldview.

### Bridge

Bridge should consume the same A2A core as everyone else.

Bridge then adds:

- external protocol translation
- richer interoperability adapters
- negotiation, trust, and security layers for non-native peers

Those additions should not bloat the shared transport core.

### Pulse

Pulse should also consume the same A2A core where agentic invocation is involved.

Pulse may additionally need:

- event envelopes
- watcher-trigger metadata
- internal automation metadata

Those should be added carefully without turning the shared package into a Pulse-specific contract.

## Architectural Boundary

The correct split is:

- shared `transport-types v2` core for platform A2A
- product-local or package-local extensions for product-specific needs
- Bridge-specific protocol breadth outside the shared core
- Pulse-specific watcher/event semantics outside the shared core unless they become truly cross-product

## Proposed V2 Shape

The package should likely organize around a smaller structure such as:

```text
packages/transport-types/
  a2a/
    request.types.ts
    response.types.ts
    error.types.ts
    stream.types.ts
  invocation/
    execution-context.ts
    output-types.ts
  discovery/
    agent-card.types.ts
    well-known.types.ts
```

The exact filenames can change, but the boundary should remain small and intentional.

## Execution Context Direction

`ExecutionContext v2` should remain sacred, but it should be leaner than the current framework-era version.

It should carry the fields needed for:

- identity
- tracing
- observability
- provider/model selection
- org and user attribution
- conversation continuity where applicable

It should not preserve extra state fields just because older products used them.

The intended direction is:

- keep `orgSlug`
- keep `userId`
- keep `conversationId`
- keep `agentSlug`
- keep `agentType`
- keep `provider`
- keep `model`
- keep optional `sovereignMode`
- remove `taskId`, `planId`, and `deliverableId` from the shared core

See `execution-context-v2.md`.

## Output Direction

The response contract should make typed outputs first-class.

Examples include:

- `text`
- `markdown`
- `json`
- `image`
- `video`
- `audio`
- optional artifact references

The transport contract should make it easy for frontend and downstream agents to understand what was returned without relying on old mode semantics.

## Discovery Direction

The shared discovery layer should support:

- well-known capability listing where applicable
- agent cards or capability descriptors
- enough metadata for A2A discovery and routing

It should not force every product into the richest possible external-discovery model.

The shared direction should center on a lean card/descriptor contract that all four products can use, while allowing `Bridge` to extend beyond the shared core where external interoperability requires it.

See `discovery-and-card-contract-v2.md`.

## Streaming Direction

Streaming should remain part of the shared contract because all four products may need it in some form.

The shared layer should define:

- event envelope structure
- chunk or progress event typing
- completion/error semantics
- correlation with the shared request/response identity model

But streaming should not be treated as an isolated subsystem owned only by transport-types.

The correct split is:

- `transport-types v2` defines the stream event contract
- the `observability` plane owns stream emission, correlation, traceability, and operational visibility

That means streaming behavior should flow through the observability plane rather than becoming ad hoc product-local event plumbing.

See `streaming-event-contract-v2.md`.

## Design Principles

1. Keep the core contract A2A-first.
2. Keep the shared package smaller than the products that consume it.
3. Move product complexity out of the shared core.
4. Preserve enough common structure for frontend, observability, and cross-product consistency.
5. Let Bridge extend outward instead of forcing every product to carry Bridge-level protocol breadth.

## Success Criteria

- `Compose`, `Forge`, `Bridge`, and `Pulse` can all use the same basic A2A transport contract
- `Bridge` can extend beyond that contract without bloating the shared core
- old mode-heavy semantics are no longer the center of the transport package
- typed outputs are first-class
- `ExecutionContext v2` is lean and explicit
- the package is small enough to stay stable and understandable

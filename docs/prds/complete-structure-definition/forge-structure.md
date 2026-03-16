# Forge Structure

## Purpose

Define the target structure for Forge as a simplified NestJS + LangGraph application for complex capabilities.

## Core Definition

Forge should be rethought as a **single NestJS application that hosts multiple complex capability modules**, not as a large inherited framework centered on old conversation/task abstractions.

Forge is the home for complex, stateful, multi-step LangGraph-backed capability execution.

## Forge Owns

Forge should own:

- LangGraph-backed capability workflows
- complex capability modules such as:
  - `cad`
  - `marketing-swarm`
  - `risk`
  - `prediction`
  - `legal`
- capability-specific dashboards and APIs
- HITL-capable execution paths
- complex evaluation and monitoring flows where those are part of the capability

## Forge Consumes

Forge should consume:

- shared planes
- shared protocol packages only insofar as they support the platform's A2A contract
- transport-types as the shared A2A contract for invocation, discovery, outputs, streaming, and execution identity
- a minimal execution or invocation identity model

Forge should not continue carrying broad inherited technical debt from monolith copies that does not support its role.

## Target Runtime Model

Forge should move toward this execution shape:

1. an A2A endpoint receives a request
2. the transport layer validates and normalizes it against shared transport-types
3. the request is routed to a capability module
4. the capability module invokes its LangGraph workflow
5. the result is mapped back through the shared A2A response contract

The core principles are:

- module-first
- A2A-native
- protocol-wrapped

## Capability Module Model

A Forge capability should be a NestJS module that owns one complex area of behavior.

Each capability module may contain:

- controller or transport adapter entrypoints
- service layer
- LangGraph workflow
- capability-specific persistence and checkpointing
- capability-specific dashboard support

This keeps Forge structurally simple:

- one Forge app
- many capability modules
- one shared protocol and plane foundation

## Conversations And Tasks

Forge should not be required to preserve the old heavy `conversations` and `tasks` model as a first-class architecture if those systems are not actual product value for the complex capability modules.

What Forge still needs is a **minimal execution identity layer** for:

- tracing
- observability
- stream/result correlation
- HITL continuity where relevant
- cost attribution where relevant

That means:

- simplify the app model aggressively
- do not assume the old monolith-style conversation/task subsystems survive unchanged
- keep only the smallest execution or invocation contract needed for platform coherence

## Transport Direction

Forge should use A2A as its core and default transport model.

That means Forge should align with the same shared transport foundation as Compose, Bridge, and Pulse:

- A2A
- shared invocation request/response types
- lean `ExecutionContext`
- typed output/result envelopes
- shared discovery and card models where applicable
- shared streaming and error semantics, with streaming flowing through the observability plane

Forge should not preserve REST-first or general multi-transport complexity as part of its core architecture. The capability is primary, and A2A is the standard wrapper.

## Decorator Direction

Forge is a strong candidate for the protocol-decorator model.

The intended pattern is:

- capability metadata declared on controllers or modules
- protocol presets declared via decorators
- transport endpoint metadata declared via decorators
- runtime guards, interceptors, adapters, and registries do the actual work

This means Forge can stay simple while still supporting:

- generated discovery metadata
- well-known and agent-card output
- shared transport behavior
- explicit A2A capability metadata

See `protocol-decorator-model.md`.

## Rewrite Implications

The Forge rewrite is deeper than a normal cleanup. It should:

- collapse inherited framework complexity
- center the app around capability modules
- put protocols at the edges instead of in the middle
- align ingress and egress to the shared A2A transport contract
- remove copied infrastructure that belongs in shared packages
- avoid preserving old abstractions that no longer deliver product value

## Structural Questions

The Forge rewrite should answer:

1. Which currently local services remain truly Forge-specific?
2. Which observability pieces become pure consumers of a shared observability plane?
3. What is the minimum A2A contract Forge needs beyond the shared transport-types core?
4. What is the smallest execution contract Forge needs after removing legacy conversation/task assumptions?
5. Which capability modules should become first-class NestJS modules in the rewrite?

## Success Criteria

- Forge is explicitly modeled as a module-first, LangGraph-backed capability host
- Forge consumes shared planes instead of carrying local infrastructure copies where appropriate
- Forge is explicitly A2A-native
- Forge consumes the shared transport-types contract instead of carrying product-local transport semantics
- Forge retains only the execution identity model it truly needs
- Forge does not preserve broad inherited technical debt just because it existed first

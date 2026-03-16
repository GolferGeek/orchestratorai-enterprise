# Forge And Compose Structure

## Purpose

Define the target architectural boundary between Forge and Compose after the planes/protocols simplification work.

## Core Boundary

The clean platform boundary remains:

- Forge = complex agent systems
- Compose = simple composable agent systems

That boundary should become sharper, not blurrier, as planes and protocols are cleaned up.

## Forge

Forge is the home for complex, stateful, multi-step capability execution.

Forge should be treated as:

- a complex capability host
- LangGraph-backed where appropriate
- A2A-native at the edge
- protocol-wrapped at the edge

The detailed Forge target model now lives in `forge-structure.md`.

## Compose

Compose is the home for simple, composable agent execution.

Compose should own:

- context-style runners
- RAG-style runners
- API-style runners
- external/A2A-style runners
- image/media-style runners
- composition and chaining of these simpler units

Compose should remain lean and avoid:

- LangGraph-first architecture
- complex workflow state systems
- product-local copies of shared infrastructure

Compose should also be explicitly:

- A2A-native
- single-action by default

The detailed Compose target model now lives in `compose-structure.md`.

## Protocol Direction For Forge And Compose

Bridge and Pulse are the first protocol-native consumers.

Forge and Compose should be redesigned around the shared A2A transport foundation, but they do not need to inherit the entire ambient-protocol complexity that Bridge needs.

That means:

- remove product-local infrastructure duplication now
- consume shared planes now
- consume a shared transport-types core now
- adopt protocol behavior where it simplifies the products rather than expanding them
- keep broader external protocol translation in Bridge rather than in Forge or Compose

## Practical Implication

The structure work for Forge and Compose should answer:

1. What should remain product-specific?
2. What should move to `packages/planes`?
3. What protocol capabilities do they actually need?
4. Which current code is only there because it was copied from older work?
5. What is the minimal common invocation contract they need?

That minimal common invocation contract should be:

- one A2A invoke request
- one A2A result/error envelope
- one lean execution context
- one typed output model
- one shared discovery/card shape where applicable

## Lean Target State

### Forge should be lean by:

- keeping only complex capability execution concerns
- shedding copied infrastructure that belongs in packages
- shedding simple-runner logic that belongs in Compose
- shedding inherited framework layers that no longer provide product value
- keeping only the web surfaces that support complex agent systems

### Compose should be lean by:

- keeping only the standard runner families
- keeping the composition layer
- shedding LangGraph-centric complexity
- shedding copied infrastructure that belongs in packages
- using conversation as the default persistence boundary
- making tasks and deliverables optional rather than universal

## Structural Questions To Resolve

### Forge

- Which currently local services remain truly Forge-specific?
- Which observability pieces become pure consumers of a shared observability plane?
- What is the minimum shared A2A transport contract Forge needs beyond the common core?
- What is the smallest execution contract Forge needs after removing legacy conversation/task assumptions?
- Which capability modules should become first-class NestJS modules in the rewrite?

### Compose

- What is the authoritative list of supported runner families?
- Which orchestration/composition pieces are core product value?
- Which external-runner capabilities need only shared A2A descriptors versus product-local special handling?
- What is the minimum useful typed-output model for simple agent execution?
- Which state concepts are truly needed: conversations, tasks, deliverables, or a thinner subset?

## Rewrite Principle

The rewrite for Forge and Compose should not be “move everything to protocols.”

It should be:

- first remove duplicated infrastructure
- then clarify each product’s proper shape
- then adopt shared protocols where they make the product simpler and more consistent

For Forge specifically, the rewrite may be deeper than Compose. See `forge-structure.md`.

## Success Criteria

- Forge and Compose have an explicit product boundary
- both consume shared planes instead of local copies where appropriate
- both consume a shared A2A transport foundation
- both have a documented protocol adoption path
- neither product retains broad inherited technical debt just because it existed first
- Forge is explicitly modeled as a module-first, LangGraph-backed capability host
- Compose is explicitly modeled as a lean, single-action, definition-first runtime

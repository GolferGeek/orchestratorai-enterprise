# Pulse Structure

## Purpose

Define the target structure for Pulse as the platform's internal ambient automation and event-driven processing product.

## Core Definition

Pulse should be treated as the **internal automation and processing engine** of the platform.

Pulse is where the platform:

- listens for internal events
- evaluates triggers and automation rules
- routes work into internal processing paths
- runs ambient automation that belongs inside the trust boundary

Pulse is not the external trust boundary, and it is not the home for generalized dashboards.

## Pulse Owns

Pulse should own:

- internal listeners and event ingestion
- trigger evaluation and execution
- internal automation policy and workflow activation
- background processing that belongs to the ambient layer
- internal execution history and operational state for ambient runs

Pulse may also host product-specific internal processing engines that naturally belong in ambient automation rather than in Compose or Forge.

## Pulse Consumes

Pulse should consume:

- shared `transport-types v2` for the common A2A and execution contracts
- shared observability for streaming, tracing, execution visibility, and event correlation
- relevant shared planes such as database, LLM, configuration, and storage where applicable
- shared protocol packages only to the degree Pulse actually needs them
- Auth where API-facing user or org context must be validated

Pulse should not carry product-local infrastructure implementations when shared planes already exist.

## Runtime Direction

Pulse should remain **event-driven and internally trusted**.

The desired runtime shape is:

1. an internal event source emits a signal
2. Pulse normalizes that signal into the ambient event model
3. Pulse evaluates matching triggers or automation rules
4. Pulse invokes the correct internal processing path
5. observability captures the lifecycle and any streaming output

Pulse may expose A2A endpoints, but those endpoints should remain thin and direct rather than growing heavyweight routing machinery.

## Pulse And Bridge Interaction

Pulse and Bridge should be understood as **frequent collaborators** inside the ambient architecture.

Two distinct interaction patterns should be treated as normal, and the architecture should not blur them together:

- **direct handoff**
- **trigger-mediated coordination**

### Direct Handoff

In the direct pattern:

- Bridge receives an external request and hands work to Pulse for internal automation, trigger execution, or processing
- Pulse reaches out to Bridge when part of an internal workflow needs to communicate with an external agent or external system

This is the clearest `Bridge <-> Pulse` collaboration path and should use the shared A2A, `ExecutionContext`, discovery, streaming, and observability foundations.

### Trigger-Mediated Coordination

In the trigger-mediated pattern:

- Bridge activity may emit or persist an event that Pulse later observes through its listener and trigger system
- Pulse may complete work by emitting, persisting, or scheduling a signal that a Bridge-owned listener, trigger, or outbound process later picks up

This is still a real Bridge/Pulse interaction, but it is **indirect**. The products are communicating through ambient triggers, events, persisted state, or queued work rather than through a direct request/response handoff.

That distinction matters because:

- direct handoff emphasizes synchronous or explicitly invoked collaboration
- trigger-mediated coordination emphasizes decoupled ambient workflows
- both patterns should be first-class in the product design

That means Pulse is not isolated from external communication concerns. It simply reaches the outside world through Bridge rather than owning that boundary itself, either by direct call paths or by trigger-driven ambient coordination.

The handoff and coordination between Pulse and Bridge should stay on the shared A2A, `ExecutionContext`, discovery, streaming, trigger, and observability foundations rather than product-local shortcuts.

## Protocol Direction

Pulse should align to the same shared A2A core as Compose, Forge, and Bridge, but it should not be protocol-maximal.

That means:

- Pulse uses the shared invoke and `ExecutionContext` model
- Pulse consumes streaming through the observability plane
- Pulse does not need the broad external adaptation surface that Bridge needs
- Pulse stays simpler at the edge because its primary work is internal

## Processing Direction

Pulse is where internal automation should stay close to the event source and the processing engine.

That means Pulse may legitimately own:

- listeners
- trigger services
- processing services
- internal automation workflows
- execution records tied to ambient operations

But Pulse should still avoid preserving inherited complexity that does not support that role.

## What Pulse Does Not Own

Pulse should not own:

- the external protocol compatibility edge
- generalized external trust-boundary logic
- dashboard-first complex capability UX
- Compose's simple family runtimes
- Auth's identity and entitlement authority
- copied infrastructure code that belongs in shared planes

Pulse can call Bridge often, or coordinate with Bridge indirectly through triggers and events, but Bridge remains the owner of the external compatibility and trust boundary.

## Shared-Core Direction

Pulse should help drive extraction of truly shared ambient and protocol building blocks into shared packages.

That includes shared concerns such as:

- event envelopes
- trigger or execution contracts where truly common
- observability integration
- transport contracts

Pulse should be a strong consumer of those abstractions, not the place where the only implementation lives forever.

## Rewrite Implications

The Pulse cleanup should:

- preserve Pulse as the internal automation engine
- remove duplicated infrastructure in favor of shared planes
- route streaming and execution visibility through the observability plane
- keep A2A support thin and aligned to the shared core
- make the distinction between direct Bridge handoff and trigger-mediated Bridge coordination explicit
- separate genuinely shared ambient abstractions from Pulse-only behavior

## Structural Questions

The Pulse structure should answer:

1. Which event, trigger, and execution contracts belong in shared packages versus Pulse itself?
2. Which current processing engines belong naturally in Pulse long-term?
3. Which infrastructure layers should be replaced by shared planes?
4. What is the minimum thin-edge A2A model Pulse needs while staying internally focused?
5. Which Bridge/Pulse interactions should be direct handoffs versus trigger-mediated coordination?

## Success Criteria

- Pulse is explicitly modeled as the internal ambient automation product
- Pulse consumes relevant shared planes instead of carrying local infrastructure copies
- Pulse aligns to the shared A2A and `ExecutionContext` contracts without becoming protocol-maximal
- Pulse explicitly supports both direct Bridge collaboration and trigger-mediated Bridge coordination
- Pulse routes streaming and execution visibility through the observability plane
- Pulse remains lean, event-driven, and professionally bounded

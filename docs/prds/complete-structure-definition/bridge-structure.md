# Bridge Structure

## Purpose

Define the target structure for Bridge as the platform's external communication boundary for agent-to-agent interoperability.

## Core Definition

Bridge should be treated as the **external compatibility and trust boundary** of the platform.

Bridge is not a business-logic host and not an internal automation engine.

Its job is to:

- receive external agent traffic
- validate and normalize that traffic
- apply trust, policy, and protocol rules
- route requests and responses across the platform boundary

## Bridge Owns

Bridge should own:

- inbound external A2A handling
- outbound external A2A calls
- external agent discovery and registry concerns
- trust-boundary validation such as signing, verification, origin policy, and rate limits
- protocol adaptation where an external party differs from the platform default
- auditability of external agent exchanges

## Bridge Consumes

Bridge should consume:

- shared `transport-types v2` as the common A2A core
- shared protocol packages and presets
- shared observability for streaming, correlation, tracing, and execution visibility
- the relevant shared planes for infrastructure concerns such as database or configuration
- Auth where user or org security context must be validated

Bridge is the broadest protocol consumer, but that does not mean Bridge should invent its own core transport contract.

## Protocol Direction

Bridge should be the product that can handle the richest external protocol surface.

That means Bridge may:

- consume the platform's shared A2A core directly
- adapt to stricter or richer external protocol requirements
- expose configuration and preset choices appropriate for external integrations

But the architectural rule remains:

- start from the shared invoke, discovery, streaming, and `ExecutionContext` contracts
- extend only where the external trust boundary actually requires it
- keep platform-internal products simpler than Bridge

## Security Boundary

Bridge should remain security-first at the external edge.

It should own concerns such as:

- request signing and verification
- origin trust decisions
- replay and abuse protection
- rate limiting
- external audit logging
- policy-driven acceptance or rejection of inbound traffic

These are external-boundary responsibilities, not general platform responsibilities for every product.

## Runtime Direction

The desired Bridge shape is **bidirectional**.

### Inbound Shape

1. external request arrives
2. Bridge validates trust, policy, and protocol shape
3. Bridge normalizes the request onto the shared platform contract
4. Bridge routes to the correct internal product or returns the correct external response
5. observability captures the interaction lifecycle

### Outbound Shape

1. an internal product decides work needs to leave the platform
2. Bridge resolves the external target through discovery, registry lookup, or a previously stored card/descriptor
3. Bridge determines the target protocol and capability expectations
4. Bridge morphs the shared internal contract into the external party's required protocol shape
5. Bridge applies outbound trust, signing, policy, and transport rules
6. Bridge sends the request outward and normalizes the response or events back onto the shared platform contract
7. observability captures the full outbound interaction lifecycle

That outbound path is a first-class part of Bridge's architecture, not a secondary implementation detail. Bridge is where the platform discovers or remembers who is on the outside, how they expect to be called, and how our shared contract is adapted to meet them safely.

## Bridge And Pulse Interaction

Bridge and Pulse should be understood as **frequent collaborators** within the ambient layer, not as isolated products that merely happen to share infrastructure.

Two distinct interaction patterns should be considered first-class:

- **direct handoff**
- **trigger-mediated coordination**

### Direct Handoff

In the direct pattern:

- an external request enters through Bridge and is then routed to Pulse for internal automation or processing
- a Pulse automation or processing flow calls Bridge when part of the workflow needs to communicate outward to an external agent or external system

This is the explicit request/response or invoked collaboration path between the two products.

### Trigger-Mediated Coordination

In the trigger-mediated pattern:

- Bridge activity may create an event, record, or signal that Pulse later detects through its listener and trigger model
- Pulse activity may create an event, record, or signal that a Bridge-owned outbound process later picks up in order to talk to the outside world

This is still real Bridge/Pulse collaboration, but it is indirect and ambient rather than a direct call path.

That means Bridge should often act as:

- the inbound trust boundary before Pulse performs internal work
- the outbound communication boundary for Pulse when work needs to leave the platform

This interaction should use the same shared A2A, `ExecutionContext`, discovery, streaming, trigger, and observability foundations rather than product-local handoff contracts.

## What Bridge Does Not Own

Bridge should not own:

- internal automation processing
- Compose family runtimes
- Forge capability execution
- Auth policy ownership
- Flow productivity logic
- dashboard-heavy capability UX

Bridge routes and protects. It does not become the place where the work itself is performed, even when it is handing work off to or receiving work from Pulse.

## Shared-Core Direction

The long-term direction should keep broadly reusable ambient and protocol abstractions in shared packages rather than letting Bridge become the only place they exist.

Bridge can remain the richest consumer while still depending on:

- shared protocol definitions
- shared transport contracts
- shared observability
- shared infrastructure planes

## Rewrite Implications

The Bridge cleanup should:

- align Bridge tightly to the shared A2A core
- keep richer external protocol behavior out of internal products
- remove duplicated protocol or transport semantics that belong in shared packages
- clarify the difference between routing/adaptation and actual execution
- preserve Bridge as a clean, professional external boundary

## Structural Questions

The Bridge structure should answer:

1. Which protocol concerns truly belong in shared packages and which remain Bridge-specific edge behavior?
2. What is the minimal shared core Bridge extends for external interoperability?
3. Which current Bridge logic is routing versus adaptation versus security enforcement?
4. How should Bridge expose discovery, cards, and registry information without bloating the shared core?

## Success Criteria

- Bridge is explicitly modeled as the external trust and interoperability boundary
- Bridge uses the shared A2A core rather than inventing product-local transport semantics
- Bridge owns rich external protocol and security concerns without leaking them into simpler products
- Bridge consumes shared packages and planes wherever those abstractions are truly shared
- Bridge remains lean, clear, and professionally bounded despite supporting the richest protocol surface

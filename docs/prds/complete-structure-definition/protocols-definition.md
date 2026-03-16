# Protocols Definition

## Purpose

Define what the protocol layer is, why it should live in `packages`, and how products are allowed to consume it.

## Core Definition

Protocols are shared communication and interaction abstractions.

They define how systems, agents, and products communicate, negotiate, validate, trust, audit, and recover, independent of any single cloud provider.

Protocols are for:

- transport
- identity
- trust
- resilience
- audit
- negotiation
- orchestration
- payment and wallet behavior when protocol-driven exchange requires it

Protocols are not for:

- app-specific business logic
- product-specific policy decisions
- ad hoc runtime experimentation inside production products

## Package Direction

Ambient protocols should move into `packages` as shared platform capabilities.

The reason to promote them into `packages` is not only Bridge and Pulse. It is that the protocol layer is a platform capability that may later be adopted by:

- Bridge
- Pulse
- Compose
- Forge

That adoption does not need to happen now, but the package boundary should be designed so it can happen later without reworking the whole architecture again.

## Capability Set vs Allowed Usage

The protocol package should contain the **broad capability set**.

Products should consume a **constrained allowed subset**.

This is the key rule:

- rich package
- opinionated products

The package can know about many protocol providers and combinations.
The products should expose only the approved presets and policies they are allowed to run.

## Bridge

Bridge is the broadest protocol consumer.

Bridge should be able to support the full protocol vocabulary of the platform when needed, including cases where an external party is not using the same framework assumptions as OrchestratorAI.

But Bridge should still be governed by:

- platform-approved presets
- product policy
- explicit allowlists

Bridge should not default to arbitrary runtime protocol composition unless explicitly authorized by design.

## Internal Products

Forge, Compose, Pulse, and other internal products should use narrower protocol behavior than Bridge.

In practice:

- internal products should prefer fixed protocol stacks
- their runtime behavior should be tightly controlled
- they should not expose every protocol provider combination just because the package contains them

## Preset Model

The preferred operating model is:

- protocol primitives in the package
- named protocol presets in the platform
- product-level policies that select which presets are allowed

Examples of the kinds of presets we expect:

- `internal-a2a`
- `external-a2a`
- `external-minimal`
- `partner-specific`

The exact preset catalog can be defined later, but the architecture should assume preset-driven usage rather than free-form protocol assembly.

## Relationship To Existing A2A

The existing Forge and Compose behavior is still built around a simpler, harder-coded A2A model.

That should not force an immediate total rewrite.

The recommended sequence is:

1. define the protocol package correctly
2. align Bridge and Pulse first
3. create a future adoption path for Forge and Compose

This preserves momentum without mixing a large platform cleanup with a risky full communication rewrite.

## Protocol Governance Rules

1. The protocol package may be broad.
2. Production product behavior must be narrow and explicit.
3. Bridge is the compatibility edge, not the model for every product.
4. Internal products should not inherit external-facing complexity unless needed.
5. Presets and policy are preferred over runtime freedom.

## Success Criteria

- the protocol package is clearly defined as a platform capability layer
- the package is broad enough for Bridge and future adoption
- product usage is intentionally constrained
- Bridge is explicitly modeled as the broadest consumer
- Forge and Compose have a future migration path without requiring immediate rewrite

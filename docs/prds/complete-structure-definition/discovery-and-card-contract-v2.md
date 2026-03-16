# Discovery And Card Contract V2

## Purpose

Define the shared discovery and card model for `transport-types v2`.

## Core Definition

The platform should have a **lean shared discovery/card contract** that all four products can use:

- `Compose`
- `Forge`
- `Bridge`
- `Pulse`

The shared contract should support:

- A2A discovery
- capability identification
- routing metadata
- enough descriptive metadata for internal and external consumers

It should not force every product to carry the richest external interoperability metadata that `Bridge` may eventually need.

## Why V2 Exists

Discovery is a shared transport concern, but not every product needs the same richness.

The shared contract needs to be:

- simple enough for internal products
- stable enough for frontend and cross-product use
- extensible enough for Bridge

That means the core shape must stay small and intentional.

## Shared Discovery Goals

The shared contract should answer:

1. What capability or agent is this?
2. Is it discoverable?
3. How do I invoke it through the shared A2A model?
4. What kind of output should I expect?
5. What optional metadata is safe to expose in discovery?

## Shared Contract Components

The minimum shared discovery model should include:

- a well-known listing shape
- a card or descriptor shape for a capability
- routing/invocation metadata
- output-type hints where useful
- product-neutral metadata fields

## Well-Known Direction

The shared discovery layer should support a well-known listing endpoint or generated equivalent.

Its job is to expose:

- the set of discoverable capabilities
- summary-level metadata for each one
- enough information to retrieve or construct the deeper card/descriptor shape

It should not be treated as a dumping ground for product-local internal state.

## Card Direction

The shared card should identify a capability or agent in a way that is useful across products.

The card should answer:

- who the capability is
- what kind of thing it is
- whether it is discoverable
- how it should be invoked through the shared A2A contract
- what output styles it commonly produces

## Shared Card Fields

The shared core should likely include fields such as:

- `id`
- `slug`
- `name`
- `description`
- `kind`
- `discoverable`
- `invoke`
- `outputTypes`
- `metadata`

## Meaning Of Core Fields

### `id`

Stable unique identifier for the capability/card record.

### `slug`

Human-meaningful stable routing or discovery identifier.

### `name`

Display label for UI and human inspection.

### `description`

Short explanation of what the capability does.

### `kind`

High-level classification such as:

- `context`
- `rag`
- `api`
- `external`
- `media`
- `capability`
- `workflow`
- `automation`

The exact vocabulary can be finalized later, but the field should help consumers reason about what they are invoking.

### `discoverable`

Explicit flag for whether a capability should appear in discovery output.

### `invoke`

Shared invocation metadata needed to call the capability through the A2A contract.

This should stay narrow and aligned to `invoke-contract-v2.md`.

### `outputTypes`

Optional list of expected or supported output types such as:

- `text`
- `markdown`
- `json`
- `image`
- `video`
- `audio`

This helps UI and downstream agents reason about likely outputs without forcing strict runtime guarantees into discovery.

### `metadata`

Optional extra descriptive fields that remain product-neutral and safe to expose.

## Invoke Metadata Shape

The shared invoke metadata should not try to encode the entire transport stack.

The likely direction is:

```typescript
interface CapabilityInvokeDescriptor {
  method: 'invoke';
  inputTypes?: string[];
  outputTypes?: string[];
  streaming?: boolean;
}
```

This tells consumers how to think about invocation without duplicating the full invocation contract inside the card.

## Proposed Shared Card Shape

```typescript
interface CapabilityCardV2 {
  id: string;
  slug: string;
  name: string;
  description?: string;
  kind: string;
  discoverable: boolean;
  invoke: CapabilityInvokeDescriptor;
  outputTypes?: string[];
  metadata?: Record<string, unknown>;
}
```

This is illustrative, not the final transport package code.

## Relationship To Compose

Compose needs the leanest version of this model.

For Compose, a card or descriptor is especially useful for:

- external agents
- API-wrapped agents
- lightweight remote capability references

Compose should not need Bridge-level interoperability metadata in order to consume or expose a simple capability card.

## Relationship To Forge

Forge benefits from discovery for capability modules.

Forge cards should expose:

- capability identity
- discoverability
- A2A invoke compatibility
- likely output behavior

This fits naturally with the decorator and registry model.

## Relationship To Bridge

Bridge is the broadest discovery consumer and producer.

Bridge should consume the same shared card core, then extend it where needed for:

- external interoperability metadata
- richer negotiation hints
- richer trust or identity declarations
- partner-specific compatibility information

Those richer fields should not be required in the shared cross-product card shape.

## Relationship To Pulse

Pulse may need discovery for internal automation capabilities, but it should still consume the same core model.

If Pulse needs watcher- or trigger-specific discovery metadata, those should stay out of the shared card core unless they later prove to be cross-product concerns.

## Relationship To Decorators And Registry

This discovery/card contract aligns naturally with the protocol decorator model.

The intended flow is:

1. decorators declare capability metadata
2. a registry collects capability and transport metadata
3. a generator emits well-known output and cards
4. the shared transport-types package defines the result shape

This keeps the runtime and the shared discovery contract cleanly separated.

## What Should Stay Out Of The Shared Core

The shared discovery/card contract should avoid:

- product-local controller details
- raw provider implementation details
- Bridge-only negotiation richness
- Pulse-only trigger metadata
- internal-only operational state
- workflow bookkeeping inherited from older systems

## Design Principles

1. Keep the shared discovery/card shape small.
2. Keep the shared shape useful across all four products.
3. Let Bridge extend outward instead of forcing everyone else to inherit Bridge-level complexity.
4. Keep discovery descriptive, not operationally overloaded.
5. Align discovery metadata to the shared `invoke` contract.

## Success Criteria

- all four products can emit or consume the same basic card shape
- `Compose` can use the shared shape without extra Bridge complexity
- `Forge` can generate cards from capability metadata cleanly
- `Bridge` can extend the shared shape without bloating the core
- the shared discovery model stays aligned to the A2A `invoke` contract

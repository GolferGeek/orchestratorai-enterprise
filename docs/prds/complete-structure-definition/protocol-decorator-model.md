# Protocol Decorator Model

## Purpose

Define a NestJS-friendly way to expose platform capabilities through shared protocols without hard-coding protocol behavior into each product endpoint.

## Why This Exists

The platform is moving toward:

- shared protocol packages
- product-specific protocol presets
- simpler product runtimes

For products like Forge, the cleanest shape is:

- capability module in the center
- protocol adapters at the edges
- metadata-driven exposure for A2A and discovery, with broader external adapters reserved primarily for Bridge

Decorators are a good fit for the declaration layer of this model.

## Core Principle

Decorators should declare **protocol metadata**, not implement protocol behavior directly.

The runtime behavior should still live in:

- guards
- pipes
- interceptors
- registry services
- protocol adapter services
- well-known / agent-card generators

## What Decorators Are Good For

Decorators are well suited to declaring:

- capability identity
- A2A and discovery participation
- whether a capability should appear in discovery output
- which preset applies to an endpoint or controller
- which protocol layers are overridden from the default preset

## What Decorators Should Not Do

Decorators should not become hidden engines that:

- sign requests themselves
- validate transport envelopes themselves
- generate agent cards themselves
- encrypt payloads themselves
- perform retries themselves
- invoke LangGraph workflows themselves

Those concerns belong in runtime services.

## Recommended Decorator Layers

### 1. Capability Decorator

Describes the capability exposed by a controller or module.

Example responsibilities:

- capability id
- display name
- description
- category
- discoverability

Example:

```ts
@Capability({
  id: 'marketing-swarm',
  name: 'Marketing Swarm',
  discoverable: true,
})
```

### 2. Protocol Preset Decorator

This should be the main decorator used in application code.

It applies an approved protocol stack or subset by name.

Example:

```ts
@ProtocolPreset('internal-a2a')
@ProtocolPreset('external-a2a')
```

This keeps endpoints readable and prevents decorator explosion.

### 3. Transport Endpoint Decorator

Declares that a given route participates in a specific transport or endpoint pattern.

Examples:

```ts
@A2AEndpoint({ method: 'invoke' })
@ExposeWellKnown()
```

### 4. Protocol Layer Override Decorator

Use this only when the preset needs small changes.

Example:

```ts
@ProtocolLayers({
  transport: 'a2a-jsonrpc',
  identity: 'oauth-jwt',
  trust: 'allowlist',
  encryption: 'tls-mutual',
  audit: 'hash-chain',
})
```

## Protocol Layer Vocabulary

The protocol system should think in terms of these major layers:

- `discovery`
- `transport`
- `security`
- `identity`
- `trust`
- `encryption`
- `resilience`
- `negotiation`
- `orchestration`
- `audit`
- `observability`
- `payment`
- `wallet`

Products should normally consume these through presets, not by individually decorating every layer.

## Runtime Architecture

The decorator model only works cleanly if the runtime has these shared pieces:

### Capability Registry

A startup-time registry discovers decorated capabilities and endpoints and stores metadata about:

- capability id
- transports
- presets
- discovery visibility
- endpoint mappings

In definition-driven products, the registry may also merge runtime metadata from:

- decorators on code-defined capabilities
- stored agent-definition metadata where that metadata is part of the approved product model

### Well-Known / Agent Card Generator

This service reads the registry metadata and generates:

- `.well-known`
- agent cards
- discovery metadata

This avoids hand-maintaining discovery documents inside each controller.

### Protocol Adapters

Shared adapters implement behavior for:

- A2A
- discovery generation
- approved external protocol adapters where required, primarily in Bridge

They normalize inbound requests into a common invocation shape and map results back to the relevant transport envelope.

## Forge Usage Model

Forge is the clearest beneficiary of this pattern.

A Forge capability module should:

1. declare itself with capability metadata
2. expose approved A2A and discovery endpoints
3. let shared protocol adapters handle transport semantics
4. invoke a LangGraph workflow through normal NestJS services

This allows Forge to support:

- A2A
- discovery output
- explicit capability metadata for the shared registry

without turning each module into a custom transport framework.

## Compose Usage Model

Compose uses the same protocol model, but with a more definition-first center of gravity.

That means:

1. shared decorators still declare product and endpoint behavior
2. Compose has a standard internal A2A posture rather than per-agent protocol configuration
3. database-defined agent records should stay focused on agent behavior, not protocol-stack selection
4. the runtime merges product defaults, decorator metadata, and approved agent-definition metadata before execution

This keeps Compose lean and avoids turning the agent table into a protocol-control surface.

## Bridge And Pulse Usage Model

Bridge and Pulse already operate closer to protocol-centric behavior.

For them, decorators are still useful, but mainly as a way to:

- standardize capability declarations
- expose discovery metadata
- align product endpoint policy with shared protocol packages

For Bridge specifically, richer external protocol adapters may still exist, but those should extend the shared A2A and discovery foundation rather than redefine the internal platform story.

## Recommended Sequence

1. define the shared protocol package and preset model
2. define the capability registry and discovery model
3. define the decorator metadata API
4. implement adapters/interceptors/guards
5. adopt the pattern first in Forge or a pilot module

## Success Criteria

- protocol metadata can be declared cleanly in NestJS code
- discovery output can be generated from metadata rather than hand-maintained
- products can expose A2A and discovery cleanly, while Bridge can extend outward where external interoperability requires more
- decorators improve clarity without hiding runtime behavior

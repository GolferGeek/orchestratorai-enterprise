# Claude Agent Alignment

## Purpose

Define how Claude agents and guidance should evolve once the application structure is cleaned up around planes, protocols, and sharper product boundaries.

## Principle

The Claude agents should understand the architecture as it actually exists, not as it existed during earlier copying and specialization phases.

Agent guidance should become more precise as the products become more precise.

## Desired End State

At the end of the structure work:

- product agents understand the exact boundaries of their products
- shared-architecture agents understand the precise package model
- skills reinforce the new planes/protocols definitions
- outdated specialization assumptions are removed

## What Needs To Be Updated

### Product Agents

The following product agents should be reviewed and updated for architectural precision:

- `forge-product-agent`
- `compose-product-agent`
- `pulse-product-agent`
- `bridge-product-agent`
- `auth-product-agent`
- `admin-product-agent`
- `command-product-agent`

### Shared Skills

These skills will likely need refinement or supplementation:

- `enterprise-architecture-skill`
- `planes-architecture-skill`
- `ambient-protocol-skill`
- `transport-types-skill`
- `execution-context-skill`
- `product-specialization-skill`

## Specific Alignment Goals

### Forge Agent

Must understand:

- Forge is the complex-agent product
- Forge should consume shared planes instead of carrying inherited infrastructure copies
- Forge is A2A-native at the edge
- Forge may adopt shared protocols incrementally, not through a forced all-at-once rewrite
- Forge streaming should be understood as part of the observability-plane story, not product-local plumbing

### Compose Agent

Must understand:

- Compose is the simple-runner and composition product
- Compose should remain lean
- Compose is single-action and definition-first
- Compose is conversation-centric rather than task/deliverable-centric
- Compose’s future protocol adoption is narrower and more selective than Bridge’s

### Bridge Agent

Must understand:

- Bridge is the broadest protocol consumer
- Bridge is the compatibility edge of the platform
- Bridge behavior is still constrained by presets and policy
- Bridge still uses the shared A2A invoke contract and first-class `ExecutionContext`

### Pulse Agent

Must understand:

- Pulse is protocol-aware but not protocol-maximal
- Pulse should consume shared protocols for ambient automation where that simplifies the platform
- Pulse must align with transport-types and ExecutionContext rules
- Pulse streaming and execution visibility should flow through the observability plane

### Auth Agent

Must understand:

- `Auth` is both a product and a consumer of auth-plane abstractions
- the `Auth` app is not replaced by the auth plane

## Guidance Quality Standard

Agent docs should answer these questions clearly:

1. What does this product own?
2. What does it explicitly not own?
3. Which shared packages must it consume?
4. Which local architecture patterns are forbidden?
5. What are the non-negotiable contracts for this product, including `ExecutionContext`, `invoke`, discovery, and observability?

## Documentation Strategy

The agent docs should be updated only after the structure definitions are settled, so they reflect stable architecture rather than intermediate discussion.

The intended sequence is:

1. settle structure definitions
2. settle product boundaries
3. update shared skills
4. update product agents
5. update product-level CLAUDE files if needed

## Success Criteria

- agents describe the current architecture accurately
- Forge and Compose agents reflect their rewritten boundaries
- Bridge and Pulse agents reflect protocol policy and package usage correctly
- shared skills reinforce the same architecture model instead of older copied assumptions

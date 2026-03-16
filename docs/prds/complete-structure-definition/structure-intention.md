# Planes And Protocols Foundation
**Status:** pending
**Created:** 2026-03-16
**Project:** orchestratorai-enterprise
**Priority:** 1

## Intent
Capture the high-level architecture decisions for `planes` and `protocols` before writing or revising PRDs and implementation plans.

This intention exists so the team can discuss and break out the work incrementally without forcing the conversation into a product-specific PRD too early.

The current direction is:

- `planes` are shared infrastructure abstractions for platform portability across provider environments.
- `protocols` are shared communication and interaction abstractions.
- apps come later as adopters of these abstractions, not as the starting point for defining them.

## Current Working Decisions

### Planes

- `planes` are for deployment portability of the platform codebase, not default runtime multi-cloud mixing inside each client deployment.
- A normal client deployment will usually choose one provider stack per concern and stay there.
- `observability` should be a full plane.
- `supabase-core` should not be treated as a top-level platform plane; it is an implementation detail behind other abstractions.
- `workflow` or `work-routing` is not assumed to be a core plane until we prove it is truly cross-product infrastructure.

### Auth

- `Auth` remains a real app and product.
- `auth` also exists as a plane concern through provider abstractions and adapters.
- The `Auth` app depends heavily on the auth plane, but it is not replaced by it.
- The `Auth` app owns OrchestratorAI platform behavior such as token lifecycle, entitlements, role semantics, and the canonical internal auth contract.

### Protocols

- Ambient protocols should move into `packages` as shared platform capabilities.
- The protocol package should contain the broad capability set.
- Products should not necessarily expose or allow the full protocol surface dynamically.
- Bridge is the broadest protocol consumer and may need the richest supported set.
- Internal products should use a narrower approved subset of protocols.
- Protocol behavior should be constrained by presets, config, and policy rather than arbitrary runtime composition.

### Adoption Strategy

- Define planes and protocols first.
- Derive product adoption from those definitions second.
- Do not rewrite Forge and Compose around the full protocol system immediately unless a later decision explicitly chooses that migration.
- Bridge and Pulse are the first consumers of the protocol stack.

## Architecture Principles

1. Keep the shared abstractions simple and explicit.
2. Extract only code that is truly shared and product-agnostic.
3. Do not normalize temporary app-specific wiring into shared packages.
4. Prefer one approved protocol preset per deployment over runtime protocol sprawl.
5. Preserve future flexibility in the package layer while keeping product behavior opinionated and controlled.

## Acceptance Criteria

- [ ] We have a clear written definition of what belongs in `packages/planes`.
- [ ] We have a clear written definition of what belongs in the protocol package(s).
- [ ] We have a clear distinction between `Auth` as an app and auth as a plane concern.
- [ ] We have an explicit decision on whether `work-routing` belongs in the core plane set.
- [ ] We have an explicit decision on how much protocol configurability Bridge exposes in production.
- [ ] We have enough clarity to write one or more PRDs from this foundation without re-litigating the model.

## Scope Boundaries

- IN: architecture definitions, boundaries, package responsibilities, app-vs-package responsibilities, protocol preset philosophy
- OUT: detailed implementation plan, file-by-file migration steps, product-specific code changes, exhaustive PRD language

## Follow-On Intentions To Create

- Define the authoritative `planes` package model
- Define the authoritative protocol package model
- Define `Auth app` vs `auth plane` contract
- Decide whether `work-routing` belongs in the core plane set
- Plan Bridge protocol presets and allowed runtime behaviors
- Plan Pulse and Bridge adoption of shared protocols
- Plan Forge and Compose future protocol adoption path
- Define lean-application and debt-removal standards
- Update Claude agents and skills to reflect the final product boundaries
- Define the protocol decorator and capability-registry model for NestJS products
- Define `transport-types v2` as the shared A2A contract for Compose, Forge, Bridge, and Pulse
- Define `ExecutionContext v2` as the lean cross-product execution capsule
- Define `agent table v2` for Compose as the simplified single-action definition model
- Define `invoke contract v2` as the shared JSON-RPC A2A request/response model
- Define `discovery/card contract v2` as the shared capability discovery model
- Define `streaming event contract v2` as the shared incremental execution event model
- Define the `observability` plane as the shared operational backbone for invocation and streaming

## Companion Documents

- `planes-definition.md`
- `protocols-definition.md`
- `forge-and-compose-structure.md`
- `forge-structure.md`
- `compose-structure.md`
- `compose-conversation-centric-model.md`
- `protocol-decorator-model.md`
- `transport-types-v2.md`
- `execution-context-v2.md`
- `agent-table-v2.md`
- `invoke-contract-v2.md`
- `discovery-and-card-contract-v2.md`
- `streaming-event-contract-v2.md`
- `observability-plane-definition.md`
- `lean-applications-and-debt-removal.md`
- `claude-agent-alignment.md`

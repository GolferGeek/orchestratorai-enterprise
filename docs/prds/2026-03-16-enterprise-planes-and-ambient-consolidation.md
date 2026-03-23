---
created: 2026-03-16
status: draft
project: Enterprise Planes and Ambient Consolidation
products: [auth, admin, forge, compose, pulse, bridge]
---

# PRD: Enterprise Planes and Ambient Consolidation

## Summary

This PRD restarts the planes-consolidation effort from the **actual state of `orchestratorai-enterprise`**, while preserving the original intent from the dev repo:

- `packages/planes` becomes the single source of truth for shared infrastructure
- observability becomes a first-class shared plane instead of product-local wiring
- Pulse and Bridge align to one ambient protocol core
- A2A, `ExecutionContext`, streaming, and observability behavior become consistent across products

The key correction is scope grounding. This repo is **already** a split-product monorepo with `apps/auth`, `apps/forge`, `apps/compose`, `apps/ambient/pulse`, `apps/ambient/bridge`, `packages/transport-types`, `packages/planes`, and `packages/ui`. We are not planning from a monolith or from a future structure. We are consolidating what exists here.

## Why This PRD Exists

The previous plan captured the right architecture intent but inherited repo assumptions from `orchestrator-ai-dev`. That created avoidable confusion around:

- source paths
- package names
- product boundaries
- what is already shared vs still duplicated
- which modules are truly portable into `packages/planes`

This PRD replaces those inherited assumptions with enterprise-repo facts.

## Repo Reality

### What already exists here

1. The enterprise repo already uses the split-product layout declared in the root `package.json` workspaces.
2. `packages/planes` already exists as a workspace package and already contains the shared implementations for:
   - database
   - config
   - storage
   - rag
   - llm
   - partial auth provider code
   - partial work-routing code
   - supabase-core
3. `apps/ambient/core/shared-protocols` and `apps/ambient/core/shared-types` already exist and are the best current source for shared ambient protocol logic.

### What is still duplicated or inconsistent

1. Forge, Compose, and Pulse each still carry a full local `src/planes/` tree mirroring `packages/planes`.
2. Forge, Compose, and Pulse each still carry a full local `src/observability/` implementation.
3. Bridge still bypasses planes in at least:
   - `apps/ambient/bridge/api/src/database/bridge-database.service.ts`
   - `apps/ambient/bridge/api/src/messaging/messaging-database.service.ts`
4. Pulse still creates Supabase clients directly in business logic in at least:
   - `apps/ambient/pulse/api/src/listeners/db-watcher.service.ts`
   - `apps/ambient/pulse/api/src/triggers/triggers.controller.ts`
5. Pulse still constructs `ExecutionContext` objects inside backend services and runners, which conflicts with the repo’s capsule rules.
6. Ambient protocol code is duplicated under:
   - `apps/ambient/core/shared-protocols`
   - `apps/ambient/pulse/packages/shared-protocols`
   - `apps/ambient/bridge/packages/shared-protocols`
7. Package/import naming is inconsistent across the repo. Some code still imports `@orchestrator-ai/transport-types` while repo-level docs now describe `@orchestratorai/transport-types`.

### Important boundary already documented in code

`packages/planes/index.ts` explicitly says `AuthModule` is not yet a clean shared module because it still depends on app-local imports. This is an architectural fact, not a temporary inconvenience to ignore.

## Problem

The current state makes architecture expensive to reason about and risky to change:

1. Shared infrastructure fixes must be repeated across products.
2. Ambient protocol changes can diverge between Core, Pulse, and Bridge.
3. Observability is not truly cross-product.
4. Bridge and Pulse do not consistently use the same database, A2A, and context patterns as the rest of the platform.
5. The current duplication invites silent drift in behavior, test coverage, and protocol compliance.

## Goals

1. Make `packages/planes` the authoritative source for shared infrastructure that is truly product-agnostic.
2. Create a shared observability plane and remove product-local observability implementations where appropriate.
3. Make `apps/ambient/core` the authoritative ambient protocol source and remove duplicate protocol copies from Pulse and Bridge.
4. Bring Bridge and Pulse onto shared database, observability, and transport contracts.
5. Reduce duplicate infrastructure code without forcing unsafe extractions.
6. Align the implementation with the repo’s existing architecture rules:
   - no fallbacks
   - ExecutionContext capsule integrity
   - transport-types as contract
   - product boundaries respected

## Non-Goals

1. Rebuilding the repo structure or introducing a new monorepo layout.
2. Moving everything immediately into a new `packages/ambient-protocols` package.
3. Forcing `AuthModule` into `packages/planes` before its app-local dependencies are removed.
4. Expanding Bridge into payment-gating, commerce, or advanced wallet work in the same effort unless required by an already-existing product requirement.
5. Rewriting Command, Landing, Assistant, or unrelated web applications.

## Architectural Principles

### 1. Prefer the simplest consolidation path

For ambient protocols, the simplest correct first move is:

- make `apps/ambient/core/shared-protocols` the single source of truth
- repoint Pulse and Bridge to it
- delete duplicate copies

Only after that is stable should we decide whether promotion into `packages/ambient-protocols` is worth the extra workspace and build complexity.

### 2. Extract only what is truly shared

This effort should not “win” by copying app-local modules into a package. Shared packages must contain product-agnostic code, not hidden product assumptions.

### 3. Do not normalize violations by spreading them

Known violations like backend-built `ExecutionContext`, direct `createClient()` in business logic, or product-local observability forks must be removed, not propagated into shared packages.

### 4. No fake compatibility layers

If package namespace, provider selection, or protocol behavior differs between products, the fix is to standardize the contract, not to add fallback aliases and dual behavior.

## In Scope

### Shared infrastructure consolidation

- `packages/planes`
- local `src/planes` copies in Forge, Compose, Pulse
- local product observability modules in Forge, Compose, Pulse
- Bridge database bypasses
- Pulse direct Supabase client bypasses

### Ambient protocol consolidation

- `apps/ambient/core/shared-protocols`
- `apps/ambient/core/shared-types`
- duplicate protocol copies in Pulse and Bridge
- Bridge protocol wiring
- Pulse protocol wiring where it affects A2A and automation execution

### Contract alignment

- transport-types import namespace consistency
- A2A JSON-RPC envelope compliance around a shared `invoke` contract
- observability metadata consistency
- lean `ExecutionContext v2` handling in Pulse and Bridge flows
- streaming event consistency through the observability plane

## Out of Scope

- command shell work
- landing
- assistant placeholder work
- broad UI redesign
- unrelated domain logic in Forge, Compose, Auth, or Admin

## Target State

### Shared planes

`packages/planes` is the authoritative source for shared infrastructure with:

- `DatabaseModule`
- `ConfigProviderModule`
- `StorageModule`
- `RagStorageModule`
- `LLMPlaneModule`
- `ObservabilityModule` as a new shared plane

Auth and work-routing support code may continue to live partly in `packages/planes`, but only the truly shared provider/interface pieces move there. App-local orchestration modules remain in product apps until they are genuinely decoupled.

### Ambient protocols

`apps/ambient/core/shared-protocols` and `apps/ambient/core/shared-types` are the single source of truth for ambient protocols and types in the first consolidation stage. Pulse and Bridge consume those shared implementations directly, and their local duplicate protocol packages are removed.

### Product behavior

1. Forge, Compose, and Pulse no longer maintain their own plane forks.
2. Forge, Compose, and Pulse no longer maintain separate observability stacks.
3. Bridge uses shared database and observability abstractions instead of direct Supabase clients.
4. Pulse uses shared database abstractions instead of direct Supabase clients in business logic.
5. Bridge and Pulse use platform-standard A2A request and response envelopes.
6. Observability data and streaming events are emitted through a shared interface owned by the observability plane.

## Workstreams

## Workstream 1: Baseline Contract Corrections

Before large extraction work begins, fix the issues that would otherwise be copied forward:

1. Normalize the transport-types package namespace used in this repo.
2. Fix the LLM usage-recording gap in the fine-control path.
3. Identify and remove direct `createClient()` use in business logic where a plane should be used.
4. Identify all backend-created `ExecutionContext` usage in Pulse and classify each case as:
   - bug to remove
   - allowed system automation pattern that requires a documented contract

This workstream is required before broader consolidation, because it defines the contract shared packages must enforce.

## Workstream 2: Observability Plane

Create a shared observability plane in `packages/planes` that can replace product-local observability implementations.

Requirements:

1. Introduce `OBSERVABILITY_SERVICE` and a shared provider interface.
2. Support at least:
   - database-backed event persistence
   - file-log or local developer logging
   - production-grade provider integration where already justified
3. Replace Forge, Compose, and Pulse product-local observability implementations with the shared plane.
4. Own streaming event emission, correlation, trace linkage, and operational visibility for the shared A2A contract.
5. Provide a migration path for Admin, Auth, and Bridge to adopt the same interface over time.

## Workstream 3: Shared Planes Adoption

Replace local plane copies with imports from `packages/planes`, starting with the products that already closely mirror the shared package:

1. Forge
2. Compose
3. Pulse

Then adopt shared planes in:

4. Bridge for database and observability
5. Auth and Admin only where the shared modules are already cleanly portable

This workstream explicitly does **not** require moving app-local auth orchestration modules into `packages/planes` prematurely.

## Workstream 4: Ambient Core Canonicalization

Consolidate ambient protocol logic around `apps/ambient/core`:

1. Make `apps/ambient/core/shared-protocols` the only protocol implementation source.
2. Make `apps/ambient/core/shared-types` the only protocol type source.
3. Remove duplicate `packages/shared-protocols` copies from Pulse and Bridge.
4. Repoint internal imports, tests, and build config to the core source.
5. Re-evaluate a future promotion to `packages/ambient-protocols` only after deduplication is complete and build boundaries are clean.

## Workstream 5: Pulse and Bridge Alignment

### Pulse

Pulse must:

1. stop building ad hoc database clients in business logic
2. use shared database and observability abstractions
3. stop inventing or mutating transport contracts
4. align automation execution paths with the platform A2A `invoke` contract
5. resolve backend `ExecutionContext` construction in a way that matches the platform rules

### Bridge

Bridge must:

1. stop using direct Supabase clients in product-specific database services
2. route through shared database and observability abstractions
3. align inbound and outbound A2A handling to platform JSON-RPC transport types and the shared `invoke` contract
4. use the core ambient protocol implementation instead of local duplicated protocol code

## Key Decisions Required

### Decision 1: ExecutionContext for ambient automation

The repo rule says backend code must not construct `ExecutionContext`, but Pulse currently does so in multiple places. This effort must resolve that intentionally. The implementation plan may not simply preserve the current behavior under a shared abstraction.

This PRD requires an explicit design decision for system-triggered automation context creation before broad Pulse refactoring proceeds.

### Decision 2: Ambient protocols stay in `apps/ambient/core` first

Unless there is a demonstrated need for package promotion now, we keep ambient protocols canonical in `apps/ambient/core` for the first consolidation pass. This is the simplest path and avoids repeating the mistake of planning a package move before the existing repo is aligned.

### Decision 3: Auth module is not forcibly extracted

`AuthModule` remains app-local until its dependencies are truly decoupled. Shared interfaces and provider logic can live in `packages/planes`, but app orchestration stays in the apps for now.

## Success Criteria

1. `packages/planes` is the authoritative source for shared infrastructure used by the products that can consume it safely.
2. Forge, Compose, and Pulse no longer carry full local plane forks.
3. Forge, Compose, and Pulse no longer maintain separate local observability stacks.
4. Bridge no longer uses direct Supabase clients in business logic where shared database abstractions should apply.
5. Pulse no longer uses direct Supabase clients in business logic where shared database abstractions should apply.
6. Ambient protocol duplication between Core, Pulse, and Bridge is removed.
7. Bridge and Pulse use platform-standard A2A request and response envelopes.
8. Streaming operational behavior flows through the shared observability plane instead of product-local event plumbing.
9. Any remaining non-shared auth code is explicitly documented as app-local rather than accidentally duplicated.
10. The repo has one clear answer for:
   - shared infrastructure source of truth
   - shared ambient protocol source of truth
   - observability contract
   - A2A transport contract

## Validation

The implementation plan derived from this PRD must validate:

1. lint on each affected product and package
2. clean TypeScript builds for each affected product and package
3. unit tests for shared package behavior
4. product smoke tests for Forge, Compose, Pulse, Bridge, Auth, and Admin as applicable
5. browser or API verification for the product flows changed by consolidation

## Next Step

Use this PRD to generate a **new enterprise-only implementation plan** that:

1. references enterprise repo paths only
2. uses current package names and workspace names only
3. respects existing module boundaries
4. separates mandatory consolidation work from optional future package promotion

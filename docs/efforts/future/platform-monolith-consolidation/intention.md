# Platform Monolith Consolidation — One Web App + One API App

## What we're doing

Consolidate the current multi-application shape into a simpler starter-platform architecture: one deployable web frontend and one deployable API backend.

Today the repo is organized around separate applications for product areas:

- Auth
- Admin
- Command
- Forge workflows
- Compose agents
- Ambient Pulse
- Secure Conversations / A2A
- Protocol Lab

That separation has architectural value for large enterprise teams, but this product is primarily a starter platform for small and medium enterprises. The current structure makes the platform harder to explain, harder to sell, harder to deploy, and harder to operate than the target customer needs.

The new shape should make the product easy to describe:

> OrchestratorAI is one AI operations platform with agents, workflows, ambient automation, secure conversations, and administration built into one installable web/API system.

## Target shape

```text
apps/
  web/
  api/

packages/
  transport-types/
  planes/
  ui/
```

Inside `apps/api`, capabilities are internal NestJS modules:

```text
apps/api/src/
  auth/
  admin/
  agents/
  workflows/
  ambient/
  secure-conversations/
  rag/
  integrations/
  invoke/
  health/
  main.ts
  app.module.ts
```

Inside `apps/web`, capabilities are frontend areas in one application shell:

```text
apps/web/src/
  app/
  shell/
  modules/
    auth/
    admin/
    agents/
    workflows/
    ambient/
    secure-conversations/
    rag/
    integrations/
    settings/
  shared/
  testing/
```

The current Command frontend product launcher/dropdown remains conceptually intact, but it stops launching separate frontend applications. It becomes a capability switcher inside the unified Vue app. Selecting a capability loads the route/component tree from the new local module structure and calls the corresponding module routes on the unified API.

Example target navigation:

```text
/dashboard
/agents
/workflows
/ambient
/secure-conversations
/admin
/rag
/settings
```

## Why now

The current structure optimizes for independent product teams and future large-enterprise deployment patterns. That is not the immediate product need.

The immediate need is:

- a platform that can be explained quickly
- a platform that can be deployed by a small team
- a platform that has one install story
- a platform that exposes advanced capabilities without forcing customers to understand internal service boundaries

Small and medium enterprises will need ambient automation, secure external agent conversations, and workflows, but they should experience those as capabilities of one platform, not as separate applications they must install and reason about.

## Guiding decisions

1. **One web frontend and one API backend are the default.**
   Do not preserve separate deployable backend applications unless a specific runtime need requires it.

2. **Capabilities move to modules, not vague shared code.**
   Auth, agents, workflows, ambient automation, and secure conversations should become clear internal modules with public service interfaces.

3. **Keep infrastructure boundaries intact.**
   `packages/planes/` remains the only place for infrastructure providers. Product modules must not import Supabase, LLM, storage, observability, or provider-specific code directly.

4. **Keep transport types authoritative.**
   `@orchestratorai/transport-types` remains the shared contract for invocation, ExecutionContext, and A2A data shapes used inside secure conversations.

5. **ExecutionContext remains whole and immutable.**
   Consolidation must not loosen ExecutionContext discipline. Every LLM/service call still receives the complete context capsule.

6. **No fallback migration paths.**
   The migration should expose and fix broken assumptions. Do not mask old app dependencies with fallback loaders, compatibility shims, swallowed errors, or duplicate data sources.

7. **Workers are optional later, not the starting architecture.**
   If ambient jobs or workflow execution become too heavy for the API process, add a worker entrypoint later that imports the same modules. Do not preserve today’s multi-app structure just to anticipate that.

## Continuity guarantees

The consolidation must preserve the core platform contracts end to end:

- The unified web app still creates or forwards the complete `ExecutionContext` required by each capability.
- The unified API passes `ExecutionContext` whole through auth, agents, workflows, ambient automation, secure conversations, invoke dispatch, LLM calls, service calls, and observability.
- A2A communication remains JSON-RPC 2.0 `invoke` using `@orchestratorai/transport-types`; secure conversations is the module name, not a new transport contract.
- Frontend modules use the shared API client and unified API module routes. They do not call old product API ports.
- Auth, RBAC, entitlements, and route visibility continue to use one coherent source of truth across the unified web/API app.
- Browser-visible verification must prove the launcher/capability switcher still loads the right UI module and sends requests to the right unified API module.

## Phasing overview

1. Inventory the current app boundaries and classify each route/module as web, API capability, infrastructure, or obsolete.
2. Define the target API module map and the target web route map.
3. Move auth/admin/command shell concerns into the unified app shape, converting old product links into in-app capability routes.
4. Move Compose agent capabilities into `apps/api/src/agents` and `apps/web/src/modules/agents`.
5. Move Forge workflow capabilities into `apps/api/src/workflows` and `apps/web/src/modules/workflows`.
6. Move Pulse ambient capabilities into `apps/api/src/ambient` and `apps/web/src/modules/ambient`.
7. Move Bridge/A2A capabilities into `apps/api/src/secure-conversations` and `apps/web/src/modules/secure-conversations`.
8. Classify Protocol Lab as either a non-starter developer-only module, an archived demo, or a future separate effort; do not silently carry it into the starter runtime.
9. Remove old deployable app entries, scripts, ports, Docker targets, and obsolete docs.
10. Verify the unified app through build, tests, local smoke, and browser-visible workflows.

## Execution model

When this effort moves from intention to implementation, run it as coordinated multi-agent work rather than a single linear migration.

Recommended agent roles:

1. **Orchestration agent**
   Owns sequencing, branch hygiene, source-of-truth updates, merge order, and final readiness. This agent decides which slices are safe to run in parallel and prevents frontend/backend/test work from drifting apart.

2. **Frontend agent**
   Moves existing frontend files into the new `apps/web/src/modules/...` structure, converts the old product launcher into the capability switcher, wires the route registry, integrates module services with the shared API client, and runs frontend e2e tests that verify the UI produces the correct unified API calls.

3. **Backend agent**
   Moves backend behavior out of the old app packages into `apps/api/src/...` modules, preserves public module boundaries, keeps planes and transport types authoritative, and verifies each module's build/unit tests as it lands.

4. **Testing agent**
   Continuously tests what becomes available. This includes unit/integration tests, endpoint checks, in-app browser verification, and later full end-to-end frontend-to-backend flows. Chrome testing comes after the unified web/API path works in normal e2e and in-app browser verification.

5. **Consistency review agent**
   Reviews frontend/backend slices when they claim completion. It checks naming, folder boundaries, ExecutionContext flow, A2A/secure-conversations contract preservation, auth/RBAC consistency, stale port references, and documentation drift.

Preferred execution order:

1. Establish the unified shell, route registry, shared API client, and API health/auth skeleton.
2. Migrate one capability end to end as a proof point.
3. Run frontend e2e and API tests for that capability.
4. Have the consistency review agent inspect the slice before expanding the pattern.
5. Parallelize remaining frontend/backend module moves only after the first slice proves the migration pattern.
6. Keep the testing agent running continuously as modules become available.
7. Finish with full frontend-to-backend e2e, then Chrome/browser testing, then removal of old deployables and docs.

## Done when

- The normal local start path is one web app and one API app.
- Root scripts expose one primary dev path for web and one for API.
- Existing product capabilities still exist as platform modules.
- The frontend launcher/dropdown still lets users choose what they want to do, but choices route inside the unified web app instead of launching separate apps.
- Frontend modules call unified API module endpoints, not old product API ports.
- There are no separate deployable API apps under `apps/auth`, `apps/admin`, `apps/forge`, `apps/compose`, `apps/ambient/pulse`, or `apps/ambient/bridge`.
- There are no separate deployable web apps under `apps/admin`, `apps/command`, `apps/forge`, `apps/compose`, `apps/ambient/pulse`, or `apps/ambient/bridge` in the starter runtime.
- Protocol Lab has an explicit final disposition outside the starter runtime, or a documented module mapping if intentionally retained.
- Auth, agents, workflows, ambient, and secure conversations use shared planes and transport types rather than product-local infrastructure.
- Documentation describes the product as one platform, not a constellation of services.
- Deployment docs describe a simple starter deployment: web, API, database.

## Explicitly not in scope

- Rewriting workflow behavior.
- Changing the JSON-RPC invoke contract.
- Changing ExecutionContext shape.
- Replacing `packages/planes/`.
- Introducing microservice boundaries.
- Adding separate queue/worker infrastructure unless a measured runtime problem requires it.
- Preserving old ports or app names as compatibility shims.

## Planning note

This effort intentionally starts from the intention only. Do not create a PRD or implementation plan until the intention has settled.

When ready to execute, generate the implementation plan directly from this intention, using the repo inventory as the source of truth for files, routes, scripts, and tests. The plan should be practical and phased, not a separate product-spec exercise.

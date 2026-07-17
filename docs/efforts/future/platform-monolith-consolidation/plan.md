# Platform Monolith Consolidation — Execution Plan

**Source of truth**: ./intention.md
**Created**: 2026-07-04
**Status**: In Progress
**Plan style**: intention-first, context-spanning, multi-agent

This plan is generated directly from the intention. There is no PRD for this effort.

## Resume Protocol

Every new context starts here:

1. Read `intention.md`.
2. Read this `plan.md`.
3. Read `state.md` if it exists.
4. Read `migration-map.md` if it exists.
5. Continue the first incomplete phase in the Progress Tracker.

When a phase changes state, update this file's Progress Tracker and append a short entry to `state.md`. `state.md` is the handoff ledger for context changes and agent coordination.

## Progress Tracker

- [x] Phase 0: Inventory, migration map, and state ledger
- [x] Phase 1: Create unified API/web shells
- [x] Phase 2: Prove the migration pattern with one capability slice
- [ ] Phase 3: Frontend module consolidation
- [ ] Phase 4: Backend module consolidation
- [ ] Phase 5: Continuous testing and consistency review
- [ ] Phase 6: Full frontend-to-backend verification
- [ ] Phase 7: Remove old deployables, scripts, ports, and docs
- [ ] Phase 8: Final hardening and completion report

## Context-Spanning Artifacts

Create and maintain these files during implementation:

- `state.md` — current phase, active branch, active agents, latest decisions, blockers, last verified commands.
- `migration-map.md` — current app/routes/files/scripts mapped to target modules or removal decisions.
- `agent-handoffs.md` — frontend/backend/testing/consistency handoff notes when agents complete slices.
- `verification-log.md` — build/test/e2e/browser evidence with dates, commands, and outcomes.
- `completion-report.md` — final summary after all gates pass.

These artifacts are required because this effort will span multiple contexts and likely multiple agents.

## Target Shape

```text
apps/
  api/
  web/

packages/
  transport-types/
  planes/
  ui/
```

API modules:

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
```

Web modules:

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

## Agent Lanes

### Orchestration Agent

Owns sequencing, state files, branch hygiene, integration order, and final readiness.

Responsibilities:

- Maintain `state.md`, `migration-map.md`, `agent-handoffs.md`, and `verification-log.md`.
- Decide which slices can run in parallel.
- Keep frontend/backend/testing work aligned.
- Prevent stale product vocabulary or old ports from reappearing.
- Decide when to advance or pause phases.

### Frontend Agent

Owns `apps/web`.

Responsibilities:

- Move existing frontend code into the `apps/web/src/modules/...` structure.
- Convert the old product launcher/dropdown into a capability switcher.
- Create route registry and endpoint registry.
- Ensure frontend services use the shared API client.
- Run frontend unit/e2e tests that prove the UI sends requests to unified API routes.

### Backend Agent

Owns `apps/api`.

Responsibilities:

- Move backend behavior from old app packages into target API modules.
- Preserve NestJS module boundaries and public service surfaces.
- Keep planes and transport types authoritative.
- Preserve `ExecutionContext` whole and immutable.
- Run build/unit tests for each migrated module.

### Testing Agent

Owns continuous verification.

Responsibilities:

- Test each newly available module.
- Run endpoint checks and integration tests.
- Use the in-app browser for browser-visible verification.
- Run frontend-to-backend e2e after paired frontend/backend slices land.
- Run Chrome testing only after normal e2e and in-app browser verification work.

### Consistency Review Agent

Owns architectural review after each claimed slice.

Responsibilities:

- Check naming and folder boundaries.
- Check `ExecutionContext` flow.
- Check A2A/secure-conversations transport preservation.
- Check auth/RBAC/entitlements consistency.
- Check stale old ports, scripts, docs, and product vocabulary.
- Check no fallback/shim logic was added.

## Phase 0: Inventory, Migration Map, And State Ledger

**Objective**: Create the context-spanning foundation before moving code.

Steps:

- [x] Create `state.md` with current phase, branch, active agents, and next action.
- [x] Create `migration-map.md` with sections for API apps, web apps, scripts, ports, docs, tests, and Protocol Lab.
- [x] Inventory root scripts and workspace entries in `package.json`.
- [x] Inventory API modules/controllers from:
  - `apps/auth/api`
  - `apps/admin/api`
  - `apps/forge/api`
  - `apps/compose/api`
  - `apps/ambient/pulse/api`
  - `apps/ambient/bridge/api`
- [x] Inventory web routes/services/components from:
  - `apps/command/web`
  - `apps/admin/web`
  - `apps/forge/web`
  - `apps/compose/web`
  - `apps/ambient/pulse/web`
  - `apps/ambient/bridge/web`
- [x] Classify Protocol Lab as archived/demo-only, developer-only outside starter runtime, future effort, or intentionally retained module.
- [x] Grep old product ports and route prefixes:
  - `6100`, `6101`, `6102`
  - `6200`, `6201`
  - `6300`, `6301`
  - `6500`, `6501`
  - `6600`, `6601`
  - `/forge`, `/compose`, `/pulse`, `/bridge`
- [x] Record all findings in `migration-map.md`.

Gate:

- [x] `state.md` exists and names the next executable phase.
- [x] `migration-map.md` maps every current deployable app to a target module or removal decision.
- [x] Protocol Lab has an explicit disposition.
- [x] No code has moved yet.

## Phase 1: Create Unified API/Web Shells

**Objective**: Establish `apps/api` and `apps/web` without migrating full behavior yet.

Backend steps:

- [x] Create `apps/api` using existing NestJS conventions from current apps.
- [x] Add `apps/api/src/main.ts`, `app.module.ts`, and `health/`.
- [x] Add placeholder modules:
  - `auth`
  - `admin`
  - `agents`
  - `workflows`
  - `ambient`
  - `secure-conversations`
  - `rag`
  - `integrations`
  - `invoke`
- [x] Wire root scripts `dev:api` and `build:api`.

Frontend steps:

- [x] Create `apps/web` using the current Vue/Ionic conventions.
- [x] Add `app`, `shell`, `modules`, `shared`, and `testing` folders.
- [x] Create `CapabilitySwitcher`, route registry, endpoint registry, and shared API client skeletons.
- [x] Add placeholder routes:
  - `/dashboard`
  - `/agents`
  - `/workflows`
  - `/ambient`
  - `/secure-conversations`
  - `/admin`
  - `/rag`
  - `/settings`
- [x] Wire root scripts `dev:web` and `build:web`.

Gate:

- [x] `cd apps/api && npm run build` passes.
- [x] `cd apps/web && npm run build` or equivalent build check passes.
- [x] `npm run dev:api` serves health.
- [x] `npm run dev:web` serves the unified shell.
- [x] `state.md` and `verification-log.md` are updated.

## Phase 2: Prove The Migration Pattern With One Capability Slice

**Objective**: Move one capability end to end before parallelizing broad migration.

Recommended first slice: `auth + shell/dashboard`, because every later module depends on auth/RBAC/entitlements and capability routing.

Steps:

- [x] Move auth/session/RBAC API behavior into `apps/api/src/auth`.
- [x] Move command shell/dashboard/login behavior into `apps/web/src/shell` and `apps/web/src/modules/auth`.
- [x] Make the capability switcher use unified route entries instead of product app URLs.
- [x] Make frontend auth services call `/api/auth` through the unified web proxy.
- [x] Verify the unified web app can log in, load dashboard, show entitled capabilities, and route inside the app in a browser.
- [x] Run API auth smoke and browser e2e for the slice.
- [x] Have the consistency review agent inspect the slice before continuing.

Gate:

- [x] Auth/shell proof slice works through unified web and unified API.
- [x] No frontend call targets old auth or command ports.
- [x] Auth/RBAC/entitlements have one coherent source of truth.
- [x] `ExecutionContext` flow is preserved where auth/invoke touches it.
- [x] Consistency review passes.

## Phase 3: Frontend Module Consolidation

**Objective**: Move UI code into the new frontend module structure and make it call unified API routes.

Run after Phase 2 proves the pattern. This phase can run partly in parallel with Phase 4, but every module pair must be tested together before it is marked complete.

Module moves:

- [ ] Admin web -> `apps/web/src/modules/admin`
- [ ] Compose web -> `apps/web/src/modules/agents`
- [ ] Forge web -> `apps/web/src/modules/workflows`
- [ ] Pulse web -> `apps/web/src/modules/ambient`
- [ ] Bridge web -> `apps/web/src/modules/secure-conversations`
- [ ] RAG/admin shared surfaces -> `apps/web/src/modules/rag`
- [ ] Settings/configuration surfaces -> `apps/web/src/modules/settings`

Progress ledger:

- [x] Admin/RAG/Settings route-surface slice copied from legacy AdminShell navigation into unified modules.
- [x] Unified subroutes added for `/admin/...`, `/rag/...`, and `/settings/...`.
- [x] Browser-visible smoke confirms the new module entry surfaces render with one visible shell/nav.
- [x] System Health page copied/adapted behind `/settings/system/health` and wired to unified `/health`.
- [x] Dev web proxy split browser API base `/api` from proxy target `http://127.0.0.1:6700`.
- [x] Corrected unified web shell back to the copied Command `OaiAppShell` model.
- [x] Removed simplified `PlatformShell`/`CapabilitySwitcher` UI and the rewritten Organizations frontend page.
- [x] Product switcher routes to in-app `/app/...` module routes in monolith mode.
- [x] Admin Organizations API copied into `apps/api/src/admin/organizations`.
- [x] Admin Organizations web page copied into `apps/web/src/modules/admin/views/OrganizationsAdminPage.vue`.
- [x] `/app/admin/organizations` renders the copied page with real unified API data.
- [ ] Full legacy Admin/RAG/Settings pages, stores, and API-backed workflows copied behind those route surfaces.

Frontend requirements:

- [ ] Every module exposes `routes.ts`.
- [ ] Every module service uses `shared/services/api-client.ts`.
- [ ] No module constructs its own base URL.
- [ ] The copied Command shell remains the main frontend chrome.
- [ ] The existing product switcher filters by entitlements and routes products in-app.
- [ ] Frontend tests prove each route loads the expected module.
- [ ] Frontend e2e proves UI actions produce the correct unified API calls.

Correction:

- The unified web frontend must keep the copied Command `OaiAppShell` as the main app chrome.
- Product app UIs should be copied into modules and integrated under `/app/...`; do not replace the main shell with a new capability-list layout.
- Frontend edits should be import rewiring, route rewiring, API base rewiring, and shell de-duplication only unless a copied page forces a specific local fix.

Gate:

- [ ] Frontend build/type checks pass.
- [ ] Command shell/product switcher tests pass.
- [ ] Frontend e2e passes for migrated modules.
- [ ] Grep finds no old product web ports or forced product-prefix navigation in `apps/web`.

## Phase 4: Backend Module Consolidation

**Objective**: Move backend behavior into `apps/api/src/...` modules while preserving platform contracts.

Module moves:

- [ ] Auth API -> `apps/api/src/auth`
- [ ] Admin API -> `apps/api/src/admin`
- [ ] Compose API runners/invoke behavior -> `apps/api/src/agents` and `apps/api/src/invoke`
- [ ] Forge API workflows -> `apps/api/src/workflows`
- [ ] Pulse API triggers/processing/listeners -> `apps/api/src/ambient`
- [ ] Bridge API inbound/outbound/registry/security/messaging -> `apps/api/src/secure-conversations`
- [ ] RAG services/admin behavior -> `apps/api/src/rag`
- [ ] Integration adapters -> `apps/api/src/integrations`

Backend requirements:

- [ ] Modules communicate through public services, not deep imports.
- [ ] Products do not import provider-specific infrastructure.
- [ ] All infrastructure access stays behind `packages/planes`.
- [ ] `@orchestratorai/transport-types` remains the transport source of truth.
- [ ] `ExecutionContext` is passed whole and immutable.
- [ ] Secure conversations preserves A2A JSON-RPC 2.0 `invoke`.
- [ ] No fallback proxies to old app APIs are added.

Gate:

- [ ] Unified API build passes.
- [ ] Migrated module unit tests pass.
- [ ] Integration tests pass for migrated modules.
- [ ] Architecture greps pass:
  - no product-local `planes/`
  - no product-local `llms/`
  - no product-local `observability/`
  - no duplicate transport types
  - no `context.taskId`, `context.planId`, or `context.deliverableId` introduced
- [ ] Consistency review passes per module.

## Phase 5: Continuous Testing And Consistency Review

**Objective**: Keep the migration honest while frontend/backend work lands.

Testing agent loop:

- [ ] For each new API module, run build and module tests.
- [ ] For each new frontend module, run build/type check and route tests.
- [ ] For each paired frontend/backend slice, run frontend-to-backend e2e.
- [ ] Use the in-app browser for visible verification of each route.
- [ ] Capture browser network evidence that requests target unified API prefixes.
- [ ] Append evidence to `verification-log.md`.

Consistency review loop:

- [ ] Review every claimed slice before it is marked complete.
- [ ] Check naming: no customer-facing Forge/Compose/Pulse/Bridge vocabulary unless explicitly migration-only.
- [ ] Check old ports and product prefixes are gone from migrated code.
- [ ] Check frontend route registry and backend module names align.
- [ ] Check auth/RBAC/entitlements remain coherent.
- [ ] Check A2A remains transport-level language inside secure conversations.
- [ ] Check no fallback/shim code was introduced.

Gate:

- [ ] `agent-handoffs.md` records each completed slice.
- [ ] `verification-log.md` has evidence for every migrated module.
- [ ] Consistency review has no unresolved blocker for migrated modules.

## Phase 6: Full Frontend-To-Backend Verification

**Objective**: Prove the unified platform works end to end before deleting old deployables.

Required flows:

- [ ] Login/logout.
- [ ] Dashboard and capability switcher.
- [ ] Admin.
- [ ] Agents.
- [ ] Workflows, including at least one SSE/job-progress flow and one HITL/review flow if available.
- [ ] Ambient.
- [ ] Secure conversations.
- [ ] RAG.
- [ ] Settings.

Verification order:

1. Unit/build checks.
2. API integration tests.
3. Frontend e2e.
4. In-app browser verification.
5. Chrome testing.

Gate:

- [ ] Full unified API build passes.
- [ ] Full unified web build/type checks pass.
- [ ] Frontend-to-backend e2e passes.
- [ ] In-app browser verification passes.
- [ ] Chrome testing passes after normal e2e is green.
- [ ] Browser/network evidence shows no old product API ports.

## Phase 7: Remove Old Deployables, Scripts, Ports, And Docs

**Objective**: Remove the old starter-runtime surface after unified verification is complete.

Steps:

- [ ] Remove obsolete root scripts:
  - `dev:auth`
  - `dev:admin:api`
  - `dev:admin:web`
  - `dev:forge:api`
  - `dev:forge:web`
  - `dev:compose:api`
  - `dev:compose:web`
  - `dev:pulse:api`
  - `dev:pulse:web`
  - `dev:bridge:api`
  - `dev:bridge:web`
  - old Protocol Lab scripts if its disposition excludes it from starter runtime
- [ ] Remove old workspace entries once their behavior has moved.
- [ ] Delete or archive old app directories according to `migration-map.md`.
- [ ] Update README/deployment docs to teach:
  - `platform-web`
  - `platform-api`
  - database/Supabase
- [ ] Update architecture docs to use capability vocabulary:
  - agents
  - workflows
  - ambient
  - secure conversations
  - admin/auth
  - RAG
  - settings
- [ ] Update `docs/efforts/roadmap.md`.

Gate:

- [ ] Root scripts teach `dev:api` and `dev:web` as the primary local path.
- [ ] Starter docs no longer present multiple product APIs/web apps.
- [ ] Old local ports are absent from starter docs and unified web/API code.
- [ ] Protocol Lab disposition is applied.

## Phase 8: Final Hardening And Completion Report

**Objective**: Close the effort with proof and durable handoff.

Steps:

- [ ] Run full monorepo build.
- [ ] Run full test suite or documented scoped equivalent.
- [ ] Run architecture greps.
- [ ] Run final browser verification.
- [ ] Write `completion-report.md`.
- [ ] Update roadmap.

Completion report must include:

- Final app shape.
- Removed deployables/scripts/workspaces.
- Protocol Lab disposition.
- Verification commands and results.
- Known residual risks.
- Any recommended follow-up efforts.

Gate:

- [ ] `completion-report.md` exists.
- [ ] `state.md` says complete.
- [ ] `verification-log.md` has final evidence.
- [ ] The starter product can be explained and deployed as one web app plus one API app.

## Stop Conditions

Stop and escalate if any of these occur:

- A migration requires changing `ExecutionContext` shape.
- A migration requires changing the JSON-RPC 2.0 `invoke` contract.
- A module needs provider-specific infrastructure imports to compile.
- A frontend module cannot call the unified API without retaining an old product port.
- Auth/RBAC behavior diverges between modules.
- A fallback proxy or compatibility shim appears necessary.

The correct response to any stop condition is root-cause analysis and intention review, not workaround code.

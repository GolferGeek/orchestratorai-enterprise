# Forge + Compose API Auth Remote Unification (Phase 2)

**Status**: Current

## What this effort does

Migrates both forge-api and compose-api from their local in-process auth guards to the shared `packages/auth-client/` remote-authorization pattern already used by admin-api.

**Order**: compose-api first (less latency-sensitive than forge's legal workflows), then forge-api. Compose-api Phase 2 also triggers the `packages/auth-client/` extraction from admin-api into a real shared package.

## Starting state

- **admin-api**: already on remote-auth (`AuthClient → POST /auth/authorize`). In-process guards deleted. ✅
- **compose-api**: Phase 1 complete — 11 controllers guarded, in-process `JwtAuthGuard` + `RbacGuard`. Remote-auth not yet adopted.
- **forge-api**: Phase 1 complete — 18 controllers guarded, in-process guards. Remote-auth not yet adopted.
- **`packages/auth-client/`**: does not exist yet. Lives in `apps/admin/api/src/auth/` as an admin-local implementation. Must be extracted.

## Preconditions (must verify before writing a PRD)

These were documented as blockers in the original parked intentions:

### 1. Latency measurement
- Compose: time a context → RAG → API runner chain (median of 10 runs), baseline vs. prototype with remote-auth guard.
- Forge: time a full `POST /legal-department/jobs/upload` NDA workflow end-to-end, same comparison.
- **Decision rule**: <50ms p50 → proceed. 50–100ms → proceed with LRU caching in AuthClient (TTL 30s). >100ms → stop and fix first.

### 2. StreamTokenService decision (shared between both products)
Both forge-api and compose-api have `StreamTokenService` for SSE auth via URL `?token=...` param. Remote `POST /auth/authorize` has no equivalent. Must choose one option before starting:
- **Option A**: keep thin in-process guard for SSE-only routes, remote auth everywhere else
- **Option B**: add `POST /auth/validate-stream-token` to auth-api (preferred — keeps pattern unified)
- **Option C**: replace with HTTP-only session cookie (biggest change, cleanest long-term)

## Scope summary

### Step 1: Extract `packages/auth-client/`
- Move admin-api's `src/auth/AuthClient` + guards/decorators into `packages/auth-client/`
- Update admin-api imports (one consumer becomes two)
- Export `JwtAuthGuard`, `RbacGuard`, `RequirePermission`, `Public`, `AuthClient`, test helpers

### Step 2: Migrate compose-api
- Delete local guards/decorators in `apps/compose/api/src/auth/guards/` and `apps/compose/api/src/rbac/guards/`
- Swap ~11 import sites to `@orchestratorai/auth-client`
- Handle StreamTokenService per chosen option
- Handle customer-service dual-mode auth (GuestSession + Bearer)
- Run Phase 1 curl verification suite unchanged

### Step 3: Migrate forge-api
- Same deletion + import swap (~20 files)
- Handle StreamTokenService (same decision as compose-api)
- Handle customer-service rate-limit guard
- Run Phase 1 curl verification suite + legal-department end-to-end workflow unchanged

### Carry-over items (from Phase 1 deferred list)
Both products share these:
- Webhook/asset signed-URL support (`@Public()` endpoints that should be scoped)
- `rag/internal-query.controller.ts` — decide: keep `@Public()` + network isolation, or remove
- Customer-service exception — formalize or replace

## Out of scope
- New features in either product
- Changing permission mappings (vocabulary frozen at Phase 1)
- Touching pulse-api or bridge-api

## Done when
- `packages/auth-client/` exists and is consumed by admin-api + compose-api + forge-api
- No local guard/decorator files remain in forge-api or compose-api auth/rbac guard directories
- Every `@UseGuards` site in both products imports from `@orchestratorai/auth-client`
- Both products' Phase 1 curl verification matrices still pass
- StreamTokenService migration implemented and documented
- Latency within the target decided during measurement

## Source files
- Original forge intention: `docs/efforts/future/forge-auth-remote-unification/intention.md`
- Original compose intention: `docs/efforts/future/compose-auth-remote-unification/intention.md`

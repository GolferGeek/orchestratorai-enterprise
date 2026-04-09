# Compose API Auth Hardening (Phase 1 of 2) — Product Requirements Document

## 1. Overview

Compose API has 19 HTTP controllers. **10 are fully unguarded**, including `runners.controller.ts` — the core entry point for compose's 5 runner types (context, RAG, API, external, media) which are the product's entire reason to exist. **7 more** have `@UseGuards(JwtAuthGuard)` without `RbacGuard` or `@RequirePermission`: authenticated but not authorized. Same class of gap as admin-api and forge-api before their respective hardening efforts.

Compose-api is **structurally a near-twin of forge-api**: it has its own in-process `JwtAuthGuard`, `RbacGuard`, full `@RequirePermission`/`@Public` decorator set, and a `StreamTokenService` side channel for SSE. Confirmed via direct inspection: `apps/compose/api/src/rbac/rbac.service.ts` line 159 has the same `return data === true` array-unwrap bug that auth-api and forge-api both had. `AuthModule` and `RbacModule` are both `@Global()`, so no per-module wiring changes are needed.

This effort closes the gap using compose-api's **existing in-process auth layer** — no remote-authorization refactor, no `packages/auth-client/` extraction, no latency regression. Phase 2 (`docs/efforts/future/compose-auth-remote-unification.md`, filed at the end of Phase 1) migrates compose-api onto the shared remote-auth package once preconditions are met. This mirrors the phased shape of `docs/efforts/forge-auth-hardening/` intentionally: the monorepo now has two products with the same Phase 2 preconditions, and whichever product's latency measurement lands first triggers the `packages/auth-client/` extraction that unblocks both.

## 2. Goals & Success Criteria

**Functional goals (measurable via curl/test)**

- `curl http://localhost:5300/runners` (no Authorization header) returns **401**
- `curl -H "Authorization: Bearer <garbage>" http://localhost:5300/runners` returns **401**
- `curl -H "Authorization: Bearer <demo-user-token>" http://localhost:5300/runners` returns **200** with runner metadata
- `curl http://localhost:5300/health` returns **200** without any header (liveness probe stays open)
- Every other protected controller returns 401 without token, 2xx with demo-user token, and 403 if demo-user lacks the required permission (where applicable)
- `speech.controller.ts` (already `@Public()`) stays reachable without a token
- Existing 7 JwtAuthGuard-only controllers continue working identically for authed requests but now enforce a real permission check

**Quality goals**

- All compose-api jest tests pass (both pre-existing and updated controller specs whose guard state changed)
- `npm run build` clean across the full monorepo
- Zero new `@ts-ignore`, zero swallowed errors, zero inline Bearer extraction outside `apps/compose/api/src/auth/guards/jwt-auth.guard.ts` and documented exceptions (rate-limit key derivation, if present)
- Compose-api's existing `JwtAuthGuard` and `RbacGuard` are **not modified** — Phase 1 is additive only (the `RbacService.hasPermission` 3-line unwrap fix is scoped in because it's a data-unpacking bug in a service, not a guard refactor — same rule we applied to auth-api and forge-api)
- `packages/planes/rbac/` and `packages/planes/auth/guards/jwt-auth.guard.ts` remain untouched (boundary continuity with admin-auth and forge-auth)
- `docs/efforts/future/compose-auth-remote-unification.md` exists as a real, reviewable, ready-to-start Phase 2 effort

## 3. User Stories / Use Cases

**Operator running a live smoke test**

> As a developer curling compose-api during a post-deploy check, I want unauthenticated requests to any runner endpoint to be rejected immediately, so that a missing header in my script is caught loud instead of silently executing a runner chain with no caller identity.

**Compose runner caller (admin-web or forge-api orchestrating compose runners)**

> As a forge-api agent that invokes a compose runner via `POST /invoke` (with the user's JWT forwarded), I want the existing flow to keep working identically after hardening — same request shape, same A2A response, no new prompts or re-auths.

**Security auditor reviewing compose-api**

> As someone reading `apps/compose/api/src/**/*.controller.ts`, I want every non-public controller to visibly declare `@UseGuards(JwtAuthGuard, RbacGuard) + @RequirePermission('...')`, and every public controller to visibly declare `@Public()` with a comment explaining why, so that runtime enforcement is documented in the source, not inferred.

**Future product author (pulse, bridge)**

> As someone hardening pulse-api or bridge-api next, I want to see that both compose-api and forge-api have Phase 1 done and Phase 2 filed with identical preconditions — so the monorepo has two plausible candidates for "second remote-auth consumer" and the decision falls naturally out of whichever product's latency measurement lands first.

## 4. Technical Requirements

### 4.1 Architecture

**No architectural changes.** Phase 1 uses the existing compose-api auth layer:

- `apps/compose/api/src/auth/guards/jwt-auth.guard.ts` — **unchanged**, exported via `@Global() AuthModule`
- `apps/compose/api/src/rbac/guards/rbac.guard.ts` — **unchanged**, exported via `@Global() RbacModule`
- `apps/compose/api/src/rbac/decorators/require-permission.decorator.ts` — **unchanged** (verified line 43: "Note: RbacGuard must be added separately via @UseGuards")
- `apps/compose/api/src/auth/decorators/public.decorator.ts` — **unchanged**, source of `@Public()` and `IS_PUBLIC_KEY`

Every change in this effort is a decorator addition on a controller file. The single exception is a 3-line narrow fix to `apps/compose/api/src/rbac/rbac.service.ts` `hasPermission()` to unwrap the planes database `rpc()` return shape (array-of-rows) instead of comparing against a raw boolean. Same pattern, same justification, same 3-test coverage as the admin-auth and forge-auth efforts.

**Guard execution order** is defined by the existing `JwtAuthGuard`: read `@Public()` metadata → extract Bearer token → validate via `IdentityProvider.validateToken()` → attach `request.user`. `RbacGuard` runs after and enforces `@RequirePermission()` metadata via `RbacService.hasPermission()` with the standard super-admin / `isAdmin` short-circuit ladder for `admin:*` permissions.

Both `AuthModule` and `RbacModule` are verified `@Global()` — no per-feature-module import changes required.

### 4.2 Data Model Changes

**None.** No tables, columns, RPCs, or migrations. Compose-api reads from the same `authz.*` schema that auth-api, admin-api, and forge-api read from, and the admin role already has `agents:execute` and `agents:manage` (applied during the forge-auth-hardening effort via `20260408100001_admin_role_agent_permissions.sql`). Demo-user's admin role covers all permissions we'll apply in Phase 3.

### 4.3 API Changes

**No route changes.** Every existing compose-api endpoint keeps its path, method, and request/response shape. Only the guard layer changes.

**Full controller inventory** (verified via `find apps/compose/api/src -name "*.controller.ts"` — 19 total):

#### Already correctly wired — **do not touch** (3)

| Controller | Current state | Action |
|---|---|---|
| `auth/auth.controller.ts` | Method-level `@UseGuards(JwtAuthGuard)` and `@UseGuards(JwtAuthGuard, RbacGuard)` across 10 handlers (some with method-level `@RequirePermission`) | Leave as-is — auth module internal, already follows the pattern. |
| `rbac/rbac.controller.ts` | Class-level `@UseGuards(JwtAuthGuard)` + 8 method-level `@RequirePermission` calls | Leave as-is — already the reference pattern (same shape as forge-api's rbac controller). |
| `speech/speech.controller.ts` | Class-level `@Public()` | Leave as-is — decision was already made. Verify during Phase 2 (plan) that the public choice is still correct by reading the controller. |

#### JwtAuthGuard-only — **add RbacGuard + @RequirePermission** (7)

For each: keep `JwtAuthGuard`, add `RbacGuard` to the stack, add class-level `@RequirePermission(...)`. Permission choices use compose-api's real rbac vocabulary (same 18 permissions as forge-api).

| Controller | Path prefix | Planned permission | Rationale |
|---|---|---|---|
| `crawler/crawler-admin.controller.ts` | `/crawler` (admin) | `admin:settings` | Crawler admin config — admins only. |
| `invoke/invoke.controller.ts` | `/invoke`, `/invoke/stream` | `agents:execute` | A2A runner dispatch — baseline "can execute workflows" permission. |
| `rag/collections.controller.ts` | `/api/rag/collections` | `rag:admin` | Collection CRUD is admin-scoped. |
| `rag/documents.controller.ts` | `/api/rag/collections/:collectionId/documents` | `rag:write` | Document management is a write operation. |
| `rag/qa.controller.ts` | `/api/rag/collections/:collectionId/qa` | `rag:read` | Q&A is a read operation with LLM on top. |
| `rag/query.controller.ts` | `/api/rag/collections/:collectionId/query` | `rag:read` | Vector search is a read operation. |

Note: `rbac/rbac.controller.ts` is excluded from this list because it already has method-level `@RequirePermission`.

#### Fully unguarded — **add full guard stack OR mark `@Public()`** (9)

| # | Controller | Path prefix | Planned disposition | Rationale |
|---|---|---|---|---|
| 1 | `health/health.controller.ts` | `/health` | `@Public()` | Liveness/readiness probe. |
| 2 | `app.controller.ts` | `/` | `@Public()` | Root liveness endpoint; read during Phase 2 to confirm. |
| 3 | `analytics/analytics.controller.ts` | `/analytics` | `@Public()` | Frontend telemetry (same pattern as forge-api — often fires before login). Confirm by reading the controller. |
| 4 | `runners/runners.controller.ts` | `/runners` | `@RequirePermission('agents:execute')` | **Highest-value fix.** The core compose runners metadata/listing endpoint. |
| 5 | `customer-service/customer-service.controller.ts` | `/customer-service` | **Possibly dual-mode exception** (match forge-api's approach) | Read during Phase 3. If compose has the same GuestSession/Bearer dual-mode as forge-api's customer-service, document as an intentional exception. Otherwise apply the standard stack. |
| 6 | `assets/assets.controller.ts` | `/assets` | `@RequirePermission('admin:settings')` class-level + method-level `@Public()` on GET stream handlers | Same mixed pattern as forge-api's assets: POST register is admin-only, GET streams must be reachable without auth so AI-generated content can embed asset URLs. |
| 7 | `config/feature-flag.controller.ts` | `/feature-flags` | `@RequirePermission('admin:settings')` | Admin-only config. |
| 8 | `mcp/mcp.controller.ts` | `/mcp` | `@RequirePermission('agents:execute')` | MCP servers are agent execution infrastructure — match the runners/invoke permission. |
| 9 | `rag/internal-query.controller.ts` | `/rag/internal` | `@Public()` + TODO for network isolation | Same call as forge-api — internal service-to-service endpoint that can't carry user tokens. |
| 10 | `system/system.controller.ts` | `/system` | `@RequirePermission('admin:settings')` | System config/health/stats — admin-only. |

**Per-method overrides are allowed** where the class-level default is wrong for a specific handler. Document any method-level overrides with a source-code comment and in the completion report.

#### Inline Bearer extraction audit

Grep check during Phase 2: `grep -rn "startsWith('Bearer ')" apps/compose/api/src --include="*.ts"` — expected hits only in `apps/compose/api/src/auth/guards/jwt-auth.guard.ts` (the guard implementation itself). If `customer-service/guards/rate-limit.guard.ts` exists and extracts Bearer tokens for rate-limit key derivation (as forge-api's does), document it as an acceptable exception. If `customer-service.controller.ts` has dual-mode inline extraction, same documented-exception treatment.

### 4.4 Frontend Changes

**None.** Compose-web (if any) and any other compose-api callers already send `Authorization: Bearer <jwt>` on every request via the standard axios interceptor pattern. No code changes in `apps/compose/web/` or downstream products.

### 4.5 Infrastructure Requirements

**None.** No new env vars, no new modules, no new DB connections, no new services. Pure source-code decoration.

## 5. Non-Functional Requirements

**Performance**

- Guard addition on the 7 JwtAuthGuard-only controllers: ~1-5ms extra for the `RbacGuard` check (super-admin / isAdmin short-circuit ladder, then `hasPermission` RPC if both short-circuits miss). Negligible.
- Guard addition on the 9 currently unguarded controllers: previously did zero auth work; now do in-process token validation (~5-10ms via `SupabaseIdentityProvider.validateToken()`) plus the RBAC check. Matches the existing guarded controllers.
- **Phase 1 explicitly does not target latency improvements.** The Phase 2 remote-auth migration may *add* latency unless cached; that tradeoff is Phase 2's concern.
- **Spot-check target**: `/runners` latency p50 <50ms after hardening (baseline is zero auth overhead; 5-15ms is expected; anything >50ms flags as a follow-up).

**Security**

- Tokens never logged by guards. `JwtAuthGuard` logs at most `{ userId, sanitizedUrl }` on success and `{ reason }` on failure.
- `@ts-ignore` / `as any` / swallowed errors prohibited in touched files.
- `@Public()` is the ONLY way to mark a route auth-free — missing a guard decoration is NOT an implicit public mark.
- Every non-public controller either has the full guard stack with a permission OR is an intentional exception documented in the completion report with source-code comments.

**Scalability**

- Stateless. No new caches or DB connections. Same scalability profile as pre-hardening compose-api.

**Compatibility**

- Admin-web continues to work unchanged.
- Forge-api's A2A calls into compose-api (runner invocation) continue to work — they already forward the user's Bearer token.
- Any external A2A callers that were relying on unauthenticated access to compose runners were broken by design and will now surface as 401s — that's a security improvement, not a regression.
- The existing 7 guarded controllers: behavior changes only for demo-user or any user whose token no longer passes the newly-added `@RequirePermission` check. Phase 5 verifies demo-user's admin role covers all of them.
- `rbac.controller.ts`, `auth/auth.controller.ts`, and `speech.controller.ts` — untouched, no behavior change.

## 6. Out of Scope

- **Modification of `apps/compose/api/src/auth/guards/jwt-auth.guard.ts` or `apps/compose/api/src/rbac/guards/rbac.guard.ts`.** These are the canonical compose-api guard classes; Phase 2 is the right time to replace them.
- **Remote authorization via `POST /auth/authorize`.** Phase 2.
- **`packages/auth-client/` extraction.** Phase 2 (or earlier if forge-auth Phase 2 happens first).
- **Latency measurement or caching design.** Phase 2.
- **Admin, Pulse, Bridge auth hardening.** Separate efforts per product.
- **Changes to compose-api's runner logic, composition engine, RAG query engine, speech service, MCP integration, or crawler logic.** Pure auth-layer work.
- **New auth-api endpoints.**
- **Touching `packages/planes/rbac/` or `packages/planes/auth/guards/jwt-auth.guard.ts`.** Continuity with admin-auth + forge-auth.
- **Fixing the admin role permission seed.** The forge-auth effort already added `agents:execute` and `agents:manage`; no further seed fixes are needed for compose-api's planned permissions. If a new gap surfaces during Phase 5, stop and raise with the user — do not silently modify RBAC data.
- **Webhook signature verification.** Compose-api may or may not have webhook endpoints; if it does and they need signing, that becomes a Phase 2 follow-up, not Phase 1 scope.
- **Removing `rag/internal-query.controller.ts`** even if it's unused. Guard it correctly (via `@Public()` + network isolation TODO). Removal is a separate hygiene effort.

## 7. Dependencies & Risks

**Dependencies**

- The admin role already has `agents:execute` and `agents:manage` (applied during `forge-auth-hardening`). Demo-user's admin role covers all planned permissions in §4.3.
- Compose-api's `AuthModule` and `RbacModule` are both `@Global()` (verified), so no feature module needs to add explicit imports.
- The `RbacService.hasPermission` bugfix depends on nothing — it's a narrow 3-line change in an isolated method.

**Risks**

1. **`RbacService.hasPermission` unwrap bug is present.** Confirmed by grep: `return data === true` at line 159 of `apps/compose/api/src/rbac/rbac.service.ts` — identical to the pre-fix state of auth-api and forge-api. **Mitigation**: Phase 1 includes the same narrow fix and 3 new unit tests (array return true, array return false, empty array). Without this fix, any `@RequirePermission` check that falls through to `hasPermission` will 403 incorrectly, breaking Phase 5's success criteria.

2. **Permission vocabulary mismatch for MCP or runners.** The real rbac vocabulary is the same 18-row set used by forge-api. The plan uses `agents:execute` for runners/invoke/mcp, `rag:*` for RAG, `admin:settings` for system/feature-flag. These are all confirmed to exist and to be granted to the admin role. If Phase 5's demo-user curl matrix shows any 403, fall back to a broader permission (e.g. `admin:settings`) and document the choice in the completion report.

3. **Tests that mount controllers will break** after Phase 3 adds the guards. **Mitigation**: Phase 4 is a dedicated test-fix phase. Create `apps/compose/api/src/test-utils/mock-guards.ts` (compose-local, mirrors forge-api's) and update every spec that mounts a changed controller. Same pattern that worked for forge-auth: `applyAuthOverrides` helper, `resetAuthMocks` in `beforeEach`.

4. **Customer-service controller may have dual-mode inline Bearer extraction.** If compose-api's `customer-service.controller.ts` has the same `GuestSession`-or-`Bearer` pattern as forge-api's, the inline extraction is legitimate dual-mode auth and should be preserved, not forced into the standard guard pattern. Phase 3 reads the file first and decides per-method.

5. **Stream-token side channel.** Compose-api has a `services/` subdirectory under `auth/` — almost certainly contains a `StreamTokenService` matching forge-api's. If any controller uses stream-token auth for SSE endpoints, those endpoints need to be treated like forge-api's (left with the existing in-process flow). Confirm during Phase 2 (plan); document during Phase 3 if applicable.

6. **The assets controller may need method-level @Public() exceptions.** If compose-api's `assets.controller.ts` has GET stream handlers for AI-generated content, apply the same mixed pattern as forge-api (class-level guard + method-level `@Public()` on the two stream methods). Phase 3 reads the file first.

7. **App controller (`app.controller.ts`) behavior.** If it has real stateful endpoints rather than a trivial `getHello()`, `@Public()` is the wrong choice and it moves to the guarded list. Phase 2 reads the file first.

## 8. Phasing

Same 6-phase shape as `forge-auth-hardening`. Each phase has a concrete gate. Each phase is independently validatable.

### Phase 1 — Permission vocabulary verification + RbacService bugfix + module wiring audit

**Objective**: Before touching any controller, (a) verify the real RBAC permission vocabulary is the same 18-row set (it is — same `authz.rbac_permissions` table), (b) verify `AuthModule`/`RbacModule` are both `@Global()` (they are — already confirmed), (c) apply the `RbacService.hasPermission` array-unwrap fix with 3 new unit tests, (d) confirm demo-user's admin role covers all planned permissions.

**Scope**:
- Query the DB to reconfirm the 18-row vocabulary (should match what forge-auth enumerated).
- Read `apps/compose/api/src/rbac/rbac.service.ts` and confirm the bug at line 159.
- Apply the 3-line fix (support both array-of-rows and raw-boolean return shapes).
- Add 3 new unit tests to `apps/compose/api/src/rbac/rbac.service.spec.ts` (array true, array false, empty array).
- Verify `@Global()` on both modules — read the `@Global()` decorator in `apps/compose/api/src/auth/auth.module.ts` and `apps/compose/api/src/rbac/rbac.module.ts`. (Already confirmed.)
- Verify demo-user passes `authz.rbac_has_permission` for `agents:execute`, `agents:manage`, `rag:read`, `rag:write`, `rag:admin`, `admin:settings` against `*` orgSlug. (Already confirmed during forge-auth-hardening.)

**Gate**:
- `cd apps/compose/api && npm run build` clean
- `cd apps/compose/api && npm run test` — all existing tests pass; 3 new `rbac.service.spec` tests pass
- No controller files modified yet
- `git diff apps/compose/api/src/auth/guards apps/compose/api/src/rbac/guards` → empty
- `git diff packages/planes/rbac packages/planes/auth/guards/jwt-auth.guard.ts` → empty

### Phase 2 — Mark genuinely-public endpoints with @Public()

**Objective**: Explicitly decorate `health`, `app`, `analytics`, and `rag/internal-query` with `@Public()` + source-code comments. Read each file first to confirm the decision. `speech.controller.ts` already has `@Public()`; do not touch.

**Scope**:
- `health/health.controller.ts` → class-level `@Public()` with comment `// Liveness probe — must be reachable without auth.`
- `app.controller.ts` → read first. If trivial getHello, `@Public()` with a comment. If stateful, move to Phase 3's guarded list.
- `analytics/analytics.controller.ts` → read first. If it's a no-op telemetry receiver (like forge-api's), `@Public()` with comment `// Frontend analytics telemetry — no-op in dev; fires from pre-login pages.`
- `rag/internal-query.controller.ts` → class-level `@Public()` with comment explaining service-to-service use and TODO for network isolation in Phase 2 follow-up file.

**Gate**:
- `grep -rn "@Public()" apps/compose/api/src --include="*.controller.ts"` — at least 4-5 hits (speech + the ones added this phase + any method-level ones from later phases)
- `cd apps/compose/api && npm run build` clean
- Tests not run yet (no guarded controllers broken yet)

### Phase 3 — Add full guard stack to remaining controllers + upgrade the 7 JwtAuthGuard-only

**Objective**: Apply `@UseGuards(JwtAuthGuard, RbacGuard)` + `@RequirePermission(...)` to every non-public compose-api controller, plus upgrade the 7 controllers that currently have `JwtAuthGuard` only.

**Scope**:

#### 3A — Upgrade the 7 JwtAuthGuard-only controllers
For each, change `@UseGuards(JwtAuthGuard)` to `@UseGuards(JwtAuthGuard, RbacGuard)` and add class-level `@RequirePermission(...)` per the §4.3 mapping table:
- `crawler/crawler-admin.controller.ts` → `admin:settings`
- `invoke/invoke.controller.ts` → `agents:execute`
- `rag/collections.controller.ts` → `rag:admin`
- `rag/documents.controller.ts` → `rag:write`
- `rag/qa.controller.ts` → `rag:read`
- `rag/query.controller.ts` → `rag:read`

Do NOT touch `auth/auth.controller.ts` (method-level pattern) or `rbac/rbac.controller.ts` (already has method-level `@RequirePermission`).

#### 3B — Guard the remaining unguarded controllers
For each, add class-level `@UseGuards(JwtAuthGuard, RbacGuard)` + `@RequirePermission(...)` per the §4.3 mapping:
- `runners/runners.controller.ts` → `agents:execute` (**highest-value fix**)
- `mcp/mcp.controller.ts` → `agents:execute`
- `config/feature-flag.controller.ts` → `admin:settings`
- `system/system.controller.ts` → `admin:settings`
- `assets/assets.controller.ts` → class-level `admin:settings` + method-level `@Public()` on GET stream handlers if any exist (read the file first)

#### 3C — Customer-service decision
Read `apps/compose/api/src/customer-service/customer-service.controller.ts` completely. If it has the same dual-mode (`GuestSession` OR `Bearer`) inline extraction pattern as forge-api's customer-service:
- Leave the controller as-is
- Do NOT force it into the standard guard pattern
- Document as an intentional exception in the completion report

If it doesn't have the dual-mode pattern and can fit the standard guard:
- Add `@UseGuards(JwtAuthGuard, RbacGuard)` + `@RequirePermission('agents:execute')` class-level

Record the decision in the plan file under 3C.

#### 3D — Grep-verify scope
- `grep -rn "@UseGuards(JwtAuthGuard, RbacGuard)" apps/compose/api/src --include="*.controller.ts" | wc -l` → expected: (6 from 3A) + (4-5 from 3B depending on customer-service decision) = 10-11
- `grep -rn "^@RequirePermission" apps/compose/api/src --include="*.controller.ts" | wc -l` → matches the count above
- `grep -rn "@Public()" apps/compose/api/src --include="*.controller.ts" | wc -l` → baseline (1 from speech) + 4 from Phase 2 + any method-level = 5+
- Every one of the 19 controllers accounted for: guarded, public, or intentional exception

**Gate**:
- `cd apps/compose/api && npm run build` clean
- Tests **intentionally not run** — Phase 4 fixes them
- `git diff apps/compose/api/src/auth/guards apps/compose/api/src/rbac/guards` → empty
- Customer-service decision recorded
- Every controller accounted for

### Phase 4 — Create compose-local mock-guards helper + fix broken specs

**Objective**: Every compose-api controller spec that mounts a controller via `Test.createTestingModule` and previously didn't override the guards now fails. Create a compose-local helper (forge-api-local copy, NOT a shared one — Phase 2 consolidates) and update the broken specs.

**Scope**:
- Create `apps/compose/api/src/test-utils/mock-guards.ts` mirroring `apps/forge/api/src/test-utils/mock-guards.ts`:
  - Imports compose-api's local `JwtAuthGuard` + `RbacGuard`
  - Exports `mockJwtAuthGuard`, `mockRbacGuard`, `resetAuthMocks`, `applyAuthOverrides`, `makeJwtGuardReject`, `makeRbacGuardReject`
- Run `cd apps/compose/api && npm run test 2>&1 | grep FAIL` to enumerate broken specs. Expected: specs for every controller in Phase 3A/3B that mounts via `Test.createTestingModule`.
- For each failing spec, update the `Test.createTestingModule(...).compile()` chain to pipe through `applyAuthOverrides(...)`. Add `resetAuthMocks()` to `beforeEach`. Fix import paths (compose-api has specs at various depths — compute relative paths per file).
- Do NOT touch service specs, health spec, speech spec, or rbac.controller spec.
- Iterate until `cd apps/compose/api && npm run test` is green.

**Gate**:
- `cd apps/compose/api && npm run test` — all specs pass
- `cd apps/compose/api && npm run build` clean
- `grep -rn "test-utils/mock-guards" apps/compose/api/src --include="*.spec.ts" | wc -l` ≥ number of controllers whose guard state changed

### Phase 5 — Live verification (curl matrix)

**Objective**: Run the HTTP-level verification against compose-api on port 5300. Confirm §2 success criteria.

**Scope**:
- Restart compose-api dev server (or verify hot-reload picked up the changes). Confirm it's listening: `lsof -iTCP:5300 -sTCP:LISTEN -P`.
- Obtain fresh demo-user JWT via `POST http://localhost:5100/auth/login`.
- **Public matrix** — expect 200 without auth:
  - `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5300/health` → 200
  - `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5300/` → 200 (if app.controller was marked public)
  - `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5300/analytics/events` → 200 or 204 (POST no-op)
- **Unauth protected matrix** — expect 401 on at least these routes:
  - `/runners`
  - `/invoke`
  - `/crawler/sources` (or appropriate crawler path)
  - `/mcp/servers` (or appropriate mcp path)
  - `/feature-flags`
  - `/system/health` (compose-api's own system health, not /health)
  - `/api/rag/collections`
  - one rag query route with a test collection id
- **Garbage token** — at least one route with `Authorization: Bearer garbage` → 401
- **Demo-user matrix** — every protected route with valid token → 2xx (200, 201, 204 all acceptable; 400 is acceptable if handler rejects bad input — means guard passed through; 500 is acceptable if it's a pre-existing downstream bug — means guard passed through)
- **Runners end-to-end smoke** — `curl -sS -H "Authorization: Bearer $TOKEN" http://localhost:5300/runners` should return a list of runner metadata. This is the headline endpoint for compose.
- **Latency spot-check** — 5 curls on `/runners` with valid token; record median; flag as follow-up if consistently >100ms.

**Gate**:
- Every PRD §2 success criterion empirically verified
- Public endpoints return 200 without auth
- Protected endpoints return 401 unauth and 2xx with demo-user
- Latency within target

### Phase 6 — Write `compose-auth-remote-unification.md` + completion report + PR

**Objective**: File Phase 2 as a real follow-up with three concrete preconditions. Write the completion report. Commit, push, open PR.

**Scope**:
- Write `docs/efforts/future/compose-auth-remote-unification.md`. Structure mirrors `forge-auth-remote-unification.md`:
  - Starting state (reference this effort's completion report)
  - Why Phase 2 not Phase 1 (same latency + extraction + StreamTokenService reasons)
  - **Three preconditions**: (1) at least one of admin/forge/pulse/bridge has adopted the remote pattern, OR compose itself becomes the second adopter (which satisfies the precondition tautologically); (2) latency measurement on a representative compose workflow (multi-runner composition chain) with <100ms p50 decision rule; (3) `StreamTokenService` migration path (A/B/C) chosen
  - Scope of the Phase 2 refactor (same shape as forge-auth Phase 2)
  - Follow-up items (any `@Public()` exceptions from Phase 1 that need real auth added later, customer-service exceptions, webhook HMAC if applicable, etc.)
  - Done-when gates
  - Minimum 80 lines of real content

- Write `docs/efforts/current/completion-report.md`:
  - Summary (1 paragraph)
  - Phase results table
  - Final permission mapping table (with any Phase 3 fallbacks documented)
  - Deviations from PRD
  - Pre-existing issues surfaced (500s from downstream services, etc.)
  - Follow-ups pointer to `compose-auth-remote-unification.md`

- Run full-repo gates one more time: `npm run lint`, `npm run build`, `npm run test`
- Final boundary verification (same grep checks as forge-auth Phase 6)
- `git push -u origin effort/compose-auth-hardening`
- `gh pr create` with a body covering the 6 phases, curl matrix, Phase 2 commitment, any fallbacks
- Run `/pr-eval` (either autonomously or by user direction)

**Gate**:
- `docs/efforts/future/compose-auth-remote-unification.md` exists, is ≥80 lines
- Completion report written
- Full repo gates green (pre-existing unrelated failures documented)
- PR opened and ready for review

---

**End of PRD.** Same phased shape as `forge-auth-hardening`. Phase 2 is a committed, scoped, triggered follow-up — not indefinitely deferred.

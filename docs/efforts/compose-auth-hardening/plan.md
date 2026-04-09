# Compose API Auth Hardening (Phase 1 of 2) — Implementation Plan

**PRD**: ./prd.md
**Intention**: ./intention.md
**Created**: 2026-04-08
**Status**: Not Started

## Progress Tracker
<!-- run-plan uses this section to track where we are -->
- [x] Phase 1: RbacService bugfix + module wiring audit
- [x] Phase 2: Mark genuinely-public endpoints with @Public()
- [x] Phase 3: Guard remaining unguarded controllers + upgrade JwtAuthGuard-only 6
- [x] Phase 4: Create compose-local mock-guards helper + fix broken specs
- [x] Phase 5: Live verification (curl matrix)
- [ ] Phase 6: Write compose-auth-remote-unification.md + completion report + PR

---

## Shared conventions

- **Working dir**: `/Users/golfergeek/projects/orchAI/orchestratorai-enterprise-dev`
- **Branch**: `effort/compose-auth-hardening` (create at start of Phase 1)
- **Lint (compose-api)**: `cd apps/compose/api && npm run lint`
- **Build (compose-api)**: `cd apps/compose/api && npm run build`
- **Test (compose-api)**: `cd apps/compose/api && npm run test`
- **Full-repo build**: `npm run build`
- **Compose API URL (dev)**: `http://localhost:5300`
- **Auth API URL (dev)**: `http://localhost:5100`
- **Demo admin user**: `demo-user@orchestratorai.io` / `DEMOUSER123!` — admin role globally (`*`). NOT super-admin. Has `agents:execute` + `agents:manage` (applied by forge-auth-hardening's migration).
- **Guard imports** (compose-local):
  - `JwtAuthGuard` → `apps/compose/api/src/auth/guards/jwt-auth.guard.ts`
  - `RbacGuard` → `apps/compose/api/src/rbac/guards/rbac.guard.ts`
  - `@RequirePermission` → `apps/compose/api/src/rbac/decorators/require-permission.decorator.ts`
  - `@Public` → `apps/compose/api/src/auth/decorators/public.decorator.ts`
- **No fallbacks, no cheating.** Same rule as admin-auth and forge-auth.
- **Do NOT modify** `apps/compose/api/src/auth/guards/jwt-auth.guard.ts`, `apps/compose/api/src/rbac/guards/rbac.guard.ts`, `packages/planes/rbac/`, or `packages/planes/auth/guards/jwt-auth.guard.ts`. The only non-decorator edit in Phase 1 is the 3-line `RbacService.hasPermission` unwrap fix (a service bug, not a guard refactor).
- **Controller inventory**: 19 total. 3 intentional exceptions (`auth/auth`, `rbac/rbac`, `speech` which is already `@Public()`). 6 JwtAuthGuard-only need upgrading. 10 need either the full stack or `@Public()`.

---

## Phase 1: RbacService bugfix + module wiring audit
**Status**: Not Started
**Objective**: Apply the narrow `RbacService.hasPermission` array-unwrap fix that matches the one we applied to auth-api and forge-api; add 3 unit tests; confirm `@Global()` on both auth and rbac modules; confirm demo-user's admin role covers all planned permissions.

### Steps
- [ ] 1.1 Create branch: `git checkout -b effort/compose-auth-hardening`.
- [ ] 1.2 Confirm compose-api `AuthModule` and `RbacModule` are both `@Global()`: already verified during PRD build (`grep -l "@Global()" apps/compose/api/src/auth/auth.module.ts apps/compose/api/src/rbac/rbac.module.ts` hit both). Record as a no-op verification step.
- [ ] 1.3 Reconfirm the 18-row permission vocabulary is unchanged from forge-auth-hardening: `docker exec supabase_db_orchestratorai-enterprise psql -U postgres -d postgres -c "SELECT COUNT(*) FROM authz.rbac_permissions;"` — expect 18. If anything changed, stop and raise.
- [ ] 1.4 Confirm demo-user passes `rbac_has_permission` for every permission this effort will use:
  ```
  docker exec supabase_db_orchestratorai-enterprise psql -U postgres -d postgres -c "
    SELECT p AS permission,
           authz.rbac_has_permission('13069c48-e606-4915-8c21-9c7c82e46977'::uuid, '*', p, NULL, NULL) AS allowed
    FROM (VALUES ('agents:execute'),('agents:manage'),('rag:read'),('rag:write'),('rag:admin'),('admin:settings'),('admin:audit')) AS t(p);
  "
  ```
  Every row must return `t` (true). If any return `f`, stop and raise — that's the same kind of seed gap we hit with forge-auth, and the fix is a separate migration conversation.
- [ ] 1.5 Apply the `RbacService.hasPermission` fix in `apps/compose/api/src/rbac/rbac.service.ts`:
  - Replace the `return data === true` at line 159 with the dual-shape unwrap that supports both the old raw-boolean shape and the planes-rpc array-of-rows shape.
  - Cast the `data` field to `Array<{ rbac_has_permission: boolean }> | boolean | null`.
  - Add a comment pointing at auth-api and forge-api as the two other places where this same bug was fixed.
- [ ] 1.6 Add 3 new unit tests to `apps/compose/api/src/rbac/rbac.service.spec.ts` (copy the pattern from `apps/forge/api/src/rbac/rbac.service.spec.ts` — same three cases):
  - Planes rpc returns `[{ rbac_has_permission: true }]` → `hasPermission` returns `true`
  - Planes rpc returns `[{ rbac_has_permission: false }]` → returns `false`
  - Planes rpc returns `[]` (empty array) → returns `false`
  - All three use `'agents:execute'` as the permission under test.
- [ ] 1.7 Run `cd apps/compose/api && npx jest rbac.service.spec.ts` — all tests pass including the 3 new ones.
- [ ] 1.8 Verify boundaries: `git diff apps/compose/api/src/auth/guards apps/compose/api/src/rbac/guards packages/planes/rbac packages/planes/auth/guards/jwt-auth.guard.ts` → empty.

### Quality Gate
- [ ] **Lint**: `cd apps/compose/api && npm run lint` — no new errors on touched files (pre-existing errors in untouched files OK and documented)
- [ ] **Build**: `cd apps/compose/api && npm run build` — clean
- [ ] **Unit Tests**: `cd apps/compose/api && npm run test` — all existing tests pass; 3 new hasPermission tests pass
- [ ] **E2E Tests**: N/A this phase
- [ ] **Curl Tests**: N/A this phase (no controller edits yet)
- [ ] **Chrome Tests**: N/A this phase
- [ ] **Phase Review**:
  - [ ] Permission vocabulary confirmed (18 rows)
  - [ ] Demo-user passes all planned permissions (step 1.4 all-true)
  - [ ] `RbacService.hasPermission` fixed with narrow 3-line change
  - [ ] 3 new unit tests passing
  - [ ] `AuthModule` and `RbacModule` confirmed `@Global()`
  - [ ] No controller files edited yet
  - [ ] Boundary grep (step 1.8) returns empty

---

## Phase 2: Mark genuinely-public endpoints with @Public()
**Status**: Not Started
**Objective**: Explicitly decorate `health`, `app`, `analytics`, and `rag/internal-query` with `@Public()` + source comments. Read each file first to confirm the decision. `speech.controller.ts` already has `@Public()`; do not touch.

### Steps
- [ ] 2.1 Read `apps/compose/api/src/health/health.controller.ts` in full. Add class-level `@Public()` import from `../auth/decorators/public.decorator` + decorator + comment `// Liveness/readiness probe — must be reachable without auth.`
- [ ] 2.2 Read `apps/compose/api/src/app.controller.ts` in full. Decision point:
  - If it's a trivial `getHello()` root: `@Public()` + comment `// Root liveness endpoint; returns basic service identification.`
  - If it has real stateful handlers: move to Phase 3's guarded list and record the move in this plan file as a note.
- [ ] 2.3 Read `apps/compose/api/src/analytics/analytics.controller.ts` in full. Decision point:
  - If it's a no-op dev telemetry receiver (like forge-api's): `@Public()` + comment `// Frontend analytics telemetry — no-op in dev; receives events from compose callers (including pre-login pages). Keeping this public avoids 401 spam from unauthenticated pages sending tracking events.`
  - If it persists data or does real work: move to Phase 3 with `@RequirePermission('admin:audit')`.
- [ ] 2.4 Read `apps/compose/api/src/rag/internal-query.controller.ts` in full. Add class-level `@Public()` with comment:
  ```
  // Internal service-to-service endpoint. Runner chains inside compose-api call this
  // to query RAG collections without carrying user tokens.
  // TODO(compose-auth-remote-unification): add network-level protection (bind to
  // loopback, mTLS, or a shared secret) since it's reachable from any caller that
  // can hit the compose-api port.
  ```
- [ ] 2.5 Verify `speech.controller.ts` is untouched:
  - `git diff apps/compose/api/src/speech/speech.controller.ts` → empty
- [ ] 2.6 Grep-verify Phase 2 scope:
  - `grep -rn "@Public()" apps/compose/api/src --include="*.controller.ts"` — expect at least 5 hits (speech + 4 from this phase; more if any method-level were added)
  - `grep -rn "@UseGuards" apps/compose/api/src --include="*.controller.ts" | wc -l` → unchanged from baseline (Phase 2 adds no new `@UseGuards`)

### Quality Gate
- [ ] **Lint**: `cd apps/compose/api && npm run lint` — no new errors on touched files
- [ ] **Build**: `cd apps/compose/api && npm run build` — clean
- [ ] **Unit Tests**: `cd apps/compose/api && npm run test` — all pass (Phase 2 doesn't break anything because `@Public()` is metadata-only for currently-unguarded controllers)
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**: N/A (Phase 5 does the full matrix)
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] Every controller in the Phase 2 list either has `@Public()` + comment or was explicitly moved to Phase 3 (with a plan-file note)
  - [ ] `speech.controller.ts` untouched
  - [ ] `git diff apps/compose/api/src/auth/guards apps/compose/api/src/rbac/guards` → empty (no guard implementations touched)

---

## Phase 3: Guard remaining unguarded controllers + upgrade JwtAuthGuard-only 6
**Status**: Not Started
**Objective**: Apply the full guard stack to every remaining controller that needs it. Upgrade the 6 `JwtAuthGuard`-only controllers to include `RbacGuard` + `@RequirePermission`. Handle customer-service per its actual shape.

### Steps

#### 3A — Upgrade the 6 JwtAuthGuard-only controllers
For each, change `@UseGuards(JwtAuthGuard)` to `@UseGuards(JwtAuthGuard, RbacGuard)` and add class-level `@RequirePermission(...)` per the PRD §4.3 mapping. Import `RbacGuard` from `../rbac/guards/rbac.guard` (or the `@/rbac/guards/rbac.guard` alias if that's what the file already uses for `JwtAuthGuard`) and `RequirePermission` from `../rbac/decorators/require-permission.decorator`.

- [ ] 3A.1 `crawler/crawler-admin.controller.ts` → `@RequirePermission('admin:settings')`
- [ ] 3A.2 `invoke/invoke.controller.ts` → `@RequirePermission('agents:execute')`
- [ ] 3A.3 `rag/collections.controller.ts` → `@RequirePermission('rag:admin')`
- [ ] 3A.4 `rag/documents.controller.ts` → `@RequirePermission('rag:write')`
- [ ] 3A.5 `rag/qa.controller.ts` → `@RequirePermission('rag:read')`
- [ ] 3A.6 `rag/query.controller.ts` → `@RequirePermission('rag:read')`

Do NOT touch:
- `auth/auth.controller.ts` — auth module internal, method-level pattern
- `rbac/rbac.controller.ts` — already has method-level `@RequirePermission`

#### 3B — Guard the remaining unguarded controllers (excluding customer-service, handled in 3C)

- [ ] 3B.1 `runners/runners.controller.ts` → class-level `@UseGuards(JwtAuthGuard, RbacGuard)` + `@RequirePermission('agents:execute')`. **Highest-value fix.**
- [ ] 3B.2 `mcp/mcp.controller.ts` → `@RequirePermission('agents:execute')`
- [ ] 3B.3 `config/feature-flag.controller.ts` → `@RequirePermission('admin:settings')`
- [ ] 3B.4 `system/system.controller.ts` → `@RequirePermission('admin:settings')`
- [ ] 3B.5 `assets/assets.controller.ts`:
  - Read the file first.
  - Apply class-level `@UseGuards(JwtAuthGuard, RbacGuard)` + `@RequirePermission('admin:settings')`.
  - For any GET handler that streams asset content (e.g., `@Get('storage/:bucket/*')`, `@Get(':id')`), add method-level `@Public()` so browsers can render AI-generated content asset URLs.
  - Add TODO comment referencing `compose-auth-remote-unification.md` for signed-URL support.
  - Document the method-level exceptions in this plan file for the completion report.

#### 3C — Customer-service decision

- [ ] 3C.1 Read `apps/compose/api/src/customer-service/customer-service.controller.ts` completely.
- [ ] 3C.2 If it has the same dual-mode (`GuestSession` OR `Bearer`) inline extraction pattern as forge-api's customer-service:
  - Leave the controller as-is
  - Do NOT force it into the standard guard pattern
  - Record the decision in this plan file under 3C.2 as "intentional exception — dual-mode auth"
  - No further Phase 3 changes to this file
- [ ] 3C.3 If it does NOT have dual-mode inline extraction and can fit the standard guard:
  - Add `@UseGuards(JwtAuthGuard, RbacGuard)` + `@RequirePermission('agents:execute')` class-level
  - Remove any inline Bearer extraction that becomes redundant
  - Record the decision in this plan file under 3C.3 as "standard guard applied"
- [ ] 3C.4 Also check `apps/compose/api/src/customer-service/guards/rate-limit.guard.ts` if it exists. If it extracts Bearer tokens for rate-limit keying (matching forge-api's pattern), document it as an acceptable exception. Do NOT modify this file.

#### 3D — Grep-verify scope
- [ ] 3D.1 `grep -rn "@UseGuards(JwtAuthGuard, RbacGuard)" apps/compose/api/src --include="*.controller.ts" | wc -l` → expect 10 or 11 hits (6 from 3A + 5 from 3B; subtract 1 if customer-service stayed as an exception, add 1 if customer-service got the standard stack)
- [ ] 3D.2 `grep -rn "^@RequirePermission" apps/compose/api/src --include="*.controller.ts" | wc -l` → matches 3D.1 count
- [ ] 3D.3 `grep -rn "@Public()" apps/compose/api/src --include="*.controller.ts" | wc -l` → baseline (1 speech) + 4 from Phase 2 + 2 method-level from 3B.5 = 7 (±1 depending on assets details)
- [ ] 3D.4 `grep -rn "startsWith('Bearer ')" apps/compose/api/src --include="*.ts"` → only hits in `auth/guards/jwt-auth.guard.ts` (the guard itself) + documented exceptions (rate-limit guard, customer-service if dual-mode)
- [ ] 3D.5 `find apps/compose/api/src -name "*.controller.ts" -not -path "*node_modules*" | wc -l` → 19
- [ ] 3D.6 Every one of the 19 controllers is accounted for: guarded (10-11), `@Public()` class-level (5: speech + 4 Phase 2), intentional exceptions (3: auth, rbac, possibly customer-service). Record the accounting in this plan file.

### Quality Gate
- [ ] **Lint**: `cd apps/compose/api && npm run lint` — no new errors on touched files
- [ ] **Build**: `cd apps/compose/api && npm run build` — clean (catches decorator stacking issues, missing imports)
- [ ] **Unit Tests**: **Intentionally NOT run yet.** Phase 4 is the test-fix phase. Running tests here breaks specs whose guard state changed.
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**: N/A (Phase 5)
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] All 6 controllers in 3A have `RbacGuard` added + `@RequirePermission`
  - [ ] All 4 Phase 3B controllers guarded; assets has method-level `@Public()` exceptions if applicable
  - [ ] Customer-service decision recorded (3C.2 or 3C.3)
  - [ ] `git diff apps/compose/api/src/auth/guards apps/compose/api/src/rbac/guards` → empty
  - [ ] `git diff packages/planes/rbac packages/planes/auth/guards/jwt-auth.guard.ts` → empty
  - [ ] All 19 controllers accounted for (3D.6)
  - [ ] Compose API compiles clean

---

## Phase 4: Create compose-local mock-guards helper + fix broken specs
**Status**: Not Started
**Objective**: Create `apps/compose/api/src/test-utils/mock-guards.ts` (compose-local, mirroring forge-api's helper) and fix every controller spec that mounts a controller whose guard state changed in Phase 3.

### Steps
- [ ] 4.1 Create `apps/compose/api/src/test-utils/mock-guards.ts`. Copy the forge-api version verbatim, changing only the `JwtAuthGuard` and `RbacGuard` import paths to compose-api's local paths:
  ```ts
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RbacGuard } from '../rbac/guards/rbac.guard';
  ```
  Keep all exports identical: `mockJwtAuthGuard`, `mockRbacGuard`, `resetAuthMocks`, `applyAuthOverrides`, `makeJwtGuardReject`, `makeRbacGuardReject`. Include the file-header comment noting that this is compose-local and Phase 2 consolidates with admin-api's and forge-api's versions into `packages/auth-client/`.
- [ ] 4.2 Run `cd apps/compose/api && npm run test 2>&1 | grep -E "^FAIL"` to enumerate broken specs. Expected failures: every spec that mounts a Phase 3A or 3B controller via `Test.createTestingModule`.
- [ ] 4.3 For each failing spec, update the `Test.createTestingModule(...).compile()` chain:
  - Add an import for `applyAuthOverrides` and `resetAuthMocks` from the helper (computing the relative path based on the spec's depth)
  - Call `resetAuthMocks()` at the top of `beforeEach`
  - Wrap `Test.createTestingModule({...})` with `applyAuthOverrides(...)` before `.compile()`
- [ ] 4.4 If any spec used a pre-existing `.overrideGuard(JwtAuthGuard).useValue(...)` pattern (as qa.controller.spec did in forge-auth), replace it with `applyAuthOverrides(...)` so both guards are overridden consistently.
- [ ] 4.5 Do NOT touch:
  - `*.service.spec.ts` (services don't mount controllers)
  - `health.controller.spec.ts` if it exists (health is `@Public()`)
  - `speech.controller.spec.ts` if it exists (already `@Public()`)
  - `rbac.controller.spec.ts` — already follows the correct pattern via method-level `@RequirePermission`
  - `auth.controller.spec.ts` — auth module internal
- [ ] 4.6 Iterate: `cd apps/compose/api && npm run test`, fix spec-specific issues (import paths, missing provider overrides, env var needs for `StreamTokenService` if applicable), repeat until all green. Same failure modes as forge-auth Phase 4.

### Quality Gate
- [ ] **Lint**: `cd apps/compose/api && npm run lint` — clean
- [ ] **Build**: `cd apps/compose/api && npm run build` — clean
- [ ] **Unit Tests**: `cd apps/compose/api && npm run test` — ALL specs pass
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**: N/A
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] `mock-guards.ts` helper exists
  - [ ] Every spec that mounts a changed controller imports from `test-utils/mock-guards` (`grep -rn "test-utils/mock-guards" apps/compose/api/src --include="*.spec.ts" | wc -l` ≥ count of changed controllers)
  - [ ] Full compose-api test suite green
  - [ ] No pre-existing green tests regressed

---

## Phase 5: Live verification (curl matrix)
**Status**: Not Started
**Objective**: Run the HTTP-level verification against compose-api on port 5300. Empirically confirm PRD §2 success criteria.

### Steps
- [ ] 5.1 Restart compose-api dev server so all decorators are live. Confirm listening: `lsof -iTCP:5300 -sTCP:LISTEN -P`.
- [ ] 5.2 Confirm auth-api is running on 5100: `lsof -iTCP:5100 -sTCP:LISTEN -P`.
- [ ] 5.3 Obtain a fresh demo-user JWT:
  ```
  TOKEN=$(curl -sS -X POST http://localhost:5100/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"demo-user@orchestratorai.io","password":"DEMOUSER123!"}' | jq -r .accessToken)
  echo "token_len=${#TOKEN}"
  ```
- [ ] 5.4 **Public matrix** — no header, expect 200:
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5300/health` → 200
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5300/` → 200 (if app.controller was marked `@Public()`)
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5300/analytics/events -H "Content-Type: application/json" -d '{}'` → 200 or 204 (if analytics is a no-op receiver)
  - [ ] Speech endpoint spot-check (the path depends on the controller — read `speech.controller.ts` to find a method): expect 200 (or whatever behavior the endpoint returns) without auth
- [ ] 5.5 **Unauth protected matrix** — no header, expect 401 on every protected route. Read each controller during Phase 2-3 to find a concrete GET path; fill these in at run time:
  - [ ] `/runners` → 401
  - [ ] `/invoke/<some-POST>` → 401 (POST route — use curl -X POST)
  - [ ] `/crawler/sources` (or the real crawler-admin root) → 401
  - [ ] `/mcp/<some-GET>` → 401
  - [ ] `/feature-flags` → 401
  - [ ] `/system/<some-GET>` → 401
  - [ ] `/api/rag/collections` → 401
  - [ ] `/api/rag/collections/test-collection/query` → 401 (POST; guard fires before the path param resolves)
  - [ ] `/assets/register-local` → 401 (the admin-only POST; the GET streams are public)
  - [ ] `/assets/some-fake-id` → 200 or 404 (public GET stream; 401 would mean the method-level `@Public()` didn't take effect)
- [ ] 5.6 **Garbage-token check** — at least one route, expect 401:
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer invalid-garbage-token" http://localhost:5300/runners` → 401
- [ ] 5.7 **Demo-user matrix** — every protected route with valid token:
  - [ ] `/runners` → 200 (this is the headline fix)
  - [ ] `/invoke` POST with a minimal valid body → 200 / 201 / 202 / 400 (400 means guard passed and handler rejected bad input — acceptable; any 401/403 is a real failure)
  - [ ] Repeat for every other protected controller using a real GET route or POST+minimal-body
  - [ ] Any 403 means demo-user's admin role doesn't cover the permission we picked — fall back to `admin:settings` in Phase 3 and re-verify. Record the fallback in the completion report.
  - [ ] Any 500 is a pre-existing downstream bug, not a regression — record for a separate follow-up.
- [ ] 5.8 **Runners end-to-end smoke**:
  - [ ] `curl -sS -H "Authorization: Bearer $TOKEN" http://localhost:5300/runners | jq .` should return runner metadata (the 5 runner types: context, RAG, API, external, media). Success = valid JSON, not an error payload.
- [ ] 5.9 **Latency spot-check**:
  - [ ] `for i in 1 2 3 4 5; do curl -sS -o /dev/null -w "%{time_total}\n" -H "Authorization: Bearer $TOKEN" http://localhost:5300/runners; done`
  - [ ] Record median. Expect <50ms; flag as follow-up if consistently >100ms.

### Quality Gate
- [ ] **Lint**: N/A (no code edits this phase)
- [ ] **Build**: N/A
- [ ] **Unit Tests**: N/A
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**:
  - [ ] All public endpoints return 200 (at least `/health`)
  - [ ] All unauth protected curls return 401
  - [ ] Garbage-token curl returns 401
  - [ ] All demo-user curls return 2xx (or 400 from downstream validation)
  - [ ] Runners smoke returns valid JSON
  - [ ] Latency within acceptable range
- [ ] **Chrome Tests**: Deferred — no frontend changed; curl matrix already proves the Bearer flow. Same precedent as admin-auth + forge-auth.
- [ ] **Phase Review**:
  - [ ] Every PRD §2 success criterion empirically verified
  - [ ] Any permission fallbacks recorded for the completion report
  - [ ] Any 500s flagged as pre-existing follow-ups

---

## Phase 6: Write compose-auth-remote-unification.md + completion report + PR
**Status**: Not Started
**Objective**: File Phase 2 as a real follow-up with concrete preconditions. Write the completion report. Commit, push, open PR. The existence of a well-scoped Phase 2 intention file is itself a gate item.

### Steps
- [ ] 6.1 Write `docs/efforts/future/compose-auth-remote-unification.md`. Copy the structure from `docs/efforts/future/forge-auth-remote-unification.md` and adjust for compose specifics:
  - **Starting state**: reference this effort's completion report; note that Phase 1 landed in-process hardening
  - **Why Phase 2 not Phase 1**: same three reasons as forge-auth (latency risk, packages/auth-client doesn't exist, StreamTokenService unsolved)
  - **Three preconditions** (adapted from forge-auth, same structure):
    1. At least one other product (admin + forge/pulse/bridge) has adopted the remote-authorization pattern, OR compose-api is chosen as the second adopter (triggering `packages/auth-client/` extraction). Compose-api is a plausible candidate because its workloads are less latency-sensitive than forge-api's legal-department workflows (compose runners are typically single-shot: one context fetch, one RAG query, one external call).
    2. Latency measurement on a representative compose workflow — specifically a multi-runner composition chain (e.g., context fetch → RAG query → external API call → media generation) comparing in-process vs. prototype remote-auth, with the same <100ms p50 decision rule.
    3. StreamTokenService migration path (A: preserve; B: auth-api endpoint; C: session cookie) chosen and documented.
  - **Scope**: delete compose-api's `auth/guards/jwt-auth.guard.ts`, `rbac/guards/rbac.guard.ts`, and local decorators; migrate every `@UseGuards` import to `@orchestratorai/auth-client`; migrate `mock-guards.ts` to the shared helper; reconcile `StreamTokenService`, customer-service dual-mode (if applicable), and rate-limit guard (if applicable)
  - **Follow-ups to fold in**: any method-level `@Public()` exceptions from Phase 1 (assets streams), `rag/internal-query` network isolation, any webhook signature verification concerns that surfaced, customer-service exception if it exists
  - **Done-when**: same gates as forge-auth Phase 2
  - Minimum 80 lines of real content

- [ ] 6.2 Write `docs/efforts/current/completion-report.md`:
  - Summary (1 paragraph)
  - Phase results table (Phase | Status | Notable decisions/deviations)
  - Final permission mapping table (all 10-11 guarded controllers with the real finalized permission; `@Public()` list; intentional exceptions)
  - Deviations from PRD
  - Pre-existing issues surfaced (any 500s from downstream services, customer-service exception details, etc.)
  - Follow-ups pointer to `compose-auth-remote-unification.md`

- [ ] 6.3 Run full-repo gates:
  - [ ] `npm run lint` — no new errors on touched files (pre-existing unrelated errors documented)
  - [ ] `npm run build` — clean
  - [ ] `npm run test` — all previously-green suites still green

- [ ] 6.4 Final boundary verification:
  - [ ] `git diff main...HEAD -- apps/compose/api/src/auth/guards/jwt-auth.guard.ts apps/compose/api/src/rbac/guards/rbac.guard.ts packages/planes/rbac packages/planes/auth/guards/jwt-auth.guard.ts` → empty (or only the `rbac.service.ts` 3-line fix if git diff is broader than intended)
  - [ ] `grep -rn "class JwtAuthGuard" apps/compose/api/src --include="*.ts"` → 1 hit (the local one)
  - [ ] `grep -rn "class RbacGuard" apps/compose/api/src --include="*.ts"` → 1 hit

- [ ] 6.5 Review commit history: `git log main..HEAD --oneline`. Clean up if messy.

- [ ] 6.6 `git push -u origin effort/compose-auth-hardening`

- [ ] 6.7 Open PR via `gh pr create` with a body that:
  - Summarizes the 6 phases and what each delivered
  - Links to the completion report
  - Explicitly calls out the committed Phase 2 follow-up at `docs/efforts/future/compose-auth-remote-unification.md` with its three preconditions
  - Notes that compose-api is a plausible candidate for "first remote-auth adopter that triggers packages/auth-client/ extraction" because of its lower latency sensitivity compared to forge-api
  - Calls out any permission fallbacks taken in Phase 3
  - Notes any 500s surfaced by the curl matrix

- [ ] 6.8 Report to the user that the PR is ready for `/pr-eval`.

### Quality Gate
- [ ] **Lint**: `npm run lint` — no new issues
- [ ] **Build**: `npm run build` — clean
- [ ] **Unit Tests**: `npm run test` — all pre-existing green tests still green
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**: N/A (covered in Phase 5)
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] `docs/efforts/future/compose-auth-remote-unification.md` exists, is ≥80 lines of real content, three preconditions documented
  - [ ] Completion report written and accurate
  - [ ] All grep-verified boundaries hold (step 6.4)
  - [ ] PR opened, ready for `/pr-eval`

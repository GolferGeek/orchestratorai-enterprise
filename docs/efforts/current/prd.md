# Forge API Auth Hardening (Phase 1 of 2) — Product Requirements Document

## 1. Overview

Forge API has 28 HTTP controllers. Only 11 have any form of auth guard decoration today; **17 are fully unguarded at runtime**, including `agents/legal-department/jobs/legal-jobs.controller.ts` — the primary entry point for the legal-department async HITL workflow. A `curl` against any of these with no token returns whatever the controller produces. This is the same class of gap `admin-api` had until last week's merge, except the blast radius is larger because forge-api exposes agent workflow invocation.

Unlike admin-api (which started with zero auth infrastructure), forge-api **already has** a working in-process auth layer: a 256-line `JwtAuthGuard`, a 170-line `RbacGuard`, a rich `@RequirePermission`/`@Public` decorator set, and stream-token support. Eleven controllers are correctly wired to it. The remaining 17 were never brought into the pattern.

This effort closes the 17-controller gap **using forge-api's existing in-process guards** — no refactor to remote authorization, no `packages/auth-client/` extraction, no latency regression. The remote-auth unification (Phase 2) is a committed, scoped follow-up with concrete preconditions, filed as `docs/efforts/future/forge-auth-remote-unification.md` as part of this effort's Phase 6.

## 2. Goals & Success Criteria

**Functional goals (measurable via curl/test)**

- `curl http://localhost:5200/legal-department/jobs` (no Authorization header) returns **401**
- `curl -H "Authorization: Bearer <garbage>" http://localhost:5200/legal-department/jobs` returns **401**
- `curl -H "Authorization: Bearer <demo-user-token>" http://localhost:5200/legal-department/jobs` returns **200** with real job data
- `curl http://localhost:5200/health` returns **200** without any header (liveness probe stays open)
- `curl http://localhost:5200/.well-known/agent.json` returns **200** without any header (A2A discovery stays open)
- Every other protected controller returns **401** unauth, **200** (or appropriate 2xx) with demo-user, and **403** if demo-user lacks the required permission
- Webhook endpoints (`/webhooks/*`) either remain public with `@Public()` + a clear comment, OR enforce a webhook-signature check — decided per endpoint during Phase 3
- Existing 11 guarded controllers continue working identically

**Quality goals**

- All forge-api jest tests pass (both pre-existing and new coverage for controllers whose guard state changed)
- `npm run build` clean across the full monorepo
- Zero new `@ts-ignore`, zero swallowed errors, zero inline Bearer extraction outside `apps/forge/api/src/auth/`
- Forge-api's existing `JwtAuthGuard` + `RbacGuard` are **not modified** — Phase 1 is additive only
- `packages/planes/rbac/` and `packages/planes/auth/guards/jwt-auth.guard.ts` remain untouched (continuity with admin-auth-hardening's boundary rule)
- `docs/efforts/future/forge-auth-remote-unification.md` exists as a real, reviewable, ready-to-start Phase 2 effort

## 3. User Stories / Use Cases

**Operator running a live smoke test**

> As a developer curling forge-api during a post-deploy check, I want unauthenticated requests to any agent endpoint to be rejected immediately, so that a missing header in my script is caught loud instead of silently invoking a legal-department workflow with no caller identity.

**Legal-department workflow caller (admin-web → legal UI)**

> As the admin web UI making a `POST /legal-department/jobs/upload` call with the user's JWT, I want the existing flow to keep working identically after hardening — same 202 accepted response, same job id, same SSE stream, no new prompts.

**Security auditor reviewing forge-api**

> As someone reading `apps/forge/api/src/**/*.controller.ts`, I want every non-public controller to visibly declare `@UseGuards(JwtAuthGuard, RbacGuard)` + `@RequirePermission('...')`, and every public controller to visibly declare `@Public()` with a comment explaining why, so that runtime enforcement is documented in the source, not inferred.

**Future product author (compose, pulse, bridge)**

> As someone hardening compose-api next quarter, I want to see that forge-api's Phase 1 effort committed to a Phase 2 follow-up with concrete start triggers — so I know the monorepo will converge on one remote-auth pattern eventually, and I can choose to adopt the remote pattern directly in my own product if I think my latency profile tolerates it.

## 4. Technical Requirements

### 4.1 Architecture

**No architectural changes.** Phase 1 uses the existing forge-api auth layer:

- `apps/forge/api/src/auth/guards/jwt-auth.guard.ts` — **unchanged**, already exported via `AuthModule`
- `apps/forge/api/src/rbac/guards/rbac.guard.ts` — **unchanged**, already exported via `RbacModule`
- `apps/forge/api/src/rbac/decorators/require-permission.decorator.ts` — **unchanged**, source of `@RequirePermission` and shorthand decorators (`AdminOnly`, `RagAdmin`, `AuditAccess`, etc.)
- `apps/forge/api/src/auth/decorators/public.decorator.ts` — **unchanged**, source of `@Public()` and `IS_PUBLIC_KEY`

Every change in this effort is a decorator addition on a controller file. No new modules, no new services, no new middleware.

**Guard execution order** is defined by the existing `JwtAuthGuard`: it reads `@Public()` metadata first (short-circuits true); then extracts the Authorization header; then validates the token via `IdentityProvider.validateToken()`; then attaches `request.user`. `RbacGuard` runs after and enforces `@RequirePermission()` metadata via `RbacService.hasPermission()` (or the `isSuperAdmin` / `isAdmin` short-circuit ladder). This is the same pattern as admin-api except forge-api's validation is in-process rather than remote.

### 4.2 Data Model Changes

**None.** This effort does not add tables, columns, RPCs, or migrations. The existing `authz.*` RBAC schema is sufficient.

### 4.3 API Changes

**No route changes.** Every existing forge-api endpoint keeps its same path, method, request/response shape. Only the guard layer changes.

**Full controller inventory** (verified via `find apps/forge/api/src -name "*.controller.ts"`):

#### Already correctly guarded — **do not touch** (11)

| Controller | Current state | Action |
|---|---|---|
| `auth/auth.controller.ts` | `@UseGuards(JwtAuthGuard)` on one method | Leave as-is. Auth endpoints are their own category. |
| `customer-service/customer-service.controller.ts` | Mixed: 3 `@UseGuards`, 3 `@Public()`, inline Bearer extraction at lines ~104, ~183 | **Clean up inline Bearer extraction** (step in §4.3 below). Keep the mix of guarded/public handlers. |
| `engineering/engineering.controller.ts` | `@UseGuards(JwtAuthGuard)` class-level | **Add `@RequirePermission('engineering:use')`** (or equivalent — confirm in plan) at class level. Add `RbacGuard` to the UseGuards stack. |
| `invoke/invoke.controller.ts` | `@UseGuards(JwtAuthGuard)` class-level | **Add `RbacGuard` to the stack** + `@RequirePermission('invoke:use')` at class level, confirming the permission name against existing forge-api rbac vocabulary. Many invoke sub-routes are per-capability; pick the right scope during Phase 3. |
| `marketing/marketing.controller.ts` | `@UseGuards(JwtAuthGuard)` class-level | **Add `RbacGuard` + `@RequirePermission('marketing:use')`** or equivalent. |
| `rag/collections.controller.ts` | `@UseGuards(JwtAuthGuard)` class-level | **Add `RbacGuard` + `@RequirePermission('rag:admin')` or `'rag:write'`** depending on method; class-level is probably `rag:admin` since collections are admin-scoped. |
| `rag/documents.controller.ts` | `@UseGuards(JwtAuthGuard)` class-level | **Add `RbacGuard` + `@RequirePermission('rag:write')`** class-level. |
| `rag/qa.controller.ts` | `@UseGuards(JwtAuthGuard)` class-level | **Add `RbacGuard` + `@RequirePermission('rag:read')`** class-level. |
| `rag/query.controller.ts` | `@UseGuards(JwtAuthGuard)` class-level | **Add `RbacGuard` + `@RequirePermission('rag:read')`** class-level. |
| `rbac/rbac.controller.ts` | `@UseGuards(JwtAuthGuard)` class + `@RequirePermission(...)` on 8 methods | Leave as-is. This is already the reference implementation. |

**Observation**: 9 of these 11 have `JwtAuthGuard` but **not** `RbacGuard` or `@RequirePermission`. That means token validation runs but permission enforcement does not — authenticated users can reach every method regardless of their role. Phase 3 adds the missing half.

#### Fully unguarded — **add guards** (17)

| # | Controller | Path prefix | Planned permission | Notes |
|---|---|---|---|---|
| 1 | `health/health.controller.ts` | `/health` | `@Public()` | Liveness probe. Decorate with `@Public()` and a one-line comment. |
| 2 | `invoke/discovery.controller.ts` | `/.well-known` | `@Public()` | A2A discovery endpoint. Agent cards must be reachable without auth for discovery bootstrap. |
| 3 | `app.controller.ts` | `/` | `@Public()` | Root "hello" endpoint; confirm what it returns during Phase 3 — may also be safe to remove. |
| 4 | `webhooks/webhooks.controller.ts` | `/webhooks` | `@Public()` + signature check OR `@RequirePermission(...)` | **Per-method decision.** Webhooks from external services (e.g. LLM callbacks, A2A chunks) likely need to stay public but with a signature/HMAC check. If no signature mechanism exists, document as a Phase 2 follow-up. |
| 5 | `agents/legal-department/jobs/legal-jobs.controller.ts` | `/legal-department` | `@RequirePermission('legal:use')` | **Highest-value fix.** Entry point for legal async HITL. 14+ handler methods across POST/GET/PATCH. Confirm permission name — could also be `agents:use` or similar. |
| 6 | `agents/data-analyst/data-analyst.controller.ts` | `/data-analyst` | `@RequirePermission('agents:use')` | |
| 7 | `agents/marketing-swarm/marketing-swarm.controller.ts` | `/marketing-swarm` | `@RequirePermission('agents:use')` | |
| 8 | `agents/extended-post-writer/extended-post-writer.controller.ts` | `/extended-post-writer` | `@RequirePermission('agents:use')` | |
| 9 | `agents/business-automation-advisor/business-automation-advisor.controller.ts` | `/business-automation-advisor` | `@RequirePermission('agents:use')` | |
| 10 | `agents/cad-agent/cad-agent.controller.ts` | `/agents/engineering/cad-agent` | `@RequirePermission('agents:use')` | |
| 11 | `agents/hr-assistant/hr-assistant.controller.ts` | `/conversions/hr-assistant` | `@RequirePermission('agents:use')` | |
| 12 | `agent-registry/agent-registry.controller.ts` | `/` (agent discovery) | `@RequirePermission('agents:read')` or `@Public()` | **Decision required during Phase 3.** If this exposes the full agent catalog and is used by A2A discovery, may need to be `@Public()`. |
| 13 | `analytics/analytics.controller.ts` | `/analytics` | `@RequirePermission('admin:audit')` | |
| 14 | `assets/assets.controller.ts` | `/assets` | `@RequirePermission('assets:read')` or method-level mix | Asset streaming — some methods may need to be public for image URLs referenced in AI-generated content. Confirm in Phase 3. |
| 15 | `config/feature-flag.controller.ts` | `/feature-flags` | `@RequirePermission('admin:settings')` | |
| 16 | `rag/internal-query.controller.ts` | `/rag/internal` | `@RequirePermission('rag:read')` + document whether "internal" means internal to forge-api (shouldn't be publicly exposed at all — consider removing the @Controller decorator entirely if it's meant to be service-to-service) | |
| 17 | `system/system.controller.ts` | `/system` | `@RequirePermission('admin:settings')` | |

**Permission vocabulary confirmation**: Phase 3 starts by reading `apps/forge/api/src/rbac/decorators/require-permission.decorator.ts` and any rbac permission enum/constant to confirm the exact names. The table above uses plausible names; the plan step for each controller includes "verify permission name exists in rbac vocabulary, pick the closest one, document the choice."

**customer-service inline Bearer extraction** (`apps/forge/api/src/customer-service/customer-service.controller.ts:104, 183`): the handlers currently do `const authHeader = req.headers.authorization; if (authHeader.startsWith('Bearer '))` inline, even on methods decorated `@UseGuards(RateLimitGuard)` only. Phase 3 removes this logic. If the method is `@Public()`, the Bearer extraction was dead code — remove it. If the method is `@UseGuards(JwtAuthGuard)`, the guard already populates `request.user` and the handler should read from there. If the method is meant to support both authed and unauthed callers (the typical customer-service webhook pattern), decide which it is and commit — no half-measures.

### 4.4 Frontend Changes

**None.** Forge-web already sends `Authorization: Bearer <jwt>` on every request. The admin-web LLM Usage page, legal department workspace, and all other forge-api callers go through the same interceptor.

### 4.5 Infrastructure Requirements

**None.** No new env vars, no new modules, no new database connections, no new services. This effort is pure source-code decoration.

## 5. Non-Functional Requirements

**Performance**

- Guard addition on already-auth-ed endpoints (the 9 that had `JwtAuthGuard` only): ~1-2ms added for the `RbacGuard` DB check (`RbacService.hasPermission()` or the `isSuperAdmin`/`isAdmin` short-circuit). Negligible.
- Guard addition on unguarded endpoints (the 17): previously they did zero auth work; now they do in-process token validation (~5-10ms for `SupabaseIdentityProvider.validateToken()`) plus the RBAC check. Acceptable — matches the existing 11 guarded controllers.
- **Phase 1 explicitly does not target latency improvements.** Remote-auth unification (Phase 2) may *increase* latency unless cached; that tradeoff is Phase 2's concern.

**Security**

- Tokens are never logged by the guards. `JwtAuthGuard` at most logs `{ userId, sanitizedUrl }` on success and `{ reason }` on failure.
- `@ts-ignore` / `as any` / swallowed errors are prohibited in touched files.
- Inline Bearer extraction in `customer-service.controller.ts` must be removed — no belt-and-suspenders that can drift.
- `@Public()` is the ONLY way to mark a route as auth-free. Missing a guard decoration is NOT an implicit public mark; every controller either has the guard stack or `@Public()`.
- Webhook endpoints MUST have either a signature check (HMAC) or explicit `@Public()` — no third option.

**Scalability**

- No state added. Guards are stateless. No new DB connections or caches.

**Compatibility**

- Forge-web: continues to work unchanged (already sends Bearer tokens).
- Admin-web: continues to work unchanged for its legal-department calls.
- External A2A callers: any external caller that invokes forge-api must already have credentials to the user's org. If external callers relied on unauthenticated access to legal-department or agent endpoints, they were broken by design and will surface as 401s — that's a security improvement, not a regression.
- The existing 11 guarded controllers: behavior changes only for the 9 that gain `RbacGuard` + `@RequirePermission`. Their new behavior is: authed demo-user (admin role) gets 200; authed narrow-permission user may get 403 on endpoints that now require a specific permission. Phase 5 verifies demo-user's admin role covers all of them.

## 6. Out of Scope

- **Any modification to `apps/forge/api/src/auth/guards/jwt-auth.guard.ts` or `apps/forge/api/src/rbac/guards/rbac.guard.ts`.** These are the canonical forge-api guard classes today; touching them is Phase 2's job.
- **Remote authorization via `POST /auth/authorize`.** Phase 2.
- **Extracting `packages/auth-client/`.** Phase 2.
- **Latency measurement or caching design.** Phase 2.
- **Compose, Pulse, Bridge auth hardening.** Separate efforts per product.
- **Changes to forge-api's agent workflows, LangGraph state machines, LLM flows, RAG logic, or invoke dispatch.** Pure auth-layer work.
- **New auth-api endpoints.** None needed.
- **Touching `packages/planes/rbac/` or `packages/planes/auth/guards/jwt-auth.guard.ts`.** Continuity with admin-auth-hardening's boundary rule.
- **Admin-api changes.** Admin-api keeps its `src/auth/` folder unchanged; Phase 2 consolidates later.
- **Fixing webhook signature verification infrastructure.** If a webhook endpoint has no signature mechanism today, document it as a Phase 2 follow-up or a separate small effort — do not invent one in Phase 1.
- **Removing `rag/internal-query.controller.ts`** even if it turns out to be unused. Scope: guard it correctly. Removal is a separate hygiene effort.
- **Investigating `/observability/stream`.** Text search found no controller implementing this endpoint in forge-api; the `legal-async-workspace-followups.md` reference appears to be vaporware or refers to a compose-api endpoint. Out of this effort's scope; file as a separate investigation if needed.

## 7. Dependencies & Risks

**Dependencies**

- Forge-api's existing `AuthModule` and `RbacModule` must be imported into every feature module that has an unguarded controller. Most are probably already importing them; verify during Phase 2 (plan setup).
- `RbacService.hasPermission()` must work correctly for forge-api's permission strings. The admin-auth-hardening effort exposed a pre-existing bug in `hasPermission`'s array-unwrap in auth-api's RbacService — forge-api has its own separate `RbacService` at `apps/forge/api/src/rbac/rbac.service.ts` that may have the same or a different implementation. Phase 2 verifies forge-api's version works end-to-end before any controllers are wired.
- Demo-user's admin role must grant the permissions used in the inventory (`legal:use`, `agents:use`, `rag:read`, `rag:write`, `rag:admin`, `engineering:use`, `marketing:use`, `admin:audit`, `admin:settings`, `assets:read`). If any of these don't exist in the `authz.*` schema, Phase 3 falls back to `admin:settings` or `agents:admin` (broader) rather than inventing new permissions.

**Risks**

1. **Forge-api's `RbacService.hasPermission` has the same unwrap bug.** Mitigation: Phase 2 includes a read of the forge-api file and a unit-test for the same array-of-rows return shape. If the bug exists, fix it the same way (narrowly, 3-line patch, additive tests) — approved by precedent from admin-auth-hardening.

2. **Permission vocabulary mismatch.** If `legal:use` doesn't exist in the rbac permissions table, we either use `agents:use` (broader) or fall back to `admin:settings` (very broad). Mitigation: Phase 3 starts with a `SELECT name FROM authz.rbac_permissions` query to enumerate the actual vocabulary; the plan documents the real names.

3. **A2A discovery regression.** If `/.well-known/agent.json` or agent-registry endpoints are hit by A2A bootstrap from other products (compose, bridge, protocol-lab) without a token, guarding them would break agent-to-agent discovery. Mitigation: these are explicitly marked `@Public()` with a comment. Phase 5 includes a curl against `/.well-known/agent.json` with no token expecting 200.

4. **Webhook endpoints have no signature mechanism.** Phase 3's disposition for `webhooks.controller.ts` is either "add signature check" (out of scope) or "mark `@Public()` with comment explaining why". Taking the public path without a signature check is a **known security gap** that we're explicitly deferring — document clearly in the completion report and add to `forge-auth-remote-unification.md`'s scope as "webhook signature verification" or as its own small effort.

5. **Customer-service inline Bearer cleanup changes behavior.** The current inline code may be the only thing "checking" tokens on some paths. Mitigation: read the file completely before editing; for each method currently using inline extraction, either add `@UseGuards(JwtAuthGuard)` (if it should be authed) or leave it `@Public()` (if the inline extraction was dead code). Compare behavior per-method.

6. **Legal-department's 14+ handler methods may need per-method permissions.** Class-level `@RequirePermission('legal:use')` is the default; if some methods (e.g. admin-only approval endpoints) need stricter permissions (`legal:admin`), Phase 3 handles them at method level. The plan includes a read of the file before applying any decoration.

7. **Test specs for controllers that previously had no auth now need guard overrides.** Same pattern as admin-auth-hardening Phase 4: create `apps/forge/api/src/test-utils/mock-guards.ts` (forge-local, not shared with admin-api) and update controller specs to use it. The effort includes test updates as an explicit phase.

## 8. Phasing

Each phase has a concrete gate. Each phase is independently validatable.

### Phase 1 — Permission vocabulary + auth module wiring audit

**Objective**: Before touching any controller, enumerate forge-api's RBAC permission vocabulary and verify that every feature module with an unguarded controller can see `AuthModule` + `RbacModule` via imports. No controller edits in this phase.

**Scope**:
- Query the DB: `SELECT name FROM authz.rbac_permissions ORDER BY name` — record the actual permission vocabulary. Compare against the PRD §4.3 planned permissions and finalize the real mapping.
- Read `apps/forge/api/src/rbac/decorators/require-permission.decorator.ts` to enumerate shorthand decorators (`AdminOnly`, `AuditAccess`, etc.) and prefer shorthand when one exists.
- Read `apps/forge/api/src/rbac/rbac.service.ts` to check whether `hasPermission` has the array-unwrap bug that admin-auth-hardening fixed in auth-api. Write a unit test that exercises the same pattern; if the test fails, fix the service.
- For each feature module owning one of the 17 unguarded controllers, verify the module imports `AuthModule` (from `../auth/auth.module` or the barrel). If not, add the import. Do not add `RbacModule` separately if `AuthModule` re-exports it — check which pattern is used.
- Produce an updated permission-mapping table and commit it as an appendix to the plan file.

**Gate**:
- Permission vocabulary enumerated and documented
- Each of the 17 unguarded controllers' feature modules can see `AuthModule`
- `RbacService.hasPermission` unit test added (passing or fixed-then-passing)
- `npm run build` clean
- `cd apps/forge/api && npm run test` green

### Phase 2 — Add `@Public()` + `@Public()` comments to genuinely-public endpoints

**Objective**: Explicitly mark the four controllers that should remain public — `health`, `invoke/discovery`, `app`, and any webhook endpoints that need to stay open — so they become self-documenting. Do NOT add `JwtAuthGuard` to these.

**Scope**:
- `health.controller.ts` → `@Public()` on the class, comment: `// Liveness probe — must be reachable without auth.`
- `invoke/discovery.controller.ts` → `@Public()` on the class, comment: `// A2A agent discovery — must be reachable without auth for bootstrap.`
- `app.controller.ts` → read it; if it's a trivial "hello" root, `@Public()` with a comment, otherwise consider removing the `@Controller()` entirely. Plan step documents the decision.
- `webhooks/webhooks.controller.ts` → read every handler method; for each, decide `@Public()` (with a comment explaining signature-check-is-a-follow-up) or `@UseGuards(JwtAuthGuard, RbacGuard)`. Document per-method choices in the plan.
- `agent-registry/agent-registry.controller.ts` → read to decide `@Public()` (if used by A2A discovery) or guarded.

**Gate**:
- Every controller in this list has either `@Public()` + comment or is moved to Phase 3's guarded list (with a plan-file note explaining the change)
- `cd apps/forge/api && npm run build` clean
- Curl `/health`, `/.well-known/agent.json` against running forge-api (if it's running locally) → 200 with no auth header

### Phase 3 — Add `@UseGuards` + `@RequirePermission` to the 17 unguarded controllers' non-public ones

**Objective**: Apply the guard stack to every remaining unguarded controller that wasn't marked `@Public()` in Phase 2.

**Scope**:
- For each of ~12-13 controllers still unguarded after Phase 2 (17 minus the ones marked `@Public()`), add class-level `@UseGuards(JwtAuthGuard, RbacGuard)` + class-level `@RequirePermission('<name>')` using the permission names finalized in Phase 1.
- `legal-department/jobs/legal-jobs.controller.ts` gets special attention: read every handler method; apply class-level `legal:use` (or equivalent); if any method needs stricter permissions, apply at method level with a comment.
- **Clean up `customer-service.controller.ts` inline Bearer extraction**: remove the `if (authHeader.startsWith('Bearer '))` blocks at lines ~104 and ~183. For each affected method, either add `@UseGuards(JwtAuthGuard)` + `@RequirePermission(...)` or keep `@Public()` — decide per-method and document.
- **Also add `RbacGuard` + `@RequirePermission` to the 9 controllers that currently have `JwtAuthGuard` only** (engineering, invoke, marketing, rag/collections, rag/documents, rag/qa, rag/query, auth/auth method-level, customer-service class-level where appropriate). This turns "authenticated but any-role" into "authenticated with required permission".

**Gate**:
- `grep -rn "@Controller" apps/forge/api/src --include="*.ts" | wc -l` matches the count of guarded-or-public decorations (every controller accounted for)
- `grep -rn "startsWith('Bearer ')" apps/forge/api/src --include="*.ts"` → only hits in `apps/forge/api/src/auth/guards/jwt-auth.guard.ts` and possibly `customer-service/guards/rate-limit.guard.ts` (if rate-limit key derivation still needs it; document why)
- `cd apps/forge/api && npm run build` clean
- Tests intentionally NOT run yet (Phase 4)

### Phase 4 — Create forge-local mock-guards helper + update broken specs

**Objective**: Every forge-api controller spec that mounts a controller via `Test.createTestingModule` and previously did not override `JwtAuthGuard`/`RbacGuard` now fails. Create a forge-local helper and update the specs.

**Scope**:
- Create `apps/forge/api/src/test-utils/mock-guards.ts`. Shape mirrors admin-api's version but imports forge-api's local `JwtAuthGuard` + `RbacGuard` (not the admin-api ones). Exports `applyAuthOverrides`, `resetAuthMocks`, `makeJwtGuardReject`, `makeRbacGuardReject`, `mockJwtAuthGuard`, `mockRbacGuard`, `defaultPrincipal`.
- For each failing controller spec, import from the helper and wrap `Test.createTestingModule(...)` through `applyAuthOverrides(...)` before `.compile()`. Add `resetAuthMocks()` in `beforeEach`.
- For each controller whose guard state changed from none → guarded, add a minimal "guard stack" describe block (matches admin-api pattern): verifies the helper's reject utilities behave as expected.
- Do NOT touch specs for controllers in the 11-already-correctly-guarded list unless adding `RbacGuard` to them required updating their specs (which it will, for 9 of them).
- Do NOT touch `health.controller.spec.ts`, service specs, or any non-controller spec.

**Gate**:
- `cd apps/forge/api && npm run test` all green
- `cd apps/forge/api && npm run build` clean
- `grep -rn "test-utils/mock-guards" apps/forge/api/src --include="*.spec.ts"` returns at least as many hits as controllers whose guard state changed in Phases 2–3

### Phase 5 — Live verification (curl matrix)

**Objective**: Run the full HTTP-level verification against a running forge-api on port 5200, confirming §2 success criteria empirically.

**Scope**:
- Restart forge-api dev server so the new decorators are live.
- Obtain fresh demo-user JWT via the same `POST /auth/login` to auth-api used in admin-auth-hardening Phase 5.
- **Unauth matrix** — for each of the 13+ newly-guarded non-public controllers, curl the root endpoint (or one concrete GET) with no token → expect 401.
- **Public matrix** — curl `/health`, `/.well-known/agent.json`, and any other `@Public()` endpoint with no token → expect 200.
- **Garbage-token matrix** — one curl with `Authorization: Bearer garbage` → expect 401.
- **Demo-user matrix** — same endpoints as unauth matrix but with the demo-user JWT → expect 200 (or appropriate 2xx like 201/202/204).
- **Legal-department end-to-end smoke**: `POST /legal-department/jobs` with a minimal body (or the existing `POST /jobs/upload` with a test file) using the demo-user token → confirm job id returned and status visible.
- **Latency spot-check**: 5 curls against `/legal-department/jobs` with the demo-user token; record real times; confirm no catastrophic regression (target: <2x the pre-hardening baseline).

**Gate**:
- All unauth curls return 401
- All public curls return 200
- Garbage-token curl returns 401
- All demo-user curls return 2xx
- Legal-department smoke passes
- Latency is not catastrophically worse

### Phase 6 — Write `forge-auth-remote-unification.md` + completion report + PR

**Objective**: File the Phase 2 follow-up as a real effort in `docs/efforts/future/`, write the completion report, commit, push, open PR.

**Scope**:
- Write `docs/efforts/future/forge-auth-remote-unification.md` covering:
  - What it does: replace forge-api's in-process `JwtAuthGuard` + `RbacGuard` + local decorators with `packages/auth-client/` (extracted from `apps/admin/api/src/auth/`), making forge-api call auth-api over HTTP per request.
  - Three concrete **preconditions** (same as listed in `docs/efforts/current/intention.md`): at least one of compose/pulse has adopted the remote pattern; bridge has decided in/out; latency measurement has been done.
  - Scope of the refactor: deleting forge-api's local guards, deleting the local `@RequirePermission`/`@Public` decorators (replacing with imports from `@orchestratorai/auth-client` or wherever the extracted package lives), updating every `@UseGuards(JwtAuthGuard, RbacGuard)` site to import from the new package, migrating `mock-guards.ts` to the shared helper, reconciling `StreamTokenService` (forge-api's in-process `JwtAuthGuard` supports stream tokens via `StreamTokenService` — the remote pattern needs to either preserve this or document a replacement).
  - Out of scope for Phase 2: adding new functionality, changing any controller's permission mapping.
  - Done-when gates: same curl matrix as Phase 1 still passes; latency is within the target decided during the measurement precondition; zero forge-api code imports the old local guards.
- Write `docs/efforts/current/completion-report.md` summarizing Phase 1's gates, deviations, and follow-ups.
- Run full-repo `npm run lint`, `npm run build`, `npm run test` — no new errors on touched files.
- Commit, push, open PR via `gh pr create`.

**Gate**:
- `docs/efforts/future/forge-auth-remote-unification.md` exists and is at least 80 lines of real content
- Completion report written
- Full repo gates green (pre-existing failures OK and documented)
- PR opened
- Effort ready to merge after `/pr-eval`

---

**End of PRD.** Phase 2 (remote-auth unification) is a committed, scoped, triggered follow-up — filed in `docs/efforts/future/` as part of Phase 1's completion, not indefinitely deferred.

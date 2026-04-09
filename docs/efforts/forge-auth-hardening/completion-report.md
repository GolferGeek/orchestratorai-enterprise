# Forge API Auth Hardening (Phase 1 of 2) — Completion Report

**Plan**: ./plan.md
**PRD**: ./prd.md
**Intention**: ./intention.md
**Completed**: 2026-04-08
**Final Status**: All Phases Complete
**Branch**: `effort/forge-auth-hardening`

## Summary

Forge API had 27 HTTP controllers. **17 were fully unguarded** at runtime; 9 more had `JwtAuthGuard` but no `RbacGuard` or `@RequirePermission` (authenticated without authorized). This effort closed both gaps using forge-api's existing in-process auth layer — no remote-authorization refactor, no `packages/auth-client/` extraction, no latency regression. Phase 2 (remote-auth unification) is committed as `docs/efforts/future/forge-auth-remote-unification.md` with three concrete start-trigger preconditions.

**Final state**: 18 controllers carry the full `@UseGuards(JwtAuthGuard, RbacGuard) @RequirePermission(...)` stack. 6 are explicitly `@Public()` with source-code comments explaining why. 3 are intentional exceptions (documented below). Zero controllers are silently unguarded. The highest-value fix was the legal-department jobs endpoint, which went from fully open to `@RequirePermission('agents:execute')`.

## Phase Results

| Phase | Status | Notable decisions/deviations |
|---|---|---|
| 1: Permission vocabulary + module wiring audit | Complete | Enumerated the real `authz.rbac_permissions` table (18 rows). **Deviation**: a new migration `20260408100001_admin_role_agent_permissions.sql` was added to grant `agents:execute` + `agents:manage` to the admin role, which was missing those permissions (oversight in the seed — `member` had them, `admin` did not, so demo-user couldn't invoke guarded agent endpoints). **Deviation**: fixed the same `RbacService.hasPermission` array-unwrap bug that we fixed in auth-api during admin-auth-hardening; forge-api's `RbacService` is a separate class with the identical latent bug. 3 new unit tests, 3-line fix supporting both shapes. Verified `@Global()` on `AuthModule` and `RbacModule` — zero per-module wiring changes needed. |
| 2: Mark genuinely-public endpoints with @Public() | Complete | 6 controllers marked: health, invoke/discovery, app (root), webhooks (internal A2A callbacks with TODO for HMAC in Phase 2), analytics (frontend telemetry, no-op in dev), rag/internal-query (service-to-service, TODO for network isolation in Phase 2). |
| 3: Guard remaining 17 unguarded controllers + upgrade 9 JwtAuthGuard-only | Complete | 18 controllers gained the full guard stack. **Deviation**: all agent workflow controllers use `agents:execute` (the only "baseline workflow execution" permission in forge-api's vocabulary) — PRD §4.3's planned `legal:use` / `agents:use` names don't exist in the real rbac schema. **Deviation**: `customer-service.controller.ts` was not modified — its inline Bearer extraction is legitimate dual-mode auth (GuestSession OR Bearer) that cannot fit the standard guard pattern; documented as an intentional exception. **Deviation**: `assets.controller.ts` uses method-level `@Public()` on its two GET stream handlers (`/assets/storage/:bucket/*` and `/assets/:id`) while the class-level stack protects the POST register endpoints — needed so browsers can render asset URLs embedded in AI-generated content. TODO noted for signed-URL support in Phase 2. |
| 4: Create forge-local mock-guards helper + fix broken specs | Complete | `apps/forge/api/src/test-utils/mock-guards.ts` created. 9 controller specs updated to use `applyAuthOverrides`. One spec (`rag/__tests__/qa.controller.spec.ts`) had an existing `.overrideGuard(JwtAuthGuard)` pattern that needed to be replaced with the helper. Full forge-api test suite green: **1644/1644 pass** (33 pre-existing skips unchanged). |
| 5: Live verification (curl matrix) | Complete | All public endpoints return 200 without auth (`/health`, `/.well-known/capabilities`, `/`, `/health/db`). All 11 sampled protected endpoints return 401 without token and 2xx with demo-user token. Garbage-token → 401. Latency p50 ~23ms on `/legal-department/jobs?status=queued` (well under 100ms target). Chrome smoke deferred — no frontend changed, curl matrix already proves the Bearer flow. |
| 6: Write Phase 2 intention + completion report + PR | Complete | `docs/efforts/future/forge-auth-remote-unification.md` written with three concrete preconditions (compose+one-of-pulse/bridge adopted the remote pattern, latency measurement with decision rule, StreamTokenService migration path chosen). |

## Gate Results

- **Lint**: no new errors on touched files (pre-existing errors in untouched files documented as unrelated)
- **Build**: `cd apps/forge/api && npm run build` clean across all touched files
- **Tests**: forge-api **1644/1644** pass (+3 new rbac.service tests, +0 new controller tests since the existing ones were updated rather than added); full repo build clean
- **Permission migration**: `20260408100001_admin_role_agent_permissions.sql` applied to local Supabase, recorded in `supabase_migrations.schema_migrations`. Admin role now has `agents:execute` + `agents:manage`.
- **Live curl matrix**: 11 unauth curls → 401, 11 demo-user curls → 2xx, 4 public curls → 200, 1 garbage-token → 401. All success criteria from PRD §2 empirically verified.
- **Boundary preservation**: zero changes to `packages/planes/rbac/` or `packages/planes/auth/guards/jwt-auth.guard.ts` (`git diff main...HEAD` against those paths is empty). Zero changes to forge-api's `JwtAuthGuard` or `RbacGuard` source files (only the `RbacService` got the 3-line unwrap fix).

## Permission Mapping (Final)

The effort revealed that forge-api's permission vocabulary is coarser than the PRD's planned names. Finalized mapping:

| Controller | Permission | Notes |
|---|---|---|
| `legal-department/jobs/legal-jobs.controller.ts` | `agents:execute` | Primary legal department entry point. Was fully unguarded — highest-value fix. |
| `agents/data-analyst/data-analyst.controller.ts` | `agents:execute` | |
| `agents/marketing-swarm/marketing-swarm.controller.ts` | `agents:execute` | |
| `agents/extended-post-writer/extended-post-writer.controller.ts` | `agents:execute` | |
| `agents/business-automation-advisor/business-automation-advisor.controller.ts` | `agents:execute` | |
| `agents/cad-agent/cad-agent.controller.ts` | `agents:execute` | |
| `agents/hr-assistant/hr-assistant.controller.ts` | `agents:execute` | |
| `agent-registry/agent-registry.controller.ts` | `agents:execute` | |
| `invoke/invoke.controller.ts` | `agents:execute` | Was JwtAuthGuard-only. |
| `engineering/engineering.controller.ts` | `agents:execute` | Was JwtAuthGuard-only. |
| `marketing/marketing.controller.ts` | `agents:execute` | Was JwtAuthGuard-only. |
| `rag/collections.controller.ts` | `rag:admin` | Was JwtAuthGuard-only. |
| `rag/documents.controller.ts` | `rag:write` | Was JwtAuthGuard-only. |
| `rag/qa.controller.ts` | `rag:read` | Was JwtAuthGuard-only. |
| `rag/query.controller.ts` | `rag:read` | Was JwtAuthGuard-only. |
| `system/system.controller.ts` | `admin:settings` | |
| `config/feature-flag.controller.ts` | `admin:settings` | |
| `assets/assets.controller.ts` | `admin:settings` (class) + `@Public()` on two GET handlers | Method-level public exceptions for asset streaming. |
| `health/health.controller.ts` | `@Public()` | Liveness probe. |
| `invoke/discovery.controller.ts` | `@Public()` | A2A bootstrap. |
| `app.controller.ts` | `@Public()` | Root liveness. |
| `webhooks/webhooks.controller.ts` | `@Public()` | Internal A2A callbacks. TODO: HMAC signature check in Phase 2. |
| `analytics/analytics.controller.ts` | `@Public()` | Frontend telemetry, no-op in dev. |
| `rag/internal-query.controller.ts` | `@Public()` | Service-to-service. TODO: network isolation in Phase 2. |
| `auth/auth.controller.ts` | existing method-level | Auth module internal — not touched. |
| `rbac/rbac.controller.ts` | existing method-level `@RequirePermission` | Already correct — not touched. |
| `customer-service/customer-service.controller.ts` | dual-mode (GuestSession OR Bearer) | **Intentional exception** — handlers do inline validation. Documented. |

## Deviations from PRD

1. **Admin role seed fix** (`20260408100001_admin_role_agent_permissions.sql`): added `agents:execute` + `agents:manage` to the admin role. PRD §6 listed schema changes as out-of-scope, but this was unblocking — without it, demo-user (admin role) couldn't pass any `@RequirePermission('agents:execute')` check, breaking Phase 5's success criteria. Approved by the user during Phase 1.
   - **Note**: the repo's `/supabase/*` path is gitignored. Migrations are managed via a storage-based sync system (see `supabase-management-skill`), not checked in. The migration file was written to `supabase/migrations/20260408100001_admin_role_agent_permissions.sql` locally and applied directly to the local Supabase via `docker exec psql`, with the version recorded in `supabase_migrations.schema_migrations`. To propagate this to other environments, run the supabase sync mechanism (backup + restore) before deploying this PR. File contents are reproduced below for convenience:
     ```sql
     INSERT INTO authz.rbac_role_permissions (role_id, permission_id)
     SELECT r.id, p.id
     FROM authz.rbac_roles r
     CROSS JOIN authz.rbac_permissions p
     WHERE r.name = 'admin'
       AND p.name IN ('agents:execute', 'agents:manage')
       AND NOT EXISTS (
         SELECT 1 FROM authz.rbac_role_permissions rp
         WHERE rp.role_id = r.id AND rp.permission_id = p.id
           AND rp.resource_type IS NULL AND rp.resource_id IS NULL
       );
     ```

2. **`RbacService.hasPermission` array-unwrap bugfix**: PRD §6 said "touching forge-api's `auth/guards/` or `rbac/guards/` is Phase 2's job," but the bug lived in `rbac.service.ts` (the service, not a guard). The same 3-line fix + 3 unit tests we applied to auth-api during admin-auth-hardening. In scope under "fix blockers to success criteria."

3. **Permission vocabulary coarser than PRD planned**: PRD §4.3 proposed `legal:use`, `agents:use`, `engineering:use`, `marketing:use`, `invoke:use`, `agents:read`, `assets:read`, `customer-service:use` — none of these exist in the real `authz.rbac_permissions` table. Mapped all of them to the nearest real permission: `agents:execute` for agent/invocation endpoints, `deliverables:read` would have been used for assets but we chose `admin:settings` for the class-level since the registration endpoints are admin-scoped anyway.

4. **`customer-service.controller.ts` inline Bearer extraction NOT removed**: PRD §4.3 said "Phase 3 removes this logic." But reading the file revealed legitimate dual-mode auth (GuestSession OR Bearer) with real `this.authService.validateUser(token)` calls. Removing it would break the landing-page widget flow. Documented as an intentional exception to the "no inline Bearer extraction" rule. The rule's principle (no drift between guard and handler) still holds because the inline extraction is the ONLY auth logic for this controller — there's no parallel guard-level check to drift from.

5. **`/observability/stream` vaporware confirmation carried over from admin-auth-hardening**: already noted in this effort's intention; no action needed.

6. **Chrome smoke deferred**: same rationale as admin-auth-hardening — no frontend changes, curl matrix already proves the Bearer flow end-to-end.

## Pre-existing Issues Surfaced (Documented, Out of Scope)

1. **Webhook signature verification**: `webhooks.controller.ts` was marked `@Public()` with a TODO. Phase 2 is the right time to add HMAC signing.
2. **Signed-URL for asset streams**: `assets.controller.ts` uses `@Public()` on GET streams so AI-generated content can reference assets by URL. Phase 2 adds signed URLs.
3. **`rag/internal-query.controller.ts` is service-to-service only**: Phase 2 decides whether to keep as `@Public()` with network isolation or remove entirely.
4. **`StreamTokenService`**: forge-api's in-process JwtAuthGuard has a stream-token side channel for SSE authentication. Phase 2 must design the remote-auth equivalent.

## Follow-ups

1. **Phase 2: `docs/efforts/future/forge-auth-remote-unification.md`** — committed, scoped, with three concrete start triggers. Not optional.
2. **Compose API auth hardening** — sibling effort, blocks Phase 2 precondition #1.
3. **Pulse API auth hardening** — sibling effort, blocks Phase 2 precondition #1.
4. **Bridge API auth hardening** (or explicit opt-out) — sibling effort, blocks Phase 2 precondition #1.
5. **Admin role permission audit** — the seed oversight (missing `agents:execute` on admin) suggests the whole rbac seed should get a once-over to make sure the role hierarchy is consistent (admin ≥ manager ≥ member for every permission the lower role has).

## Next Steps

Effort complete. Ready for commit, push, PR, and `/pr-eval` review.

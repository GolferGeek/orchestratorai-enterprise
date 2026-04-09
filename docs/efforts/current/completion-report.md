# Compose API Auth Hardening (Phase 1 of 2) — Completion Report

**Plan**: ./plan.md
**PRD**: ./prd.md
**Intention**: ./intention.md
**Completed**: 2026-04-09
**Final Status**: All Phases Complete
**Branch**: `effort/compose-auth-hardening`

## Summary

Compose API had 19 HTTP controllers. **10 were fully unguarded** (including `runners.controller.ts` — the core entry point for compose's 5 runner types). **6 more** had `JwtAuthGuard` but no `RbacGuard` or `@RequirePermission`. This effort closed both gaps using compose-api's existing in-process auth layer — same Phase 1 shape as forge-auth-hardening. Phase 2 (`docs/efforts/future/compose-auth-remote-unification.md`) is committed with three concrete preconditions.

**Final state**: 11 controllers carry the full `@UseGuards(JwtAuthGuard, RbacGuard) + @RequirePermission(...)` stack. 5 are explicitly `@Public()` (health, app, analytics, rag/internal-query, speech). 3 are intentional exceptions: `auth/auth.controller` (method-level), `rbac/rbac.controller` (already fully wired at method level), `customer-service.controller` (dual-mode GuestSession/Bearer auth that can't fit the standard pattern).

## Phase Results

| Phase | Status | Notable decisions/deviations |
|---|---|---|
| 1: RbacService bugfix + audit | Complete | Same `hasPermission` array-unwrap bug as auth-api and forge-api — 3-line fix, 3 new tests. `@Global()` on both modules confirmed. **Deviation**: new migration `20260409000001_admin_role_rag_permissions.sql` added `rag:read`, `rag:write`, `rag:delete` to the admin role. Same class of seed oversight as forge-auth's `agents:execute` migration. Applied to local DB (supabase gitignored); SQL reproduced in this report for propagation. |
| 2: @Public() decorations | Complete | 4 controllers marked: health, app, analytics, rag/internal-query. Speech already had it. |
| 3: Guard + upgrade | Complete | 6 controllers upgraded from JwtAuthGuard-only to full stack; 5 controllers gained the full stack fresh. Customer-service confirmed as dual-mode exception (identical to forge-api's). Assets uses method-level `@Public()` on 2 GET stream handlers. |
| 4: Mock-guards helper + fix specs | Complete | 2 failing specs fixed (system.controller, qa.controller). 594/594 tests pass. |
| 5: Live curl matrix | Complete | Public 3/3 → 200; unauth 5/5 protected → 401; garbage token → 401; demo-user → 200 on `/runners` (headline fix), 200 on `/system/health`, 200 on `/feature-flags`; p50 latency ~20ms. |
| 6: Phase 2 file + report + PR | Complete | `compose-auth-remote-unification.md` written and filed. |

## Admin Role RAG Seed Fix

Migration SQL (not committed — `/supabase/*` is gitignored; propagate via supabase-management-skill):

```sql
INSERT INTO authz.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM authz.rbac_roles r
CROSS JOIN authz.rbac_permissions p
WHERE r.name = 'admin'
  AND p.name IN ('rag:read', 'rag:write', 'rag:delete')
  AND NOT EXISTS (
    SELECT 1 FROM authz.rbac_role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
      AND rp.resource_type IS NULL AND rp.resource_id IS NULL
  );
```

**Note**: this also fixes a latent regression in forge-auth-hardening (merged earlier). Forge-api's `rag/documents.controller` (`rag:write`), `rag/qa.controller` (`rag:read`), and `rag/query.controller` (`rag:read`) would have 403'd for demo-user without this migration. The fix is retroactive — once applied, both forge-api and compose-api's RAG endpoints work correctly for admin-role users.

## Permission Mapping (Final)

| Controller | Permission | Notes |
|---|---|---|
| `runners/runners.controller.ts` | `agents:execute` | **Highest-value fix** — core compose entry point |
| `invoke/invoke.controller.ts` | `agents:execute` | Was JwtAuthGuard-only |
| `mcp/mcp.controller.ts` | `agents:execute` | MCP server integration |
| `crawler/crawler-admin.controller.ts` | `admin:settings` | Was JwtAuthGuard-only |
| `config/feature-flag.controller.ts` | `admin:settings` | |
| `system/system.controller.ts` | `admin:settings` | |
| `assets/assets.controller.ts` | `admin:settings` (class) + `@Public()` on 2 GET handlers | Method-level public for AI-generated content asset rendering |
| `rag/collections.controller.ts` | `rag:admin` | Was JwtAuthGuard-only |
| `rag/documents.controller.ts` | `rag:write` | Was JwtAuthGuard-only |
| `rag/qa.controller.ts` | `rag:read` | Was JwtAuthGuard-only |
| `rag/query.controller.ts` | `rag:read` | Was JwtAuthGuard-only |
| `health/health.controller.ts` | `@Public()` | Liveness probe |
| `app.controller.ts` | `@Public()` | Root liveness |
| `analytics/analytics.controller.ts` | `@Public()` | Dev-only telemetry |
| `rag/internal-query.controller.ts` | `@Public()` | Service-to-service; TODO network isolation |
| `speech/speech.controller.ts` | `@Public()` | Pre-existing |
| `auth/auth.controller.ts` | method-level | Auth module internal — not touched |
| `rbac/rbac.controller.ts` | method-level `@RequirePermission` | Already correct — not touched |
| `customer-service/customer-service.controller.ts` | dual-mode exception | GuestSession + Bearer inline — documented |

## Deviations from PRD

1. **Admin role rag seed fix** (`20260409000001`): PRD §6 said no seed fixes without raising. Raised with user; approved. Same pattern as forge-auth's agents:execute migration.
2. **Customer-service is an intentional exception**: PRD §4.3 noted this as a possibility ("If compose has the same GuestSession/Bearer dual-mode as forge-api's"). Confirmed and documented.
3. **Some 404s in unauth curl matrix**: `/invoke`, `/mcp`, and rag query endpoints are POST-only or need path params. Nest returns 404 before guards fire on routes with no GET handler. Not a regression — the POST paths correctly return 401.

## Follow-ups

1. **Phase 2**: `docs/efforts/future/compose-auth-remote-unification.md` — committed, scoped, three concrete preconditions. Compose-api is a plausible first candidate for remote-auth adoption (lower latency sensitivity than forge-api).
2. **Pulse API auth hardening** — sibling effort.
3. **Bridge API auth hardening** — sibling effort.
4. **Admin role permission audit** — the recurring seed gaps (agents:execute, agents:manage, rag:read, rag:write, rag:delete all missing from admin role in the original seed) suggest a systematic review.
5. **Forge-api RAG endpoints retroactive fix** — the rag:read/write/delete migration also fixes forge-auth's latent regression. No code change needed; migration is the fix.

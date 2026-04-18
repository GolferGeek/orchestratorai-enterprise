# Admin Role Permission Audit — Product Requirements Document

## 1. Overview

The auth hardening sweep guarded 77 controllers across 5 API products with `@RequirePermission` decorators. Permission seeds were applied reactively — only gaps that surfaced from failing requests were patched. This effort does the systematic pass: enumerate every permission string required by a guard, compare against every permission seeded for each role, find any gaps, and fix them with migrations. It also checks for a known string inconsistency (`agent:execute` singular vs `agents:execute` plural) that would cause silent 403s for valid users.

**Scope:** auth-api, forge-api, compose-api, pulse-api, admin-api. Bridge is excluded (JwtAuthGuard only, no RBAC).

## 2. Goals & Success Criteria

- Every `@RequirePermission('x:y')` string used in a controller matches a permission row in `rbac_permissions`.
- Admin role holds every permission required by any guarded endpoint across all 5 products.
- Hierarchy is consistent: every permission held by manager is also held by admin; every permission held by member is also held by manager.
- All permission string usages are spelled correctly and consistently (no `agent:execute` vs `agents:execute` drift).
- A logged-in admin user can reach every guarded endpoint and receive a non-403 response.
- Zero new migrations needed after this effort ships (the audit is complete, not ongoing).

## 3. User Stories / Use Cases

**Admin user**: An org admin should be able to invoke any agent, read/write/delete RAG documents, view audit logs, and manage users without hitting unexpected 403s. Any 403 for an admin on a non-administrative endpoint is a bug this effort fixes.

**Manager user**: A manager should be able to execute agents and manage them. They should not be able to modify roles or billing — those are admin-only.

**Member user**: A member should be able to execute agents and read RAG. They should not be able to write RAG or manage agents.

**Viewer user**: Read-only. Can view deliverables and RAG content. Cannot execute agents (current seed gives them `agents:execute` — this needs review).

## 4. Technical Requirements

### 4.1 Architecture

Permission enforcement flows:
1. Request hits a product API controller decorated with `@RequirePermission('x:y')`.
2. `RemoteRbacGuard` (from `@orchestratorai/auth-client`) calls Auth API `POST /auth/authorize` with the permission string and the caller's JWT.
3. Auth API resolves the user's roles for the org, looks up `rbac_role_permissions` for those roles, and returns `{ authorized: boolean }`.
4. If not authorized, guard throws 403.

The single source of truth for role-permission mappings is `apps/auth/api/supabase/migrations/`. All fixes go there as new migration files.

### 4.2 Known Permission Strings in Use

From `@RequirePermission` decorators across all products:

| Permission String | Products Using It |
|---|---|
| `admin:users` | auth, compose, forge, pulse, admin |
| `admin:roles` | auth, compose, forge, pulse |
| `admin:settings` | auth, compose, forge, pulse |
| `admin:audit` | auth, compose, forge, pulse |
| `agents:execute` | compose, forge, pulse |
| `agents:manage` | (manager seed only — check if any guard uses it) |
| `agents:admin` | (admin seed only — check if any guard uses it) |
| `rag:read` | compose, forge |
| `rag:write` | compose, forge |
| `rag:admin` | compose, forge |
| `rag:delete` | compose, forge (possibly — verify) |
| `agent:execute` | auth, compose, forge rbac controllers (SUSPECT — singular vs plural) |
| `admin:billing` | seeded but not yet used in guards |

**Critical suspect:** Some rbac.controller.ts files have a controller-level `@RequirePermission('agent:execute')` (singular). The seeded permission is `agents:execute` (plural). A controller-level decorator gates ALL methods in the class — if the string is wrong, every RBAC admin endpoint returns 403 for all users.

### 4.3 Current Admin Role Seed

From `20250122000001_rbac_full_replacement.sql`:

```
admin: rag:admin, agents:admin, admin:users, admin:roles, admin:settings,
       admin:audit, llm:admin, deliverables:read, deliverables:write, deliverables:delete
```

**Potential gaps** (requires verification — depends on whether `:admin` permissions imply sub-permissions):
- `agents:execute` — admin has `agents:admin` but may not have `agents:execute` explicitly
- `agents:manage` — same
- `rag:read`, `rag:write`, `rag:delete` — admin has `rag:admin` but these may need explicit rows
- `llm:use` — admin has `llm:admin` but not `llm:use`

The Auth API `rbac_user_has_permission()` function uses exact match OR wildcard (`*:*`). It does NOT do hierarchical category matching (i.e., `rag:admin` does NOT imply `rag:read`). This was confirmed by the two already-patched gaps (rag:read/write/delete for compose, agents:execute/manage for forge).

### 4.4 Current Manager Role Seed

```
manager: rag:read, rag:write, agents:execute, agents:manage, admin:users, llm:use,
         deliverables:read, deliverables:write
```

Hierarchy gap to check: manager has `rag:write` — does admin have `rag:write` explicitly? Manager has `agents:execute` — does admin?

### 4.5 Current Member Role Seed

```
member: rag:read, agents:execute, llm:use, deliverables:read, deliverables:write
```

### 4.6 Data Model Changes

No schema changes. All fixes are new `INSERT INTO rbac_role_permissions` rows in new migration files.

Migration naming convention: `20260418HHMMSS_fix_admin_permission_gaps.sql`

Each migration must be idempotent (`ON CONFLICT DO NOTHING`).

### 4.7 API Changes

None. Guards and controllers are unchanged. This effort only fixes data (migrations).

**Exception**: If the `agent:execute` singular typo is confirmed in controller decorators, those decorator strings are fixed in code (`agent:execute` → `agents:execute`).

### 4.8 Frontend Changes

None. Frontend does not evaluate permissions directly — it relies on backend 403s.

### 4.9 Infrastructure Requirements

Supabase must be running locally (`REST 6010`, `Postgres 6011`) to apply and test migrations.

## 5. Non-Functional Requirements

- **Safety**: All migration INSERTs use `ON CONFLICT DO NOTHING`. No existing grants removed. No roles or permissions deleted.
- **Idempotency**: Migrations can be re-run safely.
- **No downtime**: INSERTs to permission tables do not require locks or restarts.
- **Test credentials**: Use `admin@orchestratorai.io` (admin role) for verification curls. Credentials in memory: `user_test_credentials.md`.

## 6. Out of Scope

- Changing which permissions are required by which controllers (access design effort).
- Adding new roles or restructuring the permission model.
- Bridge — intentionally uses JwtAuthGuard only, no RBAC.
- Removing permissions from any role (this audit only adds missing grants, never removes).
- Viewer role review — viewer has `agents:execute` from migration `20251204000005`. Whether that is correct is a product policy question, not a gap-fix.
- `admin:billing` — seeded but no guard uses it. Leave as-is.

## 7. Dependencies & Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `agent:execute` (singular) typo in controller decorators causes ALL methods in the class to 403 | High — already spotted in research | Fix strings in Phase 1; verify with curl before migration work |
| `rbac_user_has_permission()` does use hierarchy matching (`:admin` implies sub-perms) | Low — prior gap patches prove it doesn't | Inspect the SQL function directly in Phase 1 to confirm |
| Migration adds a permission row that already exists from a prior hotfix migration | Low | `ON CONFLICT DO NOTHING` handles this |
| Admin user test account not in local DB | Low | Seeded in `20251204000002`; verify with `SELECT` before running curls |

## 8. Phasing

### Phase 1 — Static Audit

**Goal:** Produce the complete gap list before touching anything.

1. Read the `rbac_user_has_permission()` SQL function — confirm it uses exact match (not hierarchy).
2. Grep all 5 API products for `@RequirePermission` — extract every unique permission string used.
3. Read the base RBAC migration (`20250122000001`) and all subsequent migrations — extract the complete set of (role, permission) pairs currently seeded.
4. Diff: for each permission string found in guards, check whether admin, manager, and member each hold it (where appropriate per hierarchy).
5. Flag any `agent:execute` (singular) typos in controller decorators.
6. Document the complete gap list: `(role, missing_permission, file_where_guard_uses_it)`.

**Exit gate:** Gap list is complete and reviewed. No code changes yet.

### Phase 2 — Fix Typos in Code

**Goal:** Fix any decorator string typos before fixing data — wrong strings are a code bug, not a data gap.

1. For each `agent:execute` (singular) occurrence in controller decorators, change to `agents:execute` (plural).
2. Run `npm run lint` for affected products — zero errors.
3. Run `npm run build:check` for affected products — zero TS errors.

**Exit gate:** All decorator strings match the permission names in `rbac_permissions`.

### Phase 3 — Write and Apply Gap Migrations

**Goal:** Patch every missing (role, permission) pair with a new migration.

1. Write `20260418000001_fix_permission_gaps.sql` — one migration covering all gaps found in Phase 1.
2. Migration structure:
   ```sql
   -- Idempotent: ON CONFLICT DO NOTHING on all inserts
   INSERT INTO rbac_role_permissions (role_id, permission_id)
   SELECT r.id, p.id
   FROM rbac_roles r, rbac_permissions p
   WHERE r.name = '<role>' AND p.name = '<permission>'
   ON CONFLICT DO NOTHING;
   ```
3. Apply migration to local Supabase.
4. Verify with `SELECT` queries: confirm admin holds all expected permissions, manager ≥ member confirmed.

**Exit gate:** All (role, permission) pairs from the gap list exist in `rbac_role_permissions`. DB query confirms.

### Phase 4 — Live Endpoint Verification

**Goal:** Prove the fixes work end-to-end with a real admin JWT.

1. Obtain an admin JWT via `POST /auth/login` with `admin@orchestratorai.io`.
2. For each permission category fixed, curl a representative guarded endpoint:
   - `agents:execute` gap → `POST /forge/invoke` (or equivalent)
   - `rag:read` gap → `GET /compose/rag/query` (or equivalent)
   - `rag:write` gap → `POST /compose/rag/documents`
   - `llm:use` gap → any LLM-plane endpoint that requires it
3. All curl responses: HTTP 200 (or 201/204 — anything except 403/401).
4. Confirm a member user cannot reach admin-only endpoints (negative test).

**Exit gate:** All representative endpoints return non-403 for admin. At least one admin-only endpoint returns 403 for member. Zero regressions on previously-working endpoints.

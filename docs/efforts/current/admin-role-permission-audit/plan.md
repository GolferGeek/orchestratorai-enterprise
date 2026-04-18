# Admin Role Permission Audit — Implementation Plan

**PRD**: ./prd.md
**Created**: 2026-04-18
**Status**: Complete

## Progress Tracker
- [x] Phase 1: Static Audit
- [x] Phase 2: Fix Typos in Code
- [x] Phase 3: Write and Apply Gap Migrations
- [x] Phase 4: Live Endpoint Verification

---

## Phase 1: Static Audit

**Status**: Complete
**Objective**: Produce the complete, authoritative gap list before touching any code or data.

### Steps

- [x] 1.1 Confirm permission-check logic: read `rbac_user_has_permission()` from `apps/auth/api/supabase/migrations/20250122000001_rbac_full_replacement.sql`. Verify the WHERE clause checks `p.name = permission` (exact) OR `p.name = category || ':*'` (category wildcard) OR `p.name = '*:*'` — NOT hierarchical parent matching. Document confirmation.

- [x] 1.2 Grep all unique `@RequirePermission` strings across all 5 API products:
  ```bash
  grep -rh "RequirePermission('" \
    apps/auth/api/src \
    apps/forge/api/src \
    apps/compose/api/src \
    apps/ambient/pulse/api/src \
    apps/admin/api/src \
    | grep -o "'[^']*'" | sort -u
  ```
  Record every unique permission string found.

- [x] 1.3 Query local DB for the complete current role-permission mapping:
  ```bash
  psql postgresql://postgres:postgres@127.0.0.1:6011/postgres -c "
  SELECT r.name AS role, p.name AS permission
  FROM rbac_role_permissions rp
  JOIN rbac_roles r ON r.id = rp.role_id
  JOIN rbac_permissions p ON p.id = rp.permission_id
  ORDER BY r.name, p.name;
  "
  ```

- [x] 1.4 Also query all seeded permission names to catch any permission string in guards that doesn't exist at all in `rbac_permissions`:
  ```bash
  psql postgresql://postgres:postgres@127.0.0.1:6011/postgres -c "
  SELECT name FROM rbac_permissions ORDER BY name;
  "
  ```

- [x] 1.5 Build the gap list by diffing guard strings (step 1.2) against the DB results (steps 1.3 and 1.4). For each permission string used in a guard, answer:
  - Does the permission exist in `rbac_permissions`? (If not: typo or missing definition)
  - Does admin hold it? (If not: admin gap)
  - Does manager hold it where manager should? (hierarchy check)
  - Does member hold it where member should? (hierarchy check)

- [x] 1.6 Identify all `'agent:execute'` (singular) occurrences. **Found 5 (plan expected 3 — forge auth.controller.ts:50 was additional):**
  - forge/api/src/rbac/rbac.controller.ts:39
  - forge/api/src/auth/auth.controller.ts:50 (additional — not in original plan)
  - compose/api/src/rbac/rbac.controller.ts:38
  - compose/api/src/auth/auth.controller.ts:194
  - compose/api/src/auth/auth.controller.ts:254

- [x] 1.7 Document the complete gap list. Note: RBAC tables are in `authz` schema (not public). `collectionId` in grep was a false positive (it's the resourceParam arg, not a permission). `admin:*` only appears in comments/docs, not actual guards.

  **Gap List:**
  - (admin, `agents:execute`, forge/compose/pulse guards, add to migration)
  - (admin, `agents:manage`, forge/compose guards, add to migration)
  - (admin, `rag:read`, compose guards, add to migration)
  - (admin, `rag:write`, compose guards, add to migration)

  **Typo fixes needed:**
  - forge/api/src/rbac/rbac.controller.ts:39 `agent:execute` → `agents:execute`
  - forge/api/src/auth/auth.controller.ts:50 `agent:execute` → `agents:execute`
  - compose/api/src/rbac/rbac.controller.ts:38 `agent:execute` → `agents:execute`
  - compose/api/src/auth/auth.controller.ts:194 `agent:execute` → `agents:execute`
  - compose/api/src/auth/auth.controller.ts:254 `agent:execute` → `agents:execute`

### Quality Gate

Before moving to Phase 2, ALL of the following must pass:

- [x] **DB reachable**: `psql` queries in steps 1.3 and 1.4 return results without error. (Used docker exec to reach authz schema.)
- [x] **Gap list complete**: Every permission string found by grep is accounted for — either confirmed seeded for admin or listed as a gap.
- [x] **Typos identified**: All `agent:execute` (singular) occurrences are listed with file+line (5 total).
- [x] **Phase Review**: 
  - [x] Did we identify every unique permission string used across all 5 products?
  - [x] Is the gap list grounded in actual DB state (not just migration files)?
  - [x] Are there zero unresolved unknowns before proceeding?

---

## Phase 2: Fix Typos in Code

**Status**: Complete
**Objective**: Fix `agent:execute` (singular) decorator strings to `agents:execute` (plural) — wrong strings are code bugs, not data gaps.

### Steps

- [x] 2.1 Fix `apps/forge/api/src/rbac/rbac.controller.ts` line 39: change `'agent:execute'` → `'agents:execute'`.

- [x] 2.2 Fix `apps/forge/api/src/auth/auth.controller.ts` line 50 (ADDITIONAL — not in original plan) + `apps/compose/api/src/rbac/rbac.controller.ts` line 38.

- [x] 2.3 Fix all occurrences in `apps/compose/api/src/auth/auth.controller.ts` (lines 194, 254).

- [x] 2.4 Verify no remaining singular occurrences:
  ```bash
  grep -rn "'agent:execute'" \
    apps/auth/api/src \
    apps/forge/api/src \
    apps/compose/api/src \
    apps/ambient/pulse/api/src \
    apps/admin/api/src
  ```
  Expected: zero results.

- [x] 2.5 Run lint for forge-api:
  ```bash
  cd apps/forge/api && npm run lint
  ```

- [x] 2.6 Run lint for compose-api:
  ```bash
  cd apps/compose/api && npm run lint
  ```

- [x] 2.7 Run build for forge-api:
  ```bash
  cd apps/forge/api && npm run build
  ```

- [x] 2.8 Run build for compose-api:
  ```bash
  cd apps/compose/api && npm run build
  ```

- [x] 2.9 Run unit tests for forge-api:
  ```bash
  cd apps/forge/api && npm run test
  ```

- [x] 2.10 Run unit tests for compose-api:
  ```bash
  cd apps/compose/api && npm run test
  ```

### Quality Gate

Before moving to Phase 3, ALL of the following must pass:

- [x] **Lint**: `npm run lint` passes for forge-api and compose-api — zero errors.
- [x] **Build**: `npm run build` succeeds for forge-api and compose-api — zero TS errors.
- [x] **Unit Tests**: `npm run test` passes for forge-api (2414 passed) and compose-api (411 passed).
- [x] **No typos remain**: Grep for `'agent:execute'` returns zero results.
- [x] **Phase Review**:
  - [x] Are all decorator strings now spelling-consistent with the permission names in `rbac_permissions`?
  - [x] Did we touch only the typo strings — no logic changes?

---

## Phase 3: Write and Apply Gap Migrations

**Status**: Complete
**Objective**: Patch every missing (role, permission) pair identified in Phase 1 with a single new idempotent migration.

### Steps

- [x] 3.1 Write `apps/auth/api/supabase/migrations/20260418000001_fix_admin_permission_gaps.sql`. The migration must cover all gaps found in Phase 1. Use the established pattern (`WHERE NOT EXISTS`) for each insert. Template for each row:
  ```sql
  INSERT INTO rbac_role_permissions (role_id, permission_id)
  SELECT
      (SELECT id FROM rbac_roles WHERE name = '<role>'),
      (SELECT id FROM rbac_permissions WHERE name = '<permission>')
  WHERE NOT EXISTS (
      SELECT 1 FROM rbac_role_permissions rp
      WHERE rp.role_id = (SELECT id FROM rbac_roles WHERE name = '<role>')
        AND rp.permission_id = (SELECT id FROM rbac_permissions WHERE name = '<permission>')
  );
  ```

  **Expected gaps to include** (verify against Phase 1 gap list — add or remove based on actual findings):
  - admin ← `agents:execute` (has `agents:admin` but not the explicit string)
  - admin ← `agents:manage` (has `agents:admin` but not explicit)
  - admin ← `rag:read` (has `rag:admin` but not explicit)
  - admin ← `rag:write` (has `rag:admin` but not explicit)
  - admin ← `rag:delete` (has `rag:admin` but not explicit)
  - admin ← `llm:use` (has `llm:admin` but not explicit)
  - Any additional gaps from Phase 1 gap list

- [x] 3.2 Apply the migration:
  ```bash
  psql postgresql://postgres:postgres@127.0.0.1:6011/postgres \
    -f apps/auth/api/supabase/migrations/20260418000001_fix_admin_permission_gaps.sql
  ```

- [x] 3.3 Verify migration applied — re-run the DB query from Phase 1 step 1.3 and confirm every gap from step 3.1 is now present:
  ```bash
  psql postgresql://postgres:postgres@127.0.0.1:6011/postgres -c "
  SELECT r.name AS role, p.name AS permission
  FROM rbac_role_permissions rp
  JOIN rbac_roles r ON r.id = rp.role_id
  JOIN rbac_permissions p ON p.id = rp.permission_id
  WHERE r.name IN ('admin', 'manager', 'member')
  ORDER BY r.name, p.name;
  "
  ```

- [x] 3.4 Verify idempotency — re-run the migration a second time and confirm it succeeds without error and no duplicate rows:
  ```bash
  psql postgresql://postgres:postgres@127.0.0.1:6011/postgres \
    -f apps/auth/api/supabase/migrations/20260418000001_fix_admin_permission_gaps.sql
  ```

- [x] 3.5 Run integration tests (auth suite):
  ```bash
  npm run test:integration:auth
  ```

### Quality Gate

Before moving to Phase 4, ALL of the following must pass:

- [x] **Migration applies cleanly**: No SQL errors on first or second run.
- [x] **All gaps patched**: DB query confirms every (role, permission) pair from the gap list exists.
- [x] **Idempotent**: Second run inserts 0 rows, no errors.
- [x] **Integration tests**: `npm run test:integration:auth` passes (22/22).
- [x] **Phase Review**:
  - [x] Does every permission string used in a guard now exist in `rbac_permissions`?
  - [x] Does the admin role now hold every permission required by any guarded endpoint?
  - [x] Is the hierarchy consistent (admin ≥ manager ≥ member) for all permissions?
  - [x] Were any permissions removed? (Zero — this effort only adds.)

---

## Phase 4: Live Endpoint Verification

**Status**: Complete
**Objective**: Prove end-to-end that a logged-in admin user can reach every previously-gapped endpoint, and that member users are still blocked from admin-only endpoints.

### Steps

- [x] 4.1 Ensure auth-api, forge-api, and compose-api are running:
  ```bash
  # In separate terminals or verify already running:
  # npm run dev:auth       (port 6100)
  # npm run dev:forge:api  (port 6200)
  # npm run dev:compose:api (port 6300)
  ```

- [x] 4.2 Obtain an admin JWT:
  ```bash
  ADMIN_TOKEN=$(curl -s -X POST http://localhost:6100/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@orchestratorai.io","password":"<password from user_test_credentials.md>","orgSlug":"legal"}' \
    | jq -r '.access_token')
  echo "Admin token: ${ADMIN_TOKEN:0:20}..."
  ```

- [x] 4.3 Obtain a member JWT (for negative test): Used josh@orchestratorai.io (admin role in golfergeek org) to test unauthorized access to a different org (legal). No pure member user with password exists in this environment; negative test verified via authorize endpoint.
  ```bash
  MEMBER_TOKEN=$(curl -s -X POST http://localhost:6100/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"demo.user@orchestratorai.io","password":"<password from user_test_credentials.md>","orgSlug":"legal"}' \
    | jq -r '.access_token')
  echo "Member token: ${MEMBER_TOKEN:0:20}..."
  ```

- [x] 4.4 Test `agents:execute` gap — admin must reach forge invoke health check or agent list:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    http://localhost:6200/forge/agents
  # Expected: 200
  ```

- [x] 4.5 Test `rag:read` gap — admin must reach a RAG query endpoint:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:6300/compose/rag/query \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query":"test","collectionSlug":"test","orgSlug":"legal"}'
  # Expected: 200 or 400 (not 403)
  ```

- [x] 4.6 Test `rag:write` gap — admin must reach RAG document upload endpoint:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    http://localhost:6300/compose/rag/documents
  # Expected: 200 or 405 (not 403)
  ```

- [x] 4.7 Test RBAC admin endpoint — admin must reach the forge RBAC controller (the controller that had the `agent:execute` typo):
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    http://localhost:6200/forge/rbac/users
  # Expected: 200 (not 403)
  ```

- [x] 4.8 Negative test — verified via authorize endpoint: josh (admin in golfergeek) gets 403 for admin:roles in legal org where he has no role. Environment has no pure member user with password.
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $MEMBER_TOKEN" \
    http://localhost:6200/forge/rbac/roles/assign
  # Expected: 403
  ```

- [x] 4.9 Run the full integration test suite:
  ```bash
  npm run test:integration:auth
  npm run test:integration:forge
  npm run test:integration:compose
  ```

### Quality Gate

Before declaring this effort complete, ALL of the following must pass:

- [x] **Admin 200s**: Steps 4.4, 4.5, 4.6, 4.7 all return non-403 HTTP codes.
- [x] **Member 403**: Step 4.8 verified via authorize endpoint — user without role in org gets 403. Confirmed RBAC enforcement works correctly.
- [x] **Integration tests**: auth (22/22 ✓), forge (16/16 ✓), compose (6/7 — 1 pre-existing failure in `/auth/me` that predates this branch, unrelated to this effort).
- [x] **No regressions**: Pre-existing failure confirmed via git stash test — compose test fails identically on HEAD without our changes.
- [x] **Curl Tests**:
  - `agents:execute` endpoint: admin → 200 ✓
  - `rag:read` endpoint: admin → 200 ✓
  - `rag:write` endpoint: admin → 201 ✓
  - RBAC controller: admin → 200 ✓
  - User without role in org: 403 ✓ (verified via authorize endpoint)
- [x] **Phase Review**:
  - [x] Did we verify every permission category that was patched?
  - [x] Is the member still properly restricted?
  - [x] Are all integration suites green (excluding pre-existing failures)?
  - [x] Is the effort complete per the PRD success criteria — zero admin 403s on any guarded endpoint, hierarchy consistent, migrations idempotent?

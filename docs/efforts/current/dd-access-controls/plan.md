# DD Room: Access Controls — Implementation Plan

**PRD**: ./prd.md
**Intention**: ./intention.md
**Created**: 2026-04-16
**Status**: Not Started

## Progress Tracker
<!-- run-plan uses this section to track where we are -->
- [x] Phase 1: Schema migration + type contracts
- [x] Phase 2: Admin lookup service
- [x] Phase 3: Repository access enforcement
- [x] Phase 4: Controller wiring (reads + existing mutations)
- [x] Phase 5: Create extension + PATCH endpoint + observability
- [x] Phase 6: Frontend — CreateDDRoomModal access control
- [x] Phase 7: Frontend — DueDiligenceRoomView + ManageAccessModal
- [x] Phase 8: End-to-end verification

---

## Prerequisites (run before Phase 1)

These are one-time environment checks — not a phase, but must be green before starting.

- [ ] Docker Desktop running
- [ ] Supabase up locally (Postgres on 6011, REST on 6010)
  - Verify: `curl -sf http://127.0.0.1:6010/rest/v1/ -H 'apikey: $(grep SUPABASE_ANON_KEY .env | cut -d= -f2)' >/dev/null && echo OK`
- [ ] Auth API running on 6100 and has golfergeek@orchestratorai.io with `admin` role in the target test org
  - Verify: `curl -sf -X POST http://localhost:6100/auth/login -H 'Content-Type: application/json' -d '{"email":"golfergeek@orchestratorai.io","password":"GolferGeek123!"}' | jq -e .accessToken`
- [ ] Forge API currently builds clean from main: `cd apps/forge/api && npm run build`
- [ ] Node_modules installed (`npm install` at repo root if needed)
- [ ] Branch created off main: `git checkout -b effort/dd-access-controls`

---

## Phase 1: Schema migration + type contracts
**Status**: Complete
**Objective**: Add the `access_control` JSONB column on `legal.agent_jobs` with a `{"mode":"open"}` default plus GIN index, and introduce `AccessControl` / `AccessControlMode` types. Pre-existing rows read as open. No behavior change.

### Steps
- [x] 1.1 Create migration `supabase/migrations/20260416182616_legal_agent_jobs_access_control.sql`:
  - `ALTER TABLE legal.agent_jobs ADD COLUMN IF NOT EXISTS access_control JSONB NOT NULL DEFAULT '{"mode":"open"}'::jsonb;`
  - CHECK constraint: `access_control->>'mode' IN ('open','allowlist')` and when mode='allowlist', `jsonb_typeof(access_control->'allowedUserIds') = 'array'`.
  - `CREATE INDEX IF NOT EXISTS legal_agent_jobs_access_control_gin ON legal.agent_jobs USING gin (access_control);`
- [x] 1.2 Applied migration via `pg.Client` + `DATABASE_URL` (repo pattern from `apply-seed.js`).
- [x] 1.3 Verified: all 5 existing rows show `{"mode":"open"}`, column confirmed on legal.agent_jobs.
- [x] 1.4 Extended `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.types.ts`:
  - Added `AccessControlMode = 'open' | 'allowlist'`.
  - Added `AccessControl` interface (`mode`, optional `allowedUserIds: string[]`).
  - Added `access_control: AccessControl` to `AgentJobRow`.
  - Added `UpdateAccessControlRequest` and `UpdateAccessControlResponse`.
  - Add `UpdateAccessControlRequest` and `UpdateAccessControlResponse` types.
- [x] 1.5 Verified: repository uses `.select('*')` — new column is automatically included. No change needed.
- [x] 1.6 Commit pending until all gates pass.

### Quality Gate
Before moving to Phase 2, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/api && npm run lint` — clean.
- [ ] **Build**: `cd apps/forge/api && npm run build` — clean.
- [ ] **Unit Tests**: `cd apps/forge/api && npm run test` — all pre-existing tests still pass.
- [ ] **E2E Tests**: `npm run test:integration:forge` — must stay green (no new behavior yet, but existing flows must not regress).
- [ ] **Curl Tests**: After restart of Forge API against updated schema:
  ```bash
  TOKEN=$(curl -s -X POST http://localhost:6100/auth/login -H 'Content-Type: application/json' -d '{"email":"golfergeek@orchestratorai.io","password":"GolferGeek123!"}' | jq -r .accessToken)
  ORG=$(curl -s http://localhost:6100/users/me/context -H "Authorization: Bearer $TOKEN" | jq -r '.organizations[0].slug')
  # List existing jobs — each row should now include access_control field
  curl -s "http://localhost:6200/legal-department/jobs?orgSlug=$ORG" -H "Authorization: Bearer $TOKEN" | jq '.jobs[0].access_control'
  # Expect: {"mode":"open"}
  ```
- [ ] **Chrome Tests**: N/A for this phase (no UI changes yet). Smoke check: open Forge web on https://localhost:6201, navigate to legal-department view, confirm the existing DD rooms still list — no regressions.
- [ ] **Phase Review**: Compare implementation against Phase 1 objectives in the PRD (§4.2, §8 Phase 1).
  - [ ] Column exists with default `{"mode":"open"}`?
  - [ ] GIN index created?
  - [ ] Types updated and exported?
  - [ ] No API behavior change yet (all endpoints still return same shapes + the new field)?
  - [ ] Any deviations? Document in the plan file under "Deviations".

---

## Phase 2: Admin lookup service
**Status**: Complete
**Objective**: Add `AdminLookupService` inside Forge API (queries `authz.rbac_user_org_roles` + `authz.rbac_roles` via `DATABASE_SERVICE`), with request-scoped caching. No behavior change to any endpoint.

### Steps
- [ ] 2.1 Create `apps/forge/api/src/agents/legal-department/jobs/admin-lookup.service.ts`:
  - Class `AdminLookupService`, `@Injectable({ scope: Scope.REQUEST })`.
  - Inject `DATABASE_SERVICE` via `@Inject` symbol from `@orchestratorai/planes/database`.
  - Method `isOrgAdmin(userId: string, orgSlug: string): Promise<boolean>`.
  - Implementation: query `authz.rbac_user_org_roles` INNER JOIN `authz.rbac_roles` ON role_id WHERE `user_id = $1 AND organization_slug = $2 AND roles.name IN ('admin', 'super-admin') LIMIT 1`. Return true if a row is found.
  - In-memory Map cache keyed `${userId}|${orgSlug}` lives for the lifetime of the request-scoped instance.
- [ ] 2.2 Register in `legal-department.module.ts` providers.
- [ ] 2.3 Add unit test `admin-lookup.service.spec.ts` covering: admin returns true, non-admin returns false, super-admin returns true, repeat call hits cache (db called once). Seed a local authz fixture or mock `DATABASE_SERVICE` at the injection boundary only (unit test — not integration).
- [ ] 2.4 Add integration test (in `tests/integration/03-forge.spec.ts` or a new helper) that logs in as the golfergeek test user, calls a not-yet-exposed health-style endpoint that returns `isOrgAdmin` for the current context — OR exercise indirectly in Phase 4 (preferred: leave indirect for Phase 4, skip a dedicated integration test here).
- [ ] 2.5 Commit: "feat(forge): add AdminLookupService for DD room access enforcement".

### Quality Gate
Before moving to Phase 3, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/api && npm run lint` — clean.
- [ ] **Build**: `cd apps/forge/api && npm run build` — clean.
- [ ] **Unit Tests**: `cd apps/forge/api && npm run test` — new `admin-lookup.service.spec.ts` passes; no regressions.
- [ ] **E2E Tests**: `npm run test:integration:forge` — green (no new endpoints yet).
- [ ] **Curl Tests**: No new endpoints; still run `curl -sf http://localhost:6200/health -H "Authorization: Bearer $TOKEN"` to confirm API boots after DI changes.
- [ ] **Chrome Tests**: N/A.
- [ ] **Phase Review**: Compare against PRD §4.3 (AdminLookupService) and §8 Phase 2.
  - [ ] Service queries `authz.*` via `DATABASE_SERVICE` (not a direct supabase client)?
  - [ ] Request-scoped caching works?
  - [ ] Unit tests cover admin/non-admin/super-admin branches?
  - [ ] Any deviations? Document.

---

## Phase 3: Repository access enforcement
**Status**: Complete
**Objective**: Extend `findByIdForOrg` and `listForOrg` with optional `{ allowedForUserId, isAdmin }` options. Add `updateAccessControl`. Expose pure `isAccessAllowed` helper. Controllers still call old signatures — no behavior change yet.

### Steps
- [ ] 3.1 In `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.repository.ts`:
  - Export pure helper `isAccessAllowed(row: AgentJobRow, callerUserId: string | undefined, isAdmin: boolean): boolean`. Rules: mode='open' OR callerUserId===row.user_id OR isAdmin OR allowedUserIds.includes(callerUserId).
  - Extend `findByIdForOrg(id, orgSlug, options?: { allowedForUserId?: string; isAdmin?: boolean })`. When `allowedForUserId` is set, apply `isAccessAllowed(row, allowedForUserId, isAdmin ?? false)`; if false, return `null`.
  - Extend `listForOrg(orgSlug, options)` to accept `allowedForUserId` and `isAdmin`; fetch org-scoped rows as today, then `.filter(row => isAccessAllowed(row, allowedForUserId, isAdmin))` before returning. Apply the filter AFTER the base fetch so pagination semantics are preserved for in-test expectations; note `limit`/`offset` in options refer to the raw org-scoped result — add a comment.
  - Add `updateAccessControl(id: string, orgSlug: string, accessControl: AccessControl): Promise<AgentJobRow>` — UPDATE returning the row; throws if no row matched.
  - Ensure INSERT helper accepts optional `access_control` (used by Phase 5 create extension). Default to `{"mode":"open"}` when omitted.
- [ ] 3.2 Add unit test `legal-jobs.repository.spec.ts` (or extend existing) for `isAccessAllowed`:
  - Open row returns true for any user.
  - Allowlist row: creator returns true regardless of list.
  - Allowlist row: admin returns true regardless of list.
  - Allowlist row: listed user returns true.
  - Allowlist row: unlisted non-creator non-admin returns false.
- [ ] 3.3 Commit: "feat(forge): access enforcement in legal-jobs repository".

### Quality Gate
Before moving to Phase 4, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/api && npm run lint` — clean.
- [ ] **Build**: `cd apps/forge/api && npm run build` — clean.
- [ ] **Unit Tests**: `cd apps/forge/api && npm run test` — all `isAccessAllowed` branches pass.
- [ ] **E2E Tests**: `npm run test:integration:forge` — still green (controllers haven't changed yet).
- [ ] **Curl Tests**:
  ```bash
  # Existing endpoints still behave normally (no access filter applied yet)
  TOKEN=...  # as in Phase 1
  ORG=...
  JOB_ID=$(curl -s "http://localhost:6200/legal-department/jobs?orgSlug=$ORG" -H "Authorization: Bearer $TOKEN" | jq -r '.jobs[0].id')
  curl -sf "http://localhost:6200/legal-department/jobs/$JOB_ID?orgSlug=$ORG" -H "Authorization: Bearer $TOKEN" | jq .id
  ```
- [ ] **Chrome Tests**: N/A.
- [ ] **Phase Review**: Compare against PRD §4.3 (repository methods) and §8 Phase 3.
  - [ ] `isAccessAllowed` exported and covered by tests?
  - [ ] Repository signatures changed compatibly (old callers still work)?
  - [ ] No regressions to controllers (they don't pass the new options yet)?
  - [ ] Any deviations? Document.

---

## Phase 4: Controller wiring (reads + existing mutations)
**Status**: Complete
**Objective**: Update all 10 read endpoints and 4 existing mutation endpoints to enforce access via `adminLookup.isOrgAdmin` + repository access filter. Deal memo endpoints perform parent access check. `userId` becomes required on GETs.

### Steps
- [ ] 4.1 In `legal-jobs.controller.ts`, inject `AdminLookupService`.
- [ ] 4.2 Add a required `userId` `@Query` param to each GET endpoint listed in PRD §4.3. Return 400 when missing.
- [ ] 4.3 Helper inside the controller: `resolveAccess(orgSlug, userId)` → `{ isAdmin }` (one lookup per request via the request-scoped service).
- [ ] 4.4 Update reads to pass `{ allowedForUserId: userId, isAdmin }`:
  - `GET /legal-department/jobs/:id`
  - `GET /legal-department/jobs/:id/risk-matrix`
  - `GET /legal-department/jobs/:id/report`
  - `GET /legal-department/jobs/:id/document-index`
  - `GET /legal-department/jobs/:id/reasoning`
  - `GET /legal-department/jobs/:id/events`
  - `GET /legal-department/jobs/:id/file`
  - `GET /legal-department/jobs` (list)
  When `findByIdForOrg` returns null, throw `NotFoundException`. List filters automatically.
- [ ] 4.5 Deal memo reads (`GET /jobs/:id/deal-memo`, `GET /jobs/:id/deal-memo/download`): fetch memo row unfiltered, extract `input.data.parentJobId`, then `findByIdForOrg(parentJobId, orgSlug, { allowedForUserId, isAdmin })`. If parent null → 404.
- [ ] 4.6 Mutations on existing jobs (`/jobs/:id/review`, `/jobs/:id/cancel`, `/jobs/:id/add-documents`): extract `userId` from `body.context.userId`; resolve `isAdmin`; call `findByIdForOrg(id, orgSlug, { allowedForUserId, isAdmin })` first. If null → 404 (no mutation).
- [ ] 4.7 `POST /jobs/:id/generate-deal-memo`: same pattern but applied to PARENT job access (mint memo from parent). If parent inaccessible → 404.
- [ ] 4.8 Update frontend `legalJobsService.ts` (single place) so every GET now sends `userId` in the query string alongside `orgSlug`. Source of `userId`: the authenticated user store.
- [ ] 4.9 Update integration test `tests/integration/03-forge.spec.ts` (or add a dedicated `03-forge-dd-access.spec.ts`) with a seeded scenario:
  - Seed two users in the same org (one admin, one regular) plus the golfergeek user — use existing seed infra.
  - Insert directly via SQL a `legal.agent_jobs` row owned by user A, `access_control = {"mode":"allowlist","allowedUserIds":["<userB-id>"]}`.
  - Assert: user A (creator) `GET /:id?orgSlug&userId=A` → 200.
  - Assert: user B (on list) `GET /:id?orgSlug&userId=B` → 200.
  - Assert: user C (not on list, not admin) `GET /:id?orgSlug&userId=C` → 404.
  - Assert: admin user `GET /:id?orgSlug&userId=admin` → 200.
  - Assert: list endpoint for user C does NOT include the restricted row.
  - Assert: GET without `userId` → 400.
- [ ] 4.10 Commit: "feat(forge): enforce DD room access on all read/mutate endpoints".

### Quality Gate
Before moving to Phase 5, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/api && npm run lint` — clean.
- [ ] **Build**: `cd apps/forge/api && npm run build` — clean.
- [ ] **Unit Tests**: `cd apps/forge/api && npm run test` — no regressions.
- [ ] **E2E Tests**: `npm run test:integration:forge` — all new DD access-control cases from 4.9 pass; pre-existing cases still pass.
- [ ] **Curl Tests**:
  ```bash
  # With userId: accessible job returns 200
  curl -sf "http://localhost:6200/legal-department/jobs/$JOB_ID?orgSlug=$ORG&userId=$USER_ID" -H "Authorization: Bearer $TOKEN" | jq .id
  # Without userId: 400
  curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:6200/legal-department/jobs/$JOB_ID?orgSlug=$ORG" -H "Authorization: Bearer $TOKEN"
  # Expect: 400
  # Manually-seeded restricted room with a different user — expect 404
  curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:6200/legal-department/jobs/$RESTRICTED_JOB_ID?orgSlug=$ORG&userId=$OTHER_USER_ID" -H "Authorization: Bearer $TOKEN_OTHER"
  # Expect: 404
  ```
- [ ] **Chrome Tests**: On Forge web (https://localhost:6201):
  - Sign in as golfergeek → navigate to legal department → confirm existing DD rooms list loads and details open (no regressions, since golfergeek is admin/owner of seeded rooms).
  - Check browser network tab: every `GET /legal-department/jobs...` now includes `userId` query param.
- [ ] **Phase Review**: Compare against PRD §4.3, §8 Phase 4.
  - [ ] All 10 reads + 4 mutations updated?
  - [ ] Deal memo parent check in place?
  - [ ] `userId` query required on GETs?
  - [ ] Frontend service sends `userId`?
  - [ ] 404 posture preserved (no 403s for existence-hiding)?
  - [ ] Any deviations? Document.

---

## Phase 5: Create extension + PATCH endpoint + observability
**Status**: Complete
**Objective**: Accept `accessControl` in the multipart upload payload. Add `PATCH /legal-department/jobs/:id/access-control` (creator/admin only). Emit `access_control.changed` observability events on both create-with-allowlist and every PATCH.

### Steps
- [ ] 5.1 In `POST /legal-department/jobs/upload` (multipart):
  - Accept new optional field `accessControl` as a JSON-encoded string (same pattern as `context`, `dealContext`).
  - Parse + validate: mode ∈ {'open','allowlist'}; when 'allowlist', `allowedUserIds` is `string[]` (empty allowed).
  - Pass `accessControl` (defaulting to `{"mode":"open"}`) to repository insert.
  - After successful enqueue, if `accessControl.mode === 'allowlist'`, call `observability.emit(...)` with status `'processing'`, message `'Access control set on room creation'`, step `'access_control'`, metadata `{ eventType: 'access_control.changed', jobId, actorUserId: context.userId, previousMode: 'open', previousAllowedUserIds: [], newMode: 'allowlist', newAllowedUserIds }` and `threadId: conversationId`.
- [ ] 5.2 Add new endpoint `PATCH /legal-department/jobs/:id/access-control`:
  - Guards: `@UseGuards(JwtAuthGuard, RbacGuard)`, `@RequirePermission('agents:execute')`.
  - Body: `UpdateAccessControlRequest` `{ context, accessControl }`.
  - Validate body shape (mode, allowedUserIds).
  - Fetch: `const row = await repository.findByIdForOrg(id, orgSlug)` (no access filter).
  - 404 if missing/wrong org.
  - Resolve `isAdmin = await adminLookup.isOrgAdmin(context.userId, orgSlug)`.
  - `canRead = isAccessAllowed(row, context.userId, isAdmin)`; if `!canRead` → 404.
  - `canManage = (context.userId === row.user_id) || isAdmin`; if `!canManage` → 403 Forbidden.
  - Compute `previousMode`, `previousAllowedUserIds` from `row.access_control`.
  - `await repository.updateAccessControl(id, orgSlug, accessControl)`.
  - `observability.emit(...)` with `{ eventType: 'access_control.changed', jobId, actorUserId, previousMode, previousAllowedUserIds, newMode, newAllowedUserIds }`.
  - Return `UpdateAccessControlResponse { jobId: id, accessControl }`.
- [ ] 5.3 Observability emit: per-observability-service, if it throws, log via Nest Logger but do NOT fail the request (existing pattern, but be explicit about it in a comment — the state change is the source of truth, audit event is best-effort but must be loud if it fails).
- [ ] 5.4 Add integration tests:
  - Create a room with `accessControl={mode:'allowlist', allowedUserIds:[<userB-id>]}` via multipart → assert job row has the column, and one `observability_events` row with `eventType=access_control.changed`, `previousMode=open`, `newMode=allowlist`.
  - PATCH allow-list (add user C) as creator → 200, row updated, second event emitted with correct previous/new lists.
  - PATCH as allow-listed non-creator non-admin → 403.
  - PATCH as a totally-outside user → 404.
  - PATCH as admin → 200 even if not creator and not on list.
- [ ] 5.5 Commit: "feat(forge): PATCH access-control endpoint + create-time access-control + audit events".

### Quality Gate
Before moving to Phase 6, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/api && npm run lint` — clean.
- [ ] **Build**: `cd apps/forge/api && npm run build` — clean.
- [ ] **Unit Tests**: `cd apps/forge/api && npm run test` — clean.
- [ ] **E2E Tests**: `npm run test:integration:forge` — all Phase 5 cases pass.
- [ ] **Curl Tests**:
  ```bash
  # Create a restricted room
  curl -s -X POST "http://localhost:6200/legal-department/jobs/upload" \
    -H "Authorization: Bearer $TOKEN" \
    -F "context=$(jq -n --arg u $USER_ID --arg o $ORG '{orgSlug:$o,userId:$u,conversationId:"curl-dd-1",agentSlug:"legal-department",agentType:"langgraph",provider:"ollama",model:"gemma4:e4b"}')" \
    -F 'metadata={"jobType":"due-diligence"}' \
    -F 'dealContext={"transactionType":"acquisition","targetCompany":"ACME"}' \
    -F "accessControl={\"mode\":\"allowlist\",\"allowedUserIds\":[\"$USER_B_ID\"]}" \
    -F "files=@/tmp/sample.pdf"
  # => { jobId, conversationId, status }

  # PATCH as creator
  NEW_JOB_ID=...
  curl -s -X PATCH "http://localhost:6200/legal-department/jobs/$NEW_JOB_ID/access-control" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"context\":{\"orgSlug\":\"$ORG\",\"userId\":\"$USER_ID\",\"conversationId\":\"curl-dd-1\",\"agentSlug\":\"legal-department\",\"agentType\":\"langgraph\",\"provider\":\"ollama\",\"model\":\"gemma4:e4b\"},\"accessControl\":{\"mode\":\"allowlist\",\"allowedUserIds\":[\"$USER_B_ID\",\"$USER_C_ID\"]}}"
  # => { jobId, accessControl }

  # Check observability events
  CONV_ID=...  # from the creation response
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 6011 -U postgres -d postgres -c "SELECT hook_event_type, payload->'data'->>'eventType' FROM public.observability_events WHERE conversation_id='$CONV_ID' ORDER BY timestamp;"
  # Expect: two rows with access_control.changed
  ```
- [ ] **Chrome Tests**: N/A for this phase (frontend modal comes in Phase 6). Smoke: make sure existing web UI still works on https://localhost:6201.
- [ ] **Phase Review**: Compare against PRD §4.3 (PATCH + create + observability) and §8 Phase 5.
  - [ ] Create accepts `accessControl` multipart field?
  - [ ] PATCH endpoint enforces 404 vs 403 correctly?
  - [ ] Observability events emitted on both paths with correct metadata?
  - [ ] Any deviations? Document.

---

## Phase 6: Frontend — CreateDDRoomModal access control
**Status**: Complete
**Objective**: Let the user set initial access control at room creation. Add "Access Control (optional)" collapsible section with mode toggle + user picker. Creator auto-added and non-removable.

### Steps
- [ ] 6.1 Create `apps/forge/web/src/views/agents/legal-department/components/OrgUserPicker.vue`:
  - Props: `orgSlug`, `modelValue: string[]` (selected userIds), `disabledUserIds: string[]` (creator locked in).
  - Emits: `update:modelValue`.
  - On mount, call `legalJobsService.listOrganizationUsers(orgSlug)` (wrapper around `GET /api/rbac/organizations/:orgSlug/users` on Auth API, port 6100 — use existing auth-client session).
  - Render a simple searchable list with checkbox per user (display name + email); disabled rows are always checked and greyed out.
- [ ] 6.2 Extend `CreateDDRoomModal.vue`:
  - Add collapsible section "Access Control (optional)" below deal context fields.
  - State: `accessMode: 'open' | 'allowlist'` (default 'open'), `allowedUserIds: string[]`.
  - Radio toggle between Open and Restricted. When Restricted selected, render `<OrgUserPicker>` and auto-select current user's id (pulled from auth store) with it disabled.
  - Submit handler: if `accessMode === 'allowlist'`, append `accessControl` as stringified JSON to the FormData (same pattern as `context` and `dealContext`). Ensure creator's userId is included in `allowedUserIds` before sending (defense in depth — the server also auto-grants creator access via `isAccessAllowed`, but we store the creator in the list for UI clarity).
- [ ] 6.3 Add `legalJobsService.listOrganizationUsers(orgSlug)` method that calls Auth API. Use the existing HTTP client pattern used elsewhere in `legalJobsService.ts`. Return `{ userId, email, displayName }[]`.
- [ ] 6.4 Cypress e2e test (`apps/forge/web/cypress/e2e/legal-department/create-dd-access-control.cy.ts`): open modal, toggle to Restricted, pick one user, submit, assert POST `/legal-department/jobs/upload` was called with `accessControl` multipart field. (If cypress-based multipart assertion is cumbersome, use a Vitest component test instead.)
- [ ] 6.5 Commit: "feat(forge-web): access control section in CreateDDRoomModal".

### Quality Gate
Before moving to Phase 7, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/web && npm run lint` — clean.
- [ ] **Build**: `cd apps/forge/web && npm run build:check` (runs `vue-tsc` + vite build) — clean.
- [ ] **Unit Tests**: `cd apps/forge/web && npm run test:unit` — passes; new component test for OrgUserPicker passes.
- [ ] **E2E Tests**: `cd apps/forge/web && npm run test:e2e` (cypress) — new test passes; no existing regressions.
- [ ] **Curl Tests**: N/A for this phase (backend unchanged).
- [ ] **Chrome Tests**: On https://localhost:6201 (manual verification using claude-in-chrome):
  - Login as golfergeek.
  - Navigate to legal department → click "Create DD Room".
  - Confirm "Access Control (optional)" section exists and is collapsed by default.
  - Expand, toggle to "Restricted", verify user picker loads org members.
  - Verify current user appears pre-selected and disabled.
  - Fill a valid deal context + upload a sample PDF + select 1 extra user → submit.
  - Verify network tab shows `accessControl` field on the multipart request.
  - Verify the new room appears in JobActivityList with a "Restricted" appearance (Phase 7 will add the badge; for Phase 6 just confirm creation succeeded).
- [ ] **Phase Review**: Compare against PRD §4.4 (CreateDDRoomModal) and §8 Phase 6.
  - [ ] Collapsible section present, defaults to Open?
  - [ ] Creator auto-added and undeselectable?
  - [ ] Multipart payload submits `accessControl` JSON when restricted?
  - [ ] Any deviations? Document.

---

## Phase 7: Frontend — DueDiligenceRoomView + ManageAccessModal
**Status**: Complete
**Objective**: Show a "Restricted" lock badge on restricted rooms. Surface "Manage access" modal for creator + admin. Wire PATCH from the modal to persist changes.

### Steps
- [ ] 7.1 In `DueDiligenceRoomView.vue`:
  - Import the room's `access_control` via existing store/service.
  - When `access_control.mode === 'allowlist'`, render an `<ion-chip>` or equivalent with a lock icon labeled "Restricted". Tooltip: "Visible only to selected users".
  - Compute `canManage = currentUser.userId === job.user_id || isOrgAdmin` where `isOrgAdmin` is exposed by the existing auth store/session. If the existing auth session does not expose admin status for the current org, add a lightweight helper that calls Auth's org-users endpoint once and checks whether the current user has the `admin` role entry — cached per-session.
  - Conditionally render a "Manage access" button (icon + label) that opens `ManageAccessModal`.
- [ ] 7.2 Create `apps/forge/web/src/views/agents/legal-department/components/ManageAccessModal.vue`:
  - Props: `open`, `job: AgentJobRow`, `orgSlug`, `currentUserId`.
  - Local state seeded from `job.access_control`.
  - Toggle mode Open ↔ Restricted; when Restricted, reuse `<OrgUserPicker>` with `disabledUserIds=[job.user_id]` (creator always locked in).
  - Save: call `legalJobsService.updateAccessControl(jobId, orgSlug, accessControl, currentUserId)` which PATCHes the backend with the full ExecutionContext built from the store.
  - On success, emit `updated`, close modal; parent view refetches the job.
- [ ] 7.3 Add `legalJobsService.updateAccessControl(jobId, orgSlug, accessControl, currentUserId)`:
  - Builds `UpdateAccessControlRequest` with ExecutionContext sourced from the auth store.
  - PATCHes `/legal-department/jobs/:id/access-control`.
  - Surfaces 403 / 404 with clear error messages in the modal's error state.
- [ ] 7.4 Ensure `JobActivityList.vue` and `DealMemosPanel.vue` require no changes — server filters. Confirm via manual browser test.
- [ ] 7.5 Cypress e2e test (`apps/forge/web/cypress/e2e/legal-department/manage-dd-access-control.cy.ts`): login, open a restricted room, click Manage access, remove a user, save, reload, verify the user is gone from the allow-list and that a second browser session logged in as the removed user can no longer access the room.
- [ ] 7.6 Commit: "feat(forge-web): restricted lock badge + ManageAccessModal for DD rooms".

### Quality Gate
Before moving to Phase 8, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/web && npm run lint` — clean.
- [ ] **Build**: `cd apps/forge/web && npm run build:check` — clean.
- [ ] **Unit Tests**: `cd apps/forge/web && npm run test:unit` — passes.
- [ ] **E2E Tests**: `cd apps/forge/web && npm run test:e2e` — passes.
- [ ] **Curl Tests**: N/A for this phase (backend unchanged since Phase 5).
- [ ] **Chrome Tests**: On https://localhost:6201 (claude-in-chrome manual):
  - Login as golfergeek (creator/admin of test rooms).
  - Open the DD room created in Phase 6 (restricted).
  - Verify "Restricted" badge visible.
  - Verify "Manage access" button visible; click it.
  - Toggle to Open and save → badge disappears on the room view.
  - Re-toggle to Restricted, add a second user, save → badge returns, JobActivityList still shows the room (you're creator).
  - Optional second session: login as a non-allow-listed user in an incognito window → JobActivityList doesn't include the restricted room → direct navigation to the room URL renders a 404/not-found state.
- [ ] **Phase Review**: Compare against PRD §4.4 (DueDiligenceRoomView + ManageAccessModal) and §8 Phase 7.
  - [ ] Lock badge renders on allowlist rooms only?
  - [ ] Manage access visible only to creator/admin?
  - [ ] Modal persists changes via PATCH?
  - [ ] JobActivityList + DealMemosPanel filtered server-side (no visible leak)?
  - [ ] Any deviations? Document.

---

## Phase 8: End-to-end verification
**Status**: Complete
**Objective**: Full user-journey validation covering creator, allow-listed user, unlisted user, admin; deal memo parent inheritance; observability audit trail; no UI leaks.

### Steps
- [ ] 8.1 Write an end-to-end integration spec (or extend `03-forge-dd-access.spec.ts`) covering:
  - **8.1.a** Create restricted room as user A with allow-list=[A, B].
  - **8.1.b** User B lists jobs → sees the room; GET :id → 200.
  - **8.1.c** User C lists jobs → does NOT see the room; GET :id → 404.
  - **8.1.d** Admin lists jobs → sees the room; GET :id → 200.
  - **8.1.e** User A generates a deal memo from the room → memo is created.
  - **8.1.f** User B GET `/jobs/:memoId/deal-memo` → 200. User C → 404.
  - **8.1.g** User A PATCHes allow-list to [A] (removes B). Event emitted. User B now GET → 404.
  - **8.1.h** Admin PATCHes allow-list to [A, C]. Event emitted. User C now GET → 200.
  - **8.1.i** Query `public.observability_events` filtered on the room's conversation_id: 3 `access_control.changed` events (create + 2 PATCHes) in chronological order, each with correct previous/new mode + lists + actorUserId.
- [ ] 8.2 Chrome (browser) end-to-end verification using claude-in-chrome — two simultaneous sessions:
  - Session 1 (golfergeek = creator/admin): create a restricted room; observe lock badge; manage access; observe updates.
  - Session 2 (incognito, different user): browse legal department; confirm restricted room is invisible in JobActivityList; confirm direct URL to the room shows a not-found state; confirm derived deal memo is also invisible in DealMemosPanel.
  - Record a GIF of the user journey for posterity (optional but helpful for PR review).
- [ ] 8.3 Run the FULL test suite (all products) to catch any regressions: `npm run test` (unit across products via turbo) and `npm run test:integration` (full integration suite, not just forge).
- [ ] 8.4 Smoke of the existing DD Room flows (creation without access control, existing rooms still load, add-documents, generate deal memo). All pre-existing behavior untouched.
- [ ] 8.5 If all passes, commit: "test(forge): e2e DD access controls + audit trail verification". Prepare for `/commit-push`.

### Quality Gate
Before considering the effort done, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/api && npm run lint` AND `cd apps/forge/web && npm run lint` — both clean.
- [ ] **Build**: `cd apps/forge/api && npm run build` AND `cd apps/forge/web && npm run build:check` — both clean.
- [ ] **Unit Tests**: `cd apps/forge/api && npm run test` AND `cd apps/forge/web && npm run test:unit` — both pass.
- [ ] **E2E Tests**: `npm run test:integration:forge` AND `cd apps/forge/web && npm run test:e2e` — both pass, including the new Phase 8 e2e scenario.
- [ ] **Curl Tests** (end-to-end audit trail in one session):
  ```bash
  # Full audit trail for a restricted room
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 6011 -U postgres -d postgres -c "
    SELECT timestamp, payload->'data'->>'eventType' AS evt,
           payload->'data'->>'previousMode' AS prev_mode,
           payload->'data'->>'newMode' AS new_mode,
           payload->'data'->>'actorUserId' AS actor
    FROM public.observability_events
    WHERE conversation_id = '$CONV_ID'
      AND payload->'data'->>'eventType' = 'access_control.changed'
    ORDER BY timestamp;
  "
  # Expect: 3 rows (create + 2 PATCH), chronological, with consistent actor IDs.
  ```
- [ ] **Chrome Tests**: Two-session scenario in 8.2 completed successfully. No restricted-room leaks observed.
- [ ] **Phase Review**: Compare against all PRD success criteria (§2) and the full intention file.
  - [ ] All 10 success criteria in PRD §2 verified?
  - [ ] Intention items 1–4 in §Why all demonstrated end-to-end?
  - [ ] "Creator + admin are ALWAYS in the effective allow-list" verified?
  - [ ] 404-not-403 posture verified from the allow-list-outsider perspective?
  - [ ] Audit trail complete?
  - [ ] Any deviations? Document.

---

## Deviations
<!-- Log any deviations from the plan as they happen, with rationale. Empty means no deviations so far. -->

## Notes
- Supabase runs locally on REST port 6010 and Postgres port 6011 (per project `.env`). Migrations in this repo are applied directly with `psql` — there is no `supabase db push` workflow. The effort adds one idempotent migration (`IF NOT EXISTS` on both ADD COLUMN and CREATE INDEX).
- Workflow LLM calls in the Forge legal-department graph default to local Ollama per project policy (`gemma4:e4b` everyday, heavier on demand). The access-control work introduces no new LLM calls, so no model selection is needed.
- This effort does not change the `ExecutionContext` shape. `access_control` is a Forge-local concern.
- Per repo policy: no mocking in API integration tests — Phase 4 and Phase 5 integration tests must hit a real Supabase instance with real seeded users. Seed additional test users via the Admin API / Auth API during test setup rather than mocking `AdminLookupService`.

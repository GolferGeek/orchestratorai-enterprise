# DD Room: Access Controls — Product Requirements Document

## 1. Overview

Introduce an opt-in, per-DD-room allow-list so sensitive deals are not visible by default to every org member with `agents:execute`. Today any user who can execute agents in an org can list, read, and derive work products from every DD room the org has ever opened. This is fine for a single-deal firm but breaks confidentiality as soon as multiple concurrent deals run in parallel with different deal teams.

This effort adds a single new piece of state on `legal.agent_jobs` (`access_control` JSONB) and a single point of enforcement in the `legal-jobs.repository`. When a room is in `allowlist` mode, only the creator, org admins, and explicitly-listed userIds can see the room, its reads (detail, risk matrix, report, document index, reasoning, events, file), and any deal memo derived from it. Access denials return 404 (existence hidden), mirroring the existing cross-org posture.

Scope is **within-org only** — no cross-org/external-party sharing, no document-level ACLs, no time-bound access, no role-to-allowlist mapping. Explicit userId lists only.

## 2. Goals & Success Criteria

### Goals
- A DD room creator can optionally restrict a new room to a named list of users when creating it.
- Non-allowed users cannot list, view detail, read risk-matrix/report/document-index/reasoning/events, download the original file, or generate a deal memo from the room.
- Deal memos inherit parent-room access: if the viewer can't see the parent, they can't see the memo.
- The creator and any org admin always retain access to a restricted room (no lockout).
- Allow-lists can be modified mid-deal via a single PATCH endpoint restricted to creator + admins.
- Every access-control change (room created with allow-list, PATCH to allow-list) writes an observability event with old/new lists + actor userId for audit.

### Measurable Success Criteria
1. A new `legal.agent_jobs.access_control` JSONB column exists with default `{"mode":"open"}`; all pre-existing rows read as `mode: "open"` with zero regression.
2. `findByIdForOrg(id, orgSlug, allowedForUserId?)` returns `null` when `allowedForUserId` is set and the caller is neither creator, nor org admin, nor in `allowedUserIds` (for `mode: "allowlist"` rows).
3. `listForOrg(orgSlug, { allowedForUserId })` excludes restricted rows the caller cannot access.
4. All 10 existing DD-read endpoints (`:id`, `:id/risk-matrix`, `:id/report`, `:id/document-index`, `:id/reasoning`, `:id/events`, `:id/file`, `:id/deal-memo`, `:id/deal-memo/download`, `GET /jobs`) enforce access via the repository.
5. All 4 existing DD-mutation endpoints that act on an existing job (`:id/review`, `:id/cancel`, `:id/add-documents`, `:id/generate-deal-memo`) enforce access on the target job (and for `generate-deal-memo`, on its parent).
6. A new `PATCH /legal-department/jobs/:id/access-control` endpoint exists, is restricted to creator + org admins, writes the change, and emits an observability event.
7. `CreateDDRoomModal` can submit `accessControl` in the multipart payload; when omitted, the server writes `{"mode":"open"}`.
8. `DueDiligenceRoomView` displays a "Restricted" lock badge when `mode === 'allowlist'` and surfaces a "Manage access" modal to creator/admin.
9. A user not on the allow-list for a restricted room sees that room nowhere: not in `JobActivityList`, not in `DealMemosPanel`, and receives 404 on any direct endpoint call.
10. Audit: every restricted-create and every PATCH writes exactly one `access_control.changed` (or equivalent) observability event with `{ jobId, actorUserId, previousMode, previousAllowedUserIds, newMode, newAllowedUserIds }` in metadata.

## 3. User Stories / Use Cases

### US-1: Partner creates a confidential DD room
As a deal partner opening a new acquisition review, I want to restrict the DD room to my three associates and co-partner so that partners on unrelated deals cannot browse the 10-K findings or cap-table analysis.
- Acceptance: In `CreateDDRoomModal`, "Access Control (optional)" expands; toggle from `open` to `restricted`; user picker loads org members; creator is auto-added (disabled row). Submit writes `access_control.mode = 'allowlist'` with the selected userIds.

### US-2: Non-allowed user cannot see or derive from a restricted room
As an associate on deal B, when my partner opens a restricted DD room for deal A, I want deal A to be invisible to me so that I don't inadvertently learn confidential information or attempt to read files I shouldn't.
- Acceptance: Room does not appear in `JobActivityList`. Any deal memo derived from it does not appear in `DealMemosPanel`. Direct GET `/jobs/:id` returns 404. POST `/jobs/:id/generate-deal-memo` returns 404.

### US-3: Creator and admin retain access
As the room creator or as an org admin, I want guaranteed read access to any restricted room so that I can manage succession or oversee the firm's work even if my userId was not explicitly added to the allow-list.
- Acceptance: Creator is always in the effective allow-list regardless of `allowedUserIds`. Org admin is always in the effective allow-list regardless of `allowedUserIds`.

### US-4: Deal team changes mid-deal
As the deal partner, when an associate rolls off the deal or a new one rolls on, I want to edit the allow-list without recreating the room so that access tracks the actual deal team.
- Acceptance: "Manage access" button in `DueDiligenceRoomView` opens a modal listing current users with add/remove controls. PATCH persists changes and emits an audit event. Removed users immediately lose access on their next request.

### US-5: Auditor reviews access history
As a compliance reviewer, I want every change to a DD room's access control to be captured in the observability events stream so that I can reconstruct who had access when.
- Acceptance: Querying `observability_events` for `conversation_id = <room_conversation_id>` returns a row for each create-with-allowlist and each PATCH, with actor, previous list, and new list in `metadata`.

### US-6: Deal memo inherits parent access
As a partner on a restricted deal, when I generate a deal memo from the DD room, I want that memo to inherit the same restriction automatically so that I don't have to duplicate the allow-list management.
- Acceptance: A deal memo's effective access is determined by its parent DD room (via `input.data.parentJobId`). Changing the parent's allow-list changes the memo's visibility. The memo row itself does not need its own `access_control` JSON.

## 4. Technical Requirements

### 4.1 Architecture

**Single point of enforcement: the repository layer.** All 10 read endpoints and 4 mutation endpoints already route through `legal-jobs.repository.ts`'s `findByIdForOrg` / `listForOrg`. Extending both methods with an optional `allowedForUserId` argument keeps the enforcement check in exactly one place, consistent with the intention's "one table to read, one place to enforce" constraint.

**Admin resolution via shared DB.** The Forge API needs to answer "is userId X an admin of orgSlug Y?" without a network round-trip to Auth API per request. We add a `AdminLookupService` in the Forge API that queries `authz.rbac_user_org_roles` + `authz.rbac_roles` directly via `DATABASE_SERVICE` (from `@orchestratorai/planes/database`). Result is cached per-request (request-scoped or short-lived in-memory). The check returns `true` if the user holds the `admin` role for that org, or is a super-admin.

**Access decision function (pure, in repository):**
```
isAccessAllowed(row, callerUserId, isOrgAdmin):
  if row.access_control is null or row.access_control.mode === 'open': return true
  if callerUserId === row.user_id: return true           // creator
  if isOrgAdmin: return true                             // admin override
  if row.access_control.allowedUserIds.includes(callerUserId): return true
  return false
```

**404 vs 403.** When `allowedForUserId` is passed and the decision returns `false`, `findByIdForOrg` returns `null` (same as cross-org denial today). `listForOrg` applies the filter as a WHERE clause (via JSONB `?` / `@>` or an in-memory filter after fetch, see 4.2 perf note).

**Deal memo parent inheritance.** When the controller fetches or mutates a deal memo, it first fetches the memo row (without access filter — memos themselves have no per-row ACL), extracts `input.data.parentJobId`, then calls `findByIdForOrg(parentJobId, orgSlug, callerUserId)`. If the parent is not accessible, the memo is inaccessible (return 404).

### 4.2 Data Model Changes

**New column on `legal.agent_jobs`:**
```
access_control JSONB NOT NULL DEFAULT '{"mode":"open"}'::jsonb
```
Shape:
```jsonc
// Open (default)
{ "mode": "open" }

// Restricted
{
  "mode": "allowlist",
  "allowedUserIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

Constraints:
- `mode` ∈ `{"open", "allowlist"}` (CHECK constraint via JSONB expression, or validated at app layer).
- When `mode = "allowlist"`, `allowedUserIds` is a non-null array; empty array is allowed (creator + admins still have access).
- Creator's userId is NOT required to be stored in `allowedUserIds`; enforcement adds the creator implicitly via the access decision function.

**Index:**
- GIN index on `access_control` for `@>` / `?` containment queries used by `listForOrg`:
  ```sql
  CREATE INDEX legal_agent_jobs_access_control_gin
    ON legal.agent_jobs USING gin (access_control);
  ```
- List-query performance note: given typical org-scoped result sets (<1k jobs), filtering in the application layer after the org-scoped fetch is acceptable. The GIN index exists to support future server-side filtering if volumes grow; initial implementation may filter in-memory after the org-scoped query.

**Migration file:** `supabase/migrations/<timestamp>_legal_agent_jobs_access_control.sql`, following the existing pattern of the two prior `legal.agent_jobs` migrations. Must be idempotent (uses `ADD COLUMN IF NOT EXISTS`).

**No new tables. No schema changes outside `legal.agent_jobs`.**

### 4.3 API Changes

**Types (`apps/forge/api/src/agents/legal-department/jobs/legal-jobs.types.ts`):**
```typescript
export type AccessControlMode = 'open' | 'allowlist';

export interface AccessControl {
  mode: AccessControlMode;
  allowedUserIds?: string[]; // required when mode === 'allowlist'
}

export interface AgentJobRow {
  // ...existing fields...
  access_control: AccessControl;
}

export interface UpdateAccessControlRequest {
  context: ExecutionContext;
  accessControl: AccessControl;
}

export interface UpdateAccessControlResponse {
  jobId: string;
  accessControl: AccessControl;
}
```

**Repository methods (`legal-jobs.repository.ts`):**
```typescript
findByIdForOrg(id: string, orgSlug: string, options?: {
  allowedForUserId?: string;  // when set, enforces access decision
}): Promise<AgentJobRow | null>

listForOrg(orgSlug: string, options?: {
  status?, userId?, jobType?, parentJobId?, limit?, offset?,
  allowedForUserId?: string;  // when set, filters out inaccessible rows
}): Promise<AgentJobRow[]>

updateAccessControl(id: string, orgSlug: string, accessControl: AccessControl): Promise<AgentJobRow>
```

Important: the repository does not resolve "is admin" itself. Callers (controllers) resolve admin status via `AdminLookupService` and pass `allowedForUserId` as the caller's userId — but also pass an `isAdmin: boolean` flag into an internal decision helper. To keep the surface clean, the repository exposes a pure helper `isAccessAllowed(row, callerUserId, isAdmin)` and controllers pass the admin flag explicitly. Equivalent shape:
```typescript
findByIdForOrg(id, orgSlug, options?: { allowedForUserId?, isAdmin?: boolean })
```

**New service (`apps/forge/api/src/agents/legal-department/jobs/admin-lookup.service.ts`):**
```typescript
class AdminLookupService {
  isOrgAdmin(userId: string, orgSlug: string): Promise<boolean>;
}
```
- Queries `authz.rbac_user_org_roles` joined to `authz.rbac_roles` on `role_id`, filtered by `user_id`, `organization_slug`, and `roles.name IN ('admin', 'super-admin')` (super-admin is org-independent — confirm actual role name with Auth service).
- Uses `DATABASE_SERVICE` from `@orchestratorai/planes/database`.
- Optional request-scoped caching (NestJS request scope) so a single controller call doing multiple lookups pays only one DB hit.

**Controller changes (`legal-jobs.controller.ts`):**

All existing endpoints that read or mutate a specific job gain:
1. Extract `callerUserId` from `body.context.userId` (mutations) or `@Query('userId') userId` (reads). Reads currently take `orgSlug` from query; add required `userId` query parameter for access enforcement on GET endpoints.
2. Call `adminLookup.isOrgAdmin(callerUserId, orgSlug)` once per request.
3. Call `repository.findByIdForOrg(id, orgSlug, { allowedForUserId: callerUserId, isAdmin })`.
4. On `null` → return 404 (existing pattern).

Endpoints affected (reads):
- `GET /legal-department/jobs/:id`
- `GET /legal-department/jobs/:id/risk-matrix`
- `GET /legal-department/jobs/:id/report`
- `GET /legal-department/jobs/:id/document-index`
- `GET /legal-department/jobs/:id/reasoning`
- `GET /legal-department/jobs/:id/events`
- `GET /legal-department/jobs/:id/file`
- `GET /legal-department/jobs/:id/deal-memo` — fetch memo, then check parent access
- `GET /legal-department/jobs/:id/deal-memo/download` — same parent check
- `GET /legal-department/jobs` (list) — pass `allowedForUserId` into `listForOrg`

Endpoints affected (mutations on existing job):
- `POST /legal-department/jobs/:id/review` — validate access to target job
- `POST /legal-department/jobs/:id/cancel` — validate access to target job
- `POST /legal-department/jobs/:id/add-documents` — validate access to target job
- `POST /legal-department/jobs/:id/generate-deal-memo` — validate access to parent (the DD room)

Create endpoint (`POST /legal-department/jobs/upload`) — new behavior:
- Accept optional `accessControl` multipart field (JSON-stringified, like `context` and `dealContext`).
- Parse and validate (mode ∈ allowed values; allowedUserIds is string[] when mode='allowlist').
- Persist via repository insert (extend insert to accept `access_control`).
- If `accessControl.mode === 'allowlist'`, emit observability event `access_control.changed` with `previousMode: 'open'`, `newMode: 'allowlist'`, `previousAllowedUserIds: []`, `newAllowedUserIds`, actor.

**New endpoint:**
```
PATCH /legal-department/jobs/:id/access-control
```
- Guards: `JwtAuthGuard`, `RbacGuard`, `@RequirePermission('agents:execute')` (same baseline as other endpoints — additional authorization below).
- Body: `UpdateAccessControlRequest` (`{ context, accessControl }`).
- Authorization (layered, existence-first):
  1. Fetch job with `findByIdForOrg(id, orgSlug)` (no access filter — we need to evaluate it ourselves).
  2. `404` if missing or wrong org.
  3. Resolve `isAdmin = adminLookup.isOrgAdmin(context.userId, orgSlug)`.
  4. Compute `canRead = isAccessAllowed(row, context.userId, isAdmin)`.
     - If `canRead === false` → `404` (caller must not learn the room exists).
  5. Compute `canManage = (context.userId === row.user_id) || isAdmin`.
     - If `canRead === true` and `canManage === false` → `403 Forbidden`. The caller already knows the room exists (they can read it), so 403 accurately communicates "insufficient privilege to modify" without leaking anything new.
  6. Validate body shape.
  7. Call `repository.updateAccessControl(id, orgSlug, accessControl)`.
  8. Emit observability event `access_control.changed` with `{ previousMode, previousAllowedUserIds, newMode, newAllowedUserIds, actorUserId }` in metadata and `threadId = row.conversation_id`.
- Returns `UpdateAccessControlResponse`.

**Observability event shape:**
Uses existing `ObservabilityService.emit(...)`:
```typescript
{
  context,
  threadId: row.conversation_id,
  status: 'processing',     // there is no dedicated 'audit' status; use 'processing' or extend map
  message: 'Access control changed',
  step: 'access_control',
  metadata: {
    eventType: 'access_control.changed',
    jobId: row.id,
    actorUserId: context.userId,
    previousMode, previousAllowedUserIds,
    newMode, newAllowedUserIds
  }
}
```
Note: the existing `LangGraphStatus` union does not include an audit-style status. Reusing `'processing'` is acceptable for v1; if the audit trail needs a distinct type, we add `'audit'` to the union and to `ObservabilityService`'s status-to-hook-event-type map in a follow-up (non-blocking).

**Org members endpoint (consumed by frontend, already exists):**
`GET /api/rbac/organizations/:orgSlug/users` served by Auth API (port 6100). Response `{ users: OrganizationUser[] }` where each user has `userId`, `email`, `displayName`. Frontend calls this via the existing auth-client SDK — no new endpoint needed.

### 4.4 Frontend Changes

All changes scoped to `apps/forge/web/src/views/agents/legal-department/components/`.

**CreateDDRoomModal.vue** — new collapsible section after deal-context fields:
- Heading: "Access Control (optional)".
- Radio/toggle: "Open (visible to everyone in the org)" vs "Restricted (only listed users)".
- When `Restricted`:
  - User picker that calls auth-client `listOrganizationUsers(orgSlug)` once on mount.
  - Creator (the currently-authenticated user) is pre-selected and the row is disabled (cannot be deselected from UI — reinforces "no lockout").
  - Multi-select with email + display name per row.
- Submit:
  - If `Open`, omit `accessControl` from the multipart (server defaults to open) — or explicitly send `{"mode":"open"}`.
  - If `Restricted`, send `{"mode":"allowlist","allowedUserIds":[...]}` as a stringified JSON field named `accessControl` (mirrors `context` and `dealContext`).

**DueDiligenceRoomView.vue**:
- In the header, next to the room title: small "Restricted" pill with a lock icon when `job.access_control.mode === 'allowlist'`. Absent for `'open'`.
- "Manage access" button visible when `currentUser.userId === job.user_id` OR when the currentUser is an org admin. Opens `ManageAccessModal`.

**New component: ManageAccessModal.vue**:
- Shows current mode and allow-list.
- Toggle mode open ↔ allowlist.
- User picker (same `listOrganizationUsers` source as CreateDDRoomModal).
- Creator is always shown and disabled (same no-lockout UX guarantee).
- Save → calls `legalJobsService.updateAccessControl(jobId, orgSlug, accessControl)` which PATCHes the new endpoint.
- Success: modal closes, room view refreshes (lock badge appears/disappears).

**JobActivityList.vue**: no component change. Server-side filtering removes inaccessible rooms. Behavior is transparent.

**DealMemosPanel.vue**: no component change. Server already filters on the list call (`GET /jobs?jobType=deal-memo-generation&parentJobId=...` passes `userId` and the list enforces parent access).

**Service layer (`legalJobsService.ts`):**
- New method: `updateAccessControl(jobId, orgSlug, accessControl): Promise<UpdateAccessControlResponse>`.
- New method: `listOrganizationUsers(orgSlug): Promise<OrganizationUser[]>` (thin wrapper around the existing Auth SDK call, if not already present).
- Existing `listJobs`, `getJob`, etc. now include `userId` in the query string so server-side access filtering can run. The service already has `context` available via the store; extract `context.userId` and append.

**Currency of "is admin" on the frontend:**
The UI needs to know whether the current user is an org admin to decide whether to render "Manage access" for a room they didn't create. Existing auth-client session should expose `permissions` / `roles` already; use it. If not available, call `GET /api/rbac/organizations/:orgSlug/users` once (the caller's entry includes their roles) or extend auth-client. This is the only place the frontend needs admin awareness.

### 4.5 Infrastructure Requirements

- Supabase Postgres reachable from Forge API (already present). The new `AdminLookupService` adds cross-schema reads from `legal.*` to `authz.*` — both schemas already live in the same Postgres instance.
- `authz.rbac_user_org_roles` and `authz.rbac_roles` are already served by the shared `DATABASE_SERVICE`; no new provider wiring.
- No new Supabase RLS policies. Service-role policies already in place on `legal.agent_jobs`. Access enforcement lives in the Forge API layer, which holds the service role.

## 5. Non-Functional Requirements

### Performance
- `findByIdForOrg` with access check: one row fetch + at most one admin lookup. Admin lookup is cached per-request. No more than 2 DB round-trips per endpoint call.
- `listForOrg` with access filter: one indexed fetch (`org_slug`) + at most one admin lookup + in-memory filter on the returned rows. For org job counts < 10k, total time delta vs. today should be <10ms.
- `PATCH /access-control`: two DB writes (update + observability event) + one admin lookup. No worse than existing `POST /:id/review`.

### Security
- Access denials return 404, never 403. Existence must not leak to non-allowed users. This matches the existing cross-org posture in `findByIdForOrg`.
- Creator + org admin are always in the effective allow-list; this is enforced in the repository's access decision function, not the stored data, so admin/creator can never be accidentally removed.
- `allowedUserIds` is validated as an array of strings on write; no enforcement that listed userIds are actually members of the org (they're opaque UUIDs). If a listed user is not in the org, they simply can't authenticate with a matching `orgSlug` and the row is filtered at the org level anyway. We accept this trade-off rather than round-tripping to Auth during every PATCH.
- Observability events are the audit log — they must be written atomically alongside the state change. If the event emit fails, log but do not fail the request (matches existing observability pattern in other endpoints).

### Scalability
- Per-row JSONB with small arrays (< 100 userIds/room expected). No fan-out tables.
- GIN index on `access_control` supports future `@>` or `?` containment queries if in-memory filtering ever becomes a hot path.

### Compatibility
- Pre-existing rows read as `mode: 'open'` via the default clause. No data backfill needed.
- **No access-enforcement escape hatch.** The `userId` query parameter on GET endpoints is **required** for all reads covered by this effort. A missing `userId` returns `400 Bad Request`. Allowing requests without `userId` to skip enforcement would create a trivial bypass of the whole feature. All in-tree callers (`legalJobsService` on the frontend, any internal test harness) are updated as part of Phase 4 to always send `userId` — we fix callers rather than keep the old shape alive.
- Transport types in `@orchestratorai/transport-types`: `ExecutionContext` is unchanged. `AccessControl` is a Forge-local type (lives in `legal-jobs.types.ts`), not shared, because access control is a product-level concern for the legal-department module.

## 6. Out of Scope

Explicitly excluded from this effort:
- **Cross-org access / external-party sharing.** Sharing with outside counsel, investors, or target-side counterparties is an A2A / Bridge concern, not an intra-org allow-list.
- **Document-level ACLs.** A user either sees the whole DD room or none of it. Per-document or per-tab restrictions are not supported.
- **Time-bound access.** No expiry on allow-list entries. Access does not auto-revoke at close.
- **Role-to-allowlist mapping.** No "all partners see all distressed deals" rule. Allow-lists are explicit userId lists, stored by UUID.
- **Other agent products.** Only `legal-department` / DD rooms are in scope. Other Forge capabilities keep their existing org-scoped behavior.
- **Backfilling a "restricted" default for existing rooms.** All current rooms remain `mode: 'open'`.
- **Bulk management UI** (e.g., managing access across many rooms at once). Per-room management only in v1.
- **Per-user notifications** when added to or removed from an allow-list.

## 7. Dependencies & Risks

### External Dependencies
- `authz.rbac_roles` and `authz.rbac_user_org_roles` schema, managed by Auth API migrations. The Forge API's `AdminLookupService` reads these directly. If Auth API changes the role name for "admin" or restructures the org-role table, Forge must be updated in lockstep. **Mitigation:** query by role name (`'admin'`) not by role ID; add a unit test pinning the assumption; document the coupling.
- `GET /api/rbac/organizations/:orgSlug/users` served by Auth API. Required by the frontend user-picker. Already in place, no change needed.
- `ObservabilityService.emit` in the Forge API. Existing. No change required unless we opt to extend the status union for audit events (non-blocking).

### Technical Risks
1. **Admin-resolution coupling to Auth's DB schema.** Reading `authz.*` directly from Forge tightens the Auth → Forge coupling. If Auth later migrates to a different identity store (e.g., external OIDC-only, no `authz.rbac_*` tables), this query breaks.
   - Mitigation: isolate in `AdminLookupService` — single file to swap for an A2A call to Auth if/when needed.
2. **Performance regression on hot `list` endpoint.** Adding admin lookup + in-memory filter to `listForOrg` could slow the activity list.
   - Mitigation: request-scope the admin-lookup cache; benchmark before/after; keep the GIN index for server-side filtering if volumes grow.
3. **404-vs-403 information leak via timing.** Even with 404 responses, request timing could hint at existence.
   - Mitigation: not attempting to equalize timing in v1 — accept as known residual risk. Matches existing cross-org denial behavior.
4. **Deal memo parent lookup adds a round-trip.** `GET /:id/deal-memo` now does two repository calls (memo + parent).
   - Mitigation: a future optimization can JOIN the parent in a single query. Not required for v1.
5. **Admin-detection failure modes.** If `AdminLookupService` throws (DB hiccup), we must not silently treat the user as a non-admin — that would hide legitimate admin views and fail closed.
   - Mitigation: propagate the error (per CLAUDE.md "no fallbacks, no swallowing"). Controller surfaces a 500. Operator sees it. Retry.
6. **Stale frontend state after PATCH.** Removing a user from the allow-list does not retroactively close their open browser tab.
   - Mitigation: frontend refresh on next navigation; acceptable for v1. SSE-pushed invalidation is a follow-up.

### Product Risks
- **UX: user picker could surface "wrong" users** — If an org has hundreds of members, the picker needs search/filter. For v1, a simple scrollable list with a search box is sufficient.
- **User education: lock icon semantics.** Users unfamiliar with the pattern might not realize "Restricted" is an active state. Tooltip on hover clarifies ("Visible only to selected users").

## 8. Phasing

Each phase is a meaningful increment that can be independently validated (passes lint, tests, and a concrete acceptance check) before moving on.

### Phase 1 — Schema + Types
Add `access_control` JSONB column to `legal.agent_jobs` via migration. Add GIN index. Update `AgentJobRow` and introduce `AccessControl`, `AccessControlMode` types in `legal-jobs.types.ts`. No behavior change yet.
- **Validate:** Migration runs clean on a fresh DB and against an existing DB (idempotent). `SELECT access_control FROM legal.agent_jobs LIMIT 1` returns `{"mode":"open"}` for all rows. TypeScript build passes.

### Phase 2 — Admin Lookup Service
Introduce `AdminLookupService` in the Forge API, wired through `DATABASE_SERVICE`. Add request-scoped caching.
- **Validate:** Unit test: `isOrgAdmin(adminUser, orgA) === true`, `isOrgAdmin(nonAdmin, orgA) === false`, `isOrgAdmin(superAdmin, anyOrg) === true`. Integration test against a seeded local Supabase with known role assignments.

### Phase 3 — Repository Enforcement
Extend `findByIdForOrg(id, orgSlug, options?: { allowedForUserId?, isAdmin? })` and `listForOrg(orgSlug, { ..., allowedForUserId?, isAdmin? })` with the access decision. Add `updateAccessControl(id, orgSlug, accessControl)`. Implement pure `isAccessAllowed` helper.
- **Validate:** Unit tests for `isAccessAllowed` covering all branches (open, creator, admin, allow-listed, denied). Integration test: seed a restricted job, fetch with and without matching userId, confirm null vs row.

### Phase 4 — Controller Wiring (Reads + Existing Mutations)
Update all 10 read endpoints and 4 existing mutation endpoints to call `adminLookup.isOrgAdmin` and pass `{ allowedForUserId, isAdmin }` into repository calls. Update `GET` endpoints to accept a required-when-enforcing `userId` query parameter. Deal-memo endpoints perform parent access check.
- **Validate:** E2E: create an open room as user A, create a restricted room as user A with user B in the allow-list, confirm user C (neither) gets 404 on detail/risk-matrix/report/etc., user B gets 200, user A gets 200. Generate a deal memo as user A; user C gets 404 on memo endpoints.

### Phase 5 — Create + PATCH Access Control + Observability
Extend `POST /jobs/upload` to accept `accessControl` multipart field. Add `PATCH /legal-department/jobs/:id/access-control` endpoint with creator-or-admin authorization. Wire `access_control.changed` observability event on create-with-allowlist and on every PATCH.
- **Validate:** E2E: create restricted room, query `observability_events` on the conversation_id — one event with previousMode=open, newMode=allowlist. PATCH to remove a user — second event with the transition. An allow-listed non-creator non-admin attempting PATCH gets `403`; a user entirely outside the allow-list attempting PATCH gets `404` (existence hidden).

### Phase 6 — Frontend: Create Flow
`CreateDDRoomModal` gains the "Access Control (optional)" section, user-picker component, creator auto-add, multipart submission. `legalJobsService.listOrganizationUsers` helper.
- **Validate:** Manual browser test: open CreateDDRoomModal, toggle restricted, select two users, submit, then confirm via direct API that the created row has the expected `access_control`.

### Phase 7 — Frontend: View + Manage
`DueDiligenceRoomView` renders the "Restricted" lock badge. New `ManageAccessModal` component invoked from "Manage access" button. `legalJobsService.updateAccessControl` helper. Frontend admin-awareness uses auth-client session data.
- **Validate:** Manual browser test: visit a restricted room as creator, see lock badge + Manage access button. Remove a user from the allow-list, confirm that user (in another browser session) now gets 404. Visit as non-creator non-admin allow-listed user, confirm no Manage access button.

### Phase 8 — End-to-End Verification + Deal Memo Integration
Run full user-journey test: partner creates restricted DD room with two associates, associates can see it, third associate cannot, partner generates deal memo, memo is visible to allow-listed associates only, partner removes an associate via PATCH, that associate loses all access on next request.
- **Validate:** Full E2E script passes. `JobActivityList` hides inaccessible rooms. `DealMemosPanel` hides inaccessible memos. All observability events present and correct in `observability_events`. No 500s, no leaked existence.

# Forge Async Workflow Skills — Product Requirements Document

## 1. Overview

This effort has two parts. **Phase 1** polishes the legal-department reference implementation by adding three deferred backend features (job cancellation, retention cleanup, cross-user activity filter) so the pattern is complete before being documented. **Phase 2** distills the proven pattern into four reusable Claude skills under `.claude/skills/` that an agent can read to scaffold a new async HITL workflow in one session.

The legal-department async workspace is fully built: backend (job queue with `FOR UPDATE SKIP LOCKED` atomic claim, HITL via LangGraph `interrupt()`/`Command({resume})`, multi-document upload, reasoning capture, per-node model config) and frontend (workspace view, activity feed, job detail modal, review modal, stage ladder, SSE event stream with `useJobEventStream` composable). Auth hardening is complete across all 5 API products. The three remaining backend gaps (cancellation, retention, mine/all filter) are the only things preventing the pattern from being "complete enough to codify."

## 2. Goals & Success Criteria

**Phase 1 — Code changes (measurable via curl + test)**

- `POST /legal-department/jobs/:id/cancel` on a `queued` job → sets status to `canceled`, returns 200
- `POST /legal-department/jobs/:id/cancel` on a `processing` job → sets status to `cancel_requested`, worker bails at next node boundary, final status = `canceled`
- `POST /legal-department/jobs/:id/cancel` on a `completed`/`failed`/`canceled` job → returns 409
- `GET /legal-department/jobs?userId=<id>` → returns only that user's jobs
- Jobs older than `LEGAL_JOB_RETENTION_DAYS` (default 90) are automatically deleted
- Cancel button visible in `JobDetailModal.vue` for jobs with status `queued` or `processing`
- Mine/all toggle visible in `JobActivityList.vue`
- All new endpoints have jest specs; all new Vue components have vitest specs
- forge-api 1644+ tests pass; forge-web 2+ spec files pass; `npm run build` clean

**Phase 2 — Skills (measurable via existence + quality)**

- 4 skill files exist under `.claude/skills/`:
  - `forge-async-workflow-skill/SKILL.md`
  - `forge-document-onboarding-workflow-skill/SKILL.md`
  - `forge-workflow-frontend-skill/SKILL.md`
  - `forge-reasoning-capture-skill/SKILL.md`
- Each references the legal-department canonical files by path
- Each follows the existing `.claude/skills/` frontmatter convention (name, description, allowed-tools)
- The real test: an agent reading the skills can identify every file it needs to create, every table to migrate, every endpoint to wire, and every Vue component to build for a hypothetical "marketing async workspace" without needing to read the legal-department code directly

## 3. User Stories / Use Cases

**Legal-department user wanting to cancel a job**

> As a user who uploaded an NDA but realized it was the wrong version, I want to cancel the queued job before it starts processing, so that I don't waste LLM tokens and can upload the correct file.

**Admin reviewing the job queue**

> As an admin, I want to see all jobs across all users in the org, while a regular user should see only their own jobs by default, so the activity feed is relevant to each user's role.

**Ops maintaining the database**

> As a platform operator, I want completed jobs older than 90 days to be automatically cleaned up, so the `legal.agent_jobs` table doesn't grow unbounded.

**Agent building a new workflow**

> As a Claude agent tasked with building an async HITL workflow for a new department (marketing, finance, HR), I want to read a skill that describes the canonical pattern end-to-end — tables, migrations, repository, controller, worker, frontend — so I can scaffold the new workflow in one session without reverse-engineering the legal-department code.

## 4. Technical Requirements

### 4.1 Architecture

**Phase 1** adds to the existing legal-department module:

```
apps/forge/api/src/agents/legal-department/
  jobs/
    legal-jobs.controller.ts     ← +1 new POST endpoint (cancel)
    legal-jobs.repository.ts     ← +2 new methods (cancelJob, deleteOlderThan)
    legal-jobs.types.ts          ← +2 new statuses (cancel_requested, canceled)
    legal-jobs-worker.service.ts ← +cancellation check between nodes
    legal-jobs-cleanup.service.ts ← NEW — periodic retention cleanup

apps/forge/web/src/views/agents/legal-department/
    JobActivityList.vue          ← +mine/all toggle
    JobDetailModal.vue           ← +cancel button
    legalJobsService.ts          ← +cancelJob method, +userId param on listJobs
```

**Phase 2** creates files under `.claude/skills/` — no changes to `apps/`.

### 4.2 Data Model Changes

**Add two job statuses** to `JobStatus` union in `legal-jobs.types.ts`:

```typescript
export type JobStatus =
  | 'queued'
  | 'processing'
  | 'awaiting_review'
  | 'review_rejected'
  | 'completed'
  | 'failed'
  | 'cancel_requested'  // NEW — worker will check for this between nodes
  | 'canceled';          // NEW — terminal state
```

No migration needed — `status` column is `text`, not an enum. The new values just need to be handled in the repository and worker.

**No new tables or columns.** Retention cleanup deletes rows; it doesn't add fields.

### 4.3 API Changes

**New endpoint:**

| Method | Path | Body | Response | Auth |
|---|---|---|---|---|
| POST | `/legal-department/jobs/:id/cancel` | none | `{ success: true, status: 'canceled' \| 'cancel_requested' }` | `@UseGuards(JwtAuthGuard, RbacGuard) @RequirePermission('agents:execute')` |

- `queued` → immediate cancel: set `status='canceled'`, `completed_at=now()`, return `{ success: true, status: 'canceled' }`
- `processing` → deferred cancel: set `status='cancel_requested'`, return `{ success: true, status: 'cancel_requested' }`
- `awaiting_review` → treat like `queued` (immediate cancel — the worker isn't running on this job)
- `review_rejected` → treat like `queued` (same — waiting for re-queue)
- `completed`, `failed`, `canceled` → return 409 Conflict: `{ message: 'Job cannot be canceled in current status' }`
- Org-scoped: repository validates `org_slug` matches the caller's org

**Modified endpoint:**

| Method | Path | Change |
|---|---|---|
| GET | `/legal-department/jobs` | Add optional `userId` query param. When present, filter `WHERE user_id = $userId`. When absent, return all jobs for the org (existing behavior unchanged). |

**Controller validation**: `userId` must be a non-empty string if present; reject with 400 if empty. No authz check on userId — any authenticated user can filter by any userId within their org (the org-slug scoping already constrains visibility).

### 4.4 Frontend Changes

**`JobDetailModal.vue`** — add a cancel button:
- Visible when job status is `queued`, `processing`, `awaiting_review`, or `review_rejected`
- Hidden when `completed`, `failed`, `canceled`, or `cancel_requested`
- On click: call `legalJobsService.cancelJob(jobId)`, show a toast confirmation, refresh the job detail
- Button label: "Cancel Job" with a confirmation prompt ("Are you sure? This cannot be undone.")
- If the response status is `cancel_requested`, show "Cancellation requested — job will stop at the next checkpoint"

**`JobActivityList.vue`** — add a mine/all toggle:
- Two-segment toggle: "Mine" | "All"
- Default: "Mine" (filters by the current user's userId from the JWT/store)
- "All" shows all jobs for the org (existing behavior)
- The toggle state is a `ref` that controls the `userId` param passed to `legalJobsService.listJobs()`
- Persisted in the component's local state (not in the URL or a store — it resets on navigation)

**`legalJobsService.ts`** — add methods:
```typescript
cancelJob(jobId: string): Promise<{ success: boolean; status: string }>
// POST /legal-department/jobs/:id/cancel

listJobs(params?: { orgSlug?: string; status?: string; userId?: string; limit?: number; offset?: number }): Promise<ListJobsResponse>
// existing method — add optional userId param
```

### 4.5 Infrastructure Requirements

**New env var (optional):**
- `LEGAL_JOB_RETENTION_DAYS` — number of days to retain completed jobs. Default: 90. Set to 0 to disable cleanup.

**No new packages, no new services, no container changes.**

## 5. Non-Functional Requirements

**Performance**

- Cancellation of a `queued` job: <50ms (single UPDATE query).
- Cancellation of a `processing` job: the worker checks for `cancel_requested` between LangGraph node transitions. Worst case: the current node finishes before the worker checks (~30s for a long specialist call). Not instant, but bounded.
- Retention cleanup: runs once per hour (or per worker poll cycle). The DELETE query uses an index on `completed_at` + `status`. Expected rows per cleanup: <100 in normal usage. No table locks beyond the row-level locks of the DELETE.
- Activity feed mine/all toggle: adds a WHERE clause to an already-indexed query (`user_id` + `org_slug`). Negligible.

**Security**

- Cancel endpoint is guarded by `@UseGuards(JwtAuthGuard, RbacGuard) @RequirePermission('agents:execute')` — same as all other legal-department endpoints.
- Org-scoped: the repository's `findByIdForOrg` already validates the caller's org against the job's `org_slug`. Cancellation reuses this.
- `userId` filter on `listForOrg` does NOT constitute an authz boundary — any org member can see any org member's job list. The org-slug scoping is the real boundary. If per-user isolation is needed later, it's a separate RBAC concern.

**Skills**

- Skills are passive documentation files. They have no runtime, no dependencies, no security surface, and no performance characteristics. Their quality is measured by the "one-session scaffold" test.

## 6. Out of Scope

- **`AgentWorkspace.vue` extraction** — build skills first; extract the reusable shell after a second workflow validates the pattern
- **Live LangGraph integration test** — requires Ollama + full LangGraph stack in a test fixture
- **Supabase storage volume mount fix** — infrastructure concern, proxy workaround in place
- **Ionic Vue DevTools noise** — cosmetic, suppressors in place
- **Drop `law` schema in production** — prod-ops
- **New legal workflows** (adversarial-brief, persistent-case-team, portfolio-sentinel) — those come AFTER the skills exist
- **`legal-domain-skill`** — legal-specific domain knowledge (contract taxonomy, specialist routing rules). Captured separately if/when legal stabilizes enough. Not part of this effort.
- **Modifying existing legal-department backend behavior** — the cancel/retention/filter features are purely additive. No existing endpoint changes behavior.

## 7. Dependencies & Risks

**Dependencies**

- forge-api's existing `JwtAuthGuard` + `RbacGuard` + `@RequirePermission('agents:execute')` — already wired on the legal-department controller (merged in PR #11).
- The `legal.agent_jobs` table exists with all columns (migrations applied during the migration-drift cleanup).
- `LegalJobsRepository` has 15 public methods; this effort adds 2 more (`cancelJob`, `deleteOlderThan`).
- The worker's `tick()` method uses `this.running` as a single-job lock. Cancellation check inserts between node transitions, not inside the lock.

**Risks**

1. **Worker cancellation race condition.** If `cancel_requested` is set while the worker is mid-node (e.g., inside an LLM call), the cancellation check won't fire until the node completes. The job may produce partial results before canceling. **Mitigation**: document that cancellation is "best-effort at next node boundary" not instant. Don't try to abort in-flight LLM calls — that risks leaving the checkpoint in a broken state.

2. **Retention cleanup deletes jobs the user expected to keep.** **Mitigation**: 90-day default is generous. Only `completed` jobs are deleted; `failed` and `canceled` are kept indefinitely. The env var `LEGAL_JOB_RETENTION_DAYS=0` disables cleanup entirely.

3. **Skills are too vague or too prescriptive.** **Mitigation**: the forge-async-workflow-skills doc specifies a concrete test: "A new async workflow with HITL can be scaffolded in one working session by an agent reading the skills." If the test fails, the skills get revised. Phase 3 of the plan includes a dry-run scaffolding attempt.

4. **Mine/all toggle default logic depends on role detection.** The admin-vs-member distinction requires reading the user's roles from the JWT or store. **Mitigation**: check how `rbacStore` is already used in the legal-department workspace. If role detection is already available, use it. If not, default to "mine" for everyone and add a note that admin-default-all is a follow-up.

## 8. Phasing

### Phase 1 — Job cancellation (backend + frontend)

**Objective**: Add `cancel_requested` and `canceled` statuses, the cancel endpoint, the worker cancellation check, and the cancel button in the modal.

**Scope**:
- Add `cancel_requested` and `canceled` to `JobStatus` union
- Add `cancelJob(id, orgSlug)` to `LegalJobsRepository` — sets status based on current status, returns the new status
- Add `POST /legal-department/jobs/:id/cancel` to `LegalJobsController`
- Add cancellation check in `LegalJobsWorkerService.executeJob()` between node transitions — if status is `cancel_requested`, set `canceled` and return early
- Add `cancelJob(jobId)` to `legalJobsService.ts`
- Add cancel button to `JobDetailModal.vue`
- Add jest spec for the cancel endpoint + worker cancellation path
- Add vitest spec for the cancel button visibility logic

**Gate**: forge-api tests pass; forge-web build clean; curl `POST /jobs/:id/cancel` on a queued job returns 200 with `status: 'canceled'`

### Phase 2 — Job retention + activity feed filter

**Objective**: Add periodic retention cleanup and the mine/all toggle.

**Scope**:
- Add `deleteOlderThan(days, status)` to `LegalJobsRepository`
- Create `LegalJobsCleanupService` (or add to existing worker service) — runs once per hour, deletes completed jobs older than `LEGAL_JOB_RETENTION_DAYS`
- Add `userId` query param to `GET /legal-department/jobs` (controller + repository `listForOrg`)
- Add mine/all toggle to `JobActivityList.vue`
- Update `legalJobsService.ts` `listJobs` to accept `userId` param
- Jest spec for the cleanup service and the userId filter
- Vitest spec for the mine/all toggle

**Gate**: forge-api tests pass; forge-web build clean; curl with `?userId=...` filters correctly; cleanup service runs without error in tests

### Phase 3 — Write the 4 skills

**Objective**: Create the four reusable Claude skills that codify the legal-department pattern.

**Scope**:
- Create `.claude/skills/forge-async-workflow-skill/SKILL.md`
- Create `.claude/skills/forge-document-onboarding-workflow-skill/SKILL.md`
- Create `.claude/skills/forge-workflow-frontend-skill/SKILL.md`
- Create `.claude/skills/forge-reasoning-capture-skill/SKILL.md`
- Each skill follows the existing frontmatter convention:
  ```yaml
  ---
  name: <skill-name>
  description: <one-line description>
  allowed-tools: Read, Write, Edit, Bash, Grep, Glob
  ---
  ```
- Each skill references canonical files in `apps/forge/api/src/agents/legal-department/` and `apps/forge/web/src/views/agents/legal-department/` by path
- Each skill covers the Phase 1 additions (cancel, retention, mine/all) so the documented pattern is complete

**Gate**: all 4 files exist; each is >100 lines of real content; a dry-run test verifies the skill describes enough to scaffold a new workflow (read each skill and check: does it tell me every table, every endpoint, every Vue component, every composable I need?)

### Phase 4 — Completion report + PR

**Objective**: Commit, push, open PR, update roadmap.

**Scope**:
- Write `docs/efforts/current/completion-report.md`
- Update `docs/efforts/roadmap.md`: move this effort to completed, promote next effort (new legal workflows are now unblocked)
- Final repo-wide `npm run build` + `npm run test` for touched products
- Commit, push, PR via `gh pr create`

**Gate**: PR opened; all gates green; roadmap updated; completion report written

---

**End of PRD.** Phase 1 and 2 are code changes; Phase 3 is pure documentation; Phase 4 is process. After this effort, the path to new legal workflows (adversarial-brief, persistent-case-team, portfolio-sentinel) is open.

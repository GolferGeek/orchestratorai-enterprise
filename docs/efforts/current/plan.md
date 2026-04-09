# Forge Async Workflow Skills — Implementation Plan

**PRD**: ./prd.md
**Intention**: ./intention.md
**Created**: 2026-04-09
**Status**: Not Started

## Progress Tracker
<!-- run-plan uses this section to track where we are -->
- [x] Phase 1: Job cancellation (backend + frontend)
- [x] Phase 2: Job retention + activity feed filter
- [x] Phase 3: Write the 4 skills
- [ ] Phase 4: Completion report + PR

---

## Shared conventions

- **Working dir**: `/Users/golfergeek/projects/orchAI/orchestratorai-enterprise-dev`
- **Branch**: `effort/forge-async-workflow-skills`
- **Forge API build**: `cd apps/forge/api && npm run build`
- **Forge API test**: `cd apps/forge/api && npm run test`
- **Forge Web build**: `cd apps/forge/web && npm run build`
- **Forge Web test**: `cd apps/forge/web && npm run test`
- **Full repo build**: `npm run build`
- **Forge API URL (dev)**: `http://localhost:5200`
- **Auth API URL (dev)**: `http://localhost:5100`
- **Demo user**: `demo-user@orchestratorai.io` / `DEMOUSER123!`

### Key source files (read before editing)
- **Types**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.types.ts`
- **Repository**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.repository.ts`
- **Controller**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.controller.ts`
- **Worker**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs-worker.service.ts`
- **Controller spec**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.controller.spec.ts`
- **Vue activity list**: `apps/forge/web/src/views/agents/legal-department/JobActivityList.vue`
- **Vue job detail**: `apps/forge/web/src/views/agents/legal-department/JobDetailModal.vue`
- **Vue service**: `apps/forge/web/src/views/agents/legal-department/legalJobsService.ts`
- **Existing skills dir**: `.claude/skills/`

---

## Phase 1: Job cancellation (backend + frontend)
**Status**: Not Started
**Objective**: Add `cancel_requested` and `canceled` job statuses, a `POST /jobs/:id/cancel` endpoint, worker-side cancellation check between node transitions, and a cancel button in the job detail modal.

### Steps
- [ ] 1.1 Read `legal-jobs.types.ts`. Add `'cancel_requested'` and `'canceled'` to the `JobStatus` union type. Update `VALID_STATUSES` in the controller if it exists as a const array.
- [ ] 1.2 Read `legal-jobs.repository.ts`. Add `cancelJob(id: string, orgSlug: string): Promise<'canceled' | 'cancel_requested'>` method:
  - Fetch the job via `findByIdForOrg(id, orgSlug)` — throw `NotFoundException` if missing
  - If status is `queued`, `awaiting_review`, or `review_rejected`: UPDATE to `status='canceled'`, `completed_at=now()`, return `'canceled'`
  - If status is `processing`: UPDATE to `status='cancel_requested'`, return `'cancel_requested'`
  - If status is `completed`, `failed`, `canceled`, `cancel_requested`: throw `ConflictException('Job cannot be canceled in current status')`
- [ ] 1.3 Read `legal-jobs.controller.ts`. Add the cancel endpoint:
  ```ts
  @Post('jobs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelJob(@Param('id') id: string, @Body() body: { context?: { orgSlug?: string } }): Promise<{ success: true; status: string }>
  ```
  Extract orgSlug from body.context or default (match how other endpoints in this controller extract orgSlug). Call `this.repository.cancelJob(id, orgSlug)`. Return `{ success: true, status: result }`.
- [ ] 1.4 Read `legal-jobs-worker.service.ts`. Find the `executeJob()` method (or `tick()` method). Identify where LangGraph node transitions happen. Add a cancellation check:
  - Before or after the main workflow execution call, re-fetch the job status from the repository
  - If status is `cancel_requested`: set `status='canceled'`, `completed_at=now()`, log a cancellation message, and return early (skip remaining nodes)
  - If the worker uses LangGraph's `invoke()` or `stream()`, the check must happen OUTSIDE the invoke call (between calls, not inside LangGraph)
  - Document in a code comment: "Cancellation is best-effort at next node boundary — in-flight LLM calls complete before this check fires"
- [ ] 1.5 Add jest spec for the cancel endpoint in `legal-jobs.controller.spec.ts`:
  - Queued job → 200, status='canceled'
  - Processing job → 200, status='cancel_requested'
  - Completed job → 409
  - Unknown job → 404
  - Wrong org → 404 (org-scoped)
- [ ] 1.6 Read `legalJobsService.ts` in forge-web. Add:
  ```ts
  cancelJob(jobId: string): Promise<{ success: boolean; status: string }>
  ```
  POST to `/legal-department/jobs/${jobId}/cancel` with the standard auth header.
- [ ] 1.7 Read `JobDetailModal.vue`. Add a cancel button:
  - Visible when `job.status` is `queued`, `processing`, `awaiting_review`, or `review_rejected`
  - Hidden when `completed`, `failed`, `canceled`, `cancel_requested`
  - On click: confirmation dialog ("Cancel this job? This cannot be undone."), then call `legalJobsService.cancelJob(jobId)`
  - On success: show toast with the returned status, refresh job detail
  - If status returned is `cancel_requested`: show "Cancellation requested — job will stop at the next checkpoint"

### Quality Gate
- [ ] **Lint**: `cd apps/forge/api && npm run lint` — no new errors on touched files
- [ ] **Build**: `cd apps/forge/api && npm run build` — clean; `cd apps/forge/web && npm run build` — clean
- [ ] **Unit Tests**:
  - [ ] `cd apps/forge/api && npm run test` — all tests pass including 4+ new cancel specs
  - [ ] `cd apps/forge/web && npm run test` — all tests pass
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests** (requires running forge-api on port 5200 + auth-api on port 5100):
  - [ ] Create a test job: `TOKEN=$(curl -sS -X POST http://localhost:5100/auth/login -H "Content-Type: application/json" -d '{"email":"demo-user@orchestratorai.io","password":"DEMOUSER123!"}' | jq -r .accessToken)`
  - [ ] Cancel a queued job (if one exists — create via POST /legal-department/jobs first): `curl -sS -w "\n%{http_code}\n" -X POST http://localhost:5200/legal-department/jobs/<id>/cancel -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"context":{"orgSlug":"*"}}'` → 200, `status: 'canceled'`
  - [ ] Cancel an already-canceled job: same curl → 409
- [ ] **Chrome Tests**: N/A (cancel button is a UI element; functional test via curl is sufficient for Phase 1)
- [ ] **Phase Review**:
  - [ ] `cancel_requested` and `canceled` added to `JobStatus` union
  - [ ] `cancelJob` method exists in repository
  - [ ] `POST /jobs/:id/cancel` endpoint exists in controller with guards
  - [ ] Worker has cancellation check between node transitions
  - [ ] Cancel button exists in `JobDetailModal.vue`
  - [ ] `cancelJob` method exists in `legalJobsService.ts`

---

## Phase 2: Job retention + activity feed filter
**Status**: Not Started
**Objective**: Add periodic cleanup of old completed jobs and a userId filter on the jobs list endpoint with a mine/all toggle in the activity feed.

### Steps
- [ ] 2.1 Read `legal-jobs.repository.ts`. Add `deleteOlderThan(days: number, status: JobStatus): Promise<number>`:
  - `DELETE FROM legal.agent_jobs WHERE status = $status AND completed_at < NOW() - INTERVAL '$days days'`
  - Return the count of deleted rows
  - Use the repository's existing `this.db` pattern (rawQuery or builder — match what the repo already does)
- [ ] 2.2 Create `apps/forge/api/src/agents/legal-department/jobs/legal-jobs-cleanup.service.ts`:
  - `@Injectable()` service, injected with `LegalJobsRepository` and `ConfigService`
  - `onModuleInit()`: start a `setInterval` at 1 hour (3600000ms)
  - The interval calls `this.cleanup()` which reads `LEGAL_JOB_RETENTION_DAYS` from env (default 90, 0 = disabled), then calls `repository.deleteOlderThan(days, 'completed')`. Logs the count.
  - `onModuleDestroy()`: clear the interval
  - No cleanup of `failed` or `canceled` jobs (per PRD: kept indefinitely for postmortems)
- [ ] 2.3 Register `LegalJobsCleanupService` in the legal-department's NestJS module (wherever `LegalJobsWorkerService` is registered — same module).
- [ ] 2.4 Read `legal-jobs.repository.ts` `listForOrg` method. Add optional `userId?: string` parameter:
  - When present: add `AND user_id = $userId` to the WHERE clause
  - When absent: existing behavior unchanged
- [ ] 2.5 Read `legal-jobs.controller.ts` `GET /legal-department/jobs` handler. Add `@Query('userId') userId?: string` parameter. Pass it to `repository.listForOrg(orgSlug, { ...options, userId })`.
- [ ] 2.6 Read `legalJobsService.ts`. Update `listJobs` to accept and forward `userId` param.
- [ ] 2.7 Read `JobActivityList.vue`. Add a mine/all toggle:
  - Two-segment control (IonSegment or similar): "Mine" | "All"
  - Default: "Mine" (read userId from the auth store or JWT — check how `rbacStore` or `useAuth` works in the existing code)
  - "All" omits the userId param
  - The toggle is a local `ref<'mine' | 'all'>`, not persisted
  - When toggled, re-fetch the job list with the appropriate param
- [ ] 2.8 Add jest spec for `deleteOlderThan` (mock the db, verify the query shape) and for the `userId` filter on `listForOrg`.
- [ ] 2.9 Add jest spec for the cleanup service: mock repository + ConfigService, verify it calls `deleteOlderThan` with the right args.

### Quality Gate
- [ ] **Lint**: `cd apps/forge/api && npm run lint` — no new errors
- [ ] **Build**: `cd apps/forge/api && npm run build` — clean; `cd apps/forge/web && npm run build` — clean
- [ ] **Unit Tests**:
  - [ ] `cd apps/forge/api && npm run test` — all tests pass including cleanup + userId filter specs
  - [ ] `cd apps/forge/web && npm run test` — all tests pass
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**:
  - [ ] `curl -sS -H "Authorization: Bearer $TOKEN" "http://localhost:5200/legal-department/jobs?orgSlug=*"` → returns all jobs
  - [ ] `curl -sS -H "Authorization: Bearer $TOKEN" "http://localhost:5200/legal-department/jobs?orgSlug=*&userId=13069c48-e606-4915-8c21-9c7c82e46977"` → returns only demo-user's jobs (subset or equal)
  - [ ] `curl -sS -H "Authorization: Bearer $TOKEN" "http://localhost:5200/legal-department/jobs?orgSlug=*&userId=nonexistent-user"` → returns empty list (not an error)
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] `deleteOlderThan` method exists in repository
  - [ ] `LegalJobsCleanupService` exists and is registered in the module
  - [ ] `userId` filter works on `GET /jobs`
  - [ ] Mine/all toggle exists in `JobActivityList.vue`

---

## Phase 3: Write the 4 skills
**Status**: Not Started
**Objective**: Create four reusable Claude skills under `.claude/skills/` that codify the legal-department's async HITL workflow pattern, including the Phase 1+2 additions.

### Steps
- [ ] 3.1 Read one existing skill for structure reference: `.claude/skills/langgraph-development-skill/SKILL.md` (first 50 lines). Note the frontmatter format, heading structure, and level of detail.
- [ ] 3.2 Read the canonical legal-department implementation files to enumerate what the skills should reference:
  - `legal-jobs.types.ts` — all type definitions
  - `legal-jobs.repository.ts` — all 17 methods (15 original + 2 from Phase 1-2)
  - `legal-jobs.controller.ts` — all endpoints
  - `legal-jobs-worker.service.ts` — worker loop + cancellation
  - `legal-jobs-cleanup.service.ts` — retention
  - `legal-department.state.ts` — LangGraph state shape
  - `legal-department.service.ts` — graph definition
  - Vue components in `apps/forge/web/src/views/agents/legal-department/`
  - `useJobEventStream.ts` composable
  - `legalJobsService.ts`
- [ ] 3.3 Create `.claude/skills/forge-async-workflow-skill/SKILL.md`:
  - Frontmatter: name, description ("Canonical pattern for building an async LangGraph workflow with HITL in Forge"), allowed-tools
  - Covers: table shape, migration pattern, repository methods (all 17, with SQL patterns for atomic claim, cancellation, retention), controller endpoints (all 11), worker structure (polling, claim, HITL interrupt, cancellation check, error handling), ExecutionContext passthrough, LangGraph interrupt/resume, observability events, checkpoint persistence
  - References canonical files by path
  - >100 lines of real content
- [ ] 3.4 Create `.claude/skills/forge-document-onboarding-workflow-skill/SKILL.md`:
  - Covers: multipart upload (`FilesInterceptor`), `DocumentExtractionRouter`, per-file storage via `MEDIA_STORAGE_PROVIDER`, `document_paths TEXT[]`, parallel metadata extraction, multi-document fan-out, cross-document synthesis
  - References Phase 3 implementation in legal-department
  - >80 lines
- [ ] 3.5 Create `.claude/skills/forge-workflow-frontend-skill/SKILL.md`:
  - Covers: workspace layout, activity list with mine/all toggle, multi-file upload modal, stage ladder composable, SSE subscription via `useJobEventStream`, HITL review modal, reasoning accordion, cancel button UX, `legalJobsService.ts` pattern
  - References canonical Vue files by path
  - >100 lines
- [ ] 3.6 Create `.claude/skills/forge-reasoning-capture-skill/SKILL.md`:
  - Covers: `callLLMMaybeWithReasoning` helper, stage ladder rendering of reasoning/writing states, review modal reasoning accordion, read endpoint for fetching reasoning from `llm_usage`
  - Smaller scope — >60 lines
- [ ] 3.7 **Dry-run verification**: for each skill, read it and mentally check: "If I were an agent tasked with building a 'Marketing Async Workspace' — does this skill tell me every table, migration, repository method, controller endpoint, worker service, Vue component, composable, and service method I need?" If any critical piece is missing, add it. If a section is too vague ("do something like legal-department"), make it concrete.
- [ ] 3.8 Verify all 4 skills have correct frontmatter, are >minimum line count, and reference real file paths that exist in the codebase.

### Quality Gate
- [ ] **Lint**: N/A (skills are markdown, not code)
- [ ] **Build**: N/A
- [ ] **Unit Tests**: N/A
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**: N/A
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] 4 skill files exist under `.claude/skills/`
  - [ ] Each has correct YAML frontmatter (name, description, allowed-tools)
  - [ ] `forge-async-workflow-skill` ≥100 lines
  - [ ] `forge-document-onboarding-workflow-skill` ≥80 lines
  - [ ] `forge-workflow-frontend-skill` ≥100 lines
  - [ ] `forge-reasoning-capture-skill` ≥60 lines
  - [ ] Each references canonical files by real paths (spot-check 3 paths per skill)
  - [ ] Dry-run check passes (step 3.7)
  - [ ] Skills cover Phase 1+2 additions (cancel, retention, mine/all)

---

## Phase 4: Completion report + PR
**Status**: Not Started
**Objective**: Write completion report, update roadmap, commit, push, open PR.

### Steps
- [ ] 4.1 Write `docs/efforts/current/completion-report.md`:
  - Summary (what shipped: 3 backend features + 4 skills)
  - Phase results table
  - Any deviations from PRD
  - Follow-ups: AgentWorkspace.vue extraction, live LangGraph integration test, new legal workflows now unblocked
- [ ] 4.2 Update `docs/efforts/roadmap.md`:
  - Move "Forge Async Workflow Skills" to Completed
  - Move "Legal Async Workspace Follow-ups" to Completed (items 4/5/6 done here, items 1/2 already done, rest explicitly out of scope)
  - Update Current → next effort (new legal workflows are now unblocked)
  - Update dependency graph
- [ ] 4.3 Run full-repo gates:
  - [ ] `npm run build` — clean
  - [ ] `cd apps/forge/api && npm run test` — all pass
  - [ ] `cd apps/forge/web && npm run test` — all pass
- [ ] 4.4 Commit all changes with a clear summary message
- [ ] 4.5 `git push -u origin effort/forge-async-workflow-skills`
- [ ] 4.6 Open PR via `gh pr create`

### Quality Gate
- [ ] **Lint**: `npm run lint` — no new issues on touched files
- [ ] **Build**: `npm run build` — clean
- [ ] **Unit Tests**: forge-api + forge-web tests all pass
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**: N/A (covered in Phase 1-2)
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] Completion report written
  - [ ] Roadmap updated
  - [ ] PR opened and ready for `/pr-eval`

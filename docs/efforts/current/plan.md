# Legal Department Async Workspace — Implementation Plan

**PRD**: ./prd.md
**Created**: 2026-04-06
**Status**: Not Started

## Progress Tracker
<!-- run-plan uses this section to track where we are -->
- [ ] Phase 1: Schema, repository, enqueue + read endpoints
- [ ] Phase 2: Worker, concurrency, graph integration, events endpoint
- [ ] Phase 3: Bench harness rewrite + model bench validation
- [ ] Phase 4: Workspace UI
- [ ] Phase 5: Cleanup, docs, hardening follow-ups

---

## Phase 1: Schema, repository, enqueue + read endpoints
**Status**: Not Started
**Objective**: Stand up `legal.agent_jobs`, repository, and the three non-events HTTP routes so jobs can be enqueued and listed (worker not yet wired).

### Steps
- [x] 1.1 Two forward-only migrations: `20260406100001_drop_dead_law_schema.sql` (drops the unused `law` schema with 0 TS callers) and `20260406100002_create_legal_agent_jobs.sql` (creates `legal` schema + `legal.agent_jobs` with the three indexes). Root `supabase/config.toml` updated to expose `legal` and stop exposing `law`.
- [x] 1.2 Both migrations applied to live Postgres on 54322; `\dn legal` confirms schema, `\dt legal.*` confirms `legal.agent_jobs`, smoke insert/delete round-trip succeeded.
- [x] 1.3 Created `legal-jobs.types.ts` (AgentJobRow, JobStatus, EnqueueJobRequest/Response, ListJobsResponse).
- [x] 1.4 Created `legal-jobs.repository.ts` injected with `DATABASE_SERVICE`. Methods implemented: `insertQueued`, `findByIdForOrg`, `listForOrg`, `claimNextQueued` (raw SQL with `FOR UPDATE SKIP LOCKED` for atomic claim), `updateProgress`, `markCompleted`, `markFailed`. All reads filter by `org_slug`.
- [ ] 1.5 Repository unit tests: org isolation, `claimNextQueued` returns null when empty, ordering by `queued_at desc` for `listForOrg`.
- [x] 1.6 Created `legal-jobs.controller.ts` with `POST /legal-department/jobs`, `GET /legal-department/jobs`, `GET /legal-department/jobs/:id`. No JWT guard — context comes from body; server generates `conversationId` via `crypto.randomUUID()`. Validates `context.orgSlug/userId/provider/model` and `data.content`.
- [x] 1.7 Wired `LegalJobsController` + `LegalJobsRepository` into the existing `LegalDepartmentModule` (no new module needed since `DatabaseModule` is global at app level).
- [ ] 1.8 Controller unit tests: 400 on missing/invalid `context` in body, 202 with `{jobId, conversationId}` on success, 404 on cross-org read (caller passes a different `orgSlug` than the row's).

### Quality Gate
Before moving to Phase 2, ALL of the following must pass:

- [ ] **Lint**: `npm run lint` clean for `apps/forge/api`.
- [ ] **Build**: `npm run build` clean for `apps/forge/api`.
- [ ] **Unit Tests**: `cd apps/forge/api && npm test` — all new + existing unit tests pass.
- [ ] **E2E Tests**: `npm run test:integration:forge` passes (no new flows added yet, must not regress).
- [ ] **Curl Tests** (Forge API on `localhost:6200`; `ExecutionContext` passed in body, no JWT):
  - [ ] `curl -sS -X POST localhost:6200/legal-department/jobs -H "content-type: application/json" -d '{"context":{...},"data":{"content":"hello","contentType":"text/plain"}}'` → `202 {jobId, conversationId, status:"queued"}`.
  - [ ] `curl -sS localhost:6200/legal-department/jobs` → `200 {jobs:[…]}` containing the row above.
  - [ ] `curl -sS localhost:6200/legal-department/jobs/<id>` → `200` with the row.
  - [ ] Same `:id` request with a token from a different org → `404`.
  - [ ] Direct DB check (`psql $DATABASE_URL -c "select id,status from legal.agent_jobs"`) shows the row in `queued`.
- [ ] **Chrome Tests**: N/A this phase.
- [ ] **Phase Review**: Compare against PRD §4.2, §4.3, Phase 1 description.
  - [ ] `legal.agent_jobs` schema matches PRD §4.2 exactly.
  - [ ] All four endpoints exist except `/jobs/:id/events` (Phase 2).
  - [ ] Every read filters by `org_slug`.
  - [ ] No direct supabase imports — only `DATABASE_SERVICE`.

---

## Phase 2: Worker, concurrency, graph integration, events endpoint
**Status**: Not Started
**Objective**: Run queued jobs against the existing LangGraph workflow with per-provider concurrency, persist results, and serve durable event history.

### Steps
- [ ] 2.1 Create `apps/forge/api/src/agents/legal-department/jobs/provider-concurrency.ts`: a small in-process semaphore registry keyed by provider, configured from `OLLAMA_MAX_CONCURRENT` (default 1), `ANTHROPIC_MAX_CONCURRENT` (default 10), `OPENAI_MAX_CONCURRENT` (default 10).
- [ ] 2.2 Create `apps/forge/api/src/agents/legal-department/jobs/legal-jobs-worker.service.ts`. `onModuleInit` starts a `setInterval(tick, 1000)`; on `onModuleDestroy` clears it. `tick()` calls `repository.claimNextQueued()`, acquires the per-provider semaphore, runs `executeJob`. `executeJob` builds an `ExecutionContext` (passed whole, never destructured) where `conversationId = row.conversation_id`, then invokes the existing `legal-department.graph.ts` via the existing service. On node transitions (subscribe to observability events for that conversationId, or use the existing graph hooks) update `current_step`. On success: write `result` jsonb + `status='completed'`. On exception: write real error + `status='failed'` (no swallowing).
- [ ] 2.3 Create `apps/forge/api/src/agents/legal-department/config/legal-model-config.ts` exporting `resolveModelForNode(ctx, nodeName)` that consults an env-driven map first and falls back to `ctx.model`. Refactor existing nodes (orchestrator + 8 specialists + synthesis + report) to call this helper instead of any hardcoded model name. Where a node already uses `ctx.model`, just route through the helper.
- [ ] 2.4 Add `GET /legal-department/jobs/:id/events` to `LegalJobsController`. Implementation reads `public.observability_events` via `DATABASE_SERVICE`, filtered by `conversation_id = job.conversation_id`, ordered by timestamp asc. Org scoping: load the job first via `findByIdForOrg`; 404 if not in caller's org.
- [ ] 2.5 Worker unit tests: semaphore enforces `OLLAMA_MAX_CONCURRENT=1` (two concurrent `executeJob` calls serialize); happy path moves a row from queued → processing → completed; thrown exception writes real error to `error` and status `failed`.
- [ ] 2.6 Integration test: enqueue a trivial job (content = "hello"), let the worker run it against a stub LangGraph entry, confirm the row reaches `completed` and the events endpoint returns at least one persisted event.

### Quality Gate
Before moving to Phase 3, ALL of the following must pass:

- [ ] **Lint**: `npm run lint` clean.
- [ ] **Build**: `npm run build` clean.
- [ ] **Unit Tests**: `cd apps/forge/api && npm test` passes.
- [ ] **E2E Tests**: `npm run test:integration:forge` passes.
- [ ] **Curl Tests**:
  - [ ] POST a job with a tiny document → poll `GET /legal-department/jobs/:id` until `status=='completed'`.
  - [ ] `GET /legal-department/jobs/:id/events` returns a non-empty `events` array ordered by timestamp.
  - [ ] `GET /observability/stream?conversationId=<jobConvId>` (existing endpoint) yields the buffered events for the same conversationId.
  - [ ] Enqueue two Ollama jobs back-to-back; poll `legal.agent_jobs` and confirm only one is `processing` at a time.
- [ ] **Chrome Tests**: N/A this phase.
- [ ] **Phase Review**: Compare against PRD §4.1, §4.5, §5, Phase 2 description.
  - [ ] Worker uses semaphores and respects env vars.
  - [ ] ExecutionContext is passed whole through the worker into the graph.
  - [ ] No node has a hardcoded model name — all go through `resolveModelForNode`.
  - [ ] No new SSE endpoints, no new event bus.
  - [ ] All persistence via `DATABASE_SERVICE`; no direct supabase imports.
  - [ ] Failures surface real errors, not swallowed.

---

## Phase 3: Bench harness rewrite + model bench validation
**Status**: Not Started
**Objective**: Drive the async path via curl end-to-end and validate `gemma4:e4b` as default across representative documents.

### Steps
- [ ] 3.1 Rewrite `docs/efforts/current/bench/run.sh`. Args: `<model> [document-path]`. Behavior: POST `/legal-department/jobs` with the document, capture `{jobId, conversationId}`, attach to `/observability/stream?conversationId=<id>` via `curl -N`, tail until a `completed` or `failed` event arrives, then GET `/legal-department/jobs/:id` and print the final `result`. Exit 0 on completed, non-zero on failed.
- [ ] 3.2 Add a small `docs/efforts/current/bench/docs/` set: short NDA, medium MSA, long contract (use existing test fixtures if available; otherwise stub from public templates).
- [ ] 3.3 Run `./run.sh gemma4:e4b <each doc>`. Record per-node timing from the events stream. For any node that overflows e4b context, configure a `gemma4:26b` override via `legal-model-config.ts` env var.
- [ ] 3.4 If 26b override is needed and the daemon doesn't expose it, fix the Ollama.app version mismatch (upgrade Ollama.app, restart daemon, re-verify `/api/tags`). If e4b handles every doc, skip this step and document deferral.
- [ ] 3.5 Record bench results in `docs/efforts/current/bench/RESULTS.md` (start state, per-node models in effect, wallclock).

### Quality Gate
Before moving to Phase 4, ALL of the following must pass:

- [ ] **Lint**: `npm run lint` clean (no source changes expected, but verify).
- [ ] **Build**: `npm run build` clean.
- [ ] **Unit Tests**: `cd apps/forge/api && npm test` passes.
- [ ] **E2E Tests**: `npm run test:integration:forge` passes.
- [ ] **Curl Tests**:
  - [ ] `./docs/efforts/current/bench/run.sh gemma4:e4b ./docs/efforts/current/bench/docs/short-nda.txt` exits 0 and prints a non-empty final report.
  - [ ] Same for medium MSA. (Long contract: success required only if e4b context permits; otherwise must succeed after configuring 26b override and exit 0.)
- [ ] **Chrome Tests**: N/A this phase.
- [ ] **Phase Review**: Compare against PRD §2 success criteria, §4.5 model config, intention "Target models" section.
  - [ ] Bench drives the async path only — no synchronous `/invoke/stream`.
  - [ ] Per-node model selection is config-driven, not code-edited.
  - [ ] Results recorded.

---

## Phase 4: Workspace UI
**Status**: Not Started
**Objective**: Replace `LegalDepartmentConversation.vue` as the entry surface with a workspace whose home is the activity feed and whose detail panel merges historical + live events.

### Steps
- [ ] 4.1 Create `apps/forge/web/src/views/agents/legal-department/legalJobsService.ts` — typed client for the four endpoints (axios or existing fetch wrapper, matching pattern in `legalDepartmentService.ts`).
- [ ] 4.2 Create `LegalDepartmentWorkspace.vue` with three-pane layout: left `CapabilitySidebar`, center `ActivityFeed`, right `JobDetailPanel` (collapsible/inline).
- [ ] 4.3 Create `components/CapabilitySidebar.vue` — buttons for "Onboard a Document" (enabled, opens modal) and "Brief Stress-Test", "Persistent Case Team", "Portfolio Sentinel", "Department Knowledge" (rendered disabled with "coming soon").
- [ ] 4.4 Create `components/ActivityFeed.vue` — table with columns: type icon, title, status badge, current step, model, started, duration. Polls `GET /legal-department/jobs` every 5s; updates current row from live SSE when a detail panel is open.
- [ ] 4.5 Create `components/OnboardDocumentModal.vue` — file picker + provider/model select; on submit calls `POST /legal-department/jobs` and closes; new row appears in feed via the next poll.
- [ ] 4.6 Create `components/JobDetailPanel.vue` — on open: `GET /legal-department/jobs/:id` and `GET /legal-department/jobs/:id/events` (history); then `new EventSource('/observability/stream?conversationId=…')` for live tail. Merge events by id (dedupe), sort by timestamp, render. On `status='completed'`, render the existing report markdown component (lifted/imported from `LegalDepartmentConversation.vue`'s report renderer — do not duplicate).
- [ ] 4.7 Update Forge web router so the legal-department agent route resolves to `LegalDepartmentWorkspace.vue`. Keep `LegalDepartmentConversation.vue` reachable at a `/legacy` sub-route.
- [ ] 4.8 Component tests (Vitest) for `ActivityFeed` (renders rows from a mocked service), `JobDetailPanel` (merge + dedupe logic), and `OnboardDocumentModal` (submit flow).

### Quality Gate
Before moving to Phase 5, ALL of the following must pass:

- [ ] **Lint**: `npm run lint` clean.
- [ ] **Build**: `npm run build` clean (forge web + api).
- [ ] **Unit Tests**: `cd apps/forge/web && npm test` and `cd apps/forge/api && npm test` pass.
- [ ] **E2E Tests**: `npm run test:integration:forge` passes.
- [ ] **Curl Tests**: re-run Phase 2 curls; nothing should have regressed.
- [ ] **Chrome Tests** (forge web on `localhost:6201`):
  - [ ] Navigate to the legal-department agent route → `LegalDepartmentWorkspace.vue` renders with empty activity feed.
  - [ ] Click "Onboard a Document", select a small file, submit → modal closes, new job appears in the feed within 5s as `queued`, transitions to `processing`, then `completed`.
  - [ ] Click the row → detail panel opens, shows full event history, then live events stream in.
  - [ ] Reload the page → the completed job is still in the feed; opening it replays the full event history from the database.
  - [ ] Open the same job in a second browser session signed in as a second user in the same org → same row visible, same event history.
  - [ ] Visit the `/legacy` route → old `LegalDepartmentConversation.vue` still renders.
- [ ] **Phase Review**: Compare against PRD §4.4, §2 success criteria.
  - [ ] Workspace replaces conversation as the front door.
  - [ ] Sidebar slot exists for all future capabilities.
  - [ ] Live + historical merge works with dedupe.
  - [ ] No duplication of the report renderer.

---

## Phase 5: Cleanup, docs, hardening follow-ups
**Status**: Not Started
**Objective**: Document configuration, capture follow-ups, and ensure the repo is shippable.

### Steps
- [ ] 5.1 Document `OLLAMA_MAX_CONCURRENT` / `ANTHROPIC_MAX_CONCURRENT` / `OPENAI_MAX_CONCURRENT` and the per-node model override map in `apps/forge/api/README.md`.
- [ ] 5.2 Document the four new HTTP endpoints in the same README with example curls.
- [ ] 5.3 File follow-up effort stubs in `docs/efforts/future/` (or update existing): `/observability/stream` auth scoping (`admin:audit`), job retention/cleanup, job cancellation, `AgentWorkspace.vue` extraction, per-specialist chunking (already exists in `legal-department-upgrades.md` — just cross-reference).
- [ ] 5.4 Final lint + build + test sweep across the repo.

### Quality Gate
Before declaring done, ALL of the following must pass:

- [ ] **Lint**: `npm run lint` clean across the repo.
- [ ] **Build**: `npm run build` clean across the repo.
- [ ] **Unit Tests**: `npm test` passes across the repo.
- [ ] **E2E Tests**: `npm run test:integration:forge` passes.
- [ ] **Curl Tests**: full Phase 2 + Phase 3 curl set passes one more time.
- [ ] **Chrome Tests**: full Phase 4 chrome scenarios pass one more time.
- [ ] **Phase Review**: Compare against PRD §2 (success criteria) and §6 (out of scope).
  - [ ] All success criteria from §2 demonstrably met end-to-end against `gemma4:e4b`.
  - [ ] No out-of-scope work crept in.
  - [ ] All follow-ups captured in `docs/efforts/future/`.
  - [ ] Existing `/invoke/stream` and `LegalDepartmentConversation.vue` (at `/legacy`) still work.

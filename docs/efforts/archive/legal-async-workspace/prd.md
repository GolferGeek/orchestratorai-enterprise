# Legal Department Async Workspace on Local Models — PRD

## 1. Overview

Convert the Legal Department from a synchronous SSE-held chat experience into a **departmental workspace** backed by a **durable async job queue**, executed by an in-process worker inside the Forge API. The first (and only in-scope) capability is **Document Onboarding** — the existing 8-specialist LangGraph workflow run as an async job. The architecture must run end-to-end against local Ollama (`gemma4:e4b`) on a single Mac Studio with no per-call timeout pressure, while remaining identical in shape against cloud LLMs.

The workspace replaces `LegalDepartmentConversation.vue` as the entry surface. It is structured (sidebar capabilities, activity-feed home, job-detail panel) so the other Legal Department capabilities (Brief Stress-Test, Persistent Case Team, Portfolio Sentinel, Department Knowledge) documented in `docs/efforts/future/` can be added later as drop-in `job_type`s without re-plumbing UI or queue.

The unlock costs almost no new infrastructure: every observability event already flows through the observability plane's ReplaySubject and `public.observability_events` table, keyed on `conversationId`. By treating `conversationId` as the **job identity**, live and historical job views become the same view.

## 2. Goals & Success Criteria

### Goals
1. Run the existing Legal Department LangGraph workflow as a durable async job, not a synchronous HTTP request.
2. Eliminate the 300s per-LLM-call timeout pressure on local Ollama models.
3. Replace the chat-pane entry surface with a workspace whose home is an org-scoped activity feed.
4. Enforce per-provider concurrency at the worker level (Ollama default = 1, Anthropic default = 10).
5. Make any job — running or completed days ago — open to the same live+historical event panel.
6. Update the bench harness to drive the new async path end-to-end via curl, with no UI dependency.
7. Validate the "`gemma4:e4b` for everything" default empirically against representative documents.

### Success Criteria (binary)
- A user POSTs a multi-specialist document (e.g. an MSA) to `POST /legal-department/jobs`. The response is immediate and contains `{ jobId, conversationId }`.
- The job appears in the activity feed of `LegalDepartmentWorkspace.vue` as `queued`, transitions to `processing` with a live `current_step`, and completes with status `completed` and a non-empty rendered report.
- A second user in the same org refreshes and sees the same job in their feed; opening the detail panel replays every observability event from the database in chronological order.
- The same flow runs end-to-end against `gemma4:e4b` on the local Ollama daemon. No cloud LLM in the loop. No held HTTP connection. No SSE timeout.
- `bench/run.sh <model>` posts a job, attaches to `/observability/stream?conversationId=…`, tails until `completed|failed`, and prints the final result.
- Concurrency: with two queued Ollama jobs, the worker runs them strictly sequentially. With two queued Anthropic jobs, both run in parallel.
- The existing `/invoke/stream` endpoint and `LegalDepartmentConversation.vue` keep functioning unchanged throughout the build.

## 3. User Stories / Use Cases

- **Solo attorney, evening drop:** drops 12 contracts into the workspace at 10 PM, walks away, returns at 7 AM and finds 12 completed reports in the activity feed, each openable to its full event history.
- **Reviewer joins mid-run:** opens a job that is currently in step 5 of 8; sees every event from step 1 backfilled from the database, then live events flow in on top.
- **Auditor inspects cold job:** opens a job completed three days ago and sees the full timeline replayed identically to a live one.
- **Bench operator validates a model:** runs `./bench/run.sh gemma4:e4b` against a test document with no UI; sees structured pass/fail.

## 4. Technical Requirements

### 4.1 Architecture

**Components added:**
- New `legal` Postgres schema containing `legal.agent_jobs` (per-agent isolation, mirroring how Marketing Swarm owns `marketing`). Replaces the dead `law` schema, which was scaffolding from a January-2026 design that nothing ever wrote to and is dropped in a forward-only migration.
- `LegalJobsRepository` — accessed only via `DATABASE_SERVICE` from `@orchestratorai/planes/database`. No direct Supabase calls.
- `LegalJobsWorkerService` — single in-process worker inside the Forge API, providing per-provider concurrency gating. Pulls `queued` rows in `queued_at` order, runs the existing `legal-department.graph.ts` workflow, updates row state at every node transition.
- `LegalJobsController` — new HTTP routes under `/legal-department/jobs`.
- `LegalDepartmentWorkspace.vue` — new top-level Vue view in `apps/forge/web/src/views/agents/legal-department/`, replacing `LegalDepartmentConversation.vue` as the entry route for the agent. The old view stays on disk and routable for the duration of the build.
- `bench/run.sh` rewritten to drive the async path.

**Components NOT added (explicit non-creation):**
- No new SSE infrastructure. The existing `ObservabilityStreamController` (`/observability/stream`) is reused unchanged.
- No new event bus, no new ReplaySubject.
- No changes to ExecutionContext shape or transport-types contracts.
- No cross-agent generalization (`AgentWorkspace.vue` extraction is future).
- No new auth/JWT logic — the controller uses existing auth patterns from `legal-department.controller.ts`.

**Component flow at runtime:**
```
POST /legal-department/jobs
  → Controller validates JWT, builds ExecutionContext from body+token,
    generates fresh conversationId (UUID),
    INSERTs row with status='queued',
    returns { jobId, conversationId } 202
  → Worker (background interval/notify loop) sees queued row,
    acquires per-provider semaphore slot,
    UPDATEs status='processing',
    runs legal-department.graph.ts with the ExecutionContext (conversationId = job's),
    graph nodes emit observability events as they already do →
      ReplaySubject (live) + public.observability_events (durable),
    updates row.current_step on each node transition,
    on graph completion writes result jsonb + status='completed',
    on exception writes error + status='failed'.
  → Frontend opens detail panel:
    GET /legal-department/jobs/:id          (row + final result if any)
    GET /legal-department/jobs/:id/events   (durable history from observability_events)
    GET /observability/stream?conversationId=… (live tail; existing endpoint)
```

### 4.2 Data Model Changes

Two forward-only migrations:
- `supabase/migrations/20260406100001_drop_dead_law_schema.sql` — drops the unused `law` schema (5 empty tables, 0 TS callers).
- `supabase/migrations/20260406100002_create_legal_agent_jobs.sql` — creates the new `legal` schema and `legal.agent_jobs` table.

```sql
CREATE SCHEMA IF NOT EXISTS legal;

CREATE TABLE legal.agent_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug        text NOT NULL,
  user_id         uuid NOT NULL,
  conversation_id uuid NOT NULL UNIQUE,

  agent_slug      text NOT NULL,            -- 'legal-department'
  job_type        text NOT NULL,            -- 'document-analysis'
  provider        text NOT NULL,
  model           text NOT NULL,

  status          text NOT NULL CHECK (status IN ('queued','processing','completed','failed')),
  current_step    text,
  progress        int  NOT NULL DEFAULT 0,
  last_message    text,
  error           text,

  input           jsonb NOT NULL,
  result          jsonb,

  queued_at       timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz
);

CREATE INDEX legal_agent_jobs_org_status_idx   ON legal.agent_jobs (org_slug, status);
CREATE INDEX legal_agent_jobs_conversation_idx ON legal.agent_jobs (conversation_id);
CREATE INDEX legal_agent_jobs_queued_at_idx    ON legal.agent_jobs (queued_at DESC);
```

`public.observability_events` is **not** modified. The existing `context.conversationId` column already keys events to jobs.

### 4.3 API Changes

All routes mounted on the Forge API (port 6200) under the existing `legal-department` controller module. **No JWT guard** — the existing `LegalDepartmentController` accepts `ExecutionContext` from the request body with no `@UseGuards(...)`, and the new endpoints follow the same posture for consistency. Org-scoping is enforced at the repository (every read filters by `ctx.orgSlug`); the trust boundary is "the caller passes its own context honestly," matching the rest of Forge API. Documented as a hardening follow-up in §6 / Phase 5.

| Method | Path | Purpose | Body / Query | Response |
|---|---|---|---|---|
| POST | `/legal-department/jobs` | Enqueue a new document-analysis job | `{ context: ExecutionContext, data: { content, contentType } }` (existing invoke shape) | `202 { jobId, conversationId, status: 'queued' }` |
| GET | `/legal-department/jobs` | List jobs for caller's org | `?status=&limit=&offset=` | `200 { jobs: AgentJobRow[] }` ordered `queued_at desc` |
| GET | `/legal-department/jobs/:id` | Fetch one job (row + result if completed) | — | `200 AgentJobRow` (404 if not in caller's org) |
| GET | `/legal-department/jobs/:id/events` | Fetch persisted observability events for job | — | `200 { events: ObservabilityEvent[] }` ordered by timestamp asc |

`AgentJobRow` mirrors the table columns above. Org scoping is enforced in the repository: every query filters by `org_slug = ctx.orgSlug`.

The existing `POST /legal-department/invoke` and `/invoke/stream` endpoints remain untouched and functional.

The existing `GET /observability/stream?conversationId=…` is reused as-is for live tailing — no changes.

### 4.4 Frontend Changes

`apps/forge/web/src/views/agents/legal-department/`:
- **New:** `LegalDepartmentWorkspace.vue` — left sidebar (Capabilities), main pane (activity feed table), right panel (job detail). Becomes the default route for the legal-department agent.
- **New:** `components/CapabilitySidebar.vue` — list of capability buttons. For this effort only "Onboard a Document" is enabled; the others are rendered disabled with "coming soon" copy so the slot exists.
- **New:** `components/ActivityFeed.vue` — table of jobs scoped to org. Polls `GET /legal-department/jobs` every 5s when no live SSE is open; updates from the live stream when one is. Columns: type icon, title, status badge, current step, model, started, duration.
- **New:** `components/JobDetailPanel.vue` — fetches `/jobs/:id` and `/jobs/:id/events` on open, then attaches `EventSource('/observability/stream?conversationId=…')`. Merges historical + buffered + live events, dedupes by event id, renders chronologically. On `completed`, renders the existing report markdown view (lifted from `LegalDepartmentConversation.vue`).
- **New:** `components/OnboardDocumentModal.vue` — file picker + provider/model select; on submit calls `POST /legal-department/jobs` and closes.
- **New:** `legalJobsService.ts` — typed client for the four new endpoints.
- **Modified:** routing in `forge/web` to point the legal-department agent route at `LegalDepartmentWorkspace.vue`. Old `LegalDepartmentConversation.vue` remains accessible at a `/legacy` sub-route for the duration of the build.
- **Unchanged:** the existing report markdown rendering component is reused inside `JobDetailPanel.vue`, not duplicated.

### 4.5 Infrastructure Requirements

- **Per-provider concurrency configuration** via env vars on the Forge API:
  - `OLLAMA_MAX_CONCURRENT` (default `1`)
  - `ANTHROPIC_MAX_CONCURRENT` (default `10`)
  - `OPENAI_MAX_CONCURRENT` (default `10`)
  - Worker enforces these via in-process semaphores keyed on `provider`.
- **Per-node model overrides** via config (env var or config file). The orchestrator/specialist nodes must read their model from a configuration lookup keyed by `(agent_slug, node_name)`, falling back to `ExecutionContext.model`. No hardcoded model names in node code. Mechanism: a small `legal-department-model-config.ts` (or env-driven map) loaded at module init; nodes call a helper `resolveModelForNode(ctx, nodeName)`.
- **Worker scheduling:** simple polling loop (e.g. `setInterval` every 1s) inside `LegalJobsWorkerService.onModuleInit()`. No external queue (BullMQ etc.). Single-process correctness is sufficient for the in-process design described in the intention.
- **Database migrations:** new migration file applied via existing Supabase migration flow (`/restore-db` / `npm run db:*` scripts).
- **No new ports, no new services, no new containers.**

## 5. Non-Functional Requirements

- **Performance:** end-to-end document-analysis on `gemma4:e4b` against the test NDA must complete in ≤ ~120s wallclock (current measured ~89s) with no per-call timeout. Multi-specialist MSAs may take several minutes; this is acceptable because no HTTP connection is held.
- **Concurrency correctness:** with `OLLAMA_MAX_CONCURRENT=1` and N queued Ollama jobs, exactly one job is in `processing` at any time. Verifiable by inspecting `legal.agent_jobs` while two jobs are queued.
- **Org isolation:** every read of `legal.agent_jobs` filters by `org_slug` from the caller's ExecutionContext. A user from org A cannot read or list any row from org B.
- **Schema isolation:** `legal.agent_jobs` lives in the new `legal` schema. A Postgres role scoped only to the `marketing` schema cannot see it. The dead `law` schema is dropped in the same migration chain.
- **No fallbacks, no swallowed errors:** failed jobs go to `status='failed'` with the real error in `error` and the failure event visible in the observability stream. No retries, no silent degradation.
- **ExecutionContext is passed whole** through the worker into the graph and into every LLM call. No destructuring into ad-hoc fields.
- **Database plane only** for all `legal` reads/writes. **Observability plane only** for events. No direct Supabase imports in agent code.
- **Backwards compatibility:** the existing `/invoke/stream` and `LegalDepartmentConversation.vue` continue to work for the entire duration of the build and are not removed in this effort.
- **Security:** the four new endpoints accept `ExecutionContext` from the request body with no JWT guard, matching the existing `LegalDepartmentController` and the rest of Forge API. Org scoping is enforced at the repository (every read filters by `ctx.orgSlug`); the trust boundary is the caller. Adding real JWT validation across Forge API is a separate hardening effort, not a precondition for this one. Documented as a Phase 5 follow-up.

## 6. Out of Scope

- The other Legal Department capabilities (Brief Stress-Testing, Persistent Case Team, Portfolio Sentinel, Department Knowledge browser) — only the sidebar slots are created (disabled).
- Per-specialist chunking — captured in `docs/efforts/future/legal-department-upgrades.md`.
- Job cancellation.
- "Mine vs all" filter on the activity feed.
- Hardening of `/observability/stream` auth scoping (`admin:audit`).
- Generalizing the workspace into a shared `AgentWorkspace.vue` for Marketing Swarm / CAD.
- Job retention / cleanup policy.
- Token-level streaming inside individual LLM calls.
- Replacing or removing `/invoke/stream`.
- Rewriting the 8 specialist nodes. The orchestrator's sequential-on-Ollama fix already shipped.
- Cloud-LLM specific tuning beyond the concurrency env vars.

## 7. Dependencies & Risks

### Dependencies
- Existing planes packages (`@orchestratorai/planes/database`, `@orchestratorai/planes/observability`, `@orchestratorai/planes/llm`) — already in place and used elsewhere.
- Existing `legal-department.graph.ts` workflow — unchanged.
- Existing `ObservabilityStreamController` and `public.observability_events` table — unchanged.
- Local Ollama daemon at `localhost:11434` exposing `gemma4:e4b`.

### Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Worker polling loop misses jobs or double-processes on restart | Use a simple `SELECT … FOR UPDATE SKIP LOCKED` pattern when claiming a job (or atomic `UPDATE … WHERE status='queued' RETURNING`). Single-process design means no cross-instance coordination needed. |
| Per-node parallel `Promise.all` in the existing graph still serializes inside Ollama | The orchestrator already ships sequential-on-Ollama. Validated end-to-end. The async queue removes timeout pressure regardless. |
| `gemma4:e4b` actually fails on some node category | Model bench phase exercises representative documents; escalation path to `gemma4:26b` is configuration-only. |
| Two-Ollama daemon-version mismatch blocks 26b loading | Fix Ollama.app upgrade as a small task at end of bench phase. Not blocking because e4b is the default. |
| Observability event ordering across historical fetch + live stream causes duplicates or gaps | Frontend dedupes by event id; merge ordered by timestamp. Buffered events from ReplaySubject overlap with historical fetch — dedupe is required and explicit. |
| Migration to new `legal` schema interacts badly with existing migrations | Add the new migration as a forward-only file with a high timestamp. No edits to existing migrations. |
| Old `LegalDepartmentConversation.vue` and new workspace both writing to the same conversationId space | They use disjoint conversationIds: old path uses whatever the chat sends, new path always generates a fresh UUID at enqueue. No collision possible. |
| Per-node model config drift between bench harness and worker | Both read from the same configuration source (env-driven map / config file). Bench harness uses the same `resolveModelForNode` helper. |

## 8. Phasing

Each phase ends in a state that can be independently validated end-to-end.

### Phase 1 — Schema, repository, and enqueue endpoint
- Create migration for `legal.agent_jobs` table inside the existing `legal` schema.
- Implement `LegalJobsRepository` via `DATABASE_SERVICE`.
- Implement `POST /legal-department/jobs` (insert row, return `{ jobId, conversationId }`).
- Implement `GET /legal-department/jobs` and `GET /legal-department/jobs/:id` with org scoping.
- Unit tests for the repository (org isolation, ordering) and the controller (auth, payload validation).
- **Validation:** curl can POST a job, see the row in the DB with status `queued`, and list it back.

### Phase 2 — Worker, concurrency, graph integration
- Implement `LegalJobsWorkerService` with polling loop and per-provider semaphores.
- Wire env vars `OLLAMA_MAX_CONCURRENT` / `ANTHROPIC_MAX_CONCURRENT` / `OPENAI_MAX_CONCURRENT`.
- Worker pulls a queued row, builds ExecutionContext from the row (conversationId = row.conversation_id), invokes existing `legal-department.graph.ts`, updates `current_step` on node transitions, writes `result` + `status='completed'` on success, `error` + `status='failed'` on exception.
- `GET /legal-department/jobs/:id/events` reads from `public.observability_events` (via the database plane) filtered by `conversation_id`.
- Implement `resolveModelForNode(ctx, nodeName)` config helper; refactor existing nodes to call it instead of hardcoding model names where applicable.
- Tests: concurrency semaphore enforcement; happy-path graph execution; failure path writes error and emits a failure event.
- **Validation:** curl POSTs a job → row goes queued → processing → completed; `/jobs/:id/events` returns the full event history; two queued Ollama jobs run sequentially.

### Phase 3 — Bench harness rewrite + model bench pass
- Rewrite `docs/efforts/current/bench/run.sh` to: POST job, capture `{jobId, conversationId}`, attach to `/observability/stream?conversationId=…`, tail until `completed|failed`, GET final result, print summary.
- Run the bench against a representative document set (short NDA, medium MSA, long contract) on `gemma4:e4b`.
- Identify any node that overflows e4b's context; configure `gemma4:26b` override only for those nodes.
- Fix the Ollama daemon-version mismatch only if a node actually requires 26b.
- **Validation:** `./bench/run.sh gemma4:e4b` exits 0 on the test NDA and prints the final report. Per-node model overrides demonstrated to work via config change only.

### Phase 4 — Workspace UI
- Create `LegalDepartmentWorkspace.vue` with sidebar / activity feed / detail panel layout.
- Create `legalJobsService.ts`, `CapabilitySidebar.vue`, `ActivityFeed.vue`, `JobDetailPanel.vue`, `OnboardDocumentModal.vue`.
- Wire the legal-department agent route to the new workspace; preserve `LegalDepartmentConversation.vue` at a `/legacy` path.
- Job detail panel: historical fetch + live SSE merge with id-based dedupe; on `completed`, render report markdown using the existing component.
- **Validation:** end-to-end success criterion from §2 — drop a document in the UI, watch it appear and progress in the activity feed, open the detail panel, see live + historical events, see the final report. A second user in the same org reproduces the same view from cold open.

### Phase 5 — Cleanup and documentation
- Document env-var configuration in `apps/forge/api/README.md` (or equivalent).
- Document the per-node model override mechanism.
- File hardening follow-ups: `/observability/stream` auth scoping, retention policy, cancellation, `AgentWorkspace.vue` extraction — into `docs/efforts/future/`.
- **Validation:** `npm run lint` and `npm run build` clean across forge/api and forge/web; all new tests pass.

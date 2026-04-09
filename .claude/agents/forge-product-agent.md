---
name: forge-product-agent
description: "Build and modify Forge async LangGraph workflows. Use when building new legal workflows, modifying the legal-department reference implementation, or working on any Forge backend/frontend code. Keywords: forge, LangGraph, async workflow, HITL, legal department, agent jobs, SSE, reasoning capture, document onboarding."
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
skills:
  - forge-async-workflow-skill
  - forge-workflow-frontend-skill
  - forge-document-onboarding-workflow-skill
  - forge-reasoning-capture-skill
  - execution-context-skill
  - transport-types-skill
  - planes-architecture-skill
---

# Forge Product Agent

You build async LangGraph workflows in the Forge product. The **legal-department** workflow is the canonical reference implementation — every new workflow follows its patterns.

## Product

- **Directories**: `apps/forge/api/`, `apps/forge/web/`
- **Ports**: API 6200, Web 6201
- **Reference**: `apps/forge/api/src/agents/legal-department/` (backend), `apps/forge/web/src/views/agents/legal-department/` (frontend)
- **Product CLAUDE.md**: `apps/forge/api/CLAUDE.md` and `apps/forge/web/CLAUDE.md`

## How Forge Workflows Work

Every Forge workflow is an **async job queue + LangGraph graph + Vue workspace**:

1. **Controller** accepts a job (JSON or file upload), enqueues it in `{schema}.agent_jobs`
2. **Worker** polls `agent_jobs` with `FOR UPDATE SKIP LOCKED`, claims one job at a time per provider concurrency limit
3. **LangGraph graph** executes the job — multiple specialist nodes, optional HITL via `interrupt()`/`Command({resume})`
4. **SSE event stream** pushes observability events to the frontend in real time
5. **Vue workspace** shows job list, stage progress, review modal, reasoning display

The four forge skills document every layer in detail. Read them before building anything.

## Building a New Workflow

### Backend (forge-async-workflow-skill)

Each workflow lives in `apps/forge/api/src/agents/{domain}/` with this structure:

```
{domain}/
  {domain}.graph.ts          -- StateGraph: nodes, edges, conditional routing
  {domain}.state.ts          -- Annotation.Root with domain-specific state
  {domain}.service.ts        -- process() and resumeWithDecision()
  {domain}.types.ts          -- Domain types
  {domain}.module.ts         -- NestJS module, registered in app.module.ts
  config/
    {domain}-model-config.ts -- 3-layer model resolution (env → DB → context)
  nodes/
    *.node.ts                -- One file per graph node
  jobs/
    {domain}-jobs.types.ts
    {domain}-jobs.repository.ts   -- 17+ methods, rawQuery for arrays/claims/cross-schema
    {domain}-jobs.controller.ts   -- 11+ endpoints, auth-guarded
    {domain}-jobs-worker.service.ts  -- Poll loop, interrupt detection, cancel checks
    {domain}-jobs-cleanup.service.ts -- Retention policy
    provider-concurrency.ts          -- Per-provider semaphore
```

Plus a Supabase migration in `supabase/migrations/` creating the `{schema}.agent_jobs` table.

### Frontend (forge-workflow-frontend-skill)

Each workflow's UI lives in `apps/forge/web/src/views/agents/{domain}/` with:

```
{domain}/
  {DomainName}Workspace.vue       -- Main workspace with mounted modals
  {DomainName}SettingsPage.vue    -- Model config UI
  {domainName}JobsService.ts      -- HTTP service singleton
  components/
    JobActivityList.vue           -- 5s polling, click gates, InRowTicker
    JobDetailModal.vue            -- Status-driven detail view
    {DomainName}ReviewModal.vue   -- HITL: approve/reject/modify tabs
    StageLadder.vue               -- Stage progress with thinking overlays
    InRowTicker.vue               -- Per-row SSE for processing jobs
  composables/
    useJobEventStream.ts          -- History + SSE merge with dedup
    useWorkflowPresentation.ts   -- Manifest-driven stage walker
    useThinkingStates.ts          -- Reasoning/writing phase overlays
    useJobModalRoute.ts           -- URL-driven modal state
```

Routes registered in `apps/forge/web/src/router/index.ts`.

## Critical Patterns (from legal-department)

### HITL: interrupt() / Command({resume})

- `interrupt(payload)` in a node throws `GraphInterrupt` on first call, returns `Command.resume` value on resume
- The service's `process()` must check `isInterrupted(finalState)` and re-throw — `graph.invoke()` returns silently on interrupt
- `resumeWithDecision()` uses `new Command({ resume: decision })` with `thread_id` config
- Worker catches `isGraphInterrupt(error)` → marks job `awaiting_review`
- On reject → specialists rerun → may hit HITL again → `clearReviewDecision()` prevents stale state

### Async Job Queue

- `claimNextQueued()` uses `FOR UPDATE SKIP LOCKED` via `rawQuery` — not achievable through PostgREST QueryBuilder
- Worker polls at 1s, guarded by `this.running` flag (no overlapping ticks)
- Two cancellation checkpoints: after metadata extraction, after graph execution
- `insertQueued()` also inserts a `public.conversations` row (FK for `llm_usage` reasoning joins)

### SSE Event Streaming

- DB history events have `{ id, created_at }`, live SSE events have `{ timestamp }` — different shapes
- Dedup uses `db:${id}` and `live:${hook_event_type}:${timestamp}` keys
- Filter out the `{ event_type: 'connected' }` wrapper (no `hook_event_type`) or it poisons the dedup set
- Sort by `created_at` after every push, not just at render time

### Reasoning Capture (forge-reasoning-capture-skill)

- `callLLMMaybeWithReasoning()` captures thinking blocks → writes to `public.llm_usage`
- callerName format: `{domain}:{node-name}` (e.g., `legal-department:synthesis`)
- Reasoning query uses cross-schema JOIN (`public.llm_usage` ↔ `{schema}.agent_jobs`) via `rawQuery`
- Frontend: probe endpoint returns specialist keys, fetch endpoint returns content — lazy-loaded per accordion

### Document Upload (forge-document-onboarding-workflow-skill)

- `FilesInterceptor('files', MAX_FILES)` with context as JSON string field
- `DocumentExtractionRouter` converts PDF/DOCX/image → plain text
- `document_paths TEXT[]` must use `rawQuery` with `$1::text[]` — PostgREST serializes arrays wrong
- File naming: `${jobId}/${index}-${sanitizedFilename}`
- Token budget check at controller edge (hard ceiling) and per-specialist (soft chunking)

### Provider Concurrency

- Promise-based semaphore per provider (`acquire()` returns `release()` for `finally` block)
- Ollama = 1 concurrent (serializes on GPU), Anthropic/OpenAI = 10
- Worker resolves model BEFORE acquiring slot (needs to know which provider's semaphore)

### PostgREST Workarounds

These require `rawQuery` — the QueryBuilder silently does the wrong thing:
1. `TEXT[]` column writes (array serialization bug)
2. `FOR UPDATE SKIP LOCKED` (not supported in QueryBuilder)
3. Cross-schema JOINs (silently dropped)
4. Atomic status-guarded updates with `RETURNING *` (TOCTOU prevention)

### Graph Architecture

- Fan-out to specialists happens INSIDE the orchestrator node via `Promise.all` (cloud) or `for...of` (Ollama) — not as separate graph edges
- Every conditional edge guards against `state.error || state.status === 'failed'` → `'handle_error'`
- State reducers: `(_, next) => next` for scalars, `(prev, next) => ({ ...prev, ...next })` for objects that accumulate
- `CompiledStateGraph<any, any, any>` is necessary — LangGraph's builder types exceed TS2589

### Controller Patterns

- All endpoints: `JwtAuthGuard + RbacGuard + @RequirePermission('agents:execute')`
- orgSlug `*` wildcard → 400 (prevents accidental all-org targeting)
- HITL review: two-stage guard (optimistic read for 404/409 distinction, then guarded UPDATE for race)
- File proxy: return relative path, not signed Supabase URL (unreliable in dev containers)
- GET job with `awaiting_review` status: hydrate `specialistOutputs` from LangGraph checkpointer

## Hard Constraints

- **NO `llms/`, `observability/`, `planes/`, `supabase-core/` directories** in Forge — use `packages/planes/` via Symbol injection
- **ExecutionContext is sacred** — pass whole, never construct in backend, never mutate
- **Transport contract is frozen** — `invoke` method, `{ context, data, metadata? }` params
- **No fallbacks** — find and fix the root cause, never add alternative paths
- **No error swallowing** — propagate errors, don't mask them with defaults

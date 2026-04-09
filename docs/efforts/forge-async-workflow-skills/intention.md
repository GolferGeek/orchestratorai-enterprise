# Forge Async Workflow Skills

## What we're doing

Two things in one effort:

1. **Polish the legal-department reference implementation** — three small backend features that were deferred from the original async-workspace effort and need to land before we codify the pattern into skills:
   - **Job cancellation**: `POST /legal-department/jobs/:id/cancel` — sets `status='canceled'`, signals the worker to bail at the next node boundary
   - **Job retention/cleanup**: periodic cleanup of completed jobs older than 90 days from `legal.agent_jobs`
   - **Cross-user activity feed filter**: `userId` query param on `GET /legal-department/jobs` + mine/all toggle in the Vue activity feed

2. **Write the reusable Claude skills** that distill the legal-department's proven async HITL workflow pattern into knowledge that an agent can use to scaffold a new workflow in one session. These are `.claude/skills/` files — pure documentation, zero code in `apps/`.

## Why now

The forge-async-workflow-skills doc (`docs/efforts/future/forge-async-workflow-skills.md`) explicitly says:

> **Status**: Parked — do not start until Phase 5 (Legal Department Hardening & Verification) is complete.

Phase 5 is done. The legal department async workspace is fully built: backend (job queue, worker, HITL, multi-document, reasoning capture), frontend (workspace view, activity feed, job detail modal, review modal, stage ladder, SSE event stream, model config UI). The auth hardening sweep is complete across all 5 API products.

The doc also says:

> If, during skills writing, we notice something in legal-department that should change before being codified, we fix it in legal-department first (as a small separate PR) and then write the skill against the fixed version.

The three remaining backend items (cancellation, retention, activity feed filter) are exactly this — things that should exist in the reference implementation before we tell an agent "this is the canonical pattern." Phase 1 fixes them; Phase 2+ writes the skills.

## Phase 1: Polish the reference (code changes in forge-api + forge-web)

### Job cancellation

Add `POST /legal-department/jobs/:id/cancel`:
- If job status is `queued`: set `status='canceled'`, `completed_at=now()`. Immediate.
- If job status is `processing`: set `status='cancel_requested'` (new transient status). The worker checks for this between LangGraph node transitions and bails out cleanly, setting `status='canceled'`. Add the check to the worker's node-boundary hook.
- If job status is `completed`, `failed`, or already `canceled`: return 409 Conflict.
- Org-scoped: the repository validates `org_slug` matches the caller's context.
- Add a cancel button to `JobDetailModal.vue` that calls `legalJobsService.cancelJob(jobId)`.
- Add `cancelJob` method to `legalJobsService.ts`.

### Job retention/cleanup

Add a lightweight periodic cleanup to the worker polling loop (or a separate setInterval service):
- Default retention: 90 days for `completed` jobs, indefinite for `failed` and `canceled`.
- Cleanup = hard delete from `legal.agent_jobs` (no soft-delete — the events in `observability_events` persist separately).
- Configurable via env var `LEGAL_JOB_RETENTION_DAYS` (default 90). Set to 0 to disable.
- Runs once per hour (or once per worker poll cycle, whichever is less frequent).

### Cross-user activity feed filter

Backend:
- Add optional `userId` query param to `GET /legal-department/jobs`. When present, filter `WHERE user_id = $userId`. When absent, return all jobs for the org (existing behavior).

Frontend:
- Add a mine/all toggle to `JobActivityList.vue`. "Mine" passes `userId` from the current JWT. "All" omits it. Default: "mine" for non-admin, "all" for admin.

## Phase 2: Write the skills (pure knowledge capture)

### `forge-async-workflow-skill`

The canonical pattern for building an async LangGraph workflow with HITL in Forge. Covers:
- Table shape (`<schema>.agent_jobs`) and columns
- Migration pattern for adding status tracking, HITL review, original file path, document paths
- Repository methods: `insertQueued`, `claimNextQueued` (atomic `FOR UPDATE SKIP LOCKED`), `markAwaitingReview`, `recordReviewAndRequeue`, `markCompleted`, `markFailed`, `updateProgress`, `findByIdForOrg`, `listForOrg`, `listEventsForConversation`, **`cancelJob`** (new from Phase 1)
- Controller endpoints: all 10+ from legal-jobs.controller.ts including the new cancel endpoint
- Worker service structure: polling loop, atomic claim, provider concurrency gating, HITL interrupt detection, **cancellation check between nodes** (new from Phase 1), error handling
- ExecutionContext passthrough
- LangGraph `interrupt()` and `Command({resume})` mechanics for HITL
- How to emit observability events at node boundaries
- Checkpoint persistence via `PostgresCheckpointerService`
- **Job retention** pattern (new from Phase 1)

Points at `apps/forge/api/src/agents/legal-department/` as the canonical implementation.

### `forge-document-onboarding-workflow-skill`

File-upload workflow specifics:
- Multipart `FilesInterceptor('files', MAX_FILES)` pattern
- `DocumentExtractionRouter` for text/pdf/docx/image
- Per-file persistence via `MEDIA_STORAGE_PROVIDER`
- `document_paths TEXT[]` column pattern
- Multi-document fan-out inside specialist helpers

### `forge-workflow-frontend-skill`

Frontend counterpart:
- Queue view component (`JobActivityList` pattern with **mine/all toggle** — new from Phase 1)
- Multi-file upload modal
- Stage ladder composable with node/step progress tracking
- SSE subscription via `useJobEventStream` composable
- HITL review modal structure
- Reasoning accordion
- **Cancel button** UX (new from Phase 1)

### `forge-reasoning-capture-skill`

Reasoning capture wiring:
- Using `callLLMMaybeWithReasoning` helper
- Stage ladder rendering of reasoning/writing states
- Review modal reasoning accordion
- Read endpoint pattern for fetching reasoning from `llm_usage`

## Done when

- `POST /legal-department/jobs/:id/cancel` works end-to-end (queued → immediate cancel; processing → cancel at next node boundary)
- Completed jobs older than 90 days are cleaned up automatically
- Activity feed has a mine/all toggle that filters by userId
- All 4 skills exist under `.claude/skills/` following the existing skill convention
- Each skill references legal-department canonical files by path
- Each skill has been tested by using it to assess whether a new throwaway workflow falls out naturally from reading the skill
- `npm run build` clean, forge-api + forge-web tests green

## Explicitly out of scope

- **`AgentWorkspace.vue` extraction** — build the skills first; extract the reusable shell in a separate effort after a second workflow (e.g. marketing-swarm workspace) validates the pattern
- **Live LangGraph integration test** — requires Ollama in CI
- **Supabase storage volume mount fix** — infrastructure concern, workaround in place
- **Ionic Vue DevTools noise** — cosmetic, suppressors in place
- **Drop `law` schema in production** — prod-ops
- **New legal workflows** (adversarial-brief, persistent-case-team, portfolio-sentinel) — those come AFTER the skills exist; the skills are what makes building them fast

## Core principles

- **The skill should always describe how things ARE, not how they SHOULD BE.** Fix the reference implementation first (Phase 1), then document it (Phase 2).
- **Skills capture knowledge, not code.** An agent reading the skill writes idiomatic code for a new department — which may look like legal's or may diverge freely.
- **No shared framework.** Shared primitives (planes, transport types) stay shared. Workflow orchestration stays per-department. Skills bridge the gap with knowledge, not coupling.
- **Test by using.** The real test of a skill is: can an agent read it and scaffold a new workflow in one session? If not, revise.

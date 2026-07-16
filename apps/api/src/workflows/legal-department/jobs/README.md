# Legal Department Async Job Queue

This directory implements the async job queue that backs the Legal Department
workspace. See `docs/efforts/current/prd.md` for the full design.

## Components

| File | Role |
|---|---|
| `legal-jobs.types.ts` | `AgentJobRow`, `JobStatus`, request/response DTOs |
| `legal-jobs.repository.ts` | All reads/writes against `legal.agent_jobs` via `DATABASE_SERVICE`. Atomic claim via `FOR UPDATE SKIP LOCKED`. |
| `legal-jobs.controller.ts` | HTTP routes under `/legal-department/jobs` |
| `provider-concurrency.ts` | Per-provider semaphore registry, env-driven |
| `legal-jobs-worker.service.ts` | 1s polling worker that runs jobs through the existing `LegalDepartmentService` |

## HTTP routes

All routes accept `ExecutionContext` from the request body (no JWT). Org
scoping is enforced at the repository — every read filters by `ctx.orgSlug`.

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/legal-department/jobs` | `{ context, data: { content, contentType? } }` | `202 { jobId, conversationId, status }` |
| `GET`  | `/legal-department/jobs?orgSlug=…&status=…&limit=…&offset=…` | — | `200 { jobs: AgentJobRow[] }` |
| `GET`  | `/legal-department/jobs/:id?orgSlug=…` | — | `200 AgentJobRow` (404 if not in caller's org) |
| `GET`  | `/legal-department/jobs/:id/events?orgSlug=…` | — | `200 { events: ObservabilityEvent[] }` |

Live event tail: use the existing
`GET /observability/stream?conversationId=…` endpoint with the job's
`conversationId`. The frontend should fetch `:id/events` first (durable
history) then attach to the stream and dedupe by event id.

## Environment variables

| Name | Default | Effect |
|---|---|---|
| `OLLAMA_MAX_CONCURRENT` | `1` | Max concurrent jobs whose `ExecutionContext.provider == 'ollama'`. Local Ollama is single-stream; raising this on a Mac Studio buys nothing and risks per-call timeouts. |
| `ANTHROPIC_MAX_CONCURRENT` | `10` | Max concurrent Anthropic-backed jobs. |
| `OPENAI_MAX_CONCURRENT` | `10` | Max concurrent OpenAI-backed jobs. |
| `LEGAL_JOBS_WORKER_DISABLED` | unset | If `1`, the worker polling loop is not started at module init. Useful for tests and for running the API as a pure HTTP host with the worker disabled. |

Unknown providers default to `max=1` (safe).

## Database

Schema: `legal` (created by `supabase/migrations/20260406100002_create_legal_agent_jobs.sql`).
Table: `legal.agent_jobs`. Indexes on `(org_slug, status)`, `(conversation_id)`, and `(queued_at DESC)`.

The job's `conversation_id` is its durable thread key for the rest of its
life. Every observability event the existing graph emits is already tagged
with that id and persisted to `public.observability_events`, so live and
historical views of any job draw from the same source.

## Tests

| File | Coverage |
|---|---|
| `legal-jobs.repository.spec.ts` | insert, find (org isolation), list (ordering + filter), atomic claim, events query |
| `legal-jobs.controller.spec.ts` | enqueue success + 4 validation paths, list filters, get/events 404 cross-org |
| `provider-concurrency.spec.ts` | env defaults, env override, Ollama serializes when max=1, cloud parallelism, unknown-provider safety |
| `legal-jobs-worker.service.spec.ts` | happy path → markCompleted, throw → markFailed, non-completed → markFailed, ExecutionContext passed whole |

Run just this directory:

```bash
cd apps/forge/api
npx jest src/agents/legal-department/jobs
```

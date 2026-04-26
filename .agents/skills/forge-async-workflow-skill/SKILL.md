---
name: forge-async-workflow
description: Canonical pattern for building an async LangGraph workflow with HITL in Forge
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Forge Async Workflow Pattern

This skill codifies the legal-department implementation into a reusable pattern for building async LangGraph workflows with Human-in-the-Loop (HITL) in the Forge product.

## Canonical Reference Files

- **Types**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.types.ts`
- **Repository**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.repository.ts`
- **Controller**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.controller.ts`
- **Worker**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs-worker.service.ts`
- **Cleanup**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs-cleanup.service.ts`
- **Concurrency**: `apps/forge/api/src/agents/legal-department/jobs/provider-concurrency.ts`
- **Graph Service**: `apps/forge/api/src/agents/legal-department/legal-department.service.ts`
- **State**: `apps/forge/api/src/agents/legal-department/legal-department.state.ts`
- **Model Config**: `apps/forge/api/src/agents/legal-department/config/legal-model-config.ts`
- **HITL Node**: `apps/forge/api/src/agents/legal-department/nodes/hitl-checkpoint.node.ts`

## 1. Job Table Schema

Create a table in a dedicated Postgres schema (e.g., `{domain}.agent_jobs`). Columns:

```sql
CREATE TABLE {domain}.agent_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  conversation_id TEXT NOT NULL,

  agent_slug      TEXT NOT NULL,
  job_type        TEXT NOT NULL,
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,

  status          TEXT NOT NULL DEFAULT 'queued',
  current_step    TEXT,
  progress        INTEGER NOT NULL DEFAULT 0,
  last_message    TEXT,
  error           TEXT,

  input           JSONB NOT NULL,
  result          JSONB,

  original_file_path TEXT,
  document_paths     TEXT[] DEFAULT '{}',
  document_count     INTEGER NOT NULL DEFAULT 1,

  review_decision JSONB,

  queued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);
```

### Job Status Union

```typescript
type JobStatus =
  | 'queued'        // waiting for the worker to claim
  | 'processing'    // worker is executing the graph
  | 'awaiting_review' // graph hit a HITL interrupt(), paused
  | 'review_rejected' // reviewer rejected (optional intermediate state)
  | 'completed'     // graph ran to completion
  | 'failed'        // unrecoverable error
  | 'cancel_requested' // user requested cancel; worker checks between nodes
  | 'canceled';     // worker honored the cancel request
```

### Review Decision Payload

```typescript
type ReviewDecisionPayload =
  | { decision: 'approve' }
  | { decision: 'reject'; feedback: string }
  | { decision: 'modify'; editedOutputs: Record<string, unknown>; feedback?: string };
```

### Migration Pattern

Create the migration under `supabase/migrations/` with a timestamped filename. The migration should:
1. Create the schema if not exists: `CREATE SCHEMA IF NOT EXISTS {domain};`
2. Create the `agent_jobs` table with all columns above.
3. Add indexes on `(org_slug, status)` and `(conversation_id)`.
4. Also insert a matching row in `public.conversations` at enqueue time so `llm_usage.conversation_id` FK is satisfied.

## 2. Repository (17 Methods)

Create a NestJS `@Injectable()` repository that injects `DATABASE_SERVICE`. Every read/write filters by `org_slug` for tenant isolation. Use the `SCHEMA` and `TABLE` constants.

### Core Methods

| Method | Purpose |
|--------|---------|
| `insertQueued(request, conversationId)` | Insert a new row with status `queued`. Also inserts `public.conversations` row for FK safety. |
| `findByIdForOrg(id, orgSlug)` | Single-row lookup, org-scoped. |
| `listForOrg(orgSlug, options?)` | Paginated list with optional `status`, `userId`, `limit`, `offset` filters. Ordered by `queued_at DESC`. |
| `claimNextQueued()` | **Critical**: Atomic claim via raw SQL. See below. |
| `updateProgress(id, fields)` | Update `current_step`, `progress`, `last_message` during execution. |
| `updateOriginalFilePath(id, path)` | Set the storage path for the original uploaded file. |
| `updateDocumentPaths(id, paths)` | Set `document_paths` TEXT[] and `document_count` via `rawQuery` (PostgREST can't handle TEXT[] correctly). |
| `markCompleted(id, result)` | Set status to `completed`, write result JSONB, set `completed_at`, progress to 100. |
| `markFailed(id, errorMessage)` | Set status to `failed`, write error string, set `completed_at`. |
| `markAwaitingReview(id)` | Transition to `awaiting_review` with step `hitl_checkpoint`, progress 85. |
| `clearReviewDecision(id)` | Null out `review_decision` after the worker consumed it. |
| `recordReviewAndRequeue(id, orgSlug, decision)` | **Atomic**: `UPDATE ... SET status='queued', review_decision=$1 WHERE status='awaiting_review' RETURNING *`. Returns null on race loss (409). |
| `listEventsForConversation(conversationId)` | Read from `public.observability_events` joining on `conversation_id` or `task_id`. |
| `findReasoningForSpecialist(jobId, orgSlug, specialistKey)` | Cross-schema join to `public.llm_usage` for thinking content. |
| `listSpecialistKeysWithReasoning(jobId, orgSlug)` | Distinct specialist keys that have reasoning rows. |
| `cancelJob(id, orgSlug)` | Immediate cancel for idle statuses, deferred `cancel_requested` for `processing`. Throws ConflictException for terminal statuses. |
| `deleteOlderThan(days, status)` | Retention cleanup: `DELETE FROM ... WHERE status=$1 AND completed_at < $2`. |

### claimNextQueued -- FOR UPDATE SKIP LOCKED

This is the most important method. It uses a single SQL statement with a subselect:

```sql
UPDATE {schema}.agent_jobs
SET status = 'processing', started_at = now()
WHERE id = (
  SELECT id FROM {schema}.agent_jobs
  WHERE status = 'queued'
  ORDER BY queued_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

`FOR UPDATE SKIP LOCKED` ensures two concurrent worker ticks cannot grab the same row. The row lock is taken during the subselect; `SKIP LOCKED` means a second concurrent query silently skips any locked row and grabs the next one (or returns nothing).

## 3. Controller (11 Endpoints)

Create a NestJS `@Controller('{domain}')` protected by `JwtAuthGuard`, `RbacGuard`, and `@RequirePermission('agents:execute')`.

| Method | Route | Purpose | Request | Response |
|--------|-------|---------|---------|----------|
| POST | `/jobs` | Enqueue JSON job | `{ context: ExecutionContext, data: { content, contentType?, documents? }, metadata? }` | `202 { jobId, conversationId, status }` |
| POST | `/jobs/upload` | Enqueue from file upload | Multipart: `files` + `context` (JSON string) + `capabilitySlug` | `202 { jobId, conversationId, status }` |
| GET | `/jobs` | List jobs | Query: `orgSlug`, `status?`, `userId?`, `limit?`, `offset?` | `{ jobs: AgentJobRow[] }` |
| GET | `/jobs/:id` | Get single job | Query: `orgSlug` | `AgentJobRow` + `originalFileUrl?` + `reviewPayload?` |
| POST | `/jobs/:id/review` | Submit HITL decision | `{ context: ExecutionContext, decision: ReviewDecisionPayload }` | `202 { jobId, status }` |
| POST | `/jobs/:id/cancel` | Cancel a job | `{ context?: { orgSlug } }` or query `orgSlug` | `{ success, status }` |
| GET | `/jobs/:id/file` | Stream original file | Query: `orgSlug` | Binary response with Content-Type |
| GET | `/jobs/:id/events` | Durable event history | Query: `orgSlug` | `{ events: ObservabilityEvent[] }` |
| GET | `/jobs/:id/reasoning` | Probe or fetch reasoning | Query: `orgSlug`, `specialistKey?` | `{ jobId, specialistKeys }` or `{ jobId, specialistKey, thinkingContent, ... }` |
| GET | `/capabilities/:slug/models` | Read model config | - | `{ capability, roles }` |
| PUT | `/capabilities/:slug/models` | Update model config | `{ role, provider?, model? }` | Updated row |

### Key Controller Behaviors

- **ExecutionContext validation**: Every mutating endpoint requires `context.orgSlug`, `context.userId`, `context.provider`, `context.model`. Wildcard `*` orgSlug is always rejected.
- **Token budget check**: Both `/jobs` and `/jobs/upload` call `assertWithinInputBudget()` to reject oversized payloads before they enter the queue.
- **Review payload augmentation**: `GET /jobs/:id` reads the LangGraph checkpointer snapshot when `status === 'awaiting_review'` and returns `reviewPayload` containing `specialistOutputs`, `synthesis`, and `documentsSummary`.
- **Review atomicity**: `POST /jobs/:id/review` uses `recordReviewAndRequeue` which guards with `WHERE status='awaiting_review'`. Two concurrent reviewers get a 409.

## 4. Worker Service

Create a NestJS `@Injectable()` service implementing `OnModuleInit` and `OnModuleDestroy`.

### Polling Loop

```typescript
private timer: NodeJS.Timeout | null = null;
private running = false;
private stopped = false;

onModuleInit() {
  this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS); // 1000ms
}

onModuleDestroy() {
  this.stopped = true;
  clearInterval(this.timer);
}

async tick() {
  if (this.running || this.stopped) return;
  this.running = true;
  try {
    const job = await this.repository.claimNextQueued();
    if (!job) return;
    await this.executeJob(job);
  } finally {
    this.running = false;
  }
}
```

### executeJob Flow

1. **Resolve model**: Use `resolveModelForNode()` to get the provider/model for concurrency gating.
2. **Acquire concurrency slot**: `const release = await this.concurrency.acquire(provider)`.
3. **Reconstruct ExecutionContext**: Build the context from the job row. Pass it whole, never destructured.
4. **Pre-workflow cancellation check**: Re-read the row; if `cancel_requested` or `canceled`, honor it and return.
5. **Dispatch to graph**: If `job.review_decision` is set, call `service.resumeWithDecision(context, conversationId, decision)`. Otherwise call `service.process({ context, ... })`.
6. **Post-workflow cancellation check**: Re-read the row again; if cancel was requested during execution, discard results.
7. **Handle result**: `markCompleted` on success, `markFailed` on error.
8. **HITL interrupt detection**: In the catch block, check `isGraphInterrupt(error)`. If true, call `markAwaitingReview(id)` and `clearReviewDecision(id)`. Return without marking failed.
9. **Always release**: `release()` in the `finally` block.

### HITL Interrupt Detection

```typescript
import { isGraphInterrupt } from '@langchain/langgraph';

// In the catch block:
if (isGraphInterrupt(error)) {
  await this.repository.markAwaitingReview(job.id);
  if (job.review_decision) {
    await this.repository.clearReviewDecision(job.id);
  }
  return;
}
```

### Provider Concurrency Gating

The `ProviderConcurrencyRegistry` is a per-provider semaphore. Local LLMs (Ollama) default to max=1; cloud providers (Anthropic, OpenAI) default to max=10. Configured via env vars:
- `OLLAMA_MAX_CONCURRENT` (default 1)
- `ANTHROPIC_MAX_CONCURRENT` (default 10)
- `OPENAI_MAX_CONCURRENT` (default 10)

The `acquire(provider)` method returns a `release()` function. The caller MUST call `release()` in a `finally` block.

## 5. LangGraph interrupt() and Command({resume}) Mechanics

### In the HITL Node

```typescript
import { interrupt } from '@langchain/langgraph';

// Build a review payload from state
const reviewPayload = { specialistOutputs, synthesis, documentsSummary };

// First invocation: throws GraphInterrupt, pausing the graph.
// Resume invocation: returns the ReviewDecisionPayload.
const decision = interrupt<typeof reviewPayload, ReviewDecisionPayload>(reviewPayload);

// Stash the decision on state for downstream routing
return { orchestration: { hitlDecision: decision, hitlApproved: decision.decision === 'approve' } };
```

### In the Service (Resume Path)

```typescript
import { Command } from '@langchain/langgraph';

const config = { configurable: { thread_id: conversationId, executionContext: context } };
const finalState = await this.graph.invoke(new Command({ resume: decision }), config);
```

The graph rehydrates from the `PostgresCheckpointerService` keyed on `thread_id === conversationId`. The `Command({ resume })` feeds the decision payload back into the paused `interrupt()` call; execution continues from the HITL node.

### isInterrupted Check

`graph.invoke()` does NOT throw on `interrupt()` -- it returns state with an `__interrupt__` key. The service checks `isInterrupted(finalState)` and throws `new GraphInterrupt()` to surface it to the worker's catch path.

## 6. ExecutionContext Passthrough

ExecutionContext is received from the frontend in the request body. The backend NEVER constructs it from scratch (exception: system-triggered automation via `createSystemTriggeredContext()`). The worker reconstructs it from the job row fields (`org_slug`, `user_id`, `conversation_id`, etc.) and passes it whole into the graph via `config.configurable.executionContext`.

## 7. Observability Event Emission

The graph emits observability events at node boundaries via the `ObservabilityService`. These are persisted to `public.observability_events` with the job's `conversationId` as the correlation key. The controller's `GET /jobs/:id/events` endpoint reads them back. Live tailing uses `GET /observability/stream?conversationId=...` (SSE).

## 8. Checkpoint Persistence

The `PostgresCheckpointerService` stores LangGraph state snapshots in Postgres. The thread key is `conversationId`. This enables:
- HITL resume: the graph rehydrates from the last checkpoint before the interrupt.
- Review payload read: `GET /jobs/:id` reads the checkpointer snapshot to surface specialist outputs.

## 9. Job Retention Cleanup

The `LegalJobsCleanupService` runs hourly, deleting `completed` jobs older than `LEGAL_JOB_RETENTION_DAYS` (default 90, 0 to disable). `failed` and `canceled` jobs are kept indefinitely for postmortem analysis.

```typescript
@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly retentionDays: number;

  onModuleInit() {
    if (this.retentionDays <= 0) return; // disabled
    this.timer = setInterval(() => void this.cleanup(), 60 * 60 * 1000);
  }

  async cleanup() {
    await this.repository.deleteOlderThan(this.retentionDays, 'completed');
  }
}
```

## 10. Model Configuration

The `resolveModelForNode()` helper resolves the provider/model for each graph node. Lookup order:
1. Per-node env var override via `LEGAL_NODE_MODELS` JSON.
2. Per-capability + per-role DB override from the `capability_model_config` table.
3. Fallback to `ExecutionContext.provider` / `ExecutionContext.model`.

Nodes map to roles: specialist agents are `workhorse`, routing/synthesis/report are `thinking`, vision steps are `image`.

## 11. Testing Requirements

Every async workflow MUST have comprehensive test coverage across four layers before it ships. The final implementation phase should always include running and verifying all tests.

### Unit Tests (Jest)

Place test files alongside source files as `*.spec.ts`. Every node, utility, and controller method needs coverage:

- **Node tests**: Each graph node gets its own spec. Mock LLM calls, RAG queries, and observability. Test happy path, error handling, edge cases (empty inputs, malformed LLM responses).
- **Type tests**: Verify domain types, discriminated unions, and default values.
- **Controller tests**: Test each endpoint for success, filtering, pagination, 404, and 400 (missing orgSlug).
- **Scorecard/computation tests**: Verify math — percentages, weighted averages, boundary cases (0%, 100%, mixed).
- **HITL tests**: Verify interrupt payload shape, all decision paths (approve/reject/modify), and state transitions.
- **Report tests**: Verify all sections present, disclaimer included, LLM fallback works.

**Coverage target**: >95% statements on node files, >70% on controller.

Run with: `cd apps/forge/api && npx jest --testPathPattern="{workflow-name}" --passWithNoTests`

### Curl Tests (Live API)

Test against running servers (Supabase + Auth + Forge API). Use real auth tokens from the test user. Test the full job lifecycle:

1. **Auth**: `POST /auth/login` → get accessToken
2. **Frameworks/config**: `GET /legal-department/frameworks?orgSlug=legal` → verify data returns
3. **Upload/create job**: `POST /legal-department/jobs/upload` with files, context, metadata → verify `{ jobId, status: "queued" }`
4. **Poll status**: `GET /legal-department/jobs/:id?orgSlug=legal` → track through processing
5. **HITL review**: `POST /legal-department/jobs/:id/review` → approve → job completes
6. **Read endpoints**: Verify each read endpoint returns expected data (findings, scorecard, remediation, report)
7. **Error cases**: Missing orgSlug (400), nonexistent job (404), concurrent review (409)

### Chrome Browser Tests

Test the full user flow in the browser using the Playwright MCP or Codex Chrome browser:

1. **Login**: Navigate to app, login with test credentials
2. **Navigation**: Legal Department workspace → click capability link
3. **Create**: Open create modal, upload file, configure options, submit
4. **Progress**: Watch job appear in activity list, SSE progress updates
5. **HITL Review**: When job hits awaiting_review, open review modal, approve
6. **Detail View**: Click completed job → verify all tabs render (Scorecard, Gap Analysis, Remediation, Report)
7. **Interactions**: Filter findings, expand rows, download report
8. **Edge cases**: Empty states, error states, missing data

### E2E Integration Tests

For workflows with complex graph execution, write integration tests that exercise the full graph (not mocked). These require a running Supabase + LLM provider:

- Graph compiles without errors
- Full graph execution from start to complete with sample data
- HITL interrupt pauses correctly and resume continues
- Checkpointer persists and rehydrates state

**Important**: The final phase of any workflow implementation plan MUST include:
1. Running all unit tests and verifying pass
2. Running curl tests against live servers
3. Running Chrome browser tests for the full user flow
4. Fixing any issues found during testing
5. Documenting test results in the plan's quality gate

## Scaffolding Checklist

When building a new async workflow, create these files:

1. `apps/forge/api/src/agents/{domain}/jobs/{domain}-jobs.types.ts` -- JobStatus, AgentJobRow, request/response types
2. `apps/forge/api/src/agents/{domain}/jobs/{domain}-jobs.repository.ts` -- all 17 methods
3. `apps/forge/api/src/agents/{domain}/jobs/{domain}-jobs.controller.ts` -- all 11 endpoints
4. `apps/forge/api/src/agents/{domain}/jobs/{domain}-jobs-worker.service.ts` -- polling loop + executeJob
5. `apps/forge/api/src/agents/{domain}/jobs/{domain}-jobs-cleanup.service.ts` -- retention cleanup
6. `apps/forge/api/src/agents/{domain}/jobs/provider-concurrency.ts` -- per-provider semaphore
7. `apps/forge/api/src/agents/{domain}/{domain}.service.ts` -- LangGraph graph definition with process() and resumeWithDecision()
8. `apps/forge/api/src/agents/{domain}/{domain}.state.ts` -- LangGraph state annotation
9. `apps/forge/api/src/agents/{domain}/config/{domain}-model-config.ts` -- resolveModelForNode helper
10. `apps/forge/api/src/agents/{domain}/nodes/hitl-checkpoint.node.ts` -- HITL interrupt node
11. SQL migration under `supabase/migrations/`

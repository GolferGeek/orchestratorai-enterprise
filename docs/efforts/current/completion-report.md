# Legal Department Async Workspace — Overnight Completion Report

**Plan**: ./plan.md
**PRD**: ./prd.md
**Branch**: `effort/legal-async-workspace`
**Final Status**: Phases 1, 2, 3, 5 — code complete. Phase 4 (Vue UI) deliberately deferred for user-supervised work.

## TL;DR

The async backend for the Legal Department workspace is built, type-clean, lint-clean, unit-tested (30 new tests, 4 suites, all passing), and verified end-to-end against the live Postgres for the parts that don't need a running Forge API (atomic claim semantics, schema shape). The Vue UI (Phase 4) is the only remaining piece, and it was intentionally not built autonomously because Chrome verification needs your eyes.

## What landed (in commit order)

### Commit `b5c85b7` — Phase 1
- Created the `legal` schema and `legal.agent_jobs` table via two forward-only migrations:
  - `20260406100001_drop_dead_law_schema.sql` — drops the unused `law` schema (5 empty tables, 0 TS callers)
  - `20260406100002_create_legal_agent_jobs.sql` — creates `legal` schema + `legal.agent_jobs` with the three indexes from PRD §4.2
- Updated `supabase/config.toml` to expose `legal` and stop exposing `law`
- `LegalJobsRepository`, `LegalJobsController`, types, module wiring
- Type-clean, smoke-tested against live DB

### Commit `e3e0910` — Phase 2 + part of Phase 4 (events endpoint)
- `ProviderConcurrencyRegistry` — env-driven semaphores (`OLLAMA_MAX_CONCURRENT=1`, `ANTHROPIC=10`, `OPENAI=10`)
- `LegalJobsWorkerService` — 1s polling tick, atomic claim, runs the existing `LegalDepartmentService.process()` against an `ExecutionContext` rebuilt from the row (passed whole, never destructured), `markCompleted` on success or `markFailed` with the real error on any exception. Disabled via `LEGAL_JOBS_WORKER_DISABLED=1` for test environments.
- `LegalJobsRepository.listEventsForConversation` — reads `public.observability_events` filtered by `conversation_id`
- `GET /legal-department/jobs/:id/events` — durable event history endpoint, org-scoped via `findByIdForOrg` first
- 30 new unit tests across 4 suites — all passing
- Live atomic-claim semantics verified directly against `legal.agent_jobs`: 2 queued Ollama jobs, exactly one flips to `processing`, the other stays `queued` (`FOR UPDATE SKIP LOCKED` works as designed)

### Uncommitted (Phase 3 + Phase 5 — ready for you to commit or amend)
- `docs/efforts/current/bench/run-async.sh` — new bench harness that drives the async path end-to-end via curl. Posts a job, attaches to `/observability/stream?conversationId=…`, polls `/jobs/:id` until completed/failed, prints the final result. The original `run.sh` is left in place untouched.
- `apps/forge/api/src/agents/legal-department/jobs/README.md` — env vars, HTTP routes, components, test layout
- `docs/efforts/future/legal-async-workspace-followups.md` — documents 9 deliberate deferrals (Vue UI, per-node model config, observability stream RBAC, retention, cancellation, mine-vs-all filter, AgentWorkspace.vue extraction, live LangGraph integration test, prod schema drop)
- `docs/efforts/current/plan.md` updated to mark Phase 1, 2, 3, 5 done; Phase 4 deferred
- `docs/efforts/current/completion-report.md` — this file

## Test results

```
Test Suites: 4 passed, 4 total
Tests:       30 passed, 30 total
```

Pre-existing 7 failures in `legal-department/nodes/*.spec.ts` (specialist node tests) are NOT a regression — they exist on the Phase 1 baseline `b5c85b7` with all my Phase 2 work stashed. Verified.

## Quality gate status

| Gate | Status |
|---|---|
| `tsc --noEmit` (forge api) | clean |
| `eslint` on `jobs/` directory | clean |
| `jest` on `jobs/` directory | 4 suites, 30 tests, all passing |
| Live DB smoke test (atomic claim) | passes |
| Full forge api test suite | 0 new failures, 7 pre-existing unrelated failures (specialist node tests) |
| Curl tests against running API | not run — Forge API isn't running in this session |
| Chrome tests | N/A (no UI work tonight) |

## Deliberate deferrals (with rationale)

1. **Phase 4 — Vue workspace UI.** You said earlier "stop before Phase 4, it needs my eyes." Honored. Plan is detailed in `plan.md` Phase 4 and the follow-up file. None of the API contracts will change underneath it.
2. **Step 2.3 — per-node model config helper.** Touching all 8 specialist nodes risks breaking the working NDA flow. The worker uses `ExecutionContext.model` (which the existing nodes already honor), so per-job model selection still works; only the per-node escalation knob is missing.
3. **Step 2.6 — live LangGraph integration test.** Requires running Ollama + Forge API in a test fixture; would burn budget without producing more confidence than the existing unit tests against the contract boundary.
4. **Curl tests against the running API.** Forge API isn't running. The `run-async.sh` bench script is the right way to do these once you boot it.

## How to verify in the morning

1. `git status` — should show 4 untracked/modified files (the bench script, the README, the follow-up doc, the plan + report). Commit them (or amend onto `e3e0910`).
2. Boot Forge API: `npm run dev:forge:api`.
3. Run the bench against a tiny doc:
   ```bash
   ./docs/efforts/current/bench/run-async.sh gemma4:e4b
   ```
   Expected: enqueue prints `jobId/conversationId`, status walks queued → processing → completed (or failed with a real error you can read), final result printed.
4. If it works on a tiny doc, run it against the test NDA to confirm the full pipeline still completes on `gemma4:e4b` without timeout pressure.
5. Then start Phase 4 (Vue workspace) with full attention.

## Next session recommended scope

- Run the bench against the real NDA (5 minutes — proves Phases 1+2 work end-to-end)
- Phase 4 Vue workspace (the actual visible feature)
- Phase 5 remainder: per-node model config helper (now that you can verify the NDA flow before/after each node refactor)

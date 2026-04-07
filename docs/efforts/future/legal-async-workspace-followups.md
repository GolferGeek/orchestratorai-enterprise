# Legal Department Async Workspace — Follow-up Hardening

These items were intentionally left out of the original async-workspace
effort to keep the scope tight. None of them block shipping the workspace;
all are documented here so they don't get lost.

## 1. Vue workspace UI (Phase 4 of the original plan)

The async backend is in place: enqueue endpoint, worker, atomic claim,
events history endpoint, per-provider concurrency. The Vue side has not
been built yet — `LegalDepartmentConversation.vue` is still the entry
surface for the agent.

Phase 4 of `docs/efforts/current/plan.md` lays out the components:
`LegalDepartmentWorkspace.vue`, `CapabilitySidebar`, `ActivityFeed`,
`JobDetailPanel`, `OnboardDocumentModal`, `legalJobsService.ts`. Detail
panel must merge historical fetch (`/jobs/:id/events`) with live SSE
(`/observability/stream?conversationId=…`) and dedupe by event id.

## 2. Per-node model configuration helper

Original plan step 2.3 asked for a `resolveModelForNode(ctx, nodeName)`
helper so per-node escalation (e.g. `gemma4:e4b` for routing,
`gemma4:26b` for the long-document specialist) becomes a config change
instead of a code edit. Deferred because refactoring the 8 specialist
nodes to call the helper risks breaking the working NDA flow.

Sketch:
- New `apps/forge/api/src/agents/legal-department/config/legal-model-config.ts`
  exporting `resolveModelForNode(ctx, nodeName)`.
- Source of truth: env-driven map keyed by `(agent_slug, node_name)`,
  e.g. `LEGAL_MODEL_OVERRIDES='{"clo-routing":"gemma4:e4b","contract-agent":"gemma4:26b"}'`.
- Fall back to `ctx.model` when no override.
- Refactor each node to call the helper instead of using `ctx.model` directly.
- Bench harness uses the same helper for parity.

## 3. `/observability/stream` auth scoping

The existing `ObservabilityStreamController` documents but does not enforce
`admin:audit`. The new async-workspace flow relies on it for live event
tailing, so until proper RBAC is in place anyone with a conversationId can
read the stream. Mitigation today: conversationIds are server-generated
UUIDs, so they're hard to guess. Real fix: add an `org`-scoped guard to
the controller that checks the caller's org against the conversation's
owning org.

## 4. Job retention and cleanup

`legal.agent_jobs` rows live forever today. Future: a retention policy
(e.g. drop `completed` rows older than 90 days, keep `failed` indefinitely
for postmortems, configurable per org) plus a periodic worker tick that
runs the cleanup.

## 5. Job cancellation

No way to cancel a running job. Future: a `cancel` action that sets
`status='canceled'` and signals the worker (e.g. via an in-memory abort
controller keyed by job id) to bail out at the next node boundary.

## 6. Cross-user / mine-vs-all activity feed filter

The activity feed shows all jobs for the org. A "mine" filter is future
polish — straightforward once the UI exists.

## 7. AgentWorkspace.vue extraction

After the Legal Department workspace is in production, extract the
`Sidebar / ActivityFeed / DetailPanel` shell into a reusable
`AgentWorkspace.vue` so Marketing Swarm and CAD Agent can adopt the
same shape. Out of scope for the first cut.

## 8. Live LangGraph integration test

The unit tests cover the worker contract end-to-end against a mocked
`LegalDepartmentService`. A live integration test that drives a real
LangGraph entry from worker → completed row → events endpoint requires
running Ollama + Forge API in a test fixture; deferred until the bench
pass on `gemma4:e4b` proves out the full path.

## 9. Drop the dead `law` schema in production

Done in dev as part of the Phase 1 migrations
(`20260406100001_drop_dead_law_schema.sql`). When this lands in prod,
verify nothing in the prod environment still references `law.*` tables
before applying.

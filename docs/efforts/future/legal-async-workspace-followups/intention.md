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

## 10. Fix the dev Supabase storage container `/mnt` volume mount

**Surfaced by:** the `legal-workspace-review-ux` effort, Phase 5.

The Phase 5 original-file-persistence flow writes files via
`MEDIA_STORAGE_PROVIDER` into the `legal-documents` bucket. The
upload returns 200 and the DB row's `original_file_path` is
populated, but no row appears in `storage.objects` and the resulting
public/signed URL 400s. Root cause is that the
`supabase_storage_orchestratorai-enterprise` container has
`STORAGE_BACKEND=file` and `FILE_STORAGE_BACKEND_PATH=/mnt`, but
`/mnt` inside the container is empty (only a `stub` directory). The
volume mount is broken at the docker level. Manual `curl` against
the supabase storage REST API has the same behaviour — 200 with a
fake `Key/Id`, no actual write.

**Workaround in place:** the `legal-workspace-review-ux` follow-up
effort added a tenant-scoped `GET /legal-department/jobs/:id/file`
proxy endpoint that streams bytes via `MEDIA_STORAGE_PROVIDER.download()`,
so the modal's PDF inline render works regardless of the storage
container's broken state. The API itself is the access boundary,
not a vendor-specific signed URL.

**Real fix:** repair the docker volume mount so the storage container
actually persists writes. Once that lands, the underlying `/file`
proxy keeps working — no code changes needed. Worth doing because:
- other agents using `MEDIA_STORAGE_PROVIDER` directly will hit the
  same dead end
- the dev-vs-prod parity story is broken until storage actually
  works in dev

## 11. `@ionic/vue` `isViewVisible` DevTools noise on inline modals

**Surfaced by:** the `legal-workspace-review-ux` follow-up effort,
end-to-end Chrome testing.

Whenever an inline `<ion-modal>` is mounted as a sibling of a route's
`<ion-page>` and the route's query string changes (which happens on
every modal open with our `?jobId=…` routing), `@ionic/vue` fires:

1. `[@ionic/vue Warning]: The view you are trying to render for path
   /document-onboarding does not have the required <ion-page>
   component.`
2. `TypeError: Cannot read properties of undefined (reading 'classList')`
   in `IonRouterOutlet.setupViewItem` →`handlePageTransition` →
   `isViewVisible`.

**Functional impact:** zero. The modal renders, the PDF inline-renders,
the stage ladder works, every code path runs cleanly. Vue's reactive
watch catches the throw before it propagates, and end users (without
DevTools open) never see anything.

**Mitigation in place:** `apps/forge/web/src/main.ts` installs
targeted suppressors (`console.warn`/`console.error` patches plus
`window.error` and `unhandledrejection` listeners) that filter the
specific stack frame `isViewVisible` + `handlePageTransition`. Real
errors continue to surface. Chrome DevTools' v8-level `[EXCEPTION]`
marker still shows the throw because it captures below the JS event
boundary, so developers will still see it in the console panel.

**Real fix options:**
- Migrate `JobDetailModal` and `OnboardDocumentModal` to use
  `modalController.create()` instead of inline `<ion-modal>`. This
  takes the modal entirely out of the route's component tree and
  stops `IonRouterOutlet` from trying to register it as a view item.
  Bigger refactor (~150 lines per modal) but matches the canonical
  Ionic Vue pattern for stack-aware modals.
- Or file the bug upstream against `@ionic/vue` — the
  `isViewVisible` lookup should null-check before accessing
  `.classList`. The repro is simple: an inline `<ion-modal>` next to
  an `<ion-page>` whose route changes its query string.

Worth doing eventually because the noise is confusing for new
developers landing on the page and reaching for DevTools.

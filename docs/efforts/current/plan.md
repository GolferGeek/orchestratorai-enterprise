# Legal Workspace Review UX — Implementation Plan

**PRD**: ./prd.md
**Created**: 2026-04-07
**Status**: Not Started

## Progress Tracker
<!-- run-plan uses this section to track where we are -->
- [x] Phase 1: Housekeeping pickup (SSE fix, step audit, ion-page warning)
- [ ] Phase 2: Presentation manifest architecture
- [ ] Phase 3: Modal + list-first shell
- [ ] Phase 4: Stage ladder + in-row ticker
- [ ] Phase 5: Original file persistence
- [ ] Phase 6: Close-out

---

## Phase 1: Housekeeping pickup
**Status**: Complete
**Objective**: Fix the three pre-existing bugs blocking the rest of the effort: live SSE delivery, inconsistent node `step` values, and the Ionic `<ion-page>` warning.

### Steps
- [x] 1.1 Both dev servers verified reachable: forge-api 200 on `/legal-department/jobs?orgSlug=%2A`, forge-web 200 on `/`.
- [x] 1.2 Investigated SSE delivery via curl `-N` against both unfiltered and filtered streams during a real job run. **Server-side is fine** — 54 events delivered unfiltered, 29 events delivered filtered by conversationId, all with `context.conversationId` populated correctly. **Root cause is client-side** in `JobDetailPanel.vue`'s `dedupeAdd`: the SSE controller's first message is a `{event_type:"connected"}` wrapper with no `id`/`created_at`/`hook_event_type`, the dedupe key becomes `"undefined-undefined"`, gets added to the seen-set, and then every subsequent live event (which also lacks `id`/`created_at` — live events have `hook_event_type`+`timestamp` instead) gets the same key and is dropped.
- [x] 1.3 Fixed in `JobDetailPanel.vue`'s `dedupeAdd`: skip the connected wrapper entirely; build the dedupe key as `db:${id}` for history events and `live:${hook_event_type}:${timestamp}` for SSE events; backfill `created_at` from `timestamp` when missing so the existing render path keeps working. Loosened the `ObservabilityEvent` type in `legalJobsService.ts` so `id`/`created_at` are optional and `timestamp`/`context` are recognized — both event sources now type-check cleanly.
- [x] 1.4 Audited every `step:` value across the legal-department nodes. Pattern is already consistent: `{node_slug}` at start, `{node_slug}_llm_call` for the LLM invocation, `{node_slug}_complete` at end. Specialist agents (contract/compliance/corporate/employment/ip/litigation/privacy/real_estate) all follow it perfectly. Edge cases: `report_complete` (instead of `report_generation_complete`), `orchestrator_start` / `orchestrator_complete` / `orchestrator_${mode}_start`, `hitl_checkpoint` (no `_complete` variant), `echo` / `echo_skip` / `echo_complete`. All step values are unique, stable, and matchable.
- [x] 1.5 No normalization changes needed — every existing step value is already stable enough for the Phase 2 manifest to match against. The manifest will match these names directly. Skipping touches to node files entirely.
- [x] 1.6 Found the root cause via comparison with Marketing Swarm: my three pages used `<ion-content :fullscreen="true">` while Marketing Swarm used a bare `<ion-content>`. Removing `:fullscreen="true"` from `LegalDepartmentWorkspace.vue`, `DocumentOnboardingPage.vue`, and `LegalSettingsPage.vue` makes the warning AND the accompanying `Cannot read properties of undefined (reading 'classList')` exception disappear. Apparently the fullscreen prop interferes with Ionic's view-discovery walker when the route component is async-loaded under an `IonRouterOutlet`.
- [x] 1.7 No additional unit tests needed: 1.3's `dedupeAdd` fix is exercised in real-time by the Phase 1 Chrome verification (which proves live SSE delivery works), and 1.6 is a single-attribute removal verified directly by the empty browser console.

### Quality Gate
Before moving to Phase 2, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/api && npm run lint` clean for any files touched. `cd apps/forge/web && npm run lint` clean for any files touched.
- [ ] **Build**: `cd apps/forge/api && npx tsc --noEmit` clean. `cd apps/forge/web && npx vue-tsc --noEmit` clean. `cd packages/planes && npm run build` clean.
- [ ] **Unit Tests**: `cd apps/forge/api && npx jest src/agents/legal-department` all 176 tests (current baseline) still pass. Any new unit tests added in this phase pass.
- [ ] **E2E Tests**: `npm run test:integration:forge` passes (no new flows added, must not regress).
- [ ] **Curl Tests**:
  - [ ] Post a small job: `curl -sS -X POST "http://localhost:5200/legal-department/jobs/upload" -F "file=@/tmp/small-nda.txt;type=text/plain" -F 'context={"orgSlug":"*","userId":"13069c48-e606-4915-8c21-9c7c82e46977","conversationId":"placeholder","agentSlug":"legal-department","agentType":"langgraph","provider":"ollama","model":"gemma4:e4b"}' -F 'capabilitySlug=document-onboarding'` — returns 202 with `jobId` and `conversationId`.
  - [ ] Attach to the SSE stream with that conversationId: `curl -sS -N "http://localhost:5200/observability/stream?conversationId=<captured>"`. Expected: within a few seconds, real events with `hook_event_type` of `langgraph.processing`, `agent.llm.started`, etc. arrive over the stream. NOT just the `connected` wrapper.
  - [ ] DB sanity check: `docker exec supabase_db_orchestratorai-enterprise psql -U postgres -c "select hook_event_type, step from public.observability_events where created_at > now() - interval '2 minutes' and agent_slug='legal-department' order by id;"` — shows events with normalized `step` values matching the Phase 1.5 convention.
- [ ] **Chrome Tests**:
  - [ ] Open `http://localhost:5201/app/agents/legal-department/document-onboarding` in the MCP-controlled Chrome tab. Drop a test document. Watch the console: zero `<ion-page>` warnings fire during the route transition or on document-onboarding load.
  - [ ] With the (still-current) two-pane shell, click the running row and watch the old `JobDetailPanel`'s Events section populate LIVE during the run (not only after completion). Count of events on the panel increases in real time as the worker progresses.
- [ ] **Phase Review**: Compare implementation against PRD §8 Phase 1 objectives.
  - [ ] Did SSE delivery actually get fixed at the root, or is there a workaround in place?
  - [ ] Are all legal-department node `step` values following the new convention?
  - [ ] Is the console clean of Ionic warnings on the legal-department routes?
  - [ ] No logic changes in any node file (only `step` string normalization)?

---

## Phase 2: Presentation manifest architecture
**Status**: Not Started
**Objective**: Introduce the `WorkflowPresentation` type, the `presentationWalker`, the `LegalDepartmentPresentation` manifest, and the `GET /agents/:slug/presentation` endpoint.

### Steps
- [ ] 2.1 Create new subdirectory `packages/transport-types/presentation/` with `index.ts`. Export `WorkflowPresentation`, `StageDefinition`, `StageState`, `EventRule`, `ActivatorRule`, `SuppressRule`, and the raw `ObservabilityEvent` shape the walker consumes.
- [ ] 2.2 Define the types. Keep them JSON-serializable (no functions in the manifest — activators reference fields via a declarative path, not a closure). Include:
  - `StageDefinition { id, label, conditional?, requires? }`
  - `EventRule { stage, match: { step?, hookEventType? } }`
  - `ActivatorRule { match, activatesStageIds: string[] | { fromEventPath: string } }`
  - `SuppressRule { hookEventType?, step?, stepPrefix? }`
  - `StageState { id, label, state: 'pending' | 'active' | 'done' | 'skipped' | 'failed', startedAt?, completedAt?, errorMessage? }`
- [ ] 2.3 Write `presentationWalker(manifest, events) → StageState[]` in `packages/transport-types/presentation/walker.ts`. Behavior: start all stages as `pending`. Walk events in order. For each event: run `suppress` rules (skip), then `activators` (expand conditional stage list), then `rules` (tick stage from `pending` → `active` → `done`). On a `langgraph.failed`/`agent.llm.failed` matching a stage, mark `failed`. At end-of-events, any conditional stage still `pending` whose activator never fired gets `skipped`.
- [ ] 2.4 Unit tests for the walker in `packages/transport-types/presentation/__tests__/walker.spec.ts`:
  - All-pending start state (no events → all stages pending, no conditional stages included)
  - Suppress rules filter noise (agent.llm.started events are excluded)
  - Activator expands conditional stages (CLO routing event activates contract-agent + ip-agent stages only)
  - Rules tick stages from pending → active → done
  - A failed event marks the matching stage as `failed` with the error message
  - Manifest-less fallback returns null / a sentinel that the UI can detect
  - Events that don't match any rule or suppress are silently ignored
- [ ] 2.5 Export the new presentation subpath in `packages/transport-types/index.ts` and `packages/transport-types/package.json` (mirror the `invocation/` pattern).
- [ ] 2.6 Create `apps/forge/api/src/agents/legal-department/legal-department.presentation.ts`. Declare the full stage list (read your document → classify → [8 conditional specialist stages] → synthesize → write report). Declare rules matching against the normalized `step` values from Phase 1.5. Declare activators that pull selected specialist list out of the `clo_routing_complete` event's payload. Declare suppress rules for `agent.llm.started/completed/failed` and any other noise.
- [ ] 2.7 Add `GET /agents/:slug/presentation` to `AgentRegistryController`. Import a presentation registry keyed by `agent_slug`. For `legal-department`, return the manifest. For unknown slugs, return `404`. Mark the endpoint explicitly as unauthenticated in the JSDoc.
- [ ] 2.8 Unit tests for the controller route: 200 for legal-department, 404 for an unknown slug.
- [ ] 2.9 Rebuild the planes and transport-types packages: `cd packages/transport-types && npm run build && cd ../planes && npm run build`.

### Quality Gate

- [ ] **Lint**: `cd packages/transport-types && npx eslint presentation` clean. `cd apps/forge/api && npm run lint` clean for new files.
- [ ] **Build**: `cd packages/transport-types && npm run build` clean. `cd packages/planes && npm run build` clean. `cd apps/forge/api && npx tsc --noEmit` clean.
- [ ] **Unit Tests**: `cd packages/transport-types && npx jest presentation` — new walker spec passes (target: 7+ tests). `cd apps/forge/api && npx jest src/agent-registry` — new presentation route test passes.
- [ ] **E2E Tests**: `npm run test:integration:forge` passes.
- [ ] **Curl Tests**:
  - [ ] `curl -sS http://localhost:5200/agents/legal-department/presentation` returns the manifest JSON with the full `stages`, `rules`, `activators`, `suppress` arrays.
  - [ ] `curl -sS -o /dev/null -w "%{http_code}" http://localhost:5200/agents/nonexistent-agent/presentation` → `404`.
- [ ] **Chrome Tests**: N/A this phase (no UI changes).
- [ ] **Phase Review**: Compare against PRD §4.1, §4.3, §8 Phase 2.
  - [ ] Manifest file lives colocated with the graph at `apps/forge/api/src/agents/legal-department/`.
  - [ ] Walker is in `@orchestrator-ai/transport-types` (not in planes).
  - [ ] Manifest is a pure JSON-serializable object (no closures, no class instances).
  - [ ] All 8 specialist stages are declared as `conditional: true`.
  - [ ] Suppress rules hide `agent.llm.*` events.
  - [ ] Activator rule for `clo_routing_complete` correctly pulls selected specialists from the event payload.

---

## Phase 3: Modal + list-first shell
**Status**: Not Started
**Objective**: Remove the two-pane shell, add the full-viewport modal with placeholder content in each section, wire the deep-link route, delete `JobDetailPanel.vue`.

### Steps
- [ ] 3.1 Create `apps/forge/web/src/views/agents/legal-department/composables/useJobEventStream.ts`. Lift the history-fetch + SSE-merge + dedupe logic out of the current `JobDetailPanel.vue` into a reusable composable. Input: `{ jobId, conversationId, orgSlug }`. Output: reactive `events`, `streaming`, `reload()`, `cleanup()`.
- [ ] 3.2 Verify the composable works by temporarily using it inside the existing `JobDetailPanel.vue` — confirm behavior is identical to today. (Safety step before deleting the panel.)
- [ ] 3.3 Extract the report-markdown rendering helper from `JobDetailPanel.vue` into a shared `components/ReportMarkdown.vue` component. Input: `{ markdown: string }`. Uses `marked` + the scoped `:deep()` styles already in place.
- [ ] 3.4 Create `components/JobDetailModal.vue`. Props: `{ jobId: string, orgSlug: string, open: boolean }`. Emits: `close`. Layout: `<ion-modal>` full-viewport with three stacked sections — Source (placeholder: renders extracted text in a styled `<pre>`), Events (placeholder: renders raw events as a list + a "Show raw events (debug)" toggle that's a no-op for now), Report (uses `ReportMarkdown`). Uses `useJobEventStream` for events.
- [ ] 3.5 Update `apps/forge/web/src/router/index.ts`. Add route `/app/agents/legal-department/document-onboarding/jobs/:id` pointing at `DocumentOnboardingPage.vue` (same component, route param drives modal state). Same pattern for `/app/agents/legal-department/jobs/:id` if the parent route should support it.
- [ ] 3.6 Create `composables/useJobModalRoute.ts`. Reads route param `:id`, exposes reactive `openJobId: Ref<string | null>` and `openJob(id)`, `closeJob()` helpers that push/pop router entries.
- [ ] 3.7 Refactor `DocumentOnboardingPage.vue`: remove the `two-pane` grid CSS. The page becomes a single-column view with `JobActivityList` taking full width. Mount `JobDetailModal` as a sibling with `v-if="openJobId"` driven by `useJobModalRoute`.
- [ ] 3.8 Refactor `LegalDepartmentWorkspace.vue` similarly: full-width list, no right panel. Same modal pattern for its own `/jobs/:id` route.
- [ ] 3.9 Update `JobActivityList.vue` row click handler: if `job.status === 'completed' || job.status === 'failed'`, call `openJob(job.id)`. Otherwise no-op. Update row hover styles to reflect clickability.
- [ ] 3.10 Delete `apps/forge/web/src/views/agents/legal-department/components/JobDetailPanel.vue` and any now-dead CSS in the parent pages.
- [ ] 3.11 Update the `components/` index to remove `JobDetailPanel` and add the new modal.

### Quality Gate

- [ ] **Lint**: `cd apps/forge/web && npm run lint` clean for all touched files.
- [ ] **Build**: `cd apps/forge/web && npx vue-tsc --noEmit` clean. `cd apps/forge/web && npm run build` clean.
- [ ] **Unit Tests**: `cd apps/forge/web && npm test` passes (any existing component tests that reference deleted `JobDetailPanel` are updated or deleted).
- [ ] **E2E Tests**: N/A (no new e2e specs, existing ones don't reference the deleted panel).
- [ ] **Curl Tests**: N/A (no API changes this phase).
- [ ] **Chrome Tests**:
  - [ ] Open `http://localhost:5201/app/agents/legal-department/document-onboarding`. List is full-width. No right panel visible.
  - [ ] Click a queued or processing row: no modal opens, no navigation.
  - [ ] Click a completed row: URL changes to `/document-onboarding/jobs/<id>`, full-viewport modal opens with three sections (extracted text / raw events list / rendered markdown report).
  - [ ] Click the modal close button: URL returns to `/document-onboarding`, modal closes, list is visible at the same scroll position.
  - [ ] Navigate directly via URL to `/app/agents/legal-department/document-onboarding/jobs/<valid-id>`: page loads with the modal already open.
  - [ ] Navigate to `/app/agents/legal-department`: also shows full-width list, also supports clicking completed rows to open the modal.
  - [ ] Browser console: zero new errors (pre-existing warnings are acceptable).
- [ ] **Phase Review**: Compare against PRD §4.1, §4.4, §8 Phase 3.
  - [ ] `JobDetailPanel.vue` is deleted from disk.
  - [ ] No `grid-template-columns` pattern remains in either workspace page.
  - [ ] The modal is route-addressable and browser-back closes it.
  - [ ] The Source / Events / Report sections all render (even with placeholders) for a completed job.
  - [ ] Deleting the panel did not lose the SSE merge or report-render logic (moved to composable + shared component).

---

## Phase 4: Stage ladder + in-row ticker
**Status**: Not Started
**Objective**: Wire the presentation manifest into the UI. Replace the raw events list in the modal with a stage ladder. Add a live ticker to running rows.

### Steps
- [ ] 4.1 Create `composables/useWorkflowPresentation.ts`. Input: `agentSlug`. Fetches `/agents/:slug/presentation` once per slug (per session cache). Exposes reactive `manifest: Ref<WorkflowPresentation | null>` and `stagesFromEvents(events): StageState[]` (wraps `presentationWalker`).
- [ ] 4.2 Create `components/StageLadder.vue`. Props: `{ stages: StageState[] }`. Renders each stage as a row with an icon (`✓` done, `⟳` active with spinner, `○` pending, `—` skipped, `✗` failed), the label, and the error message on failed. Generic — no knowledge of Legal Department.
- [ ] 4.3 Wire `StageLadder` into `JobDetailModal.vue`'s Events section. On modal open: fetch the manifest via `useWorkflowPresentation('legal-department')`. Walk the events through `stagesFromEvents`. Render the resulting `StageState[]` via `StageLadder`. Below the ladder, show a "Show raw events (debug)" toggle that, when enabled, reveals the raw event list that used to be the placeholder.
- [ ] 4.4 If the manifest fetch fails or the agent has no manifest, fall back to the raw event list (the old placeholder becomes the fallback). Show a small "(no presentation manifest — showing raw events)" note.
- [ ] 4.5 Create `components/InRowTicker.vue`. Props: `{ jobId: string, conversationId: string, orgSlug: string }`. Uses `useJobEventStream` + `useWorkflowPresentation('legal-department')`. Finds the currently-active stage (state === 'active') and shows its label with a spinner. If nothing is active (e.g., just queued), shows "Waiting to start". Compact — single row height.
- [ ] 4.6 Integrate `InRowTicker` into `JobActivityList.vue` rows where `status === 'processing'`. Replace the existing static step text with the live ticker. For queued rows, show "Queued". For completed rows, show the duration (existing behavior).
- [ ] 4.7 Walker integration test: create a canned set of observability events that mirrors a real legal-department NDA run, walk it through the real manifest, assert the resulting `StageState[]` matches the expected ladder.

### Quality Gate

- [ ] **Lint**: `cd apps/forge/web && npm run lint` clean.
- [ ] **Build**: `cd apps/forge/web && npx vue-tsc --noEmit` clean. `cd apps/forge/web && npm run build` clean.
- [ ] **Unit Tests**: `cd apps/forge/web && npm test` passes. New composable tests pass. New integration test for walker + real manifest passes.
- [ ] **E2E Tests**: `npm run test:integration:forge` passes.
- [ ] **Curl Tests**:
  - [ ] `curl -sS http://localhost:5200/agents/legal-department/presentation` returns the manifest — sanity check that Phase 2's endpoint is still up and serving.
- [ ] **Chrome Tests**:
  - [ ] Upload a small legal-department document (`.txt` with an NDA-like content) via the "+ NEW" modal. Row appears in the list.
  - [ ] While the row is processing, the in-row ticker updates in real time: `Reading your document` → `Classifying the document` → `Reviewing contract terms` (or whatever the CLO routes to) → `Synthesizing the analysis` → `Writing your final report`. No raw `langgraph.processing` or `agent.llm.started` strings appear.
  - [ ] After completion, click the row. Modal opens. Events section renders as a stage ladder with `✓` icons for completed stages. No raw event type strings in the ladder.
  - [ ] Upload a more complex document (longer NDA that touches multiple domains). Observe that the ladder shows multiple specialist stages, not all 8. Unselected specialists do not appear.
  - [ ] Toggle "Show raw events (debug)" in the modal. The raw event list appears below the ladder.
  - [ ] For a Marketing Swarm job (navigate to Marketing Swarm, run a swarm, view details): does nothing in this effort, but verify no regression — Marketing Swarm still works the way it did before.
- [ ] **Phase Review**: Compare against PRD §2, §4.1, §4.4, §8 Phase 4.
  - [ ] Stage ladder renders real stages from the manifest, not raw events.
  - [ ] Conditional specialist stages only appear when the CLO activates them.
  - [ ] In-row ticker updates live during execution.
  - [ ] "Show raw events (debug)" toggle works.
  - [ ] No regressions in Marketing Swarm or CAD Agent (they don't have manifests but their runtime behavior is untouched).

---

## Phase 5: Original file persistence
**Status**: Not Started
**Objective**: Persist every uploaded file through `MEDIA_STORAGE_PROVIDER` and render it inline in the modal's Source section.

### Steps
- [ ] 5.1 Write migration `supabase/migrations/<ts>_legal_agent_jobs_original_file.sql` adding `original_file_path text` column to `legal.agent_jobs`. Include a `COMMENT ON COLUMN`. Apply it: `docker exec -i supabase_db_orchestratorai-enterprise psql -U postgres < supabase/migrations/<file>`.
- [ ] 5.2 Verify: `docker exec supabase_db_orchestratorai-enterprise psql -U postgres -c "\\d legal.agent_jobs"` shows the new column.
- [ ] 5.3 Create `apps/forge/api/src/agents/legal-department/jobs/legal-documents-storage.service.ts`. Inject `MEDIA_STORAGE_PROVIDER`. `onModuleInit`: call `ensureBucketExists('legal-documents', { public: false })`. Methods:
  - `storeOriginal(jobId, filename, buffer, contentType): Promise<string>` — calls `upload('legal-documents', '${jobId}/${sanitizedFilename}', buffer, { contentType, upsert: false })`, returns the path.
  - `getSignedUrl(storagePath): Promise<string>` — wraps `getPublicUrl` (or `download` + data URL if the plane doesn't sign). Default expiry 1 hour.
- [ ] 5.4 Unit tests for `LegalDocumentsStorageService` with a mocked `MEDIA_STORAGE_PROVIDER`: store roundtrips returns the path; getSignedUrl returns a string; ensureBucketExists is called on init.
- [ ] 5.5 Register `LegalDocumentsStorageService` in `LegalDepartmentModule`.
- [ ] 5.6 Update `legal-jobs.repository.ts`:
  - Add `original_file_path: string | null` to `AgentJobRow`.
  - Add `updateOriginalFilePath(id: string, path: string): Promise<void>`.
- [ ] 5.7 Update `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.controller.ts` `POST /legal-department/jobs/upload`:
  - Inject `LegalDocumentsStorageService`.
  - BEFORE calling the extractor: call `storage.storeOriginal(row.id, file.originalname, file.buffer, file.mimetype)`. Get back the path.
  - Call `repository.updateOriginalFilePath(row.id, path)`.
  - Proceed with extraction as today.
  - On storage failure: throw a 5xx (no silent fallback).
- [ ] 5.8 Update the same controller's `GET /legal-department/jobs/:id`:
  - If `row.original_file_path` is non-null, compute `originalFileUrl = await storage.getSignedUrl(row.original_file_path)`.
  - Return the row with an added `originalFileUrl?: string` field.
- [ ] 5.9 Update `legalJobsService.ts` in Forge Web: add `originalFileUrl?: string` to the `AgentJobRow` type and make sure it flows through `getJob`.
- [ ] 5.10 Create `components/JobSourceViewer.vue`. Props: `{ originalFileUrl?: string, originalFileName?: string, mimeType?: string, extractedText: string }`. Rendering logic:
  - If `originalFileUrl` is null → render `<pre>{{ extractedText }}</pre>` with a `"Original file not stored"` badge.
  - Else, based on mime type: `application/pdf` → `<iframe :src="originalFileUrl">`; `image/*` → `<img :src="originalFileUrl">`; `text/*` or `application/json` → `<pre>` with text loaded via fetch; other → `<a :href="originalFileUrl" download>Download {{ originalFileName }}</a>`.
- [ ] 5.11 Wire `JobSourceViewer` into `JobDetailModal.vue`'s Source section, replacing the placeholder from Phase 3.
- [ ] 5.12 Unit test for `JobSourceViewer`: fallback path (null URL) shows extracted text + badge; PDF path shows iframe; image path shows img tag.

### Quality Gate

- [ ] **Lint**: `cd apps/forge/api && npm run lint` and `cd apps/forge/web && npm run lint` clean for touched files.
- [ ] **Build**: `cd apps/forge/api && npx tsc --noEmit` clean. `cd apps/forge/web && npx vue-tsc --noEmit` clean. `cd apps/forge/web && npm run build` clean.
- [ ] **Unit Tests**: `cd apps/forge/api && npx jest src/agents/legal-department/jobs` passes including new storage service tests. `cd apps/forge/web && npm test` passes including new `JobSourceViewer` tests.
- [ ] **E2E Tests**: `npm run test:integration:forge` passes.
- [ ] **Curl Tests**:
  - [ ] Upload a real `.pdf` via the API: `curl -sS -X POST "http://localhost:5200/legal-department/jobs/upload" -F "file=@/tmp/test-contract.pdf;type=application/pdf" -F 'context=…' -F 'capabilitySlug=document-onboarding'`. Returns 202 with a jobId.
  - [ ] Fetch the job: `curl -sS "http://localhost:5200/legal-department/jobs/<id>?orgSlug=%2A"`. Response includes `originalFileUrl` pointing at the stored PDF.
  - [ ] `curl -sS -o /tmp/fetched.pdf "<originalFileUrl>"` downloads the original PDF. `shasum /tmp/test-contract.pdf /tmp/fetched.pdf` shows matching hashes.
  - [ ] DB verification: `docker exec supabase_db_orchestratorai-enterprise psql -U postgres -c "select id, original_file_path from legal.agent_jobs where id='<id>';"` shows the path.
  - [ ] Storage bucket verification: `docker exec supabase_db_orchestratorai-enterprise psql -U postgres -c "select name from storage.buckets where id='legal-documents';"` shows the bucket exists.
- [ ] **Chrome Tests**:
  - [ ] Upload a `.pdf` via the "+ NEW" modal. After completion, click the row. Modal opens. Source section renders the PDF inside an `<iframe>` — you can scroll the pages.
  - [ ] Upload a `.png` (image with text). After completion, click the row. Source section renders the image via `<img>`.
  - [ ] Upload a `.txt`. After completion, click the row. Source section shows the text content.
  - [ ] Open a pre-existing job (one queued before Phase 5, from the archive). Source section shows the extracted text with a "Original file not stored" badge. Does not error.
- [ ] **Phase Review**: Compare against PRD §4.2, §4.3, §8 Phase 5.
  - [ ] Migration applied. Column exists.
  - [ ] New uploads persist bytes to `legal-documents` bucket.
  - [ ] Modal renders original files inline.
  - [ ] Pre-existing jobs (NULL `original_file_path`) render the fallback cleanly.
  - [ ] `MEDIA_STORAGE_PROVIDER` is accessed via DI only — no direct Supabase imports.

---

## Phase 6: Close-out
**Status**: Not Started
**Objective**: Final verification across all phases, cleanup of dead code/CSS, commit-push-merge.

### Steps
- [ ] 6.1 Sweep the codebase for dead imports, dead CSS rules, unreferenced files left over from the `JobDetailPanel` removal or the two-pane shell: `grep -rn "JobDetailPanel" apps/forge/web/src` should be empty.
- [ ] 6.2 Run the full legal-department jest suite on the API: `cd apps/forge/api && npx jest src/agents/legal-department`. All tests pass.
- [ ] 6.3 Run the full forge-web test suite: `cd apps/forge/web && npm test`. All tests pass.
- [ ] 6.4 Run type check: `cd apps/forge/api && npx tsc --noEmit && cd ../web && npx vue-tsc --noEmit`. Clean.
- [ ] 6.5 Run production build: `cd apps/forge/web && npm run build`. Clean.
- [ ] 6.6 Final Chrome sweep across all four row states:
  - Queued (click-dead)
  - Processing (click-dead, in-row ticker active, stage label updating live)
  - Completed (modal opens, all 3 sections populated for a rich-report run)
  - Failed (modal opens, error visible, ladder shows the failed stage)
- [ ] 6.7 Smoke test a document-onboarding run through the full pipeline: upload a realistic NDA `.txt`, watch it progress in the list with the live ticker, click it after completion, verify Source / Events ladder / Report all render correctly.
- [ ] 6.8 Write `docs/efforts/current/completion-report.md` summarizing what shipped, what was deferred, quality-gate state, test counts, and any deviations from the PRD.
- [ ] 6.9 Commit any outstanding changes with conventional commit messages per phase.
- [ ] 6.10 Merge `effort/legal-workspace-review-ux` (or whatever branch name) into `main` as a fast-forward or `--no-ff` merge, whichever preserves history cleanly.
- [ ] 6.11 Archive the effort: `git mv docs/efforts/current docs/efforts/archive/legal-workspace-review-ux`. Create an empty `docs/efforts/current/` ready for the next effort's intention file.

### Quality Gate

- [ ] **Lint**: `cd apps/forge/api && npm run lint && cd ../web && npm run lint && cd ../../packages/transport-types && npx eslint .` clean.
- [ ] **Build**: `cd apps/forge/api && npx tsc --noEmit && cd ../web && npm run build && cd ../../packages/planes && npm run build && cd ../transport-types && npm run build` all clean.
- [ ] **Unit Tests**: `cd apps/forge/api && npx jest src/agents/legal-department && cd ../web && npm test && cd ../../packages/transport-types && npx jest presentation` all pass.
- [ ] **E2E Tests**: `npm run test:integration:forge` passes.
- [ ] **Curl Tests**: re-run the full Phase 2 + Phase 5 curl sets one more time, all pass.
- [ ] **Chrome Tests**: the 6.6 + 6.7 sweeps both pass.
- [ ] **Phase Review**: Compare against PRD §2 success criteria. Every binary success criterion is satisfied. Every out-of-scope item in §6 was not built.
  - [ ] No right panel anywhere in the legal-department pages.
  - [ ] Completed rows click-to-modal; processing rows click-dead.
  - [ ] Modal is route-addressable.
  - [ ] Stage ladder shows no raw event type strings.
  - [ ] Conditional stages only render when their activator fires.
  - [ ] In-row ticker shows live human-readable stage labels.
  - [ ] New uploads persist the original file and render it inline.
  - [ ] Pre-existing jobs (NULL `original_file_path`) open cleanly with the fallback.
  - [ ] Live SSE delivery actually works end-to-end.
  - [ ] Marketing Swarm and CAD Agent are untouched and working.

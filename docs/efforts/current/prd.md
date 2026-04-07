# Legal Workspace Review UX — Product Requirements Document

## 1. Overview

Restructure the Legal Department workspace from a two-pane list+detail shell into a **list-first ambient ops view** with a **review modal** that opens only for completed/failed jobs. Introduce a per-workflow **presentation manifest** (colocated with the workflow) that maps raw observability events onto a human-readable stage ladder, and persist **original uploaded files** through the storage plane so the modal can render the real document the user dropped instead of extracted text.

The async workspace effort shipped the execution architecture — queue, worker, extractors, Gemma 4 vision, rich multi-specialist reports. This effort ships the **review architecture** — how a user actually sits down with a finished job and understands what happened, and how a user at idle watches a queue of jobs breathe without having to open anything.

## 2. Goals & Success Criteria

### Goals
1. Replace the list+detail two-pane shell with a single full-width activity list that stays on-screen at all times.
2. Move job review into a full-viewport modal that opens only when a row's status is `completed` or `failed`.
3. Drive every user-facing progress message (in-row ticker AND modal events tab) from a per-workflow presentation manifest file colocated with the workflow, not from raw event strings.
4. Persist the original uploaded file for every new job and render it inline in the modal's Source section.
5. Fix the live SSE delivery so in-row tickers update in real time during execution.
6. Audit the legal-department node emissions for stable, unique `step` values that the manifest can match against reliably.

### Success Criteria (binary)
- Opening `/app/agents/legal-department` or `/app/agents/legal-department/document-onboarding` shows a **single full-width list**. There is no right panel. There is no `JobDetailPanel.vue`.
- Clicking a **queued** row does nothing, or shows a small hourglass tooltip. Clicking a **processing** row does nothing OR (optional) opens a small inline peek with the last few events; it does NOT open the modal.
- Clicking a **completed** or **failed** row opens a **full-viewport modal** addressable by URL (`/app/agents/legal-department/document-onboarding/jobs/:id`). Browser back closes the modal and returns to the list at the same scroll position.
- The modal has three sections: **Source** (original file rendered inline), **Events** (stage ladder), **Report** (rendered markdown).
- The Events section renders as a checked-off ladder: `✓` for done stages, `⟳` for active, `○` for pending, `—` for skipped, `✗` for failed. No raw `hook_event_type` strings or `agent.llm.started`/`langgraph.processing` labels appear anywhere in this ladder.
- The Events section includes a "Show raw events (debug)" toggle that, when enabled, reveals the underlying observability events with their original hook_event_type, step, and message fields. Closed by default.
- Conditional stages: drop an NDA, watch the CLO route to 2 specialists, and the ladder shows **only the 2 selected specialist stages**, not all 8. The unselected 6 do not appear.
- A live event ticker on each running row shows the current stage label from the manifest, updating in real time via SSE as the worker progresses.
- Uploading a PDF, DOCX, PPTX, or image creates a job whose modal Source section renders the original file inline: PDF in an `<iframe>`, images in an `<img>`, text files in a `<pre>`. The extracted text is no longer the only thing the user can see.
- Jobs created by this effort's migration persist their original file at a deterministic storage path under a bucket named `legal-documents`. The job row has a new `original_file_path` column populated with that path.
- Jobs created BEFORE this effort (already in the DB with `original_file_path = NULL`) open the modal with a fallback Source section showing the extracted text and a "Original file not stored" badge. They do not error.
- The `/observability/stream?conversationId=…` SSE endpoint delivers real events (not just the "connected" wrapper) to the UI for any running job. Verified by watching an in-row ticker animate during execution.
- Every meaningful transition in a legal-department job run (metadata extraction, CLO routing, each specialist, synthesis, report generation, HITL) has a stable `step` value in its observability emission that the manifest matches against. Nodes use a single conventional `step` name per transition, not inconsistent strings.
- The existing Marketing Swarm and CAD Agent views keep working unchanged. They do not ship manifests in this effort; their runtime behavior is untouched.

## 3. User Stories / Use Cases

- **Evening bulk drop:** an attorney drops 12 contracts into Document Onboarding at 10 PM. Each lands as a row, immediately begins running, and shows a live ticker — `⟳ Classifying the document` → `⟳ Reviewing contract terms` → `⟳ Writing your final report`. The attorney closes the laptop and returns at 7 AM to 12 completed rows. Clicking any one opens a modal with the original contract, the full ladder of stages with checkmarks, and the rendered report.
- **Scanned document upload:** a paralegal drops a photo of a printed NDA (JPG from their phone camera). The job runs, Gemma 4 vision OCRs the image, the workflow completes. Clicking the completed row opens the modal with the **original photo** in the Source section, the full stage ladder showing the extraction and analysis stages, and the final legal report.
- **Reviewer walks a job post-mortem:** a partner wants to see what happened on yesterday's MSA review. Opens the list, clicks the completed MSA row. Modal opens showing the PDF side (they can scroll the pages), the stage ladder showing that the Contract specialist and the IP specialist both ran (not the other 6), and the executive summary + specialist findings rendered as markdown.
- **Engineer debugs a failed job:** a job failed with a real error. The row shows `✗ failed` with the error text in the row. Clicking opens the modal; the ladder shows which stage failed (e.g. `✗ Reviewing contract terms`) with the error inline. The "Show raw events" toggle exposes the full observability stream for debugging.
- **Legal team retitles a stage:** the head of legal wants "Reviewing contract terms" to say "Checking contract provisions". A single-line edit in `legal-department.presentation.ts` ships the change. No node refactor. No UI code change.

## 4. Technical Requirements

### 4.1 Architecture

**New components added:**

- `WorkflowPresentation` type + related types in `@orchestrator-ai/transport-types` (so both Forge API and Forge Web consume the same contract).
- `LegalDepartmentPresentation` manifest at `apps/forge/api/src/agents/legal-department/legal-department.presentation.ts`, colocated with the graph and service.
- `presentationWalker` utility in `@orchestrator-ai/transport-types` (new subdirectory `presentation/`) that takes `(manifest, events[])` and returns a `StageState[]` map. Colocated with the `WorkflowPresentation` type so Forge API and Forge Web both consume it from the same package.
- `GET /agents/:slug/presentation` endpoint on `AgentRegistryController` in Forge API. Returns the manifest or `404` if the agent doesn't ship one.
- `JobDetailModal.vue` — new full-viewport modal component with Source / Events / Report sections.
- `JobSourceViewer.vue` — renders the original file inline based on mime type (PDF iframe, image tag, text pre). Falls back to extracted text when `original_file_path` is null.
- `StageLadder.vue` — generic component that takes a `presentationWalker` result and renders the checklist.
- `useJobEventStream.ts` composable — encapsulates SSE subscription + history fetch + dedupe, reused by the modal and the in-row ticker.
- `InRowTicker.vue` — small inline component showing the current stage label for a running job. Consumed by `JobActivityList.vue` rows.
- `LegalDocumentsStorageService` (or equivalent) in `apps/forge/api/src/agents/legal-department/jobs/` — thin wrapper around `MEDIA_STORAGE_PROVIDER.upload/download/getPublicUrl` for the `legal-documents` bucket.

**Existing components modified:**

- `LegalDepartmentWorkspace.vue` and `DocumentOnboardingPage.vue` — two-pane grid removed; becomes a single-column view wrapping `JobActivityList`.
- `JobActivityList.vue` — rows now contain an `InRowTicker` slot; rows are click-dead when processing, click-to-modal when completed/failed.
- `legal-jobs.controller.ts` — the `POST /legal-department/jobs/upload` endpoint now stores the original file before extraction and writes the path to the new column; `GET /legal-department/jobs/:id` returns a signed URL for the stored file.
- `legal-jobs.repository.ts` — add `original_file_path` to `AgentJobRow`, update insert/update methods.
- `LegalJobsWorkerService` — no functional changes, but the event-stream consumer in the UI now relies on the SSE fix to deliver events live.
- `ObservabilityStreamController` (`packages/planes/observability/services/observability-stream.controller.ts`) — fix the delivery gap so real events reach subscribers during execution.
- Legal department node files (`clo-routing.node.ts`, `contract-agent.node.ts`, etc.) — audit and normalize `step` names in observability emissions so the manifest can match reliably. No logic changes.

**Components removed:**

- `JobDetailPanel.vue` — deleted entirely. No `/legacy` shim. No renamed-and-hidden variant.
- The two-pane `grid-template-columns` CSS in `LegalDepartmentWorkspace.vue` and `DocumentOnboardingPage.vue`.

### 4.2 Data Model Changes

Single forward-only migration:

```sql
-- supabase/migrations/<ts>_legal_agent_jobs_original_file.sql
ALTER TABLE legal.agent_jobs
  ADD COLUMN original_file_path text;

COMMENT ON COLUMN legal.agent_jobs.original_file_path IS
  'Storage path (bucket-relative) for the original uploaded file under
   MEDIA_STORAGE_PROVIDER. NULL for jobs created before 2026-04-07 or
   for jobs enqueued via the JSON body path (no file upload).';
```

Nullable column, no backfill. Pre-existing jobs keep `NULL` and the UI falls back to extracted-text rendering.

The `legal-documents` bucket must exist. The `LegalDocumentsStorageService` calls `ensureBucketExists('legal-documents', { public: false })` at module init.

### 4.3 API Changes

| Method | Path | Purpose | Behavior |
|---|---|---|---|
| `GET`  | `/agents/:slug/presentation` | Returns `WorkflowPresentation` for the given agent | `200` with the manifest, or `404` if none shipped. Mounted on `AgentRegistryController`. |
| `POST` | `/legal-department/jobs/upload` | Existing — **augmented** to persist original file | Before extraction: `storage.upload('legal-documents', '{jobId-or-conversationId}/{filename}', buffer, { contentType })`. Store the returned path on the job row's new `original_file_path` column. Extraction proceeds unchanged. |
| `GET`  | `/legal-department/jobs/:id` | Existing — **augmented** to return signed URL | Response now includes `originalFileUrl?: string` (a signed URL from `storage.getPublicUrl` or equivalent). Null when `original_file_path` is null. Existing fields unchanged. |
| `GET`  | `/legal-department/jobs/:id/events` | Unchanged | Still returns raw observability events. Client-side walker + manifest turn these into stage states. |

The `/observability/stream?conversationId=…` endpoint contract is unchanged — the fix is internal to the controller's filter logic so live events actually reach subscribers.

### 4.4 Frontend Changes

**Routes (`apps/forge/web/src/router/index.ts`):**

```
/app/agents/legal-department
/app/agents/legal-department/document-onboarding
/app/agents/legal-department/document-onboarding/jobs/:id   ← new, opens modal for :id
/app/agents/legal-department/settings
```

The `:id` route reuses `DocumentOnboardingPage` as the page component and opens the modal for the matched id. Browser back navigates to the bare `/document-onboarding` route which closes the modal.

**Component tree (document-onboarding page):**

```
DocumentOnboardingPage.vue
├── OnboardDocumentModal.vue (unchanged, for "+ NEW")
├── JobActivityList.vue (full-width, single column)
│     └── row × N
│           └── InRowTicker.vue (shows current stage for running rows)
└── JobDetailModal.vue (mounted when :id param is present, v-if)
      ├── JobSourceViewer.vue (Source section)
      ├── StageLadder.vue (Events section, driven by manifest + walker)
      ├── "Show raw events (debug)" toggle → raw event list
      └── <RenderedMarkdown> (Report section, lifted from current JobDetailPanel)
```

**`JobDetailPanel.vue` is deleted.** Any report-rendering helpers are moved into a small shared `ReportMarkdown.vue` component consumed by `JobDetailModal`.

**Composables:**

- `useJobEventStream(jobId, conversationId, orgSlug)` — fetches history, opens SSE, merges + dedupes, exposes reactive `events: Ref<ObservabilityEvent[]>` and `streaming: Ref<boolean>`.
- `useWorkflowPresentation(agentSlug)` — fetches the manifest from `GET /agents/:slug/presentation` once and caches; exposes a reactive `stages: ComputedRef<StageState[]>` when given events.
- `useJobModalRoute()` — syncs the `:id` route param with modal open state.

**Interaction rules:**

| Row status | Hover state | Click behavior |
|---|---|---|
| `queued` | none | no-op (tooltip optional) |
| `processing` | none | no-op in scope; click-to-peek is a follow-up if it ends up in the plan |
| `completed` | pointer | opens modal (navigates to `/jobs/:id`) |
| `failed` | pointer | opens modal (navigates to `/jobs/:id`) |

### 4.5 Infrastructure Requirements

- **Storage bucket:** `legal-documents`, private. Auto-created by `LegalDocumentsStorageService.onModuleInit()` via `ensureBucketExists('legal-documents', { public: false })`.
- **No new env vars.** Storage provider is selected at the existing `MEDIA_STORAGE_PROVIDER` plane level via whatever env vars that plane already reads.
- **No new ports. No new services. No new containers.**
- **No changes to the LLM plane, the extractors plane, the worker, the LangGraph graph, or the model config table.** This effort does not touch the execution path.

## 5. Non-Functional Requirements

- **Performance:** rendering a modal for a completed job is instantaneous. Fetching history + opening SSE + parsing manifest + walking stages all happen client-side on already-loaded data; the only network call for a completed job is the one-time events fetch (already cached by the current `JobDetailPanel` flow). Storing the original file at upload time adds at most one `storage.upload` call (~50–500 ms for typical contract sizes).
- **Live update latency:** in-row ticker updates within 1 s of the underlying observability event being emitted by the worker. Acceptable cap: 3 s under load.
- **Signed URL lifetime:** original-file URLs live long enough for the user to open and read them. Default 1 hour. Renewed on every `GET /jobs/:id` call.
- **ExecutionContext is passed whole** to `MEDIA_STORAGE_PROVIDER.upload` or its generic equivalent when the API is present — no destructuring into ad-hoc fields.
- **No fallbacks, no swallowed errors.** If the storage upload fails, the upload endpoint returns a 5xx with the real error. If the manifest can't be parsed, the UI shows the raw events in a plain fallback list with a visible warning. If the SSE stream fails, the modal still works via the history fetch and the UI surfaces "live updates unavailable."
- **Backwards compatibility:** existing jobs with `original_file_path = NULL` continue to open cleanly in the new modal. No existing route URLs change (the new `/jobs/:id` route is additive).
- **Accessibility:** the stage ladder is keyboard-navigable and screen-reader friendly. Each stage renders as a list item with a descriptive aria-label like `"Stage 3 of 6, Reviewing contract terms, in progress"`.
- **Security:** `legal-documents` bucket is private. Access is gated by the `orgSlug` on the job row (same posture as the rest of the legal-department endpoints). Signed URLs are short-lived. `GET /agents/:slug/presentation` is unauthenticated (presentation manifests are compile-time constants, not user data).
- **No changes to auth posture.** Same body-borne ExecutionContext as the rest of Forge API.

## 6. Out of Scope

- **Presentation manifests for Marketing Swarm, CAD Agent, or any other agent.** Each gets the same pattern in its own follow-on effort. Agents without manifests continue to render events as a plain raw list (fallback path) in the new modal.
- **Inline rendering of DOCX, PPTX, or XLSX files.** The modal's Source section shows extracted text for these formats; adding client-side Mammoth or SheetJS rendering is future work.
- **Click-to-peek inline expansion for processing rows.** Mentioned as optional in the intention; will land only if the core modal + ticker work ships with time remaining in the plan. Not a success criterion.
- **In-row event ticker for completed rows.** Static summary only.
- **Cancellation of running jobs.** Still deferred from the original effort.
- **Mine-vs-all filter on the activity feed.** Still deferred.
- **RBAC scoping on `/observability/stream`.** Pre-existing weakness, not addressed here.
- **Storage retention, pruning, or cost management for `legal-documents`.** Files live in the bucket forever in this effort.
- **Changes to the LangGraph graph, the worker, the extractors, the model config, or the upload endpoint's extraction pipeline.** This is a presentation-layer effort.
- **Per-node model tier changes.** Unchanged from the async workspace effort.
- **Shared `AgentWorkspace.vue` extraction for reuse across products.** The new components are written to be reusable when their time comes, but this effort doesn't extract them into a shared package.
- **Server-side markdown sanitization.** Client-side `marked` continues to be the only rendering path, same as the async workspace effort.

## 7. Dependencies & Risks

### Dependencies

- `MEDIA_STORAGE_PROVIDER` plane at `packages/planes/storage/` — already global, already wired into Forge API via AppModule. Interface at `media-storage-provider.interface.ts` provides `upload`, `download`, `getPublicUrl`, `ensureBucketExists` — the exact surface needed.
- `@orchestrator-ai/transport-types` package — must be modified to add the `WorkflowPresentation` type and its supporting types. Forge API and Forge Web both depend on it.
- `marked` — already a direct dependency for report rendering (added in the async workspace effort).
- `AgentRegistryController` in Forge API — already exists, already has `@Get('agents')` routes; adding `@Get('agents/:slug/presentation')` is a one-file change.

### Risks & Mitigations

| Risk | Mitigation |
|---|---|
| The `/observability/stream` bug's root cause might not be in the filter — could be upstream at event emission, buffer, or RxJS subject configuration. | Phase 1 starts with a root-cause debugging pass against a real running job. If the fix is elsewhere than the filter, the plan adapts. The fix is a prerequisite for the in-row ticker; we don't move past phase 1 until real events are verified flowing through the SSE to the browser. |
| Auditing the legal-department node `step` names may reveal more inconsistencies than expected (nodes emit ad-hoc strings). | Phase 1 includes the audit. If a node emits inconsistent names, normalize them to a single convention (`{node_slug}_started`, `{node_slug}_completed`, etc.) before the manifest phase. This is mechanical and low-risk. |
| PDF inline rendering via `<iframe>` may not work for all PDFs due to sandbox + CSP restrictions. | Fallback path: render PDF as a download link with filename + size. For images and text this is not an issue. |
| Supabase signed URL generation behavior varies between the Supabase provider and GCS/Azure providers. | Use the plane's `getPublicUrl` which is already abstracted. If the bucket is private, the plane should handle signing. If it doesn't, wrap it in a `getSignedUrl` helper before shipping. |
| The `WorkflowPresentation` type in transport-types may need iteration as we implement the walker; moving types around mid-effort is fragile. | Phase 2 ships the type + the legal manifest + the walker together as one atomic change. No cross-phase dependencies on the type's shape. |
| Deep-linkable modals can fight with Ionic's router-outlet view-transition logic (we already saw an `<ion-page>` warning in the async-workspace effort). | Test the route+modal combination early in phase 3. If Ionic's modal behavior doesn't play well with deep links, fall back to a plain `v-if`-mounted overlay component that reads the route param manually. |
| Removing the two-pane shell and replacing it with a modal is a destructive UI change — if the modal is buggy the user loses the ability to see any job details at all. | Phase 3 ships modal + deep linking + Source section fallback first, then builds the events ladder and report rendering on top. At every checkpoint the modal is usable for at least one of the three sections. |
| The existing `JobDetailPanel.vue` has ~300 lines of CSS, SSE merge logic, and dedupe logic worth keeping. Deleting it risks losing that work. | Move the SSE merge + dedupe into `useJobEventStream.ts` composable first, verify the composable works inside the old panel, THEN delete the panel. Same for the report render helper. |
| Pre-existing jobs have `original_file_path = NULL`. The UI must not crash on them. | The `JobSourceViewer` component takes both `originalFileUrl?: string` and `extractedText: string` and renders the first one available. Unit test covers the null path. |

## 8. Phasing

Each phase ends in a state that can be independently validated.

### Phase 1 — Housekeeping pickup
- Debug and fix `/observability/stream` so SSE events actually reach the UI during execution. Verify with a live upload.
- Audit `apps/forge/api/src/agents/legal-department/nodes/*.node.ts` for `emitProgress` `step` values. Document the current names, normalize any inconsistencies to a single `{node-slug}_{started|processing|completed|failed}` convention.
- Fix the Ionic `<ion-page>` route-transition warning on the async-loaded workspace pages.
- **Validation:** drop a document via the current UI (still the old two-pane shell), watch the detail panel's Events section update live as the worker runs. Console is clean of Ionic warnings. No regressions in the current test suite.

### Phase 2 — Presentation manifest architecture
- Add `WorkflowPresentation`, `StageDefinition`, `EventRule`, `ActivatorRule`, `SuppressRule`, `StageState` types to `@orchestrator-ai/transport-types` (new subdir `presentation/`).
- Write `presentationWalker(manifest, events) → StageState[]` in the same package, plus unit tests covering: all-pending start state, activator expanding conditional stages, events ticking stages off, suppress filtering, failed stage rendering, manifest-less fallback.
- Create `LegalDepartmentPresentation` manifest at `apps/forge/api/src/agents/legal-department/legal-department.presentation.ts`. Declare all stages including the 8 conditional specialist stages.
- Add `GET /agents/:slug/presentation` to `AgentRegistryController`. For unknown slugs, return `404`. For `legal-department`, return the manifest.
- **Validation:** `curl localhost:5200/agents/legal-department/presentation` returns the manifest JSON. Unit tests for the walker pass. No UI changes yet.

### Phase 3 — Modal + list-first shell
- Refactor `LegalDepartmentWorkspace.vue` and `DocumentOnboardingPage.vue` to single-column layouts.
- Create `useJobEventStream.ts` composable by lifting the history-fetch + SSE-merge + dedupe logic out of the current `JobDetailPanel.vue`.
- Create `JobDetailModal.vue` with the three-section layout. Source section renders extracted text as a placeholder for now (phase 4 wires in the original file). Events section renders raw events as a plain list as a placeholder (phase 4 wires in the ladder). Report section reuses the existing marked rendering.
- Add route `/document-onboarding/jobs/:id` that keeps the same page component but opens the modal when `:id` is present.
- Update `JobActivityList.vue` row click handler: click-dead for `queued`/`processing`, navigate to `/jobs/:id` for `completed`/`failed`.
- Delete `JobDetailPanel.vue` and its parent grid CSS.
- **Validation:** Chrome: open document-onboarding, see full-width list, click a completed row, modal opens to a 3-section layout (extracted text + raw events + rendered report), close modal, back to list. Deep link to `/jobs/:id` opens directly to the modal.

### Phase 4 — Stage ladder + in-row ticker
- Create `useWorkflowPresentation(agentSlug)` composable that fetches the manifest from `GET /agents/:slug/presentation`, caches it, and exposes a reactive walker.
- Create `StageLadder.vue` generic component.
- Wire `StageLadder` into the modal's Events section. Add the "Show raw events (debug)" toggle.
- Create `InRowTicker.vue` for running rows. Subscribes to the job's event stream via `useJobEventStream` and the manifest via `useWorkflowPresentation`; shows the current stage label with a spinner.
- Integrate `InRowTicker` into `JobActivityList` rows where `status === 'processing'`.
- **Validation:** Chrome: upload a real NDA, watch the in-row ticker advance through `Reading your document` → `Classifying the document` → `Reviewing contract terms` → … → `Writing your final report`. Click the row after completion; modal's Events section shows the same stages as a checked-off ladder with `✓` markers. Conditional stages: upload an MSA that routes to multiple specialists; ladder shows only the selected specialist stages, not all 8.

### Phase 5 — Original file persistence
- Write migration `<ts>_legal_agent_jobs_original_file.sql` adding the `original_file_path` column.
- Create `LegalDocumentsStorageService` in `apps/forge/api/src/agents/legal-department/jobs/` with `onModuleInit` calling `ensureBucketExists('legal-documents', { public: false })`. Method: `storeOriginal(jobId, filename, buffer, contentType) → storagePath`. Method: `getSignedUrl(storagePath) → string`.
- Update `POST /legal-department/jobs/upload` to call `storeOriginal` before extraction and write the path to the job row.
- Update `legal-jobs.repository.ts` with `original_file_path` on `AgentJobRow` and an `updateOriginalFilePath(id, path)` method.
- Update `GET /legal-department/jobs/:id` response to include `originalFileUrl?: string`.
- Create `JobSourceViewer.vue`. Input: `{ originalFileUrl?: string, originalFileName?: string, extractedText: string, mimeType?: string }`. Renders PDF in `<iframe>`, images in `<img>`, text-family in `<pre>`, unknown types as a download link. Falls back to `<pre>{{ extractedText }}</pre>` with a "(Original file not stored)" badge when `originalFileUrl` is null.
- Wire `JobSourceViewer` into the modal's Source section.
- **Validation:** Chrome: upload a PDF, click the completed row, see the PDF rendered in an iframe inside the modal. Upload a PNG, see it rendered as an `<img>`. Upload a .txt, see it in a styled `<pre>`. Open a pre-existing job (`original_file_path = NULL`) and see the extracted-text fallback with the badge.

### Phase 6 — Close-out
- Run the full legal-department jest suite; all tests pass.
- Run `vue-tsc --noEmit` and `npm run build` on forge web and forge api; clean.
- Chrome verification across: queued (click-dead), processing (click-dead or peek, in-row ticker active), completed (modal opens, all 3 sections populated for a rich-report run), failed (modal opens, error visible, ladder shows failed stage).
- Delete any dead imports / CSS rules left over from `JobDetailPanel`.
- Commit-push, merge to main, archive the effort.

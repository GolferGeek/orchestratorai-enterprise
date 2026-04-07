# Intention: Legal Workspace Review UX

## What

Replace the two-pane shell of the Legal Department workspace with a **list-first ambient ops view** backed by a **review modal** that only opens for completed jobs, and drive every user-facing progress message from a **per-workflow presentation manifest** colocated with the workflow itself. Persist original uploaded files through the storage plane so the modal's Source section shows what the user actually dropped, not just the extracted text.

The user opens Legal Department and lands on a full-width activity feed — nothing else. Each row is alive while its job is running: a tight one-line stage label, the current step, elapsed time, nothing else. Processing rows are click-dead (or expand briefly to show a peek with the last few events); completed and failed rows are click-to-open. Clicking a completed row brings up a modal that takes the whole viewport with three sections — the original document, the event timeline rendered as a checked-off ladder of human-readable stages, and the rendered final report markdown. Close the modal, back to the feed.

The presentation layer for that stage ladder does not know about Legal Department specifically. It reads a manifest that Legal Department's own workflow file declares, walks the raw observability events through the manifest's filter rules, and renders a canonical "pending / active / done / skipped" checklist. When Marketing Swarm and the future Financial and Manufacturing departments get the same treatment, each ships its own manifest next to its own graph, and the UI doesn't change at all.

## Why

### The current pain
The async workspace effort that just shipped got the backend right but the UI stops short of the product we want. Three specific things hurt:

- **The two-pane right panel is the wrong ergonomics for a department dashboard.** When you've got one running job and a detail panel, 60% of the screen is dedicated to staring at events for a single job. When you've got twelve jobs queued overnight, the feed is cramped into a sidebar. The activity feed is the primary artifact — it should breathe. The "drop 12 contracts at 10 PM, walk away, come back at 7 AM" demo from the original intention document does not work well in a split-screen layout.

- **Raw observability events are machine telemetry, not user messages.** The current detail panel renders `langgraph.processing echo_llm_call Echo: Calling LLM for document analysis` and expects a human to read it. That's instrumentation output, not a status update. A non-technical user opens the detail panel and sees a log file. The existing event taxonomy is great for debugging and cost tracking and absolutely should stay in place at the observability plane layer — but the UI needs a completely different presentation layer on top of it.

- **The modal and the run-time observer shouldn't be the same surface.** When a job is running you want ambient awareness — peripheral vision across the whole queue. When a job is complete you want to sit down with it and read the report, scroll the source document, walk through what the specialists said. Those are two different jobs for two different UI regions. Forcing them into one panel is why the current detail panel feels both too busy for live runs and too cramped for post-mortem review.

### The unlock

Four things become possible once we make this shift:

1. **Per-workflow wording lives next to the workflow.** Want to rename "Reviewing contract terms" to "Checking contract provisions"? One-line edit in `legal-department.presentation.ts`. No node refactor. No UI change. The workflow owner owns the words the user reads.

2. **Conditional stages render honestly.** The CLO routes to 2 of 8 specialists based on the document. The manifest declares all 8 as conditional; when the CLO routing decision fires, the 2 selected ones light up in the ladder and the other 6 gracefully disappear. A simple NDA shows 4 stages; a complex MSA shows 8. The UI tells the truth about what's actually happening without the user needing to understand LangGraph routing.

3. **Checklist-style rendering instead of log-tailing.** `✓ Reading your document / ✓ Classifying the document (NDA) / ⟳ Reviewing contract terms / ○ Synthesizing / ○ Writing report` is a vastly calmer UI than a scrolling timestamped event stream. The user sees a small number of big things happening, not a large number of small things happening.

4. **Scales to every future department.** Marketing Swarm, Financial, Manufacturing — each gets its own manifest file alongside its graph. The modal component, the in-row ticker, the Vue plumbing: all generic. The manifest format is the extension point. New departments cost one file.

### The deeper reason

The previous effort was about the **execution architecture** — queue, worker, concurrency, extractors, vision, model config. It got that part right. This effort is about the **review architecture** — how a user actually sits down with a completed job and understands what happened. The execution architecture is what the platform needs to be correct; the review architecture is what sells it. Both halves are required for "Legal Department" to feel like a department and not a script.

## The shape of the thing

### List-first activity feed

The workspace's left pane goes away. `DocumentOnboardingPage.vue` and `LegalDepartmentWorkspace.vue` become single-column views. The activity list uses the full viewport width, giving each row room to breathe — roughly doubled vertical height per row compared to today — and real estate for a live event ticker line beneath the filename/status row.

Each row's states:

- **Queued.** Click-dead. Cursor normal. Small hourglass icon, no progress indication.
- **Processing.** Click-dead for a full modal (because there's no report yet), but optionally click-to-peek — a small inline drawer below the row showing the last 3 events and the current stage label. Not meant to be stared at. Peek, confirm progress, collapse, go back to watching the feed.
- **Completed / failed.** Fully clickable. Hover state. Click opens the full-screen modal.

The in-row live event ticker is driven by the presentation manifest (see below). While the job is running, the row shows the current ladder stage as a single human-readable line: `⟳ Reviewing contract terms` or `⟳ Synthesizing the analysis`. No raw event names ever appear in the row itself.

### Review modal

Opens only for `completed` and `failed` rows. Three sections, stacked vertically on desktop and as tabs on mobile:

- **Source.** The original file rendered inline. PDFs in an `<iframe>`. Images in an `<img>`. Text/markdown/json/csv in a styled `<pre>`. PowerPoint and Word fall back to the extracted text until inline renderers are worth the complexity. Requires persisting the original bytes through `MEDIA_STORAGE_PROVIDER` at upload time — see "Original file persistence" below.

- **Events.** The stage ladder, rendered from the presentation manifest. Each stage is one of `pending / active / done / skipped / failed`, with icons and a human-readable label. No raw event types, no node names, no `agent.llm.started` noise. For failed jobs, the failed stage shows inline with the error message from the job row. A collapsed "Show raw events (debug)" affordance exposes the underlying observability stream for developers when something doesn't add up.

- **Report.** The existing marked-rendered markdown output. No change from what ships in the current effort.

The modal is route-addressable: `/agents/legal-department/document-onboarding/jobs/:id` opens the capability page with that job's modal already open. Closing the modal navigates back to the bare capability page. Deep-linkable, shareable, browser-back works.

### Presentation manifest

A new type in `@orchestrator-ai/transport-types` (because Vue and Nest both consume it):

```ts
interface WorkflowPresentation {
  agentSlug: string;
  stages: StageDefinition[];
  rules: EventRule[];
  activators: ActivatorRule[];
  suppress: SuppressRule[];
}
```

Each workflow ships one. Legal Department's lives at `apps/forge/api/src/agents/legal-department/legal-department.presentation.ts` next to the graph. It declares:

- **The ordered stage list** — what the user will see. Some stages are `conditional: true` with a `requires: 'contract-agent'` hint so they only appear when the CLO routing decision activates them.
- **Match rules** — which raw observability `step` values (or `hook_event_type` + payload combinations) tick off which stages.
- **Activator rules** — events that declare which conditional stages are going to fire (e.g. the CLO's routing decision event carries the selected specialists; the manifest says "when this event fires, activate these stages").
- **Suppression rules** — event types to hide entirely from the user stream. `agent.llm.started`, `agent.llm.completed`, orchestrator bookkeeping, and anything else that's pure telemetry.

The API exposes manifests at `GET /agents/:slug/presentation`. The UI fetches the manifest once per agent (cached), then walks each job's event history through it locally. Manifests are pure data and cheap to compute against.

**Backend cost of this:** a one-time audit of the legal-department nodes to confirm every meaningful stage transition emits a stable, unique `step` value. Some already do; some emit generic strings that need tightening. No node logic changes, only the `step` field in the observability emit calls.

### Original file persistence

Current state: the upload endpoint hands the file to the extractor router, gets text out, stores the text as `data.content` on the job row, and drops the bytes on the floor. The modal's Source section has nothing real to show.

Target state: before extraction, the upload endpoint also writes the file to storage via `MEDIA_STORAGE_PROVIDER` under a deterministic path keyed by `jobId`. A new nullable `legal.agent_jobs.original_file_path` column holds the storage path. The `GET /jobs/:id` endpoint returns a short-lived signed URL alongside the row. The modal's Source section reads that URL and renders the file inline.

Files uploaded before this effort have `original_file_path = NULL` and the modal falls back to showing the extracted text with a "(original not stored)" badge.

### Housekeeping pickup

A few real bugs from the async-workspace effort that I knew about but deferred:

- `/observability/stream` SSE controller filters events by `conversation_id`, but the existing LangGraph observability pipeline writes the conversationId into `task_id`, leaving `conversation_id` NULL. Live SSE doesn't work today; the post-completion history fetch works as a bandaid. Fix the stream controller to match either column, same as the events endpoint already does.
- Ionic `<ion-page>` route-transition warning at async-loaded child components. Non-blocking but noisy in the console. Probably a wrapper-element issue on the workspace pages.

Neither of these blocks the new scope, but both get knocked out in the same pass because the UX work touches the same files.

## Constraints

- **No legacy.** The two-pane shell is deleted entirely, not hidden behind a flag. No `/legacy` fallback, no toggle. When this effort ships, clicking a row opens a modal — period.
- **No follow-up docs.** If something doesn't make the cut it either gets done in this effort or it gets forgotten. No "future improvements" files.
- **Must land on merged `effort/legal-async-workspace`.** This effort starts from that branch's merge into main and does not re-do any of its work.
- **Presentation manifests are forward-compatible only.** We ship Legal Department's manifest in this effort. Marketing Swarm and CAD Agent keep working exactly as they do today with no manifest — they fall back to the raw event stream until someone writes their manifests in a follow-up effort. The UI handles missing manifests gracefully.
- **Gemma 4 stays the default model.** No model changes in this effort. The presentation manifest is about making the existing model's behavior legible, not about changing what the model does.
- **No changes to the backend execution path.** The worker, the extractors, the model config, the LangGraph graph — all stay exactly as they are. This is a presentation-layer effort. The only backend changes are: the new manifest endpoint, the original-file storage wiring on upload, the `/observability/stream` filter fix, and the node-emit audit for stable `step` values.
- **One LLM call per document, max.** The manifest rendering happens entirely client-side on static data. No additional LLM calls, no additional services.
- **Route-addressable modals.** The modal is a route, not a transient overlay. Browser back works, deep links work, shareable URLs work.
- **End-to-end success criterion:** a user drops a multi-specialist document into the workspace, sees it appear as a full-width row with a live ticker showing `⟳ Reading your document` → `⟳ Classifying the document (NDA)` → `⟳ Reviewing contract terms` → `⟳ Reviewing intellectual property` → `⟳ Synthesizing the analysis` → `⟳ Writing your final report`, sees the row transition to completed with a check icon and duration, clicks it, sees a full-screen modal with the original file rendered on top, a clean checked-off stage ladder in the middle, and the rendered markdown report on the bottom. Closes the modal, drops another document, repeats. No raw event names appear anywhere in the user-facing UI.

## Out of scope

- **Marketing Swarm and CAD Agent presentation manifests.** They get the same pattern in follow-up efforts, one per agent. This effort ships the manifest architecture and Legal Department's instance of it.
- **RBAC on `/observability/stream`.** The stream controller's missing auth scoping is a pre-existing issue across Forge API. Fixing it is its own effort, not bundled here.
- **Token-level streaming inside LLM calls.** Observability events are per-node-transition. Finer-grained progress would require changes at the LLM plane level.
- **Inline rendering of .docx and .pptx.** The modal shows extracted text for these formats. Adding client-side Mammoth or PPTX rendering can come later if needed.
- **Storage lifecycle policy.** Original files live in storage forever for now. Retention, pruning, and cost management are future hardening.
- **Job cancellation and retry.** Still deferred from the original effort.
- **Per-specialist chunking for long documents.** Still deferred.
- **Mine-vs-all filter, multi-user job feed filters.** Still deferred.
- **Marketing Swarm / CAD Agent using the same modal component.** The generic `JobDetailModal` is ready to be reused when their backends expose the same job/events/result shape. Doing that refactor in THEIR apps is a follow-up effort per agent.
- **Server-side markdown rendering or sanitization.** Client-side `marked` is fine for admin tooling; a full HTML sanitizer pass is future work if we ever open the UI to end-users.

## Phases

1. **Housekeeping.** Fix the `/observability/stream` filter (match either column). Audit legal-department nodes for stable `step` values in observability emits. Ionic `<ion-page>` warning cleanup. Small, isolated, unblocks everything else.

2. **Presentation manifest.** Define the `WorkflowPresentation` type in transport-types. Write the `LegalDepartmentPresentation` manifest. Add `GET /agents/:slug/presentation`. Unit tests for the walker that maps raw events → stage states through a manifest.

3. **Modal refactor.** New `JobDetailModal.vue` with three sections (source placeholder / events ladder / report). Replace the two-pane layout in `LegalDepartmentWorkspace.vue` and `DocumentOnboardingPage.vue` with a single full-width activity list. Wire modal open/close to a route param. Click-dead behavior for processing rows. Delete `JobDetailPanel.vue`.

4. **In-row live event ticker.** Row-level subscription using the same manifest walker. Current stage label + icon. Optional click-to-peek expansion. The peek is optional polish for this phase — ship without it if the base modal flow works.

5. **Original file persistence.** Migration for the new column. Upload endpoint writes bytes to storage before extraction. `GET /jobs/:id` returns a signed URL. Modal's Source section renders the file inline (PDF iframe, image tag, text pre).

6. **Close-out.** Delete any dead CSS, run the full test suite, Chrome verification across all three states (queued / processing / completed), commit-push, PR, merge.

## Why this is the right effort to do next

It's the smallest thing we can build that:

- Finishes the review story the async workspace effort started
- Turns the raw observability stream into something a non-technical user can actually read
- Gives every future department a copy-paste pattern for their own user-facing language
- Makes the demo genuinely impressive — list view with live tickers, modal post-mortem with the original document rendered inline, stages as a checklist not a log
- Reuses every piece of the backend architecture that just shipped without touching the execution path
- Can be validated entirely through the Chrome browser automation that's already set up
- Leaves the product in a state where adding the next department (Financial, Manufacturing) is a graph + manifest + database seed, not a UI rebuild

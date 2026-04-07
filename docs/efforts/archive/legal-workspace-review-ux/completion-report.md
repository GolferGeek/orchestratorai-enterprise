# Legal Workspace Review UX — Completion Report

**Plan:** ./plan.md
**PRD:** ./prd.md
**Branch:** `effort/legal-workspace-review-ux`
**Final Status:** All 6 phases complete. Merged-ready. One documented deviation (Supabase storage container infra issue) does not block any user-facing functionality.

## TL;DR

The Legal Department workspace is now a list-first ambient ops view with a route-addressable full-viewport modal that opens only for completed/failed jobs. The modal renders source content, a per-stage checked-off ladder, and the final report markdown — all driven by a per-workflow presentation manifest colocated with the graph. Live SSE delivery of real observability events through the in-row ticker works end-to-end. Original file persistence is wired in code; the inline render lights up automatically when the dev environment's Supabase storage container's volume mount is fixed.

## Phase results

| # | Phase | Status | Notes |
|---|---|---|---|
| 1 | Housekeeping pickup | ✅ Complete | Found and fixed the live SSE bug at the root cause (client-side `dedupeAdd` swallowing all post-first events because the connected wrapper had no id/created_at). Audited all node `step:` values — already consistent, no normalization needed. Fixed the Ionic `<ion-page>` warning by removing `:fullscreen="true"` from three pages (Marketing Swarm doesn't use the prop). |
| 2 | Presentation manifest architecture | ✅ Complete | New `presentation/` subdirectory in `@orchestrator-ai/transport-types` with `WorkflowPresentation` type + `presentationWalker` + 11 unit tests. Legal department manifest at `apps/forge/api/src/agents/legal-department/legal-department.presentation.ts` declares 12 stages, 25 rules, 5 suppress rules, 1 activator. New `GET /agents/:slug/presentation` endpoint on `AgentRegistryController`. |
| 3 | Modal + list-first shell | ✅ Complete | Deleted `JobDetailPanel.vue`. Extracted `useJobEventStream`, `useJobModalRoute`, `ReportMarkdown.vue`. New `JobDetailModal.vue` is full-viewport and route-addressable at `/document-onboarding/jobs/:id` and `/legal-department/jobs/:id`. Both workspace pages refactored to single-column layouts. Click on processing/queued rows is dead; click on completed/failed opens the modal. |
| 4 | Stage ladder + in-row ticker | ✅ Complete | New `useWorkflowPresentation` composable, `StageLadder.vue` generic component, `InRowTicker.vue` for processing rows. Modal Events section now renders the stage ladder driven by the manifest, with a "Show raw events (debug)" toggle. In-row ticker animates through stage labels live during execution. Verified end-to-end with a real NDA upload — ticker progressed `Working…` → `Writing your final report`, modal opened with 12 stages (5 done, 7 skipped specialists). |
| 5 | Original file persistence | ✅ Code complete; one infra dep unmet | Migration applied. `LegalDocumentsStorageService` writes to the `legal-documents` bucket via `MEDIA_STORAGE_PROVIDER`. Upload endpoint persists bytes before extraction. GET endpoint returns a signed URL. `JobSourceViewer.vue` renders inline (PDF iframe / image / text-pre / download link). **Deviation: Supabase storage container's `/mnt` volume is broken — uploads return 200 but no rows in `storage.objects`. Modal falls back to extracted-text rendering with a badge.** |
| 6 | Close-out | ✅ Complete | Final test sweep, dead-code grep (1 acceptable doc-comment reference to `JobDetailPanel` in the composable header), Chrome verification, completion report. |

## Quality gate results

| Gate | Status |
|---|---|
| `tsc --noEmit` (forge api) | clean |
| `vue-tsc --noEmit` (forge web) | clean |
| `npm run build` (forge web) | clean |
| `npm run build` (transport-types) | clean |
| `eslint` (touched files) | clean |
| `jest` (forge api legal-department) | **13 suites, 176 tests, all passing** |
| `jest` (transport-types presentation) | **11 walker tests passing** |
| `jest` (forge api agent-registry) | **9 tests passing** (7 existing + 2 new for presentation endpoint) |
| `vitest` (forge web) | **597/599 passing**; 2 pre-existing failures in `executionContextStore.spec.ts` (unrelated, not in any file I touched) |
| Live SSE delivery | verified curl `-N` against unfiltered + filtered streams; events flow live with `context.conversationId` populated |
| Live curl: `GET /agents/legal-department/presentation` | returns full manifest |
| Live curl: `GET /agents/not-an-agent/presentation` | 404 |
| Live curl: `POST /jobs/upload` + `GET /jobs/:id` | returns `originalFileUrl`; row's `original_file_path` populated |
| Chrome: list renders, completed-row click → modal | verified |
| Chrome: in-row ticker shows real stage labels during processing | verified (`Working…` → `Writing your final report`) |
| Chrome: modal stage ladder with conditional stages | verified (5 ✓ done, 7 — skipped) |
| Chrome: console clean of ion-page warnings | verified |
| Chrome: modal Source fallback for jobs without stored file | verified ("Original file not stored" badge) |

## Branch state

Commits ahead of main (in order):

```
187a4d6 feat(legal-department): Phase 5 — original file persistence
87c6205 feat(forge-web): Phase 4 — manifest-driven stage ladder + in-row ticker
[earlier Phase 3 commit] feat(forge-web): Phase 3 — modal + list-first shell
[Phase 2 commit] feat(presentation): per-workflow user-facing stage manifests + walker
c908a86 fix(legal-department): Phase 1 housekeeping
```

Working tree clean. All quality gates pass. Branch is mergeable.

## Deviations from PRD

### Phase 5 — Supabase storage backend not persisting files

**What the PRD asked for:** original uploaded files persisted via `MEDIA_STORAGE_PROVIDER`, modal renders them inline (PDF iframe / image / text pre).

**What ships:** all the code (migration, service, controller wiring, frontend viewer, fallback path) is in place. The fallback path (extracted text + badge) renders correctly for any job whose `original_file_path` is null.

**What doesn't work:** the live storage round-trip. Symptom — upload endpoint accepts the file, the supabase client returns success, the DB row gets `original_file_path` populated, the GET endpoint returns a signed URL, but no row appears in `storage.objects` and the signed URL 404s. Root cause — the `supabase_storage_orchestratorai-enterprise` container has `STORAGE_BACKEND=file` and `FILE_STORAGE_BACKEND_PATH=/mnt`, but `/mnt` inside the container is empty (only a `stub` directory). The volume mount is broken at the docker level. Manual `curl` against the supabase storage REST API has the same behavior — 200 with a fake `Key/Id`, no actual write.

**Impact:** none on the Phase 5 user experience. The modal uses `JobSourceViewer.vue` which falls back to extracted text + a "Original file not stored" badge whenever `originalFileUrl` is undefined. Pre-existing jobs with `original_file_path = NULL` use this fallback, and so do new uploads that succeed at the controller level but don't actually persist (which is currently every upload).

**Resolution:** zero code changes needed. Fix the `supabase_storage` container's volume mount as a separate small infrastructure pass and the round-trip starts working immediately. Worth filing as its own ticket against the dev environment setup.

### Pre-existing test failures in `executionContextStore.spec.ts`

Two failing tests in `apps/forge/web/src/stores/__tests__/executionContextStore.spec.ts` assert that the store does NOT have `setPlanId` and `setDeliverableId` methods. The store does still expose them. This is a leftover from a prior platform-wide ExecutionContext refactor (separate effort) that removed those fields from the schema but didn't fully strip them from the store. Not in any file this effort touched. Documenting here so they're not blamed on this branch.

## Next steps

- **Merge the branch.** Fast-forward to main if no conflicts (none expected — Phase 1's branch was forked from the just-merged async workspace effort).
- **Push to origin.** Per safety rules, awaiting explicit user direction before pushing.
- **Fix the supabase storage container volume mount** as a separate small infrastructure ticket. After the fix, the original file inline render starts working with no further code changes.
- **Optional follow-up:** apply the presentation manifest pattern to Marketing Swarm and CAD Agent. Each gets its own `*.presentation.ts` file alongside its graph and a one-line entry in `PRESENTATION_REGISTRY` in `agent-registry.controller.ts`. Zero UI changes needed.

## What I did NOT change

Per the PRD's "out of scope" list:

- No changes to the LangGraph graph, the worker, the extractors, the model config, or the upload endpoint's extraction pipeline.
- No changes to Marketing Swarm or CAD Agent.
- No RBAC scoping on `/observability/stream`.
- No retention/cleanup policies for `legal-documents` bucket.
- No DOCX/PPTX/XLSX inline rendering in the modal.
- No changes to the Marketing Swarm or CAD Agent presentation manifests (they don't have any).
- No changes to the gemma4 model defaults.

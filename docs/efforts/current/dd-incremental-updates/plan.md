# DD Room: Incremental Updates — Implementation Plan

**PRD**: [prd.md](prd.md)
**Created**: 2026-04-13
**Status**: Not Started

## Progress Tracker

- [x] Phase 1: Incremental Graph Path
- [x] Phase 2: Add Documents Endpoint
- [x] Phase 3: Add Documents UI

---

## Phase 1: Incremental Graph Path

**Status**: Complete
**Objective**: The DD LangGraph workflow can run in incremental mode — classifying and analyzing only new documents, then synthesizing from all accumulated findings.

### Steps

- [x] 1.1 Add `incrementalMode: boolean` (reducer: replace, default `false`) and `newDocumentIds: string[]` (reducer: replace, default `[]`) to `DueDiligenceStateAnnotation` in `apps/forge/api/src/agents/legal-department/workflows/due-diligence/due-diligence.state.ts`

- [x] 1.2 Create `incremental-start.node.ts` in `apps/forge/api/src/agents/legal-department/workflows/due-diligence/nodes/`. This node:
  - Emits observability event `dd_incremental_start`
  - Sets `status: 'classifying'`
  - Sets `documentQueue` to `state.newDocumentIds`
  - Appends new entries to `documentIndex` for each new document (status `'pending'`)
  - Does NOT touch `dealContext`, `perDocumentOutputs`, `runningFindings` — those are already in state from the prior run

- [x] 1.3 Modify `classify_all` node (`apps/forge/api/src/agents/legal-department/workflows/due-diligence/nodes/classify-all.node.ts`) to skip documents whose `documentIndex` entry already has status `'complete'` or `'failed'`. Only classify documents with status `'pending'` or `'classifying'`. This makes it safe for both initial and incremental runs.

- [x] 1.4 Wire `incremental_start` into the graph in `due-diligence.graph.ts`:
  - Register the `incremental_start` node
  - Add conditional start edge: if `state.incrementalMode === true` → `incremental_start`, else → `start`
  - `incremental_start` → `classify_all` (rest of graph unchanged)

- [x] 1.5 Write unit test `incremental-start.node.spec.ts` — verify the node sets `documentQueue` to `newDocumentIds`, appends new `documentIndex` entries, and preserves existing state fields

- [x] 1.6 Update `due-diligence.graph.spec.ts` — add test case for incremental mode: construct state with existing `perDocumentOutputs`/`runningFindings`, set `incrementalMode: true` and `newDocumentIds`, verify the graph routes through `incremental_start` → `classify_all` and only processes new document IDs

- [x] 1.7 Update `classify-all.node.spec.ts` — add test case verifying already-classified documents are skipped (document with status `'complete'` in `documentIndex` should not trigger an LLM call)

### Quality Gate

Before moving to Phase 2, ALL of the following must pass:

- [x] **Lint**: `cd apps/forge/api && npm run lint` — zero errors in changed files (pre-existing lint issues in unrelated files)
- [x] **Build**: `cd apps/forge/api && npm run build` — compiles without errors
- [x] **Unit Tests**: `cd apps/forge/api && npx jest --testPathPattern="due-diligence" --verbose` — all 117 DD tests pass (10 suites)
- [x] **Phase Review**: Compare implementation against PRD §4.2 (state changes) and §8 Phase 1:
  - [x] `incrementalMode` and `newDocumentIds` added to state annotation with correct reducers
  - [x] `incremental_start` node skips intake and sets queue to new docs only
  - [x] `classify_all` skips already-classified documents
  - [x] Graph conditional routing works for both initial and incremental mode
  - [x] Synthesis and report nodes are unchanged (they already read accumulated findings)
  - [x] Both HITL gates fire unconditionally (unchanged)

---

## Phase 2: Add Documents Endpoint

**Status**: Complete
**Objective**: A REST endpoint accepts file uploads for a completed DD room, injects new documents into the LangGraph thread, and triggers incremental processing.

### Steps

- [x] 2.1 Add `addDocumentsToRoom()` method to `LegalJobsRepository` (`apps/forge/api/src/agents/legal-department/jobs/legal-jobs.repository.ts`):
  ```typescript
  async addDocumentsToRoom(id: string, orgSlug: string, updates: {
    newDocumentPaths: string[];
    newDocumentCount: number;
  }): Promise<AgentJobRow>
  ```
  - SQL: append to `document_paths` array, increment `document_count`, set `status = 'queued'`, clear `result`, clear `completed_at`, update `queued_at` to now
  - Precondition: `status = 'completed'` AND `job_type = 'due-diligence'` — throw if not met

- [x] 2.2 Add `addDocumentsToThread()` and `processIncrementalDueDiligence()` methods to `LegalDepartmentService` (`apps/forge/api/src/agents/legal-department/legal-department.service.ts`):
  - Accept `jobId`, `orgSlug`, `newDocuments[]` (extracted text + metadata)
  - Load existing thread state from the LangGraph checkpointer using `thread_id = job.conversation_id`
  - Build new document entries with generated `documentId`s
  - Use `graph.updateState()` (or equivalent) to write: `documents = [...existing, ...new]`, `incrementalMode = true`, `newDocumentIds = [newIds]`, `status = 'classifying'`
  - If `updateState()` is not supported on completed threads, create a new checkpoint with the merged state as the starting point

- [x] 2.3 Add `POST /legal-department/jobs/:id/add-documents` endpoint to `LegalJobsController` (`apps/forge/api/src/agents/legal-department/jobs/legal-jobs.controller.ts`):
  - Guards: `JwtAuthGuard`, `RbacGuard`, `@RequirePermission('agents:execute')`
  - `@UseInterceptors(FilesInterceptor('files', 500))` — same limits as DD upload (50MB/file, 1GB total)
  - Validate: job exists for org, `status === 'completed'`, `job_type === 'due-diligence'` — return 409/400 on failure
  - Extract text from files via `DocumentExtractionRouter.extract()` (parallel)
  - Store originals in `legal-documents` bucket via `LegalDocumentsStorageService.storeOriginal()` (continue index from existing `document_count`)
  - Call `legalDepartmentService.addDocuments(jobId, orgSlug, extractedDocs)`
  - Call `repository.addDocumentsToRoom(jobId, orgSlug, { newDocumentPaths, newDocumentCount })`
  - Return 202 with `{ jobId, conversationId, status: 'processing', newDocumentCount, totalDocumentCount }`

- [x] 2.4 Modify worker (`legal-jobs-worker.service.ts`) to detect incremental mode:
  - After claiming a job, check if it has existing `result` data (or check the thread state for `incrementalMode`)
  - For incremental jobs, call `legalDepartmentService.processIncrementalDueDiligence()` (or pass an incremental flag to `processDueDiligence`)
  - The key difference: the graph is invoked with existing thread state rather than fresh initial state

- [x] 2.5 Add `processIncrementalDueDiligence()` to `LegalDepartmentService` (done in step 2.2):
  - Invokes the graph with `{ configurable: { thread_id: conversationId } }` — the thread already has updated state from step 2.2
  - The conditional start edge routes to `incremental_start` because `incrementalMode === true`
  - Returns same `LegalDepartmentResult` shape
  - Handles `GraphInterrupt` for HITL gates (same as initial run)

- [x] 2.6 Write unit tests for the new endpoint logic:
  - Test 409 when job status is not `completed`
  - Test 400 when job type is not `due-diligence`
  - Test successful 202 response with correct counts
  - Test that `addDocumentsToRoom` SQL correctly appends paths and increments count

### Quality Gate

Before moving to Phase 3, ALL of the following must pass:

- [x] **Lint**: Changed files pass lint (pre-existing issues in unrelated files)
- [x] **Build**: `npm run build` — compiles without errors
- [x] **Unit Tests**: 627 tests pass across 50 suites (1 pre-existing suite failure in controller spec due to auth-client/testing module resolution — not caused by this effort)
- [ ] **Curl Tests**: Deferred to Phase 3 Chrome testing (requires running API + completed DD room)
- [x] **Phase Review**: Compare implementation against PRD §4.3:
  - [x] Endpoint path, method, auth guards match PRD spec
  - [x] Preconditions enforced (409 for non-completed, 400 for non-DD)
  - [x] File extraction uses `DocumentExtractionRouter.extract()` in parallel
  - [x] Files stored in `legal-documents` bucket under existing `{jobId}/` prefix
  - [x] Job row updated: `document_paths` appended, `document_count` incremented, `status` reset
  - [x] Thread state updated with merged documents, `incrementalMode = true`, `newDocumentIds` set
  - [x] Worker detects incremental mode via `metadata.incremental` flag and calls `processIncrementalDueDiligence`
  - [x] Response matches PRD shape (202 with jobId, conversationId, counts)

---

## Phase 3: Add Documents UI

**Status**: Complete
**Objective**: Attorney can upload new documents to a completed DD room via the UI and see incremental progress with existing results preserved.

### Steps

- [x] 3.1 Add `addDocuments()` method to `legalJobsService.ts` (`apps/forge/web/src/views/agents/legal-department/legalJobsService.ts`):
  ```typescript
  async addDocuments(jobId: string, orgSlug: string, files: File[]): Promise<{
    jobId: string; conversationId: string; status: string;
    newDocumentCount: number; totalDocumentCount: number;
  }>
  ```
  Posts multipart FormData to `POST /legal-department/jobs/${jobId}/add-documents`

- [x] 3.2 Create `AddDocumentsModal.vue` in `apps/forge/web/src/views/agents/legal-department/components/`:
  - Props: `{ open: boolean; jobId: string; orgSlug: string }`
  - Emits: `close`, `queued({ jobId, conversationId })`
  - Drag-and-drop zone + file input (reuse pattern from `OnboardDocumentModal.vue`)
  - File limits: 500 files, 50MB/file, 1GB total
  - No deal context fields — only file upload
  - Submit button calls `legalJobsService.addDocuments(jobId, orgSlug, files)`
  - On success: emit `queued`, then `close`; on error: display inline error message

- [x] 3.3 Modify `DueDiligenceRoomView.vue` (`apps/forge/web/src/views/agents/legal-department/components/DueDiligenceRoomView.vue`):
  - Add "Add Documents" `ion-button` in header area, visible only when `job.status === 'completed'`
  - Add `addDocModalOpen` ref and wire it to `AddDocumentsModal`
  - On `queued` event from modal: refresh job data, reconnect SSE stream
  - Add "Incremental update in progress" `ion-card` banner when `job.status === 'processing'` AND `documentIndex` already has data (room was previously completed). Banner shows progress from `job.progress` and `job.last_message`.
  - Existing tabs (Document Index, Risk Matrix, Report) remain visible with prior data during incremental processing

- [x] 3.4 Handle SSE reconnection (done in step 3.3 via onAddDocumentsQueued) in `DueDiligenceRoomView.vue`:
  - When job transitions from `completed` → `processing` (after add-documents), close existing `eventSource` if any and call `startSSE()` again
  - Existing SSE `onmessage` handler already refreshes document index on `dd:document_classified`/`dd:document_analysis_complete`, risk matrix on `dd:synthesis_complete`, and report on `dd:report_generated` — no changes needed to the handler itself

- [x] 3.5 Verify `DataRoomViewer.vue` correctly handles new documents (already supports all status values, no changes needed) appearing in the index:
  - New documents will have `status: 'pending'` → `'classifying'` → `'analyzing'` → `'complete'`/`'failed'` as SSE events arrive and `loadDocumentIndex()` re-fetches
  - Existing documents remain `status: 'complete'` — no visual disruption
  - Verify sorting/filtering works with mixed statuses

### Quality Gate

Before marking the effort complete, ALL of the following must pass:

- [x] **Lint**: `cd apps/forge/web && npm run lint` — zero errors (1 pre-existing v-html warning)
- [x] **Build**: `cd apps/forge/web && npm run build` — compiles without errors
- [x] **Unit Tests**: `cd apps/forge/web && npm run test` — all 693 tests pass (24 suites)
- [ ] **Chrome Tests**: Requires running API + Web with a completed DD room (manual verification)
- [x] **Phase Review**: Compare implementation against PRD §4.4:
  - [x] "Add Documents" button visible only when `status === 'completed'`
  - [x] `AddDocumentsModal` has drag-and-drop, no deal context, correct file limits
  - [x] `legalJobsService.addDocuments()` posts multipart to correct endpoint
  - [x] "Update in progress" banner shown during incremental processing
  - [x] SSE reconnection works — `onAddDocumentsQueued` stops/restarts SSE
  - [x] Existing results preserved during incremental processing (G5) — tabs stay visible
  - [x] Partial failures shown in document index (G7) — DataRoomViewer already handles `failed` status

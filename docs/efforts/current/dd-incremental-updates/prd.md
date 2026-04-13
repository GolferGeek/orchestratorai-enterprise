# DD Room: Incremental Updates — Product Requirements Document

## 1. Overview

Add the ability to upload new documents to a completed Due Diligence Room and re-run analysis incrementally. New documents go through classification and specialist analysis while existing results are preserved. Synthesis, risk matrix, and report are regenerated from the merged findings (original + new). Both HITL gates fire during incremental runs.

This transforms DD rooms from single-shot analysis into living workspaces that mirror how real deal teams receive and process documents over time.

## 2. Goals & Success Criteria

- **G1**: An attorney can upload 1–500 new documents to a completed DD room and trigger incremental analysis
- **G2**: Only new documents go through classification and specialist analysis — original documents are not re-processed
- **G3**: Synthesis runs on ALL findings (original + new) producing a coherent updated report, risk matrix, and deal-breaker flags
- **G4**: Both HITL gates fire: Gate 1 (review new document findings before synthesis) and Gate 2 (review updated synthesis before report)
- **G5**: The existing report/risk matrix remain visible during incremental processing — not cleared until new synthesis completes
- **G6**: Incremental updates appear as events on the same room/job, not as separate rooms
- **G7**: If some new documents fail analysis, synthesis proceeds with those that succeeded; failed docs are flagged and can be re-uploaded in a subsequent run

**Success criteria**:
- A completed DD room with 50 analyzed documents accepts 5 new documents and produces an updated report within reasonable time (proportional to 5 docs, not 55)
- The document index shows all 55 documents with correct status
- The risk matrix and report reflect findings from all 55 documents
- No original `perDocumentOutputs` or `runningFindings` entries are lost or overwritten

## 3. User Stories / Use Cases

**US1 — Add documents to completed room**: As an attorney, I open a completed DD room, click "Add Documents", upload 5 new PDFs, and the room begins incremental analysis. I see the existing report while the update processes.

**US2 — Review new findings**: As an attorney, I receive a HITL Gate 1 prompt showing findings from the 5 new documents alongside the original findings. I approve, and synthesis runs on the combined set.

**US3 — Review updated synthesis**: As an attorney, I receive a HITL Gate 2 prompt showing the updated risk matrix and deal-breaker flags. I approve, and the final report is regenerated.

**US4 — Partial failure**: As an attorney, 3 of 5 new documents succeed and 2 fail extraction. I see the 2 failures flagged in the document index, synthesis proceeds with the 3 that worked, and I can re-upload the failed docs later.

**US5 — Multiple incremental rounds**: As an attorney, I add documents in three separate batches over a week. Each batch is analyzed incrementally, and the report is updated each time.

## 4. Technical Requirements

### 4.1 Architecture

The incremental update reuses the existing DD room's LangGraph thread. The same graph runs in "incremental mode" — skipping `intake`, loading existing state from the checkpointer, classifying and analyzing only new documents, then running synthesis on merged findings.

**Flow**:
1. Frontend uploads new files to `POST /legal-department/jobs/:id/add-documents`
2. Backend extracts text from uploaded files, stores originals in `legal-documents` bucket
3. Backend updates the job row: appends to `document_paths`, increments `document_count`, resets status to `processing`
4. Backend writes new documents into the LangGraph thread state and enqueues the job for the worker
5. Worker resumes the graph from a new entry node (`incremental_start`) that skips intake
6. Graph classifies only new docs, analyzes only new docs (merge reducers accumulate results), then runs synthesis on all findings
7. Both HITL gates fire; report is regenerated

**Why reuse the same job/thread**: The LangGraph checkpointer already holds all `perDocumentOutputs` and `runningFindings` from the original run. By resuming the same thread, the merge reducers naturally accumulate new results alongside existing ones. Creating a child job would require manually copying all prior state.

### 4.2 Data Model Changes

**`legal.agent_jobs` table** — no schema changes required. Existing columns support incremental updates:
- `document_paths: text[]` — append new paths
- `document_count: integer` — increment
- `status` — reset to `processing` when incremental run starts
- `result` — overwritten when incremental run completes

**LangGraph thread state** — the `DueDiligenceStateAnnotation` needs two new fields:

```typescript
// New fields in DueDiligenceStateAnnotation
incrementalMode: boolean              // reducer: replace — true when running incremental update
newDocumentIds: string[]              // reducer: replace — IDs of documents added in this increment
```

The existing `documents` field (replace reducer) will be set to the full array (original + new) when entering incremental mode. The `documentQueue` will be set to only the new document IDs.

### 4.3 API Changes

#### New Endpoint: `POST /legal-department/jobs/:id/add-documents`

**Auth**: `JwtAuthGuard + RbacGuard + @RequirePermission('agents:execute')`

**Precondition**: Job must have `status === 'completed'` and `job_type === 'due-diligence'`. Returns 409 if not completed, 400 if not a DD room.

**Request**: Multipart form data
- `files` — 1 to 500 files (same limits as initial upload: 50MB/file, 1GB total)
- `orgSlug` — required (for tenant scoping)

**Response**: `202 Accepted`
```json
{
  "jobId": "uuid",
  "conversationId": "uuid",
  "status": "processing",
  "newDocumentCount": 5,
  "totalDocumentCount": 55
}
```

**Backend logic**:
1. Validate job exists, belongs to org, is completed, is DD type
2. Extract text from uploaded files via `DocumentExtractionRouter.extract()` (parallel)
3. Store originals in `legal-documents` bucket under existing `{jobId}/` prefix (continue index from existing count)
4. Build `newDocuments[]` array with generated `documentId`s
5. Load existing thread state from LangGraph checkpointer to get current `documents` array
6. Update job row: append to `document_paths`, increment `document_count`, set `status = 'processing'`, clear `result`
7. Write updated state to LangGraph thread: `documents = [...existing, ...new]`, `documentQueue = newDocumentIds`, `incrementalMode = true`, `newDocumentIds = [newIds]`, `status = 'classifying'`
8. The worker picks up the job on next poll cycle

#### Modified Endpoints (no signature changes)

- `GET /legal-department/jobs/:id/document-index` — already reads from checkpointer; will naturally return updated index after incremental run
- `GET /legal-department/jobs/:id/risk-matrix` — same; returns latest synthesis
- `GET /legal-department/jobs/:id/report` — same; returns latest report

### 4.4 Frontend Changes

#### DueDiligenceRoomView.vue

**Add Documents button**: Visible when `job.status === 'completed'`. Positioned in the header area next to the existing status display. Opens the `AddDocumentsModal`.

**Update in progress banner**: When `job.status === 'processing'` AND the room was previously completed (has existing `documentIndex` data), show a banner: "Incremental update in progress — existing results shown below" with a progress indicator. The existing tabs (Document Index, Risk Matrix, Report) remain visible and functional with prior data.

**SSE reconnection**: When an incremental update starts, reconnect the SSE stream (same `conversationId`). The existing SSE handler already refreshes `documentIndex` on `dd:document_classified` / `dd:document_analysis_complete` events, refreshes risk matrix on `dd:synthesis_complete`, and refreshes report on `dd:report_generated`.

#### New Component: AddDocumentsModal.vue

Reuses the drag-and-drop file upload pattern from `OnboardDocumentModal.vue` but simplified:
- No deal context fields (inherited from existing room)
- No capability slug selection
- File limits: up to 500 files, 50MB/file, 1GB total (same as DD room creation)
- Submit calls `legalJobsService.addDocuments(jobId, orgSlug, files)`
- On success: emits `queued` event, closes modal, parent component refreshes job status

#### legalJobsService.ts

New method:
```typescript
async addDocuments(jobId: string, orgSlug: string, files: File[]): Promise<{
  jobId: string;
  conversationId: string;
  status: string;
  newDocumentCount: number;
  totalDocumentCount: number;
}> {
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  formData.append('orgSlug', orgSlug);
  return this.post(`/legal-department/jobs/${jobId}/add-documents`, formData);
}
```

#### DataRoomViewer.vue

**Visual differentiation for new documents**: Documents added in the latest increment can be identified by their position in the index (appended at the end) and their status cycling through `pending → classifying → analyzing → complete/failed` while original documents remain `complete`. No schema change needed — the existing `status` field on `DocIndexEntry` already distinguishes them.

### 4.5 Infrastructure Requirements

No new infrastructure. Uses existing:
- `legal-documents` Supabase storage bucket
- `DocumentExtractionRouter` for text extraction
- LangGraph checkpointer for thread state persistence
- Observability event stream for SSE progress
- Worker polling loop for job processing

## 5. Non-Functional Requirements

- **Performance**: Incremental analysis of N new documents should take roughly the same time as analyzing N documents in a fresh room. No re-processing of original documents.
- **Data integrity**: Original `perDocumentOutputs` and `runningFindings` must never be lost or overwritten during incremental updates. The merge reducers guarantee this by design.
- **Concurrency**: Only one incremental update can run at a time per room. The `status !== 'completed'` precondition on the endpoint enforces this.
- **Atomicity**: If the endpoint fails after file upload but before job requeue, the job remains in `completed` status and the uploaded files are orphaned (acceptable — no user-visible corruption). The attorney can retry.

## 6. Out of Scope

- **Document versioning**: No "v2 replaces v1" tracking. Each upload is additive only.
- **Document removal**: No way to remove or exclude previously analyzed documents from synthesis.
- **Real-time streaming upload**: Files are uploaded as a batch, then processed. No document-at-a-time streaming.
- **Merge/diff of reports**: The report is fully regenerated by the LLM, not patched or diffed.
- **Incremental updates for non-DD job types**: Only `due-diligence` rooms support incremental updates.

## 7. Dependencies & Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| LangGraph thread state may not support writing new state entries after graph completion | High | Verify checkpointer API supports `update_state()` on completed threads. If not, use a new checkpoint with prior state carried forward. |
| Synthesis quality degrades with many incremental rounds (context window pressure) | Medium | `runningFindings` is already a summarized form. Synthesis prompt receives findings, not raw documents. Monitor token usage in synthesis calls. |
| Large existing `perDocumentOutputs` + new docs could exceed LLM context in synthesis node | Medium | Synthesis already operates on `runningFindings` (aggregated summaries per specialist), not raw `perDocumentOutputs`. This naturally compresses. |
| Race condition: attorney opens "Add Documents" while another tab shows stale completed state | Low | Frontend refreshes job status before opening modal. 409 response if job is no longer completed. |

## 8. Phasing

### Phase 1: Backend — Incremental Graph Path

**Goal**: The DD graph can run in incremental mode, processing only new documents and producing updated synthesis/report.

**Work**:
- Add `incrementalMode` and `newDocumentIds` fields to `DueDiligenceStateAnnotation`
- Add `incremental_start` node that loads existing state, sets `documentQueue` to new doc IDs only, skips intake
- Modify `classify_all` to classify only documents not already classified (check `documentIndex` status)
- Modify graph to support entry from `incremental_start` (conditional start edge based on `incrementalMode`)
- Synthesis and report nodes need no changes — they already read from accumulated `runningFindings`
- Both HITL gates already fire unconditionally — no changes needed

**Validation**: Unit test that constructs a thread with existing state, enters incremental mode with new documents, and verifies only new docs are classified/analyzed while synthesis covers all findings.

### Phase 2: Backend — Add Documents Endpoint

**Goal**: A REST endpoint accepts file uploads for a completed DD room and triggers incremental processing.

**Work**:
- Add `POST /legal-department/jobs/:id/add-documents` to `LegalJobsController`
- Implement file extraction, storage, job row update, and thread state injection
- Modify worker to detect incremental mode and invoke graph at `incremental_start` node
- Add `addDocuments()` method to `LegalJobsService` / `LegalJobsRepository`

**Validation**: Integration test: upload files to completed room via endpoint → verify job transitions to processing → verify graph runs incrementally → verify updated document index, risk matrix, and report.

### Phase 3: Frontend — Add Documents UI

**Goal**: Attorney can upload new documents to a completed DD room and see incremental progress.

**Work**:
- Add "Add Documents" button to `DueDiligenceRoomView.vue` header (visible when `status === 'completed'`)
- Create `AddDocumentsModal.vue` with drag-and-drop file upload (reuse pattern from `OnboardDocumentModal.vue`)
- Add `addDocuments()` method to `legalJobsService.ts`
- Add "Update in progress" banner when incremental run is active
- SSE reconnection on incremental start (existing handlers will refresh tabs as events arrive)
- Verify document index, risk matrix, and report tabs update correctly after incremental completion

**Validation**: End-to-end browser test: create DD room → complete initial analysis → add documents → verify incremental processing → verify updated results displayed correctly.

# DD Room: Incremental Updates

## What

Add new documents to an existing Due Diligence Room after the initial analysis has completed. Re-run classification, analysis, and synthesis with new + existing findings merged together — without re-analyzing documents that were already processed.

## Why

Real due diligence rooms grow over time. The target company's counsel sends documents in batches — initial data room dump, then follow-up requests, supplemental disclosures, and last-minute additions. A DD room that requires starting from scratch every time new docs arrive is a demo toy, not a production tool.

A law firm needs to:
1. Upload 5 new documents to an existing completed DD room
2. See those 5 docs classified and analyzed (without re-running the original 50)
3. Get an updated synthesis that merges new findings with existing ones
4. See an updated risk matrix, deal-breaker flags, and report reflecting the full picture

## Shape

### Backend
- New endpoint: `POST /legal-department/jobs/:id/add-documents` — accepts file uploads for an existing completed DD room job
- Re-runs the same job graph in incremental mode (not a child job) — the existing job's state already has merge reducers on `perDocumentOutputs` and `runningFindings`, so appending is natural
- Graph incremental mode: skip intake, load existing state, only classify + analyze new documents, then re-run synthesis with merged findings
- Preserve the original document index and specialist outputs — append, don't replace

### Frontend
- "Add Documents" button on completed DD room detail view
- Upload modal — reuse `OnboardDocumentModal.vue` (drag-drop file picker), minus deal context fields since those are inherited from the existing room
- While incremental analysis is running, the existing report/risk matrix remain visible with an "Update in progress" banner — they are not cleared until the new synthesis completes
- Progress tracking for incremental analysis (same SSE event stream)
- Updated document index, risk matrix, and report reflecting merged results once complete

### Key Constraints
- The deal context (transaction type, target, buyer, jurisdictions) is inherited from the original room — not re-specified
- Original documents are NOT re-analyzed — only new uploads go through the pipeline
- Synthesis runs on ALL findings (original + new) to produce a coherent updated report
- Both HITL gates fire during incremental runs: Gate 1 (per-document review of new doc findings) and Gate 2 (review of the updated synthesis/report before finalization)
- Job history should show incremental updates as events on the same room, not separate rooms
- Partial failure policy: if some new documents fail analysis, synthesis proceeds with the documents that succeeded. Failed documents are flagged in `documentsFailed` and surfaced in the UI — they do not block the rest of the batch. The attorney can re-upload failed docs in a subsequent incremental run.

## What This Is NOT
- Not a real-time streaming upload (batch upload, then process)
- Not a document versioning system (no tracking of "v2 replaces v1")
- Not a merge/diff tool (the report is regenerated, not patched)
- Not a way to remove or replace previously analyzed documents

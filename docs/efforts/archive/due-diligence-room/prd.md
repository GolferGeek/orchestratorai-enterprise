# PRD: Due Diligence Room

**Product:** OrchestratorAI Enterprise - Legal Department (Forge)
**Priority:** #4 of 10 Legal Workflows
**Traces to:** [intention.md](./intention.md)

---

## 1. Overview

The Due Diligence Room is a multi-document batch analysis workflow for M&A legal due diligence. A lawyer uploads a virtual data room (50-500 documents), provides deal context, and receives a structured due diligence report with a risk matrix, document index, per-category analysis, and deal-breaker flags.

This is the first high-volume batch workflow in the Legal Department. It introduces the document dispatcher loop pattern, cross-document specialist context (running findings summary), and progressive reporting. These patterns are directly reused by Discovery Document Review (#7).

The workflow runs as a single job in the existing `legal.agent_jobs` queue. Internally, a dispatcher loop node iterates over documents within the LangGraph, respecting provider concurrency limits. Two HITL gates allow attorney review after extraction and after synthesis.

---

## 2. Goals & Success Criteria

### Goals (traced from intention)

| # | Goal | Intention Reference |
|---|------|---------------------|
| G1 | Process 50-500 documents through the specialist pipeline in a single job | "50 to 500 documents" / batch processing section |
| G2 | Classify every document and produce a structured Document Index | Phase 1: Document classification and indexing |
| G3 | Accumulate cross-document context via running findings summaries | Phase 2: "specialists accumulate context across documents" |
| G4 | Produce a risk matrix, per-category analysis, and deal-breaker flags | Phase 3: Cross-document synthesis |
| G5 | Generate a structured DD report with executive summary, appendices | Phase 4: Report generation |
| G6 | Two HITL gates: post-extraction and post-synthesis | "The DD workflow has two HITL gates" |
| G7 | Respect provider concurrency (sequential Ollama, parallel cloud) | Constraints: "Provider concurrency is respected" |
| G8 | Handle individual document failures without stopping the pipeline | Constraints: "No fallbacks on document failures" |
| G9 | Introduce batch patterns reusable by Discovery Document Review (#7) | "introduces the pattern Discovery (#7) scales up" |

### Success Criteria

- **SC1:** A 50-document room completes end-to-end on cloud providers within 30 minutes (excluding HITL wait time).
- **SC2:** A 200-document room completes end-to-end on Ollama as an overnight job (< 12 hours).
- **SC3:** Every document in the room has a classification, risk score, and status in the Document Index.
- **SC4:** Failed documents are marked with the real error and noted in the final report; the pipeline does not stop.
- **SC5:** The risk matrix correctly aggregates findings across all analyzed documents with clause-level citations.
- **SC6:** Both HITL gates interrupt the graph and resume correctly after attorney review.
- **SC7:** No cross-room state leakage: specialists' running findings from Room A never appear in Room B.
- **SC8:** Upload enforcement: individual documents rejected above 50MB, total room rejected above 1GB.

---

## 3. User Stories / Use Cases

### US1: Create a Due Diligence Room

**As** an M&A attorney, **I want to** create a DD room by uploading documents and specifying deal context, **so that** the system analyzes the entire data room and produces a comprehensive DD report.

**Acceptance:**
- Upload up to 500 documents individually, as a batch, or as a ZIP.
- Provide deal context: transaction type (acquisition, merger, investment, joint venture, asset purchase), target company, buyer company, deal value range, jurisdiction(s).
- Optionally specify focus areas and known issues.
- Receive a job ID and see the room appear in the Legal Department workspace.

### US2: Monitor DD Room Progress

**As** an attorney, **I want to** see real-time progress of document analysis, **so that** I know which documents have been classified and analyzed.

**Acceptance:**
- The Document Index tab updates in real time via SSE as documents are classified and analyzed.
- Each document row shows: name, type, risk score, status (pending / classifying / analyzing / complete / failed).
- Overall progress shows "Analyzing document N of M" with a percentage.

### US3: Review After Extraction (HITL Gate 1)

**As** an attorney, **I want to** review the document index and initial findings after extraction, **so that** I can correct misclassifications, flag documents for deeper analysis, add focus areas, or skip irrelevant documents before synthesis runs.

**Acceptance:**
- Job transitions to `awaiting_review` after all documents are extracted and analyzed.
- Review modal shows the Document Index with classifications, risk flags per document, and initial specialist findings.
- Attorney can: approve (continue to synthesis), reject (with feedback), modify (correct classifications), deepen (flag specific documents for Legal Research deep-dive), redirect (add/change focus areas).

### US4: Review After Synthesis (HITL Gate 2)

**As** an attorney, **I want to** review the risk matrix and deal-breaker flags before the final report is generated, **so that** I can reclassify risks, request deeper research on specific findings, or add commentary.

**Acceptance:**
- Job transitions to `awaiting_review` after synthesis completes.
- Review modal shows: risk matrix, deal-breaker flags, per-category summaries, missing document list.
- Attorney can: approve (generate report), reject (re-run synthesis with feedback), modify (reclassify risks, edit deal-breaker flags), deepen (fire Legal Research on specific findings).

### US5: View the DD Report

**As** an attorney, **I want to** view and download the completed DD report, **so that** I can share it with the deal team and client.

**Acceptance:**
- Report tab shows the full DD report in rendered markdown.
- Report includes: executive summary, risk matrix, per-category detailed analysis, document index with per-document risk scores, cross-reference map, appendix with per-document annotations.
- Report is downloadable as markdown.

### US6: Handle Document Failures

**As** an attorney, **I want** documents that fail parsing or analysis to be clearly marked as failed with the real error, **so that** I know what wasn't analyzed and can address it.

**Acceptance:**
- Failed documents show in the Document Index with status "failed" and the error message.
- The final report includes a "Failed Documents" section listing each failure with the reason.
- The pipeline continues past failures without stopping.

---

## 4. Technical Requirements

### 4.1 Architecture

#### 4.1.1 DD Room LangGraph Workflow

A new LangGraph StateGraph at `apps/forge/api/src/agents/legal-department/workflows/due-diligence/`. The graph structure:

```
[intake] -> [classify_all] -> [dispatch_loop] -> [hitl_gate_1] -> [synthesis] -> [hitl_gate_2] -> [report_generation] -> [complete]
                                    ^    |
                                    |    v
                                [analyze_document]
```

**Nodes:**

1. **intake** - Validates deal context, initializes document index from uploaded documents, sets initial state.
2. **classify_all** - Runs lightweight LLM classification on each document (type, parties, date, one-line summary). Populates the Document Index. Uses the existing `DocumentExtractionRouter` for text extraction and the clause segmentation approach from Contract Review.
3. **dispatch_loop** - The document dispatcher. Maintains a queue of unanalyzed documents in graph state. Dispatches documents to `analyze_document` one at a time (Ollama) or in parallel batches (cloud providers). This is a loop node with a conditional edge: if unanalyzed documents remain, loop back; otherwise, proceed to `hitl_gate_1`.
4. **analyze_document** - Runs the specialist pipeline on a single document. The CLO routing node determines which specialists apply. Each specialist receives the running findings summary as cross-document context. After analysis, the specialist appends key findings to the running findings summary in state.
5. **hitl_gate_1** - `interrupt()` call. Presents the Document Index and initial findings for attorney review. Resume with `ReviewDecisionPayload`.
6. **synthesis** - Runs after HITL Gate 1 approval. Produces: risk matrix, per-category analysis, deal-breaker flags, missing document list, cross-reference map. Reads all specialist outputs and running findings summaries from state.
7. **hitl_gate_2** - `interrupt()` call. Presents synthesis results for attorney review.
8. **report_generation** - Assembles the final DD report from synthesis output, document index, and per-document annotations. Produces structured markdown.
9. **complete** - Marks job completed, stores result.

#### 4.1.2 Dispatcher Loop Pattern

The dispatcher is a **loop node within the graph**, not a separate job queue. Key mechanics:

- State field `documentQueue: string[]` holds document IDs yet to be analyzed.
- State field `documentsAnalyzed: string[]` tracks completed document IDs.
- State field `documentsFailed: Record<string, string>` maps failed document IDs to error messages.
- The conditional edge after `dispatch_loop` checks: if `documentQueue.length > 0`, route back to `dispatch_loop`; otherwise, route to `hitl_gate_1`.

**Provider concurrency:** The dispatcher reads `executionContext.provider` to determine concurrency. For Ollama (`provider === 'ollama'`), dispatch one document at a time. For cloud providers, dispatch up to `N` documents in parallel (using the existing provider concurrency semaphore from `LegalJobWorkerService`). The graph checkpoints after each document, so a crash mid-room resumes from the last completed document.

#### 4.1.3 Running Findings Summary

Each specialist maintains a running findings summary in state. The summary is a compressed, structured representation — not the full analysis of every prior document.

```typescript
interface RunningFindingsSummary {
  specialistKey: string;
  documentCount: number;
  keyFindings: Array<{
    documentId: string;
    documentName: string;
    finding: string;        // One-line summary
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;       // Risk category
  }>;
  crossReferences: Array<{
    sourceDocId: string;
    targetDocId: string;
    relationship: string;   // e.g., "references schedule defined in"
  }>;
  cumulativeRisks: string[];  // Risks that span multiple documents
}
```

After analyzing each document, the specialist appends to the running findings summary in state. The summary is passed as context to subsequent document analyses for that specialist. The full per-document analysis is stored separately in state (for the appendix) but is NOT passed to subsequent analyses.

#### 4.1.4 Integration with Existing Patterns

- **Specialist pipeline:** Reuses the existing 8 specialists via `runSpecialistOverDocuments()` from `specialist-utils.ts`. Each specialist call receives the running findings summary as additional context in the user message.
- **CLO routing:** Reuses `CloRoutingNode` to determine which specialists apply to each document type.
- **Contract Review annotations:** Per-document clause-level annotation output (from workflow #1) is stored and included in the report appendix.
- **Legal Research deep-dive:** HITL Gate 1 and Gate 2 `deepen` decisions fire the recursive research graph from workflow #2 on flagged findings.
- **Job queue:** One row in `legal.agent_jobs` per DD room. Job type: `due-diligence`.
- **HITL:** Reuses `GraphInterrupt` -> `interrupt()` -> `markAwaitingReview()` -> `POST /jobs/:id/review` pattern.
- **WorkflowRagService:** `globalSearch()` available for cross-document queries during synthesis. The DD room's documents are indexed into a room-scoped RAG collection.

### 4.2 Data Model

#### 4.2.1 DD Room State (LangGraph)

New state annotation: `DueDiligenceStateAnnotation` in `workflows/due-diligence/due-diligence.state.ts`.

```typescript
// Extends the pattern from LegalDepartmentStateAnnotation
export const DueDiligenceStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,

  executionContext: Annotation<ExecutionContext>({ ... }),

  // --- Deal Context (set at intake) ---
  dealContext: Annotation<{
    transactionType: 'acquisition' | 'merger' | 'investment' | 'joint_venture' | 'asset_purchase';
    targetCompany: string;
    buyerCompany: string;
    dealValueRange?: string;
    jurisdictions: string[];
    focusAreas: string[];
    knownIssues: string[];
  }>({ reducer: (_, next) => next, default: () => ({ ... }) }),

  // --- Document Management ---
  /** All documents in the room, with extracted text */
  documents: Annotation<Array<{
    documentId: string;
    name: string;
    content: string;
    mimeType?: string;
    sizeBytes: number;
  }>>({ reducer: (_, next) => next, default: () => [] }),

  /** Classification and metadata per document (index-aligned with documents) */
  documentIndex: Annotation<Array<{
    documentId: string;
    name: string;
    documentType: string;
    parties: string[];
    date: string | null;
    summary: string;
    riskScore: number | null;          // Set after specialist analysis
    status: 'pending' | 'classifying' | 'classified' | 'analyzing' | 'complete' | 'failed';
    error?: string;
    specialistsAssigned: string[];     // Which specialists were routed
    specialistsCompleted: string[];    // Which have finished
  }>>({ reducer: (_, next) => next, default: () => [] }),

  // --- Dispatcher State ---
  /** Document IDs not yet analyzed */
  documentQueue: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),
  /** Document IDs successfully analyzed */
  documentsAnalyzed: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),
  /** Document IDs that failed, mapped to error message */
  documentsFailed: Annotation<Record<string, string>>({ reducer: (prev, next) => ({ ...prev, ...next }), default: () => ({}) }),

  // --- Specialist Outputs ---
  /** Per-document specialist outputs, keyed by documentId */
  perDocumentOutputs: Annotation<Record<string, {
    specialistOutputs: Record<string, unknown>;  // keyed by specialist key
    routingDecision: RoutingDecision;
    clauseAnnotations?: ClauseAnnotation[];
  }>>({ reducer: (prev, next) => ({ ...prev, ...next }), default: () => ({}) }),

  // --- Running Findings (cross-document context) ---
  /** One RunningFindingsSummary per specialist, keyed by specialist key */
  runningFindings: Annotation<Record<string, RunningFindingsSummary>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // --- Synthesis Outputs ---
  riskMatrix: Annotation<RiskMatrix | undefined>({ ... }),
  perCategoryAnalysis: Annotation<Record<string, CategoryAnalysis> | undefined>({ ... }),
  dealBreakerFlags: Annotation<DealBreakerFlag[] | undefined>({ ... }),
  missingDocuments: Annotation<MissingDocument[] | undefined>({ ... }),
  crossReferenceMap: Annotation<CrossReference[] | undefined>({ ... }),

  // --- Report ---
  report: Annotation<string | undefined>({ ... }),  // Final markdown report

  // --- Orchestration ---
  status: Annotation<'intake' | 'classifying' | 'analyzing' | 'awaiting_extraction_review' | 'synthesizing' | 'awaiting_synthesis_review' | 'generating_report' | 'completed' | 'failed'>({ ... }),
  phase: Annotation<1 | 2 | 3 | 4>({ ... }),
  error: Annotation<string | undefined>({ ... }),
  startedAt: Annotation<number>({ ... }),
  completedAt: Annotation<number | undefined>({ ... }),

  // --- HITL ---
  hitlGate1Decision: Annotation<ReviewDecisionPayload | undefined>({ ... }),
  hitlGate2Decision: Annotation<ReviewDecisionPayload | undefined>({ ... }),
});
```

#### 4.2.2 Synthesis Output Types

```typescript
interface RiskMatrix {
  cells: Array<{
    category: 'contractual' | 'ip' | 'employment' | 'regulatory' | 'financial' | 'corporate' | 'environmental';
    severity: 'critical' | 'high' | 'medium' | 'low';
    count: number;
    documentRefs: Array<{ documentId: string; documentName: string; finding: string }>;
  }>;
}

interface CategoryAnalysis {
  category: string;
  narrative: string;          // Markdown narrative summary
  findings: Array<{
    documentId: string;
    documentName: string;
    clauseRef?: string;       // Clause identifier for citation
    finding: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    recommendation: string;
  }>;
  overallRisk: 'critical' | 'high' | 'medium' | 'low';
}

interface DealBreakerFlag {
  finding: string;
  category: string;
  severity: 'critical';
  documentRefs: Array<{ documentId: string; documentName: string; clauseRef?: string }>;
  reasoning: string;
  recommendation: string;
}

interface MissingDocument {
  referencedIn: { documentId: string; documentName: string; clauseRef?: string };
  description: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
}

interface CrossReference {
  sourceDocId: string;
  sourceDocName: string;
  targetDocId: string;
  targetDocName: string;
  relationship: string;
  riskImplication?: string;
}
```

#### 4.2.3 Job Queue Extension

The existing `legal.agent_jobs` table is reused with no schema changes. DD rooms use:
- `job_type = 'due-diligence'`
- `document_count` = total documents in the room
- `document_paths` = storage paths for all uploaded documents
- `input` = `{ data: { dealContext, documents }, metadata: { jobType: 'due-diligence' } }`
- `result` = `{ report, riskMatrix, documentIndex, synthesis }` on completion

The `DD_JOB_TYPE = 'due-diligence'` constant is added to `legal-jobs.types.ts`.

### 4.3 API

#### 4.3.1 Create DD Room

```
POST /legal-department/jobs/upload
```

Extended to support DD room creation. The existing endpoint already handles multi-file upload (up to 10). Changes:

- Accept a `dealContext` field in the multipart form data (JSON string).
- Accept `jobType: 'due-diligence'` in metadata to distinguish from single-document analysis.
- Raise the file count limit to 500 for DD room jobs.
- Enforce per-file limit of 50MB and total room limit of 1GB.
- Accept ZIP files; extract and process each contained file individually.
- Return `{ jobId, conversationId, status: 'queued', documentCount }`.

#### 4.3.2 DD Room Status

```
GET /legal-department/jobs/:id
```

Existing endpoint. The `AgentJobRow` response already includes `progress`, `current_step`, `last_message`, `status`, and `result`. For DD rooms:

- `current_step` = `'classifying' | 'analyzing_doc_N_of_M' | 'awaiting_extraction_review' | 'synthesizing' | 'awaiting_synthesis_review' | 'generating_report'`
- `last_message` = human-readable progress, e.g., "Analyzing document 23 of 147 — Employment Agreement (AcmeCorp)"
- `progress` = calculated as: classification (10%) + analysis (10-75%, proportional to docs completed) + synthesis (75-85%) + report (85-100%)

#### 4.3.3 DD Room Document Index

```
GET /legal-department/jobs/:id/document-index
```

New endpoint. Returns the current document index from the graph state checkpoint. Response:

```json
{
  "documentIndex": [
    {
      "documentId": "doc-001",
      "name": "Master Services Agreement.pdf",
      "documentType": "contract",
      "parties": ["AcmeCorp", "TargetCo"],
      "date": "2024-03-15",
      "summary": "Professional services agreement with 3-year term",
      "riskScore": 72,
      "status": "complete",
      "specialistsAssigned": ["contract", "ip", "privacy"],
      "specialistsCompleted": ["contract", "ip", "privacy"]
    }
  ],
  "totalDocuments": 147,
  "analyzed": 23,
  "failed": 1,
  "pending": 123
}
```

#### 4.3.4 DD Room Risk Matrix

```
GET /legal-department/jobs/:id/risk-matrix
```

New endpoint. Returns the risk matrix from synthesis. Only available after Phase 3 (synthesis) completes. Returns 404 if synthesis has not run.

#### 4.3.5 DD Room Report

```
GET /legal-department/jobs/:id/report
```

New endpoint. Returns the final DD report as markdown. Only available after Phase 4 (report generation) completes. Returns 404 if report has not been generated.

#### 4.3.6 HITL Review

```
POST /legal-department/jobs/:id/review
```

Existing endpoint. No changes needed. The `ReviewDecisionPayload` already supports `approve`, `reject`, `modify`, `deepen`, and `redirect` decisions. The DD graph's HITL nodes interpret these decisions in the DD context:

- **Gate 1 (post-extraction):** `modify` includes classification corrections and document skip list. `deepen` triggers Legal Research on specific documents. `redirect` adds focus areas.
- **Gate 2 (post-synthesis):** `modify` includes risk reclassifications and deal-breaker edits. `deepen` triggers Legal Research on specific findings.

#### 4.3.7 SSE Progress Events

```
GET /legal-department/jobs/:id/events (existing SSE endpoint)
```

Existing SSE stream. DD rooms emit additional event types via the existing observability pipeline:

- `dd:document_classified` — `{ documentId, name, documentType, summary }`
- `dd:document_analysis_started` — `{ documentId, name, specialists }`
- `dd:document_analysis_complete` — `{ documentId, name, riskScore, findingCount }`
- `dd:document_analysis_failed` — `{ documentId, name, error }`
- `dd:classification_complete` — `{ totalDocuments, typeBreakdown }`
- `dd:synthesis_started` — `{}`
- `dd:synthesis_complete` — `{ riskMatrixSummary, dealBreakerCount }`
- `dd:report_generated` — `{}`

### 4.4 Frontend

#### 4.4.1 DD Room Entry Point

In `LegalDepartmentWorkspace.vue`, add a "Due Diligence Room" button alongside the existing job creation flow. This opens a `CreateDDRoomModal.vue` with:

- Multi-file upload area (drag-and-drop, file picker, ZIP support).
- Deal context form: transaction type (dropdown), target company (text), buyer company (text), deal value range (text), jurisdictions (multi-select/tags).
- Optional: focus areas (tag input), known issues (textarea).
- File size validation: per-file 50MB, total 1GB. Display running total.
- Submit creates the job and navigates to the DD room detail view.

#### 4.4.2 DD Room Detail View

New component: `DueDiligenceRoomView.vue`. Three tabs:

**Tab 1: Document Index** (`DataRoomViewer.vue`)
- Table with columns: Status icon, Document Name, Type, Parties, Date, Risk Score.
- Status icons: pending (gray), classifying (blue spinner), analyzing (blue spinner), complete (green check), failed (red X).
- Rows update in real time via SSE events.
- Click a row to expand and show per-document specialist findings and clause annotations.
- Sortable by any column. Filterable by type, status, risk score range.
- Shows overall stats bar: "147 documents: 23 complete, 1 failed, 123 pending".

**Tab 2: Risk Matrix** (`RiskMatrix.vue`)
- 7-column (categories) x 4-row (severities) grid.
- Each cell shows the count of findings. Color-coded by severity.
- Click a cell to expand and show the specific findings with document references.
- Deal-breaker flags highlighted separately above the matrix.
- Available only after synthesis (Phase 3). Shows "Awaiting synthesis..." placeholder before.

**Tab 3: Report** (`ReportMarkdown.vue` - reuse existing)
- Rendered markdown of the full DD report.
- Download button for raw markdown.
- Available only after report generation (Phase 4). Shows "Awaiting report generation..." placeholder before.

#### 4.4.3 Review Modals

Two review modals, both extending the existing `LegalJobReviewModal.vue` pattern:

**HITL Gate 1 Modal:** Shows the Document Index with checkboxes for selecting documents to skip, type dropdown for reclassification, and fields for adding focus areas. Decision buttons: Approve, Reject, Modify, Deepen.

**HITL Gate 2 Modal:** Shows the Risk Matrix (read-only with inline edit for severity), deal-breaker flags (toggle on/off, add commentary), and a guidance textarea. Decision buttons: Approve, Reject, Modify, Deepen.

### 4.5 Infrastructure

#### 4.5.1 File Upload Scaling

The existing `POST /legal-department/jobs/upload` uses `DocumentExtractionRouter` for text extraction. For DD rooms:

- Multer config: raise `maxFiles` from 10 to 500 for DD room requests.
- ZIP handling: detect ZIP MIME type, extract in memory, process each contained file through `DocumentExtractionRouter`.
- Storage: all documents stored under `legal-dd/{conversationId}/` in `MEDIA_STORAGE_PROVIDER`.
- Extraction: run text extraction sequentially to avoid memory pressure on large rooms.

#### 4.5.2 RAG Indexing

Each DD room's documents are indexed into a room-scoped RAG collection via `WorkflowRagService`:

- Collection name: `dd-room-{conversationId}`
- Indexed after text extraction, before specialist analysis.
- Available for cross-document queries during synthesis via `globalSearch()`.
- Collection is retained after job completion for future reference (no auto-deletion).

#### 4.5.3 Checkpointing

LangGraph checkpoints after every node transition. For the dispatcher loop, this means a checkpoint after each document analysis. If the worker crashes mid-room, it resumes from the last checkpoint with all prior document analyses intact.

The existing `MemorySaver` (dev) and Supabase checkpointer (prod) handle this automatically.

---

## 5. Non-Functional Requirements

### 5.1 Performance

- **Classification (Phase 1):** < 5 seconds per document on cloud, < 15 seconds on Ollama. A 200-document room classifies in < 17 minutes (cloud) or < 50 minutes (Ollama).
- **Analysis (Phase 2):** Per-document specialist analysis time matches existing single-document analysis (30-120 seconds on cloud, 2-5 minutes on Ollama per specialist). Cloud providers parallelize across specialists and documents.
- **Synthesis (Phase 3):** < 5 minutes for rooms up to 500 documents. The running findings summaries provide compressed input.
- **Report (Phase 4):** < 2 minutes. Template-driven assembly from structured synthesis output.

### 5.2 Scalability

- Must handle 500 documents per room without running out of memory. Documents are processed one at a time (Ollama) or in bounded batches (cloud). Full document text is NOT held in graph state for all documents simultaneously; it is loaded from storage per-document during analysis.
- Running findings summaries must stay under 32K tokens per specialist even for 500-document rooms. The summary is compressed, not appended raw.

### 5.3 Reliability

- Individual document failures do not stop the pipeline. The error is recorded, the document is marked failed, and the pipeline continues.
- Worker crashes resume from the last LangGraph checkpoint. No document is analyzed twice.
- The job queue's `FOR UPDATE SKIP LOCKED` atomic claim prevents double-processing.

### 5.4 Observability

- Every LLM call carries the `ExecutionContext` with the room's `conversationId` for cost attribution and tracing.
- Progress events are written to `observability_events` for durable replay.
- The `current_step` and `last_message` fields on `agent_jobs` provide at-a-glance status.

### 5.5 Security

- All document storage under `MEDIA_STORAGE_PROVIDER` scoped to `legal-dd/{conversationId}/`.
- All API endpoints filtered by `org_slug` from `ExecutionContext`.
- No cross-room state leakage: each DD room's graph state, RAG collection, and running findings are isolated by `conversationId`.

---

## 6. Out of Scope

| Item | Reason | Future |
|------|--------|--------|
| Incremental room updates (adding documents after analysis starts) | Requires re-running synthesis with delta; complex state management | Future enhancement |
| Automated deal memo generation | DD report identifies risks; drafting the acquisition agreement is a separate workflow | Future workflow |
| Financial analysis | Financial DD is a different discipline; specialists analyze legal documents only | Future expansion |
| Data room access controls | All org users can see all DD rooms; per-room ACL is a hardening item | Future hardening |
| Comparison across DD rooms | "Compare risk profiles across acquisitions" is an analytics feature | Future analytics |

---

## 7. Dependencies & Risks

### Dependencies

| Dependency | Status | Impact if Blocked |
|------------|--------|-------------------|
| Contract Review (#1) - clause annotation format | Completed | Per-document annotations in report appendix |
| Legal Research (#2) - recursive research pattern | Completed | `deepen` decisions at HITL gates fire Legal Research |
| Legal Department async workspace + HITL | Completed | Job queue, worker, review flow, SSE progress |
| `DocumentExtractionRouter` (text extraction) | Completed | PDF/DOCX/TXT extraction for uploaded documents |
| `WorkflowRagService` (RAG indexing) | Completed | Cross-document queries during synthesis |
| Provider concurrency semaphore | Completed | Sequential Ollama / parallel cloud dispatch |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Running findings summary exceeds context window on large rooms | Medium | Analysis quality degrades | Implement token-budget-aware summary compression; truncate oldest findings when approaching limit |
| 500-document room causes memory pressure during extraction | Medium | Worker OOM | Load documents from storage per-document; do not hold all text in graph state simultaneously |
| Ollama throughput too slow for large rooms | High | Overnight job becomes multi-day | Document this as expected; recommend cloud providers for rooms > 100 documents |
| ZIP extraction creates unexpected file types | Low | Extraction failures | Validate extracted files against supported MIME types; skip unsupported with clear error |
| LangGraph checkpoint size grows large with 500 per-document outputs | Medium | Checkpoint save/load becomes slow | Store per-document outputs in database keyed by documentId; keep only summaries in graph state |

---

## 8. Phasing

### Phase 1: DD Room Skeleton + Document Ingestion

**Scope:** Create the DD room job type, upload endpoint extension, document extraction pipeline, and the basic graph skeleton with intake and classification nodes.

**Deliverables:**
- `DD_JOB_TYPE = 'due-diligence'` constant in `legal-jobs.types.ts`
- `workflows/due-diligence/` directory with state, graph, and node files
- `DueDiligenceStateAnnotation` with deal context, document management, and dispatcher fields
- `intake` node: validates deal context, initializes document index
- `classify_all` node: classifies each document (type, parties, date, summary) using lightweight LLM call
- Upload endpoint extension: accept `jobType: 'due-diligence'`, raise file limit to 500, enforce 50MB/1GB limits, handle ZIP extraction
- Document storage under `legal-dd/{conversationId}/` in `MEDIA_STORAGE_PROVIDER`
- Worker updated to handle `due-diligence` job type
- Frontend: `CreateDDRoomModal.vue` with file upload + deal context form

**Validation:**
- Upload 10 documents as a DD room. Job appears in workspace with status "classifying".
- After classification, `GET /jobs/:id/document-index` returns all 10 documents with type, parties, date, summary.
- ZIP upload extracts and classifies contained files.
- Per-file (50MB) and total (1GB) limits enforced with clear error messages.

### Phase 2: Document Dispatcher + Specialist Analysis

**Scope:** Implement the dispatcher loop node, per-document specialist analysis with running findings summaries, and individual document failure handling.

**Deliverables:**
- `dispatch_loop` node: maintains `documentQueue`, dispatches documents respecting provider concurrency
- `analyze_document` node: runs CLO routing + specialist pipeline on a single document, appends to running findings summary
- `RunningFindingsSummary` type and compression logic (token-budget-aware)
- Conditional edge: loop back if documents remain, proceed to HITL gate 1 if all processed
- Per-document failure handling: catch errors, mark document as failed, continue pipeline
- Per-document progress events via observability pipeline
- Frontend: `DataRoomViewer.vue` component with real-time SSE updates, status icons, stats bar

**Validation:**
- Upload 20 documents. Each document is classified, routed to specialists, and analyzed sequentially (Ollama) or in parallel (cloud).
- Running findings summary grows across documents: specialist analyzing doc #10 references findings from docs #1-9.
- Deliberately upload one unparseable file: it is marked "failed" in the document index, pipeline continues, other documents complete.
- SSE events update the Document Index tab in real time.
- `progress` field reflects document completion percentage.

### Phase 3: HITL Gates + Synthesis

**Scope:** Implement both HITL gates and the synthesis node.

**Deliverables:**
- `hitl_gate_1` node: `interrupt()` after all documents analyzed, presents document index + findings
- `hitl_gate_2` node: `interrupt()` after synthesis, presents risk matrix + deal-breaker flags
- `synthesis` node: produces risk matrix, per-category analysis, deal-breaker flags, missing document list, cross-reference map
- HITL Gate 1 review modal: document reclassification, skip, focus area additions, deepen
- HITL Gate 2 review modal: risk reclassification, deal-breaker edits, deepen
- `deepen` decision handler: fires Legal Research workflow on flagged findings/documents
- `GET /jobs/:id/risk-matrix` endpoint
- Frontend: `RiskMatrix.vue` component with clickable cells

**Validation:**
- After analysis completes, job transitions to `awaiting_review`. HITL Gate 1 modal appears with document index and findings.
- Approve Gate 1: synthesis runs, producing risk matrix and deal-breaker flags.
- After synthesis, job transitions to `awaiting_review` again. HITL Gate 2 modal shows risk matrix.
- Modify at Gate 1: correct a classification, re-run affected analysis.
- Modify at Gate 2: downgrade a deal-breaker, commentary persists to report.
- Deepen at Gate 2: Legal Research fires on a flagged finding.
- Risk matrix endpoint returns structured data; frontend renders the grid.

### Phase 4: Report Generation + Polish

**Scope:** Implement the report generation node, report tab, and end-to-end polish.

**Deliverables:**
- `report_generation` node: assembles structured markdown report (executive summary, risk matrix, per-category analysis, document index, cross-reference map, appendix)
- `GET /jobs/:id/report` endpoint
- Frontend: Report tab with rendered markdown and download button
- RAG indexing: index DD room documents into `dd-room-{conversationId}` collection during Phase 1
- RAG queries during synthesis for cross-document analysis
- End-to-end testing: 50-document room on cloud, 10-document room on Ollama
- Progress calculation: 0-10% classification, 10-75% analysis, 75-85% synthesis, 85-100% report

**Validation:**
- Complete a 50-document DD room end-to-end on a cloud provider within 30 minutes (excluding HITL wait).
- Report contains all six sections: executive summary, risk matrix, per-category analysis, document index with risk scores, cross-reference map, appendix with per-document annotations.
- Report accurately reflects HITL modifications (reclassified risks, added commentary, downgraded deal-breakers).
- Complete a 10-document room on Ollama end-to-end.
- Failed documents appear in the report's "Failed Documents" section with real errors.
- No cross-room state leakage: create two DD rooms, verify specialist findings from Room A do not appear in Room B's analysis or report.

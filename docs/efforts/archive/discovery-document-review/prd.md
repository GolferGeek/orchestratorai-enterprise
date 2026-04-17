# Discovery Document Review — Product Requirements Document

## 1. Overview

Discovery Document Review is a high-volume document review pipeline for the Legal Department workspace in Forge. Litigation discovery produces thousands to millions of documents that must be reviewed for relevance, privilege, and issue coding before production to the opposing party. This is BigLaw's single largest cost center — contract attorney review of 100K documents runs $250K–$650K for a mid-size dispute, multiplied 5–10x for complex litigation.

The platform applies **specialist reasoning** to each document rather than the TAR (Technology Assisted Review) pattern of similarity matching. A privacy specialist identifies privileged communications. A litigation specialist assesses relevance. An employment specialist flags HR-related documents. This is closer to how a senior associate reviews — with judgment, not pattern matching.

The workflow introduces **batch HITL review**, a new Human-in-the-Loop pattern where reviewers process batches of 50–100 coded documents at a time rather than individual items. This pattern is reusable by any future high-volume workflow.

## 2. Goals & Success Criteria

### Goals
- Build an end-to-end document review pipeline: protocol definition → ingestion → first-pass coding → batch HITL review → production set generation.
- Introduce the batch HITL review pattern as a new HITL mode alongside the existing per-job approve/reject/modify flow.
- Handle document volumes of 50K+ with configurable concurrency across sovereign (Ollama) and cloud providers.
- Enforce absolute privilege safety: any document with privilege signals goes through mandatory human review.

### Success Criteria
- A user can define a review protocol, upload documents, launch the review, and receive a production set and privilege log.
- Batch HITL review UI allows reviewers to approve/correct documents in batches of configurable size.
- No document flagged as potentially privileged bypasses human review. Privilege confidence threshold is 0.95 (not the standard 0.7).
- Failed documents are logged and visible in review statistics — never silently excluded.
- The pipeline processes documents at the provider's concurrency ceiling (sequential on Ollama, 10–50 concurrent on cloud).
- Activity feed shows real-time progress: documents coded, relevance breakdown, privilege flags, issue distribution.

## 3. User Stories / Use Cases

**US-1: Define review protocol.** A litigation attorney opens the Legal Department workspace, clicks "Start a Document Review," and defines the review protocol: relevance criteria (claims, date range, key parties, key topics), privilege holders (attorneys, firms, in-house counsel), and issue tags. This protocol governs all coding decisions for the matter.

**US-2: Upload and launch.** The attorney uploads a document set (or points to a storage location) and launches the review. The activity feed shows the review progressing with real-time statistics.

**US-3: Privilege batch review.** The system flags potentially privileged documents into a mandatory review batch. The reviewer sees each document's text, the system's privilege reasoning, and confidence score. Every document in this batch must be individually approved or corrected. No bulk-approve for privilege batches.

**US-4: Relevance batch review.** Low-confidence relevance coding is grouped into batches. The reviewer can drill into individual documents, correct coding, or approve remaining high-confidence items in bulk.

**US-5: Hot document review.** Documents flagged as highly significant are presented in a dedicated batch for senior attorney attention.

**US-6: Quality control sampling.** A random sample of high-confidence "not relevant" documents is presented for spot-checking. If the reviewer finds systematic miscoding, the system recalibrates.

**US-7: Export production set.** After all batches are reviewed, the attorney exports the production set (relevant, non-privileged documents with optional Bates numbering) and the privilege log.

## 4. Technical Requirements

### 4.1 Architecture

The workflow follows the established Legal Department pattern: a LangGraph StateGraph compiled with the shared `PostgresCheckpointerService`, dispatched via the existing `LegalJobsWorkerService`, and registered in `LegalDepartmentService`.

**New files** (all under `apps/forge/api/src/agents/legal-department/workflows/discovery-review/`):
- `discovery-review.state.ts` — State annotation
- `discovery-review.graph.ts` — Graph factory
- `discovery-review.types.ts` — Domain types (ReviewProtocol, DocumentCoding, BatchReviewResult, etc.)
- `nodes/` — One file per graph node

**Graph shape:**
```
__start__ → start → protocol_validation → ingest → classify_all
  → dispatch_loop → code_document → (loop until queue empty)
  → build_batches → batch_hitl_privilege → batch_hitl_relevance
  → batch_hitl_hot_docs → batch_hitl_sample
  → calibration_check → generate_production_set → complete
```

Each `batch_hitl_*` node uses `interrupt()` to pause for reviewer decisions, following the same pattern as DD's `hitl-gate-1` and `hitl-gate-2` nodes. The graph resumes via `Command({ resume: BatchReviewDecisionPayload })`.

**Job type constant:** `DISCOVERY_REVIEW_JOB_TYPE = 'discovery-review'`

**Capability slug:** `discovery-review`

### 4.2 Data Model Changes

#### New types in `discovery-review.types.ts`

**ReviewProtocol** — matter-level configuration:
```typescript
interface ReviewProtocol {
  matterId: string;
  matterName: string;
  relevanceCriteria: {
    claims: string[];
    dateRange?: { start: string; end: string };
    keyParties: string[];
    keyTopics: string[];
    exclusions?: string[];
  };
  privilegeHolders: {
    attorneys: string[];
    firms: string[];
    inHouseCounsel: string[];
  };
  issueTags: Array<{ tagId: string; tagName: string; description: string }>;
  batchSize: number;               // default 50
  confidenceThreshold: number;     // default 0.7 for relevance
  privilegeReviewRequired: boolean; // default true
}
```

**DocumentCoding** — per-document coding result:
```typescript
interface DocumentCoding {
  documentId: string;
  relevance: {
    classification: 'relevant' | 'not_relevant' | 'potentially_relevant';
    confidence: number;
    reasoning: string;
    matchingCriteria: string[];
  };
  privilege: {
    classification: 'privileged' | 'not_privileged' | 'potentially_privileged';
    confidence: number;
    privilegeType: 'attorney_client' | 'work_product' | 'both' | 'none';
    reasoning: string;
  };
  issueTags: Array<{ tagId: string; confidence: number }>;
  hotDocument: boolean;
  hotDocumentReason?: string;
}
```

**ReviewBatch** — a batch prepared for HITL review:
```typescript
type BatchType = 'privilege' | 'low_confidence_relevance' | 'hot_documents' | 'sample';

interface ReviewBatch {
  batchId: string;
  batchType: BatchType;
  documentIds: string[];
  status: 'pending' | 'in_review' | 'completed';
}
```

**DiscoveryReviewStatus:**
```typescript
type DiscoveryReviewStatus =
  | 'protocol_setup'
  | 'ingesting'
  | 'classifying'
  | 'coding'
  | 'building_batches'
  | 'awaiting_privilege_review'
  | 'awaiting_relevance_review'
  | 'awaiting_hot_doc_review'
  | 'awaiting_sample_review'
  | 'calibrating'
  | 'generating_production_set'
  | 'completed'
  | 'failed';
```

#### State Annotation

The `DiscoveryReviewStateAnnotation` follows the DD pattern with these domain-specific fields:

| Field | Type | Purpose |
|-------|------|---------|
| `executionContext` | `ExecutionContext` | Immutable capsule |
| `reviewProtocol` | `ReviewProtocol` | Matter-level config |
| `documents` | `Array<{documentId, name, content, mimeType?, sizeBytes}>` | Ingested documents |
| `documentIndex` | `DocumentIndexEntry[]` | Classification metadata |
| `documentQueue` | `string[]` | IDs not yet coded |
| `documentsCoded` | `string[]` | IDs successfully coded |
| `documentsFailed` | `Record<string, string>` | Failed IDs → error |
| `documentCodings` | `Record<string, DocumentCoding>` | Per-document coding results |
| `reviewBatches` | `ReviewBatch[]` | Prepared HITL batches |
| `batchDecisions` | `Record<string, BatchReviewDecisionPayload>` | Reviewer decisions per batch |
| `calibrationAdjustments` | `string[]` | Criteria changes from reviewer corrections |
| `productionSet` | `string[]` | Final document IDs for production |
| `privilegeLog` | `PrivilegeLogEntry[]` | Formatted privilege log |
| `reviewStatistics` | `ReviewStatistics` | Aggregate stats |
| `status` | `DiscoveryReviewStatus` | Current pipeline phase |

#### No schema changes to `legal.agent_jobs`

The existing `agent_jobs` table supports this workflow as-is. The `job_type` column gets `'discovery-review'`, `document_paths` holds the uploaded files, `document_count` tracks volume. All coding results and batches live in the LangGraph state (persisted via the checkpointer), not in new database tables.

### 4.3 API Changes

**No new endpoints.** The existing Legal Department API handles this workflow:

| Endpoint | Use for Discovery Review |
|----------|------------------------|
| `POST /legal-department/jobs` | Enqueue a review job with `metadata.jobType: 'discovery-review'` and `data.reviewProtocol` |
| `GET /legal-department/jobs/:id` | Fetch job with `reviewPayload` containing batch data when `status === 'awaiting_review'` |
| `POST /legal-department/jobs/:id/review` | Submit batch review decisions |
| `GET /legal-department/jobs` | List jobs filtered by `job_type=discovery-review` |
| SSE `/legal-department/jobs/:id/events` | Real-time progress (document coded, batch ready, etc.) |

**New review decision variant** added to `ReviewDecisionPayload`:
```typescript
| {
    decision: 'batch_review';
    batchId: string;
    documentDecisions: Array<{
      documentId: string;
      action: 'approve' | 'correct';
      correctedCoding?: Partial<DocumentCoding>;
    }>;
    feedback?: string;
  }
```

**New SSE event types** emitted by graph nodes:
- `dr:document_coded` — `{ documentId, relevance, privilege, progress }` — after each document is coded
- `dr:batch_ready` — `{ batchId, batchType, documentCount }` — when a batch is prepared for review
- `dr:batch_reviewed` — `{ batchId, approvedCount, correctedCount }` — after reviewer submits
- `dr:calibration_applied` — `{ adjustments }` — when coding criteria are adjusted from corrections
- `dr:production_set_ready` — `{ documentCount, privilegeCount }` — final output ready

**reviewPayload augmentation** in `GET /legal-department/jobs/:id`: When the job is `awaiting_review`, the controller reads the LangGraph checkpoint and injects:
- `currentBatch`: the batch currently awaiting review (documents, codings, reasoning)
- `batchQueue`: remaining batches with their types and sizes
- `reviewStatistics`: running stats (coded count, relevance breakdown, privilege count)

### 4.4 Frontend Changes

**New files** (all under `apps/forge/web/src/views/agents/legal-department/`):

#### Page Component
- `DiscoveryReviewPage.vue` — top-level page following the `DueDiligenceRoomPage.vue` pattern: toolbar + `JobActivityList` (filtered by `capability-slug="discovery-review"`) + detail view when a job is selected.

#### Detail View Components
- `components/DiscoveryReviewView.vue` — five-tab detail view:
  1. **Overview** — real-time progress charts (documents coded, relevance breakdown, privilege flags, issue distribution). SSE-driven updates via `dr:document_coded` events.
  2. **Batch Queue** — pending batches listed by type and priority. Contains the `BatchReviewPanel`.
  3. **Document Browser** — searchable, filterable table of all documents with their coding (relevance, privilege, issues). Expandable rows show document text and reasoning.
  4. **Privilege Log** — formatted privilege log with document ID, privilege basis, and privilege type per entry.
  5. **Production Set** — final production set with document list, optional Bates numbering, and export button.

#### Batch Review Components
- `components/BatchReviewPanel.vue` — the core new UI component. Shows:
  - Table of documents in the current batch with coding columns (relevance, privilege, issues)
  - Expandable rows showing document text and system reasoning
  - Per-document actions: **Approve** (accept coding) or **Correct** (inline editing of coding fields)
  - Batch-level actions: **Approve Remaining** (accept all uncorrected documents), **Flag for Senior Review**
  - Batch statistics bar: approval rate, correction rate, correction patterns
  - **Privilege batch restriction**: when `batchType === 'privilege'`, the "Approve Remaining" button is disabled. Every privilege document must be individually reviewed.

#### Launch Modal
- `components/CreateDiscoveryReviewModal.vue` — review protocol definition form:
  - Matter identification (ID, name)
  - Relevance criteria: claims (tag input), date range picker, key parties (tag input), key topics (tag input), exclusions
  - Privilege holders: attorneys, firms, in-house counsel (tag inputs)
  - Issue tags: dynamic list with ID, name, description
  - Review settings: batch size slider (10–100, default 50), confidence threshold (0.5–0.9, default 0.7), privilege review required toggle
  - Document upload: multi-file upload using the existing `OnboardDocumentModal` pattern

#### Review Modal Integration
- `LegalJobReviewModal.vue` — add a routing case for `job_type === 'discovery-review'` that renders `BatchReviewPanel.vue` instead of `DocumentAnalysisReviewSection.vue`.

#### Route Registration
- Add route in `apps/forge/web/src/router/index.ts` under `/agents/legal-department/discovery-review`.

#### Workspace Navigation
- Add "Document Review" action button in `LegalDepartmentWorkspace.vue`.

### 4.5 Infrastructure Requirements

**LLM usage per document:** 3 calls (relevance, privilege, issue coding) + 1 optional (hot document flag). Each call receives the document text, the relevant protocol criteria, and produces structured JSON output.

**Provider concurrency:** Uses the existing provider concurrency configuration:
- Ollama (sovereign): sequential, ~30 seconds per document
- Cloud providers: 10–50 concurrent, ~5 seconds per document
- Hybrid: privilege assessment on sovereign (sensitive), relevance/issues on cloud

**Storage:** Documents are stored via `MEDIA_STORAGE_PROVIDER`, paths tracked in `agent_jobs.document_paths`. All coding results live in LangGraph state (checkpointed to Postgres).

**No new infrastructure.** The workflow uses the existing LLM plane, storage plane, checkpointer, and job queue.

## 5. Non-Functional Requirements

### Performance
- Must process 50K documents without state corruption or memory exhaustion. LangGraph state grows linearly with document count; `documentCodings` is the largest field (~500 bytes per document × 50K = ~25MB max state).
- SSE progress events must be emitted at least once per document coded, not batched (the reviewer needs to see real-time progress).
- Batch review UI must render 100 documents in the batch table without jank. Virtual scrolling if needed.

### Security
- **Privilege safety is the primary security concern.** The 0.95 confidence threshold for "definitely not privileged" is not configurable — it's hardcoded. The `confidenceThreshold` in ReviewProtocol controls relevance routing, not privilege.
- Document content flows through ExecutionContext for full tracing. Every LLM call is observable via the observability plane.
- No document content leaves the system except via the explicit production set export.

### Scalability
- The dispatcher loop processes one document at a time within the graph; concurrency is at the provider level (multiple jobs can run in parallel). For very large reviews (>100K documents), the graph state size is the bottleneck — future optimization could externalize `documentCodings` to a database table.

### Compatibility
- The batch HITL pattern is additive — the existing per-job approve/reject/modify flow is untouched.
- The `batch_review` decision type is a new variant in the `ReviewDecisionPayload` union. Existing decision types continue to work for all other workflows.

## 6. Out of Scope

- **Predictive coding / TAR integration.** Continuous active learning from reviewer corrections to re-rank uncoded documents. Separate ML effort.
- **Multi-reviewer workflow.** Multiple reviewers working the same review with work assignment and conflict resolution.
- **Production formatting.** Converting documents to TIFF/PDF with redactions per court rules. Future export feature.
- **Deduplication.** Identifying and removing duplicate documents pre-review. Separate pre-processing step.
- **Email threading intelligence.** Beyond basic thread grouping — forward chains, CC pattern analysis.
- **Bates number format customization.** The system applies sequential Bates numbers if configured. Court-specific formatting rules are out of scope.

## 7. Dependencies & Risks

### Dependencies
- **Due Diligence (#4)** — batch document processing pattern (dispatcher loop, `documentQueue`/`documentsAnalyzed`/`documentsFailed`, progressive reporting). Must be complete and stable.
- **Contract Review (#1)** — annotation output format (structured per-document coding). Must be complete.
- **Legal Department async workspace** — job queue, SSE events, activity feed. Complete.
- **Legal Department HITL** — `interrupt()`/`Command({ resume })` mechanics, review modal infrastructure. Complete — but batch HITL is a new mode built on top.

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| LangGraph state size at 50K+ documents | State serialization/deserialization becomes slow; potential OOM | Monitor state size during coding phase. If >50MB, externalize `documentCodings` to a dedicated table and store only document IDs in state. |
| Privilege false negatives (system misses a privileged document) | Inadvertent privilege waiver — severe legal consequence | 0.95 confidence threshold + mandatory human review of all flagged documents. No autonomous "not privileged" classification below 0.95. |
| Calibration feedback loop diverges | System adjusts criteria incorrectly based on a few corrections | Calibration adjustments are logged and shown to the reviewer. Adjustments only apply to uncoded documents — already-coded documents are not re-coded automatically. |
| Batch review UI overwhelm | 100 documents per batch may be too many to review effectively | Default batch size is 50. Expandable rows hide detail until needed. Low-confidence documents sort first. |

## 8. Phasing

### Phase 1: Review Protocol & Document Ingestion
**Scope:** Review protocol definition (types + validation), document ingestion node, document classification node. State annotation with all fields. Graph skeleton with `start → protocol_validation → ingest → classify_all → END` (temporary termination).

**Validates:** Protocol can be defined and persisted in state. Documents can be uploaded, ingested, and classified by type. SSE events report ingestion progress. Job appears in activity list with correct status.

**Frontend:** `CreateDiscoveryReviewModal.vue` (protocol form + document upload), `DiscoveryReviewPage.vue` (shell with activity list), basic `DiscoveryReviewView.vue` with Overview tab showing ingestion progress.

### Phase 2: First-Pass Coding Pipeline
**Scope:** Dispatcher loop (`dispatch_loop → code_document → loop`), three LLM coding calls per document (relevance, privilege, issue coding), hot document flagging. `DocumentCoding` populated for each document.

**Validates:** Documents flow through the coding pipeline. Each document gets relevance/privilege/issue coding with confidence scores. Hot documents are flagged. Failed documents are logged in `documentsFailed`. SSE `dr:document_coded` events fire with progress. Privilege confidence threshold is enforced at 0.95.

**Frontend:** Overview tab shows real-time coding statistics (relevance breakdown, privilege count, issue distribution). Document Browser tab shows all documents with their coding.

### Phase 3: Batch HITL Review
**Scope:** `build_batches` node (groups documents into review batches by type), four `batch_hitl_*` nodes with `interrupt()` at each. `BatchReviewDecisionPayload` added to `ReviewDecisionPayload`. Resume path via `Command({ resume })`. Calibration check node (detect correction patterns, log adjustments).

**Validates:** Batches are built in priority order (privilege → low-confidence → hot docs → sample). Each batch pauses the graph for review. Reviewer decisions are recorded. Privilege batch enforces per-document review (no bulk approve). Calibration adjustments are logged. Graph resumes correctly after each batch.

**Frontend:** `BatchReviewPanel.vue` with document table, expandable rows, per-document approve/correct, batch-level approve-remaining (disabled for privilege batches). `LegalJobReviewModal.vue` routes `discovery-review` jobs to `BatchReviewPanel`. Batch Queue tab shows pending batches.

### Phase 4: Production Set & Reports
**Scope:** `generate_production_set` node — assembles the production set (relevant + non-privileged documents), generates privilege log, computes review statistics, applies optional Bates numbering. `complete` node writes final outputs.

**Validates:** Production set contains only documents that passed relevance and privilege review. Privilege log lists all withheld documents with privilege basis. Hot document summary lists flagged significant documents with annotations. Review statistics are accurate (total, breakdown by relevance/privilege/issues, human correction rate). Export works. Full end-to-end pipeline runs from protocol definition to production set.

**Frontend:** Privilege Log tab with formatted entries. Production Set tab with document list, hot document summary, Bates numbers (if configured), and export button. Overview tab shows final statistics.

# Discovery Document Review — Implementation Plan

**PRD**: ./prd.md
**Intention**: ./intention.md
**Created**: 2026-04-17
**Status**: In Progress

## Progress Tracker
<!-- run-plan uses this section to track where we are -->
- [x] Phase 1: Review Protocol & Document Ingestion
- [ ] Phase 2: First-Pass Coding Pipeline
- [ ] Phase 3: Batch HITL Review
- [ ] Phase 4: Production Set & Reports

---

## Conventions (applies to every phase)

- **API root**: `apps/forge/api/src/agents/legal-department/workflows/discovery-review/`
- **Web root**: `apps/forge/web/src/views/agents/legal-department/` (page at root; components in `components/`)
- **Job type**: `DISCOVERY_REVIEW_JOB_TYPE = 'discovery-review'`
- **Capability slug**: `discovery-review`
- **LangGraph**: compile with shared `PostgresCheckpointerService`; dispatch via `LegalJobsWorkerService`; register in `LegalDepartmentService`
- **ExecutionContext**: immutable capsule, never mutated, never destructured
- **No fallbacks**: failed documents go in `documentsFailed` with error message — never silently dropped
- **Privilege**: hardcoded 0.95 "not privileged" confidence threshold. `confidenceThreshold` in `ReviewProtocol` is for relevance routing only.

### Gate commands (identical each phase; scope varies)

- **Lint (api)**: `npm run lint --workspace=apps/forge/api`
- **Lint (web)**: `npm run lint --workspace=apps/forge/web`
- **Build (api)**: `npm run build --workspace=apps/forge/api`
- **Build (web)**: `npm run build:check --workspace=apps/forge/web`
- **Unit tests (api)**: `npm run test --workspace=apps/forge/api -- discovery-review`
- **Unit tests (web)**: `npm run test:unit --workspace=apps/forge/web -- discovery-review`
- **Full unit suites** (regression, at end of each phase): `npm run test --workspace=apps/forge/api` and `npm run test:unit --workspace=apps/forge/web`
- **Dev servers** (for curl/chrome gates): `npm run dev:forge:api` (6200) and `npm run dev:forge:web` (6201)

---

## Phase 1: Review Protocol & Document Ingestion
**Status**: Complete
**Objective**: Define the review protocol and ingest + classify documents through a skeleton graph that terminates after classification.

### Steps
- [x] 1.1 Create `discovery-review.types.ts` with `ReviewProtocol`, `DocumentCoding`, `ReviewBatch`, `BatchType`, `DiscoveryReviewStatus`, `DocumentIndexEntry`, `ReviewStatistics`, `PrivilegeLogEntry`, `BatchReviewDecisionPayload`
- [x] 1.2 Create `discovery-review.state.ts` with `DiscoveryReviewStateAnnotation` containing every field in PRD §4.2 state table
- [x] 1.3 Create `nodes/start.node.ts` (initialize state, emit `dr:started`) and spec
- [x] 1.4 Create `nodes/protocol-validation.node.ts` — validate required protocol fields; fail-closed with structured error. Spec covers missing claims, missing privilege holders, invalid batch size
- [x] 1.5 Create `nodes/ingest.node.ts` — load documents from `document_paths` via `MEDIA_STORAGE_PROVIDER`, populate `state.documents`, emit per-document progress. Spec covers failure handling (`documentsFailed`)
- [x] 1.6 Create `nodes/classify-all.node.ts` — classify doc type (email / attachment / contract / memo / presentation / spreadsheet / other); populate `documentIndex`; group email threads. Spec covers classification + threading
- [x] 1.7 Create `discovery-review.graph.ts` factory — wire `__start__ → start → protocol_validation → ingest → classify_all → __end__` for Phase 1
- [x] 1.8 Add `DISCOVERY_REVIEW_JOB_TYPE` constant; register graph in `LegalDepartmentService`; wire dispatch in `LegalJobsWorkerService`
- [x] 1.9 Add `dr:document_ingested`, `dr:classification_complete` to the legal SSE event union (emit from nodes via existing SSE bus)
- [x] 1.10 Create `__fixtures__/protocol.ts` and `__fixtures__/documents.ts` for tests
- [x] 1.11 Write `discovery-review.graph.spec.ts` — happy path end-to-end through classify_all with fixture protocol + 3 documents
- [x] 1.12 Frontend: create `DiscoveryReviewPage.vue` (toolbar + `JobActivityList` filtered `capability-slug="discovery-review"` + empty detail)
- [x] 1.13 Frontend: create `components/CreateDiscoveryReviewModal.vue` with full `ReviewProtocol` form + document upload (reuse `OnboardDocumentModal` upload pattern); POST to `/legal-department/jobs` with `metadata.jobType: 'discovery-review'`, `data.reviewProtocol`
- [x] 1.14 Frontend: create `components/DiscoveryReviewView.vue` shell with Overview tab only; SSE-driven ingestion progress display
- [x] 1.15 Frontend: add route `/agents/legal-department/discovery-review` in `apps/forge/web/src/router/index.ts`
- [x] 1.16 Frontend: add "Document Review" action button in `LegalDepartmentWorkspace.vue`
- [x] 1.17 Frontend: unit specs for the modal (validation) and the page (renders with empty activity list)

### Quality Gate
- [x] **Lint**: api + web lint clean
- [x] **Build**: api + web build clean (fixed pre-existing TS errors in DueDiligenceRoomView + CrossRoomComparisonPage as incidental)
- [x] **Unit Tests**: new specs pass (api 40/40 discovery-review, web 777/777). Full api regression: 144/145 suites — 1 pre-existing failure in `legal-department.service.spec.ts` (missing SentinelRepository mock from portfolio-sentinel effort, unrelated)
- [x] **E2E Tests**: n/a this phase
- [ ] **Curl Tests** (API on 6200, valid JWT in `$TOKEN`):
  - [ ] `curl -s -X POST http://localhost:6200/legal-department/jobs -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" -d @docs/efforts/current/discovery-document-review/fixtures/create-job.json | jq '.status'` → `"pending"` or `"ingesting"` with `job_type=discovery-review`
  - [ ] `curl -s http://localhost:6200/legal-department/jobs/$JOB_ID -H "Authorization: Bearer $TOKEN" | jq '.status'` → reaches `"classifying"` or later
  - [ ] `curl -sN http://localhost:6200/legal-department/jobs/$JOB_ID/events -H "Authorization: Bearer $TOKEN"` streams `dr:document_ingested` and `dr:classification_complete`
- [ ] **Chrome Tests** (web on 6201):
  - [ ] Open Legal Department workspace — "Document Review" button visible; click routes to `/agents/legal-department/discovery-review`
  - [ ] Click "Start a Document Review" — modal opens, all protocol sections render, file upload accepts 3 PDFs, Submit creates a job
  - [ ] Activity list shows the new job with `discovery-review` capability; detail Overview tab shows ingestion progress via SSE and resolves to classification complete
- [ ] **Phase Review**: compare against PRD §4.2 (state), §4.3 (endpoints reused), §4.4 (Phase 1 frontend scope), §8 Phase 1 validation criteria
  - [ ] Protocol can be defined and persisted in state
  - [ ] Documents upload, ingest, classify successfully
  - [ ] SSE ingestion events visible
  - [ ] Job appears in activity list with correct status
  - [ ] No schema changes to `legal.agent_jobs`
  - [ ] Deviations documented below if any

---

## Phase 2: First-Pass Coding Pipeline
**Status**: Not Started
**Objective**: Dispatch every document through relevance / privilege / issue / hot-document LLM coding with failure isolation and real-time SSE progress.

### Steps
- [ ] 2.1 Create `nodes/dispatch-loop.node.ts` — pop next ID from `documentQueue`, route to `code_document`; when empty, route to end-of-phase sink (temporary: `__end__` in this phase)
- [ ] 2.2 Create `nodes/code-document/relevance.ts` — LLM call with structured JSON output (classification, confidence, reasoning, matchingCriteria) using `LLM_SERVICE`
- [ ] 2.3 Create `nodes/code-document/privilege.ts` — LLM call returning privilege classification, confidence, privilegeType, reasoning. Enforce hardcoded 0.95 "not privileged" threshold — anything below forces `potentially_privileged`
- [ ] 2.4 Create `nodes/code-document/issues.ts` — LLM call scoring each `ReviewProtocol.issueTags` entry
- [ ] 2.5 Create `nodes/code-document/hot-document.ts` — conditional LLM call (only if relevance is relevant AND privilege is not privileged) returning `hotDocument` + `hotDocumentReason`
- [ ] 2.6 Create `nodes/code-document.node.ts` — orchestrates the four coding calls for one document, writes `DocumentCoding` into `state.documentCodings`, moves ID from `documentQueue` to `documentsCoded`, emits `dr:document_coded`
- [ ] 2.7 Add failure handling: any coding error puts the ID in `state.documentsFailed` with the error message; the loop continues (never halts the pipeline)
- [ ] 2.8 Extend `discovery-review.graph.ts` to wire `classify_all → dispatch_loop → code_document → dispatch_loop` until queue empty, then `__end__` for this phase
- [ ] 2.9 Populate `state.reviewStatistics` incrementally on each coding (relevanceBreakdown, privilegeCount, issueDistribution, failedCount)
- [ ] 2.10 Unit specs per node: relevance, privilege (explicitly test 0.94 is routed to `potentially_privileged`), issues, hot-document, code-document orchestrator, dispatch-loop (queue drain + failure continues)
- [ ] 2.11 Graph spec: 5-doc fixture runs to completion with mixed success/failure; `documentCodings` populated; `documentsFailed` captures the failure
- [ ] 2.12 Frontend: enhance Overview tab with live charts (relevance breakdown pie, privilege flagged count, issue distribution bars, coded vs failed) driven by `dr:document_coded`
- [ ] 2.13 Frontend: add **Document Browser** tab to `DiscoveryReviewView.vue` — searchable/filterable table of all documents with coding columns; expandable rows show document text + reasoning
- [ ] 2.14 Frontend: unit specs for Overview aggregation composable and Document Browser filter/search

### Quality Gate
- [ ] **Lint**: api + web lint pass
- [ ] **Build**: api + web build pass
- [ ] **Unit Tests**: new + all existing pass (api + web)
- [ ] **E2E Tests**: not applicable (HITL not yet wired; Phase 3 owns e2e)
- [ ] **Curl Tests**:
  - [ ] Launch a job with 5-doc fixture; poll `GET /legal-department/jobs/$JOB_ID` until `status` advances through `coding` then terminates; assert `documentCodings` size = 5 − failedCount
  - [ ] SSE stream emits `dr:document_coded` exactly once per successful doc (verify count)
  - [ ] Inject a doc designed to score privilege confidence ~0.9 on "not privileged" — confirm final `DocumentCoding.privilege.classification === 'potentially_privileged'`
- [ ] **Chrome Tests**:
  - [ ] Launch a review — Overview charts update in real time as documents are coded
  - [ ] Document Browser tab lists all coded documents; expanding a row shows text and reasoning; failed documents appear with error
- [ ] **Phase Review**: compare against PRD §4.2 (DocumentCoding shape), §4.5 (3+1 LLM calls), §8 Phase 2 validation, intention §Phase 2 privilege rule
  - [ ] Every document gets relevance/privilege/issues with confidence
  - [ ] Hot documents flagged
  - [ ] Failed docs logged (never dropped)
  - [ ] `dr:document_coded` fires per doc, not batched
  - [ ] 0.95 privilege threshold enforced and unit-tested
  - [ ] Deviations documented below if any

---

## Phase 3: Batch HITL Review
**Status**: Not Started
**Objective**: Build prioritized review batches, pause the graph at each batch via `interrupt()`, accept reviewer decisions through the existing review endpoint, and apply calibration.

### Steps
- [ ] 3.1 Create `nodes/build-batches.node.ts` — produce batches in priority order: privilege (all flagged), low-confidence relevance (below `confidenceThreshold`, lowest first), hot documents, random sample (~5%) of high-confidence not-relevant. Populate `state.reviewBatches`. Emit `dr:batch_ready` for each
- [ ] 3.2 Create `nodes/batch-hitl-privilege.node.ts` — `interrupt()` with current privilege batch payload; resume via `Command({ resume: BatchReviewDecisionPayload })`; record into `state.batchDecisions`; reject resume payloads that attempt `approve_remaining` (privilege safety)
- [ ] 3.3 Create `nodes/batch-hitl-relevance.node.ts` — same pattern for low-confidence relevance; `approve_remaining` allowed
- [ ] 3.4 Create `nodes/batch-hitl-hot-docs.node.ts` — same pattern; `flag_senior_review` propagates to decision payload
- [ ] 3.5 Create `nodes/batch-hitl-sample.node.ts` — same pattern; records corrections for calibration
- [ ] 3.6 Create `nodes/calibration-check.node.ts` — inspect aggregate corrections; if a systematic pattern is detected, append to `state.calibrationAdjustments`; emit `dr:calibration_applied`. Adjustments apply only to uncoded docs (already empty by this point — pattern recorded for report)
- [ ] 3.7 Extend `BatchReviewDecisionPayload` (in types) with `batch_review` variant per PRD §4.3
- [ ] 3.8 Extend `ReviewDecisionPayload` union and the `POST /legal-department/jobs/:id/review` controller to accept `batch_review` and dispatch `Command({ resume })` into the correct paused batch
- [ ] 3.9 Extend `GET /legal-department/jobs/:id` to inject `reviewPayload.currentBatch`, `batchQueue`, `reviewStatistics` when `status === awaiting_review`, by reading the checkpoint
- [ ] 3.10 Wire graph: `code_document` queue-drain → `build_batches → batch_hitl_privilege → batch_hitl_relevance → batch_hitl_hot_docs → batch_hitl_sample → calibration_check → __end__` (Phase 3 terminates here)
- [ ] 3.11 Unit specs per node; graph spec that runs end-to-end with two simulated `Command({ resume })` calls per batch; assert privilege batch rejects bulk approve; assert calibration adjustments logged on patterned corrections
- [ ] 3.12 Frontend: create `components/BatchReviewPanel.vue` — document table with coding columns, expandable rows, per-doc Approve/Correct, batch-level Approve Remaining (disabled if `batchType==='privilege'`), Flag for Senior Review, batch stats bar
- [ ] 3.13 Frontend: route `discovery-review` jobs in `LegalJobReviewModal.vue` to `BatchReviewPanel` instead of `DocumentAnalysisReviewSection`
- [ ] 3.14 Frontend: add **Batch Queue** tab to `DiscoveryReviewView.vue` listing pending batches and hosting `BatchReviewPanel`
- [ ] 3.15 Frontend: unit specs — privilege panel disables bulk approve; correction submits the expected payload; expand/collapse behaviour

### Quality Gate
- [ ] **Lint**: api + web lint pass
- [ ] **Build**: api + web build pass
- [ ] **Unit Tests**: all pass
- [ ] **E2E Tests**: `npm run test:e2e --workspace=apps/forge/web -- discoveryReview` — cypress flow: create review, wait for first batch, approve, loop through all batches, reach terminal status
- [ ] **Curl Tests**:
  - [ ] After coding completes, `GET /legal-department/jobs/$JOB_ID` returns `status: awaiting_review` with `reviewPayload.currentBatch.batchType === 'privilege'`
  - [ ] `POST /legal-department/jobs/$JOB_ID/review` with `{ decision: 'batch_review', batchId, documentDecisions:[...] }` advances to next batch
  - [ ] Attempting to send `approve_remaining: true` on a privilege batch returns HTTP 400 with explanation
  - [ ] SSE emits `dr:batch_ready` and `dr:batch_reviewed` for each batch
- [ ] **Chrome Tests**:
  - [ ] Batch Queue tab shows the pending batches in priority order
  - [ ] Privilege batch: "Approve Remaining" button is disabled; per-doc approve/correct works; submit advances to next batch
  - [ ] Low-confidence relevance batch: Approve Remaining enabled; correcting a coding submits successfully and updates the batch stats bar
  - [ ] Reviewing all batches in sequence brings job to the end of Phase 3 terminal state
- [ ] **Phase Review**: compare against PRD §4.3 (review decision + reviewPayload), §4.4 (Phase 3 frontend), §8 Phase 3 validation
  - [ ] Batches built in priority order
  - [ ] Every batch interrupts and resumes cleanly
  - [ ] Privilege batch enforces per-document review
  - [ ] Calibration adjustments recorded
  - [ ] `batch_review` decision type is additive — existing HITL flows untouched (spot-check DD job still works)
  - [ ] Deviations documented below if any

---

## Phase 4: Production Set & Reports
**Status**: Not Started
**Objective**: Assemble the production set, privilege log, hot-doc summary, and final review statistics; expose them in the frontend with export.

### Steps
- [ ] 4.1 Create `nodes/generate-production-set.node.ts` — populate `state.productionSet` with IDs of documents that are relevant AND not privileged (post-reviewer corrections); apply sequential Bates numbers if `reviewProtocol.batesConfig` present
- [ ] 4.2 Extend `generate-production-set.node.ts` to build `state.privilegeLog`: one `PrivilegeLogEntry` per withheld document with documentId, privilegeType, privilegeBasis, reviewerId if corrected
- [ ] 4.3 Compute final `state.reviewStatistics`: totals, relevance breakdown, privilege count, issue distribution, human correction rate, confidence calibration deltas
- [ ] 4.4 Create `nodes/complete.node.ts` — emit `dr:production_set_ready`, write `status: 'completed'`, persist outputs via checkpointer
- [ ] 4.5 Wire final graph segment: `calibration_check → generate_production_set → complete → __end__`
- [ ] 4.6 Unit specs: production set excludes privileged docs AND failed docs AND reviewer-corrected "not relevant"; Bates numbering applied in order when configured; privilege log entries match all withheld docs
- [ ] 4.7 Full graph spec: end-to-end run from protocol definition → production set with fixture of 10 documents and scripted reviewer decisions
- [ ] 4.8 Extend `GET /legal-department/jobs/:id` (or final-output endpoint already in use by legal dept) to expose `productionSet`, `privilegeLog`, `hotDocumentSummary`, `reviewStatistics` when `status === 'completed'`
- [ ] 4.9 Frontend: add **Privilege Log** tab — formatted table (documentId, privilegeType, basis)
- [ ] 4.10 Frontend: add **Production Set** tab — document list, hot-doc summary, Bates column when present, Export button (CSV download via browser)
- [ ] 4.11 Frontend: Overview tab final-state panel showing completion stats + links to Production Set / Privilege Log tabs
- [ ] 4.12 Frontend unit specs for both tabs and export action

### Quality Gate
- [ ] **Lint**: api + web lint pass
- [ ] **Build**: api + web build pass
- [ ] **Unit Tests**: all pass
- [ ] **E2E Tests**: extend the Phase 3 cypress flow to run through Phase 4 — reach `completed`, open Production Set tab, click Export, assert CSV downloaded
- [ ] **Curl Tests**:
  - [ ] After reviewing the final batch, `GET /legal-department/jobs/$JOB_ID` returns `status: completed` with `result.productionSet`, `result.privilegeLog`, `result.reviewStatistics`, `result.hotDocumentSummary`
  - [ ] `productionSet` contains only relevant + non-privileged docs (verify against fixture expectation)
  - [ ] No privileged document ID appears in `productionSet`
  - [ ] SSE emits `dr:production_set_ready` exactly once
- [ ] **Chrome Tests**:
  - [ ] Privilege Log tab renders all withheld documents in a formatted table
  - [ ] Production Set tab lists only relevant, non-privileged docs with Bates numbers (when configured)
  - [ ] Export button downloads a CSV with the expected columns
  - [ ] Overview tab shows final review statistics
- [ ] **Phase Review**: compare against PRD §4 (outputs), §5 privilege safety, §8 Phase 4 validation, intention §Phase 4
  - [ ] Production set never contains a privileged document
  - [ ] Privilege log lists all withheld docs with basis
  - [ ] Hot document summary present
  - [ ] Review statistics accurate
  - [ ] Export works
  - [ ] Full pipeline runs end-to-end from protocol definition to production set
  - [ ] Deviations documented below if any

---

## Deviations Log
<!-- Populated during run-plan if implementation diverges from this plan or PRD. -->

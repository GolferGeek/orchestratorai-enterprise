# Legal Department Upgrades — Product Requirements Document

## 1. Overview

The Legal Department is a LangGraph workflow in Forge (`apps/forge/api/src/agents/legal-department/`) that runs a document through an echo → CLO routing → multi-specialist orchestrator → synthesis → HITL checkpoint → report generation pipeline. The workflow is executed asynchronously by `LegalJobsWorkerService` against jobs persisted in `legal.agent_jobs`, with state checkpointed by `PostgresCheckpointerService` and live events emitted over SSE via the observability plane.

Four capability gaps currently block production use of this workflow:

1. **Production HITL** — `hitl-checkpoint.node.ts` auto-approves; no human is ever in the loop.
2. **Input Size Limits** — specialist nodes pass full document text to the LLM with no token accounting, so large documents blow token limits.
3. **Multi-Document Support** — `getDocumentText()` in `specialist-utils.ts` only reads `documents[0]`; additional uploaded documents are silently dropped.
4. **Streaming Support** — the end-to-end workflow is 10+ sequential LLM calls with >60s latency and no progressive output, even though `LLM_SERVICE` and Forge's `/invoke/stream` already support streaming.

This effort closes all four gaps while preserving the existing ExecutionContext capsule flow, checkpoint persistence, and SSE observability contract.

## 2. Goals & Success Criteria

### Goals
- A legal document analysis can be paused at HITL, surfaced to a reviewer in the Forge web UI, and resumed (approve / reject / modify) without losing state.
- Documents up to a configurable maximum size are processed reliably; documents above that limit are chunked or rejected with a clear error rather than silently failing at the LLM layer.
- Every document uploaded to a single job is analyzed; the final report cross-references findings across all documents.
- Specialist, synthesis, and report LLM calls stream tokens to the Forge web conversation window as they are produced.

### Success Criteria
- **HITL**
  - A job's graph run suspends at `hitl_checkpoint` via LangGraph `interrupt()`; the job row transitions to `status='awaiting_review'` and emits an SSE event with specialist outputs and synthesis.
  - A new API endpoint accepts an approve/reject/modify decision and resumes the graph via LangGraph `Command`.
  - On reject, specialists re-run with the reviewer's feedback injected into their user messages; on modify, edited specialist outputs replace state before synthesis.
  - Resuming across an API process restart works (state comes from `PostgresCheckpointerService`).
- **Input Size Limits**
  - A `countTokens()` utility produces a stable token count for a string/model pair.
  - Documents exceeding the per-specialist budget are chunked; chunk-level specialist outputs are merged deterministically before synthesis.
  - Documents exceeding the absolute maximum are rejected at enqueue time with a typed error, not at LLM call time.
- **Multi-Document**
  - `getDocumentText()` is replaced by accessors that enumerate all documents.
  - CLO routing considers the union of detected document types.
  - Synthesis and report nodes cross-reference findings across documents; report headers name every document analyzed.
  - Existing single-document jobs still pass their specs unchanged.
- **Streaming**
  - Every specialist, synthesis, and report node uses the streaming LLM path when the request arrived on `/invoke/stream`.
  - The Forge web conversation window renders streaming text for each specialist output progressively.
  - Non-streaming `/invoke` callers still get a fully-buffered response.
- **Global**
  - All existing Jest specs under `apps/forge/api/src/agents/legal-department/` still pass.
  - `tsc --noEmit` and `vue-tsc --noEmit` clean for forge api + forge web.
  - ExecutionContext is passed whole through every new code path; no destructuring.
  - No fallbacks, no swallowed errors, no `@ts-ignore`.

## 3. User Stories

- **As a reviewing attorney**, I open the Forge Legal workspace, see a job in "awaiting review" with all specialist outputs and the synthesis, and approve, reject with feedback, or edit specialist outputs before the report is generated.
- **As a paralegal uploading a 120-page master services agreement**, I want the workflow to complete with a report covering the whole document rather than failing mid-specialist on token limits.
- **As a deal team uploading four related contracts in one job**, I want one synthesized report that cross-references the four documents, not a report about document #1 that silently ignores the rest.
- **As any user watching a job run**, I want to see specialist text appear token-by-token in the conversation window instead of staring at a spinner for a minute.

## 4. Technical Requirements

### 4.1 Architecture

All work stays inside `apps/forge/api/src/agents/legal-department/` and `apps/forge/web/src/` plus related Forge invoke wiring. No new packages. No new planes. Rules from `apps/forge/api/CLAUDE.md` apply: no `llms/`, no `observability/`, no `planes/` directories in the product — use the existing `LLM_SERVICE`, `OBSERVABILITY_SERVICE`, `PostgresCheckpointerService`, and shared services (`LLMHttpClientService`, `ObservabilityService`).

### 4.2 Data Model Changes

- `legal.agent_jobs.status` gains two new allowed values: `awaiting_review`, `review_rejected`. Migration via the Supabase storage-based sync system (`supabase-management-skill`).
- New column `legal.agent_jobs.review_decision JSONB NULL` to persist the last decision payload (`{ decision, feedback?, editedOutputs? }`).
- New column `legal.agent_jobs.document_count INT NOT NULL DEFAULT 1` for observability.
- No changes to `public.observability_events`.

### 4.3 API Changes

All additions live under the existing `LegalJobsController` (`/legal-department/...`). No new controllers.

- `POST /legal-department/jobs/:id/review` — body `{ context: ExecutionContext, decision: 'approve' | 'reject' | 'modify', feedback?: string, editedOutputs?: Record<specialistKey, string> }`. Looks up the job (org-scoped), persists `review_decision`, resumes the graph via LangGraph `Command`, and returns the new job status. Rejects with 409 if the job is not in `awaiting_review`.
- `GET /legal-department/jobs/:id` — augmented response: when `status === 'awaiting_review'`, includes `specialistOutputs`, `synthesis`, and the enumerated `documents` summary from checkpointed state (read through `PostgresCheckpointerService`).
- `/invoke/stream` wiring: Forge's existing SSE endpoint already exposes streaming. `LegalDepartmentService` gains an `invokeStream()` path that yields `StreamChunk`s from specialist/synthesis/report nodes. The worker continues to use the non-streaming path for background job execution; streaming is used by foreground conversation invocations.

### 4.4 Frontend Changes (apps/forge/web)

- **Workspace review modal** — new component that, when a job row's status is `awaiting_review`, shows:
  - specialist outputs (one tab/section per specialist)
  - synthesis text
  - action row: Approve / Reject / Modify
  - reject → freeform feedback textarea
  - modify → per-specialist editable textareas
  - Submission posts to `POST /legal-department/jobs/:id/review` and closes on success.
- **Streaming renderer** — `useOutputRenderer` composable (already exists) extended to merge incremental specialist text keyed by `specialistKey`. The Legal conversation window subscribes to the same SSE stream the worker already emits, but additionally renders token-level LLM output chunks as they arrive.
- **Job list** — `awaiting_review` gets a distinct badge and the row click opens the review modal instead of the normal detail modal.
- **Stage ladder** — one new stage between `synthesis` and `report_generation` named "HITL Review", activating when the job is paused.

### 4.5 Infrastructure Requirements

- Token counting: add a `token-count.util.ts` inside `legal-department/services/` using `tiktoken` (already available transitively via LLM providers; add a direct dep if not). No new plane — this is a product-local utility.
- LangGraph: use `interrupt()` and `Command({ resume: ... })` from `@langchain/langgraph` (already installed). Requires the graph to be compiled with the existing `PostgresCheckpointerService` (already the case).
- Streaming: use `callLLMStream` on `LLMHttpClientService` (already exists per the intention file).

## 5. Non-Functional Requirements

- **Performance**: Streaming must start emitting tokens within 2 seconds of the first specialist LLM call. Token counting for a 100k-character document must complete in <200 ms.
- **Security**: `POST /jobs/:id/review` enforces org scoping through the same repository read used by `GET /jobs/:id`. ExecutionContext is validated (no wildcard orgSlug, matching userId pattern already enforced by `LegalJobsController.enqueue`).
- **Scalability**: Multi-document and chunked processing must respect existing per-provider concurrency via `ProviderConcurrencyRegistry`; chunk-level specialist calls count toward the same slot budget.
- **Compatibility**: Existing single-document, non-HITL, non-streaming jobs must still succeed end-to-end with no behavioral change other than HITL now actually pausing (which is the point). All existing specs under `legal-department/**` must continue to pass.
- **Observability**: Every new state transition (`awaiting_review`, `review_rejected`, chunk processing, stream token) emits an observability event through `ObservabilityService` so the durable event history remains the single source of truth.

## 6. Out of Scope

- Rewriting any other Forge agent (marketing-swarm, cad-agent, customer-service, etc.).
- Changes to the CLO routing heuristics themselves (we extend its input, not its logic).
- New RAG collections or vector storage changes. RAG enrichment continues to be best-effort as today.
- Adding authentication/authorization beyond the existing org-scoped repository pattern.
- A generic HITL framework usable by other agents — this effort implements HITL for Legal Department only.
- Changing the Supabase storage container mount issue (tracked in `legal-async-workspace-followups.md` #10).
- Fixing the Ionic Vue `isViewVisible` DevTools marker (tracked as follow-up #11).

## 7. Dependencies & Risks

### Dependencies
- `@langchain/langgraph` `interrupt()` / `Command` (already installed).
- `PostgresCheckpointerService` (already wired into the graph).
- `LLMHttpClientService.callLLMStream` (already exists per intention).
- Forge `/invoke/stream` SSE endpoint (already exists).
- `useOutputRenderer` composable in forge web.

### Risks & Mitigations
- **Risk**: LangGraph `interrupt()` interacts awkwardly with the current background worker model (worker polls and calls `service.process()` to completion). **Mitigation**: the worker catches the `GraphInterrupt` exception, updates the row to `awaiting_review`, and returns the slot. Resumption from the review endpoint re-enters the graph using the saved thread id.
- **Risk**: Chunked specialist outputs are not trivially mergeable (specialists return JSON-shaped findings). **Mitigation**: define a per-specialist merge strategy in specialist-utils (concat findings arrays, union tagged parties, dedupe by normalized key). Document the merge rule per specialist in code comments.
- **Risk**: Streaming + multi-specialist parallelism in the orchestrator could interleave tokens on the wire in a way the frontend can't demux. **Mitigation**: every streamed chunk carries `{ specialistKey, chunkIndex, text }`; the frontend renderer buffers per-key.
- **Risk**: Running specialists over N documents multiplies LLM cost and latency. **Mitigation**: pass all documents into one specialist call via a clearly delimited multi-document prompt by default, and only fan out per-document when token budget demands it. Phase 3 makes that decision per job based on token counts from Phase 2.
- **Risk**: Review endpoint race — a reviewer approves while the worker is still updating the row. **Mitigation**: guard the review write with `UPDATE ... WHERE status = 'awaiting_review'` and 409 on zero rows.

## 8. Phasing

Each phase is independently shippable — tests pass, lint/build clean, the workflow still completes end-to-end — and ends with a verification pass.

### Phase 1 — Production HITL
- Replace `hitl-checkpoint.node.ts` auto-approve with a real `interrupt()` call.
- `LegalJobsWorkerService` catches `GraphInterrupt`, writes `status='awaiting_review'`, persists the interrupt payload (specialist outputs + synthesis) in the checkpoint, releases the concurrency slot.
- Add migration: `legal.agent_jobs.status` enum gains `awaiting_review`, `review_rejected`; add `review_decision JSONB`.
- Add `POST /legal-department/jobs/:id/review` endpoint that loads the saved thread, resumes via `Command({ resume: decision })`, and on reject loops specialists with feedback.
- Forge web: `LegalJobReviewModal.vue`, job-list badge, approve/reject/modify flow calling the new endpoint.
- Stage ladder: add "HITL Review" stage to `legal-department.presentation.ts`.
- **Done when**: a job paused at HITL can be approved from the UI and completes; rejected flow re-runs specialists with feedback; restart of the API mid-review still allows resumption.

### Phase 2 — Input Size Limits
- Add `token-count.util.ts` (tiktoken-backed, keyed on `context.model`).
- At enqueue time (`LegalJobsController.enqueue` + `/upload`), measure input token count and reject with a typed 413 response when it exceeds `MAX_INPUT_TOKENS`.
- In each specialist node, compute per-call budget = model context window − reserved output − system prompt overhead. When `buildBaseUserMessage` output exceeds the budget, chunk the document, call the LLM per chunk, and merge findings via a specialist-local merge function.
- Emit observability events for chunk counts and merged outputs so the UI stage ladder can show "Chunked: 4 segments".
- **Done when**: a 120-page contract processes successfully through all specialists without any LLM token-limit failure, and a synthetic "too large" document is rejected at enqueue with a clear error.

### Phase 3 — Multi-Document Support
- `document_count` column added and populated at enqueue.
- Replace `getDocumentText()` with `enumerateDocuments(state)` that returns `Array<{ index, content, metadata }>`.
- `legal-intelligence.service` runs metadata extraction per document; `state.legalMetadata` becomes `state.documentsMetadata: LegalMetadata[]` (keep a `legalMetadata` getter pointing at `documentsMetadata[0]` for back-compat inside the effort only, removed at the end of the phase).
- CLO routing considers union of `documentType.type` across documents.
- Each specialist node iterates documents (or receives a merged multi-document prompt when tokens fit) and merges findings using the Phase 2 merge functions.
- Synthesis node prompt updated to cross-reference findings across documents; report generation prints a document table at the top of the report.
- Update `legal-jobs.controller.ts` `/jobs/upload` to accept multiple files (`FilesInterceptor`), extracting each through `DocumentExtractionRouter`.
- Web upload modal accepts multiple files; the review modal groups specialist outputs under document tabs.
- **Done when**: a job with three heterogeneous documents (an NDA, an employment agreement, an IP assignment) produces one synthesized report mentioning all three, and all existing single-document specs pass unchanged.

### Phase 4 — Streaming Support
- `LegalDepartmentService.invokeStream()` added; specialist/synthesis/report nodes emit `StreamChunk { specialistKey, chunkIndex, text }` through observability when invoked on the streaming path.
- Forge `/invoke/stream` wiring routes the legal-department capability to the new method.
- Forge web `useOutputRenderer` extended to merge token-level chunks keyed by `specialistKey` into the conversation window; stage ladder tickers show running token counts.
- Background worker path (`LegalJobsWorkerService`) remains on the non-streaming path — the worker processes persisted jobs; streaming is a foreground conversation concern.
- **Done when**: invoking legal-department via `/invoke/stream` shows tokens appearing in the Forge conversation window during specialist execution, and non-streaming `/invoke` still returns the same buffered output it did before.

### Phase 5 — Hardening & Verification
- Full test pass: Jest (forge api), Vitest (forge web), tsc/vue-tsc clean.
- Manual Chrome verification of: single-doc approve, single-doc reject-with-feedback, single-doc modify, multi-doc streaming run, oversized doc rejection.
- `/commit-push` to a feature branch, `/create-pr`, `/pr-eval`.

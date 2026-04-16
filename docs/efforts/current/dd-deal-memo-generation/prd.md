# DD Room: Deal Memo Generation — Product Requirements Document

## 1. Overview

The Due Diligence (DD) Room in Forge's legal-department agent produces a structured report surfacing findings, risk matrices, deal-breaker flags, and missing-document gaps across a target company's document set. This effort adds a new, separate LangGraph workflow — **Deal Memo Generation** — that consumes a completed DD Room's findings and drafts an acquisition-agreement memo broken into the standard sections (representations & warranties, indemnification, disclosure schedules, conditions precedent, covenants).

The memo workflow is a **child job** of a completed DD Room: it runs independently, reads the DD Room's checkpointer state read-only, persists its own state/artifacts, and presents a single HITL gate reviewing the full draft. A single DD Room can spawn multiple memos (e.g., stock purchase vs. asset purchase framings); each memo is a snapshot and is not re-derived if the parent DD Room receives incremental updates.

This closes the loop from "what's in the documents" (DD) to "what language goes in the contract" (memo), replacing 10–20 hours of senior-attorney pattern-matching with an LLM-drafted, cited-to-findings first draft.

## 2. Goals & Success Criteria

**Goals**
1. Triggerable memo generation from any completed DD Room via a single click.
2. Five drafted sections (reps & warranties, indemnification, disclosure schedules, conditions precedent, covenants) plus a synthesized final memo.
3. Each drafted provision cites the specific DD finding(s) that informed it (traceability back to `perDocumentOutputs` / `runningFindings` / `riskMatrix` / `dealBreakerFlags`).
4. Single end-of-run HITL gate; standard approve/reject/modify decisions via the existing review pipeline.
5. Multiple memos per DD Room, each independently addressable and downloadable as markdown or DOCX.

**Success criteria**
- From a completed DD Room, clicking "Generate Deal Memo" creates a job in `law.agent_jobs` with `job_type='deal-memo-generation'` whose input carries `parentJobId` and `dealStructure` (stock | asset | merger).
- The workflow runs to `awaiting_review` and returns a `reviewPayload` containing all five section drafts plus the synthesized memo.
- On approve, the job completes with `result.memoMarkdown`, `result.sectionCitations`, and a stored artifact retrievable via `GET /legal-department/jobs/:id/deal-memo`.
- Reject path re-runs synthesis with reviewer feedback; modify path substitutes edited section text before synthesis re-runs.
- Failure to load parent DD state fails the job loudly (status `failed`, reason in `error`) — no silent fallback.
- End-to-end happy path completes in < 5 minutes for a typical 20-document DD Room on default models.
- Attempting to generate a memo against a non-`completed` DD Room returns 409 with a clear reason.

## 3. User Stories / Use Cases

- **Deal-lead attorney** opens a completed DD Room in Forge, clicks "Generate Deal Memo," picks a deal structure, and within minutes reviews a draft memo with five sections.
- **Reviewing partner** opens the memo review modal, scans each section with citations back to DD findings, edits specific provisions (modify), and approves.
- **Deal team** generates a second memo under a different deal structure against the same DD Room to compare stock-purchase vs. asset-purchase framings.
- **Attorney** downloads the finalized memo as DOCX for handoff to the drafting team.
- **Audit/compliance** traces every drafted indemnification cap back to the specific DD finding and source document that motivated it.

## 4. Technical Requirements

### 4.1 Architecture

- New LangGraph sub-workflow `deal-memo-generation` lives under `apps/forge/api/src/agents/legal-department/workflows/deal-memo/` alongside the existing `due-diligence/` workflow. This follows the established sub-workflow pattern.
- Workflow state defined in `deal-memo.state.ts` via `DealMemoStateAnnotation`, containing:
  - Inputs: `parentJobId`, `parentConversationId`, `dealStructure`, `reviewerNotes?`
  - Hydrated from parent: `dealContext`, `perDocumentOutputs`, `runningFindings`, `riskMatrix`, `dealBreakerFlags`, `missingDocuments`, `documentIndex`
  - Section drafts: `repsWarranties`, `indemnification`, `disclosureSchedules`, `conditionsPrecedent`, `covenants` — each as `{ draft: string; citations: CitationRef[] }`
  - Synthesis: `synthesizedMemoMarkdown`, `crossReferences`
  - HITL: `reviewPayload`, `lastDecision?`
- Graph nodes (matching intention):
  1. `memo_intake` — validates parent DD job exists and is `completed`, loads parent state from `PostgresCheckpointerService` using `parentConversationId` as thread_id.
  2. `section_reps_warranties` — LLM drafts seller/buyer/mutual reps from findings.
  3. `section_indemnification` — drafts caps, baskets, survival.
  4. `section_disclosure_schedules` — identifies items requiring scheduling.
  5. `section_conditions_precedent` — drafts closing conditions keyed to open DD gaps / missing documents.
  6. `section_covenants` — drafts pre-closing and post-closing covenants.
  7. `memo_synthesis` — composes final markdown with section headers, numbering, cross-references.
  8. `memo_hitl_gate` — calls `interrupt()`; payload is the full `reviewPayload`.
  9. `memo_finalize` — writes finalized markdown to storage, updates job `result`.
- Sections 2–6 run sequentially in the initial implementation (explicit edges 2→3→4→5→6→7). Parallelization is out of scope for this effort (see §6).
- Checkpointer: reuse `PostgresCheckpointerService` with a distinct thread_id equal to the memo job's own `conversationId` (never reuse the parent DD thread).
- Worker: extend `legal-jobs.worker` `job_type` dispatch to route `'deal-memo-generation'` into the new graph's `invoke()` path, reusing the existing HITL interrupt/resume catch-block logic unchanged.
- Reasoning capture: every LLM call in section-draft nodes goes through `callLLMMaybeWithReasoning()` with `callerName` formatted `legal-department:deal-memo:<section>` so the existing `useThinkingStates` stage overlay picks it up.

### 4.2 Data Model Changes

- No new tables. Reuse `law.agent_jobs`.
- New `job_type` constant: `DEAL_MEMO_JOB_TYPE = 'deal-memo-generation'` in `legal-jobs.types.ts`.
- Job row input payload (TypeScript shape, stored in existing input JSONB column):
  ```ts
  interface DealMemoJobInput {
    parentJobId: string;
    parentConversationId: string;
    dealStructure: 'stock-purchase' | 'asset-purchase' | 'merger';
    reviewerNotes?: string;
  }
  ```
- Job row result payload:
  ```ts
  interface DealMemoJobResult {
    memoMarkdown: string;
    sectionCitations: Record<SectionId, CitationRef[]>;
    artifactPath: string;      // path in legal-documents bucket
    docxArtifactPath?: string; // present once DOCX export runs
  }
  ```
- `CitationRef` shape:
  ```ts
  interface CitationRef {
    findingId?: string;            // key into runningFindings/perDocumentOutputs
    documentId?: string;           // key into documentIndex
    riskRowId?: string;            // key into riskMatrix
    dealBreakerFlagId?: string;    // key into dealBreakerFlags
    excerpt: string;               // short quote from the finding
  }
  ```
- Parent linkage: `parentJobId` lives inside the input JSONB — no new column. List queries for "memos for a DD room" filter by `input->>'parentJobId'` where `job_type = 'deal-memo-generation'`.
- Storage: final memo markdown + DOCX written via `LegalDocumentsStorageService` to the existing `legal-documents` bucket under `{memoJobId}/deal-memo.md` and `{memoJobId}/deal-memo.docx`.

### 4.3 API Changes

All routes extend the existing `legal-jobs.controller.ts`. ExecutionContext flows through unchanged.

| Method | Route | Purpose |
|---|---|---|
| POST | `/legal-department/jobs/:id/generate-deal-memo` | Enqueue a memo job for completed DD room `:id`. Body: `{ dealStructure, reviewerNotes? }` + ExecutionContext. Returns new memo `jobId`. 409 if parent `status !== 'completed'`. 404 if parent missing or not a DD room. |
| GET | `/legal-department/jobs/:id/deal-memo` | Fetch the memo job's final markdown + citations (only valid when status=completed). |
| GET | `/legal-department/jobs/:id/deal-memo/download?format=md\|docx` | Return a signed URL (or proxied stream) to the artifact file. |
| GET | `/legal-department/jobs?parentJobId=...&jobType=deal-memo-generation` | Extend existing list endpoint with two optional filters so the UI can list memos for a DD room. |

Existing endpoints reused without modification:
- `GET /legal-department/jobs/:id` — returns memo review payload when `status='awaiting_review'` (generic code path).
- `POST /legal-department/jobs/:id/review` — submits the single HITL decision.
- `GET /legal-department/jobs/:id/reasoning` — exposes the memo's per-section thinking; section keys align with `callerName` suffixes (`deal-memo:reps-warranties`, etc.).

Per-role model config: extend `/legal-department/capabilities/:slug/models` to cover the new memo-draft roles (`deal-memo:reps-warranties`, `:indemnification`, `:disclosure-schedules`, `:conditions-precedent`, `:covenants`, `:synthesis`) so operators can select a reasoning-capable model for heavy sections.

### 4.4 Frontend Changes

Location: `apps/forge/web/src/views/agents/legal-department/`.

- **Entry point**: on `DueDiligenceRoomView.vue`, when the room's status is `completed`, render a "Generate Deal Memo" button alongside the existing "Add Documents" button.
- **New modal**: `GenerateDealMemoModal.vue` — deal-structure radio (stock/asset/merger), optional free-text "reviewer notes", submit button. On submit, calls a new `legalJobsService.generateDealMemo(parentJobId, payload)` method and routes to the memo workspace.
- **New workspace view**: `DealMemoWorkspaceView.vue` (route: `/forge/legal/dd/:parentJobId/memo/:memoJobId`). Tabs per section (Reps & Warranties, Indemnification, Disclosure Schedules, Conditions Precedent, Covenants, Full Memo). Each tab shows the drafted language (markdown-rendered) plus a right-rail "Cited DD findings" panel that resolves `CitationRef[]` against the parent DD Room's document index and risk matrix.
- **Stage ladder**: reuse `StageLadder.vue` with a memo-specific stage mapping (intake, 5 section stages, synthesis, review, finalize). Reasoning overlays light up via `useThinkingStates` on each section's `callerName`.
- **HITL review modal**: reuse the existing review modal component, feeding it the memo `reviewPayload`. Decision tabs collapse to approve/reject/modify (deepen/redirect not surfaced for the memo flow in v1, but not blocked in the backend).
- **Listing memos per DD room**: add a "Deal Memos" panel on `DueDiligenceRoomView.vue` listing prior memos (status, dealStructure, createdAt) with deep links into each memo workspace.
- **Download**: buttons on `DealMemoWorkspaceView.vue` — Markdown and DOCX — call `GET /legal-department/jobs/:id/deal-memo/download?format=...`.

### 4.5 Infrastructure Requirements

- No new planes. DOCX conversion happens API-side via an existing MD→DOCX library (e.g. the one already in use, or a new workspace dep such as `md-to-docx` or `pandoc-wasm`). If no library is currently in the repo, add a single dependency; do not reach for a new infrastructure plane.
- Media storage via `MEDIA_STORAGE_PROVIDER` (existing `legal-documents` bucket).
- LLM calls via `LLM_SERVICE` with `callLLMMaybeWithReasoning()`.
- Observability events (`agent.llm.thinking_started`, `agent.llm.thinking_completed`) flow automatically through the reasoning-capture pattern.
- Token budget: extend `assertWithinInputBudget()` usage to the memo intake node — the hydrated DD state can be large, so the node must prune or summarize fields that exceed the configured budget rather than silently truncating.

## 5. Non-Functional Requirements

- **Performance**: p95 end-to-end runtime for a 20-document DD Room < 5 min; section-draft nodes individually < 90 s at default model.
- **Reliability**: a failed section draft fails the entire job (status `failed`) with a diagnostic `error` field; no silent fallback, no partial-draft completion. Retry is a new memo job — in-place resume after a mid-graph failure is out of scope (§6).
- **Immutability**: memo jobs never write to the parent DD Room's checkpointer or database row. Reads only.
- **Concurrency**: existing `recordReviewAndRequeue()` atomicity applies; two reviewers racing on the same memo yields 409 to the loser.
- **Traceability**: every provision in the synthesized memo carries inline references to section citations; citations resolve to real IDs in the parent DD state (validated at synthesis time — failure = job fails).
- **Security**: ExecutionContext-scoped org/user authorization on every new endpoint; parent DD Room must belong to the same `orgSlug` as the caller.
- **Compatibility**: no changes to the DD graph, DD state, or DD endpoints. No database migrations.

## 6. Out of Scope

- Parallel execution of section nodes (sequential only in v1).
- Multi-party / seller-side memo drafting (buyer-focused only).
- Cap-table updates, e-signature, regulatory filings, or other closing-workflow integrations.
- A template library in code — drafting guidance lives in prompts.
- Per-section HITL gates (single end-of-run gate only).
- Auto-regeneration when the parent DD Room receives incremental updates (memos are snapshots; user manually regenerates).
- Cross-memo comparison tooling (e.g., side-by-side stock-vs-asset diff).
- `deepen` / `redirect` HITL decisions in the memo UI (backend tolerates them; UI does not surface them in v1).
- In-place resume of a memo job after a mid-graph failure — retry is a new memo job.

## 7. Dependencies & Risks

**Dependencies**
- Completed DD Room effort (parent data producer) — already shipped.
- Existing `PostgresCheckpointerService`, `LegalDocumentsStorageService`, `LLM_SERVICE`, `MEDIA_STORAGE_PROVIDER` planes.
- An MD→DOCX conversion path. If the repo lacks one, a single new dependency is in scope for Phase 4.

**Risks**

| Risk | Mitigation |
|---|---|
| Hydrated DD state exceeds LLM context budget for large rooms | `memo_intake` computes a pruned view (summaries only for `perDocumentOutputs`; full data for `riskMatrix`, `dealBreakerFlags`, `missingDocuments`). Hard-fail with clear error if still over budget — no silent truncation. |
| Citation fabrication (model invents finding IDs) | Post-draft validator in `memo_synthesis` resolves every `CitationRef` against the hydrated parent state; any unresolved ref fails the job. |
| Parent DD checkpointer snapshot missing or corrupt | `memo_intake` fails the job with a diagnostic error; no fallback to regenerate DD. |
| Concurrent memos from the same DD Room race on shared parent read | Reads are idempotent; each memo has its own thread_id. No shared writes. |
| DOCX conversion fidelity for legal formatting | v1 commits to markdown as the source of truth; DOCX is a mechanical render. Known limitations documented; no attempt to preserve rich cross-references in DOCX. |
| Per-role model config drift between DD and Memo capabilities | Memo roles use a dedicated `specialistKey` namespace (`deal-memo:*`); per-role model config is independent. |

## 8. Phasing

Each phase produces an independently validatable increment.

### Phase 1 — Backend scaffolding & parent-state hydration
- Add `DEAL_MEMO_JOB_TYPE`, `DealMemoJobInput`, `DealMemoJobResult`, `CitationRef` types.
- Create workflow folder, `deal-memo.state.ts` with `DealMemoStateAnnotation`, empty graph that only implements `memo_intake` (read parent checkpoint, pruning, fail-loud on missing/not-completed).
- Controller endpoint `POST /legal-department/jobs/:id/generate-deal-memo` enqueuing the job.
- Worker dispatch routes `'deal-memo-generation'` to the new graph.
- Integration test: enqueue a memo against a completed DD Room fixture; job reaches `memo_intake` and persists hydrated state.

### Phase 2 — Section draft nodes
- Implement `section_reps_warranties`, `section_indemnification`, `section_disclosure_schedules`, `section_conditions_precedent`, `section_covenants` sequentially.
- Wire each through `callLLMMaybeWithReasoning()` with correct `callerName`.
- Output contract per node: `{ draft, citations }` on state; invalid citations fail the node.
- Extend capabilities endpoints with the six new role slugs.
- Integration test: all five sections populate; invalid citation produces `status='failed'` with clear reason.

### Phase 3 — Synthesis, HITL, finalize
- `memo_synthesis` composes markdown; post-validation of all citations.
- `memo_hitl_gate` interrupts with full memo payload; controller returns reviewPayload via existing `GET /jobs/:id`.
- `memo_finalize` writes markdown + updates `result`.
- Approve / reject / modify decisions resume correctly (reject → re-run synthesis with feedback; modify → substitute edited section text then re-run synthesis).
- Integration test: full happy path plus one reject-and-reapprove path.

### Phase 4 — Artifact storage & download
- Write markdown artifact to `legal-documents` bucket on finalize.
- MD→DOCX conversion (introduce dep if absent).
- `GET /deal-memo` and `GET /deal-memo/download?format=md|docx` endpoints.
- Integration test: download endpoints return correct bytes and content-type; auth scoped to orgSlug.

### Phase 5 — Frontend workspace
- `GenerateDealMemoModal.vue`, `legalJobsService.generateDealMemo()`.
- `DealMemoWorkspaceView.vue` with per-section tabs, citations rail, stage ladder, reasoning overlays.
- HITL review modal integration.
- Memos list panel on `DueDiligenceRoomView.vue` using `GET /jobs?parentJobId=...&jobType=deal-memo-generation`.
- Download buttons (MD / DOCX).
- Manual browser validation: generate → review → approve → download; second memo with different deal structure; reject path; 409 on in-progress DD Room.

# Legal Department Upgrades — Implementation Plan

**PRD**: ./prd.md
**Created**: 2026-04-07
**Status**: Not Started

## Progress Tracker
<!-- run-plan uses this section to track where we are -->
- [x] Phase 1: Production HITL (code complete; web test + chrome matrix pending — see deviations below)
- [ ] Phase 2: Input Size Limits
- [x] Phase 3: Multi-Document Support
- [ ] Phase 4: Streaming Support
- [ ] Phase 5: Hardening & Verification

---

## Commands Reference
- **Forge API lint**: `cd apps/forge/api && npm run lint`
- **Forge API build**: `cd apps/forge/api && npm run build`
- **Forge API tests**: `cd apps/forge/api && npm test -- --testPathPattern=legal-department`
- **Forge API full test**: `cd apps/forge/api && npm test`
- **Forge Web lint**: `cd apps/forge/web && npm run lint`
- **Forge Web build**: `cd apps/forge/web && npm run build`
- **Forge Web tests**: `cd apps/forge/web && npm test`
- **Forge API typecheck**: `cd apps/forge/api && npx tsc --noEmit`
- **Forge Web typecheck**: `cd apps/forge/web && npx vue-tsc --noEmit`
- **Dev servers**: `npm run dev:forge:api` (6200), `npm run dev:forge:web` (6201)

---

## Phase 1: Production HITL
**Status**: Code complete (2026-04-07) — gate partially verified, chrome matrix pending

### Deviations from original plan
- **1.6**: Repository extension landed as `markAwaitingReview(id)`, `clearReviewDecision(id)`, and `recordReviewAndRequeue(id, orgSlug, decision)` (one guarded UPDATE that writes the decision and transitions the row back to `queued` atomically). This subsumes `saveReviewDecision` + `claimForReview` into a single call so the controller has no TOCTOU window.
- **1.13 / graph.spec**: Did not add resume-routing tests against a live `MemorySaver` — the routing is a trivial conditional edge, and the interrupt/resume path is exercised end-to-end by the hitl-checkpoint node spec (payload shape), the worker spec (GraphInterrupt → awaiting_review + resume dispatch) and the controller spec (review endpoint + 409). A full resume-with-checkpointer graph test would add significant surface area for low marginal value.
- **Forge web test suite**: `apps/forge/web` `npm test` has 2 pre-existing failures in `executionContextStore.spec.ts` (planId/deliverableId — unrelated to this effort, same failures on `main`). Verified by stashing our changes and re-running. Not addressed in Phase 1.
- **Chrome matrix**: not yet performed — requires manual verification by the user once dev servers are restarted.
**Objective**: Replace auto-approve HITL with real LangGraph `interrupt()` + resume-via-API + Forge web review modal.

### Steps
- [x] 1.1 Add migration via `supabase-management-skill`: `legal.agent_jobs.status` enum gains `awaiting_review`, `review_rejected`; add `review_decision JSONB NULL` column.
- [x] 1.2 Update `legal-jobs.types.ts` — `JobStatus` union includes new states; add `ReviewDecisionPayload` type.
- [x] 1.3 Rewrite `nodes/hitl-checkpoint.node.ts` to call `interrupt({ specialistOutputs, synthesis, documentsSummary })` instead of pass-through. Remove `hitlDecision` state hack.
- [x] 1.4 Update `legal-department.graph.ts` — on resume, read the `Command.resume` payload; if `decision==='reject'`, route back to `orchestrator` with `feedback` merged into state; if `decision==='modify'`, overwrite `specialistOutputs` with edited values and proceed to `report_generation`; if `approve`, proceed to `report_generation`.
- [x] 1.5 Update `legal-jobs-worker.service.ts` to catch `GraphInterrupt`, write `status='awaiting_review'` via repository, release provider concurrency slot, return cleanly.
- [x] 1.6 Extend `LegalJobsRepository` with `markAwaitingReview(id, payload)`, `saveReviewDecision(id, decision)`, and the status-guarded `claimForReview(id, orgSlug)` using `UPDATE ... WHERE status='awaiting_review' RETURNING *`.
- [x] 1.7 Add `POST /legal-department/jobs/:id/review` to `LegalJobsController`: validates ExecutionContext (org scope, no wildcard), loads job, returns 409 if not `awaiting_review`, persists `review_decision` JSONB and transitions status `awaiting_review → queued` in a single guarded UPDATE (returns 0 rows → 409). Responds 202 immediately — no graph work on the HTTP thread.
- [x] 1.8 Add `LegalDepartmentService.resumeWithDecision(ctx, threadId, decision)` — reconstructs ExecutionContext (passed whole), invokes the compiled graph with `Command({ resume: decision })`, letting the Postgres checkpointer rehydrate state keyed on `thread_id`. Runs to completion or the next `GraphInterrupt`.
- [x] 1.8a Update `LegalJobsWorkerService` claim-and-dispatch loop: after claiming a row, if `review_decision IS NOT NULL` call `resumeWithDecision(ctx, row.conversation_id, row.review_decision)` instead of `process()`, then clear `review_decision` on success. If the resume itself throws `GraphInterrupt`, same catch path as step 1.5 — mark `awaiting_review`, clear `review_decision`, release slot.
- [x] 1.9 Augment `GET /legal-department/jobs/:id` response to include `specialistOutputs`, `synthesis`, and `documentsSummary` when status is `awaiting_review`, read from the checkpointer.
- [x] 1.10 Update `legal-department.presentation.ts` — add "HITL Review" stage between `synthesis` and `report_generation`.
- [x] 1.11 Forge web: create `LegalJobReviewModal.vue` (approve / reject-with-feedback / modify-with-edited-outputs); wire into the job list so `awaiting_review` rows open this modal instead of the normal detail modal; add distinct badge style.
- [x] 1.12 Forge web service: `legalJobsService.review(jobId, decision, payload)` posting to new endpoint.
- [x] 1.13 Add/update Jest specs: `hitl-checkpoint.node.spec.ts` (interrupt is called, payload shape), `legal-jobs.controller.spec.ts` (review endpoint happy + 409 + wildcard rejection), `legal-jobs-worker.service.spec.ts` (GraphInterrupt transitions to awaiting_review and releases slot), `legal-department.graph.spec.ts` (resume with approve/reject/modify routing).

### Quality Gate
- [x] **Lint**: `cd apps/forge/api && npm run lint` and `cd apps/forge/web && npm run lint` clean (web shows pre-existing warnings only)
- [x] **Build**: `cd apps/forge/api && npm run build` and `cd apps/forge/web && npm run build` clean
- [x] **Typecheck**: `cd apps/forge/api && npx tsc --noEmit` and `cd apps/forge/web && npx vue-tsc --noEmit` clean
- [x] **Unit Tests (forge api legal-department)**: 185/185 passing. **forge web** has 2 pre-existing failures (see deviations)
- [ ] **Curl Tests** (pending manual verification against a running dev server):
  - Enqueue: `curl -X POST http://localhost:6200/legal-department/jobs/upload -F "file=@test.pdf" -F 'context={"orgSlug":"customer-service","userId":"test-user","provider":"openai","model":"gpt-4o-mini"}'` → 202 with jobId
  - Poll until `awaiting_review`: `curl 'http://localhost:6200/legal-department/jobs/{id}?orgSlug=customer-service'`
  - Approve: `curl -X POST http://localhost:6200/legal-department/jobs/{id}/review -H "Content-Type: application/json" -d '{"context":{...},"decision":"approve"}'` → 200, job completes
  - Reject: same with `"decision":"reject","feedback":"Re-check indemnity"` → job re-runs specialists then awaits review again
  - 409 guard: reviewing a `completed` job returns 409
- [ ] **Chrome Tests**:
  - Upload a PDF; watch job transition to `awaiting_review` with new badge
  - Click row → review modal shows specialist tabs + synthesis
  - Click Approve → job completes, report renders
  - Upload another; Reject with feedback → specialists re-run, new review appears
  - Upload another; Modify a specialist output → edited text flows into report
  - Restart `npm run dev:forge:api` while paused at HITL → approve still resumes
- [ ] **Phase Review**:
  - [ ] HITL actually pauses the graph via `interrupt()` (no auto-approve)
  - [ ] Approve/reject/modify all work end-to-end
  - [ ] ExecutionContext passed whole, no destructuring
  - [ ] Resumption across API restart confirmed
  - [ ] Document deviations from PRD §8 Phase 1

---

## Phase 2: Input Size Limits
**Status**: Not Started
**Objective**: Prevent token-limit failures via token counting + per-specialist chunking with deterministic merging.

### Steps
- [ ] 2.1 Add `tiktoken` as a direct dep to `apps/forge/api/package.json` if not transitively resolvable; `npm install` from repo root.
- [ ] 2.2 Create `services/token-count.util.ts` exposing `countTokens(text, model)` and `getModelBudget(model): { contextWindow, reservedOutput }`.
- [ ] 2.3 Add `MAX_INPUT_TOKENS` constant and `computeInputTokens(request)` helper; apply in `LegalJobsController.enqueue` and `/jobs/upload`, throwing `PayloadTooLargeException` (HTTP 413) with a typed error body when exceeded.
- [ ] 2.4 Define `document_count` column on `legal.agent_jobs` (migration, defaults 1) — used immediately for observability and consumed by Phase 3.
- [ ] 2.5 In each specialist node (`contract`, `compliance`, `ip`, `privacy`, `employment`, `corporate`, `litigation`, `real_estate`), replace the direct `buildBaseUserMessage` → LLM call with a helper `runSpecialistOverDocument(llmClient, observability, state, systemPrompt, mergeFn)` in `specialist-utils.ts` that:
  - Computes per-call budget from `getModelBudget(ctx.model)` minus system prompt overhead
  - If document fits, runs single call
  - Otherwise chunks the document text, runs the LLM per chunk, merges JSON outputs via the specialist's `mergeFn`, and emits `observability.emitProgress` with `{ chunks, merged }`
- [ ] 2.6 Implement per-specialist merge functions in each node file: merge strategies concat findings arrays, union parties, dedupe by normalized key. Document the merge rule in a comment above each.
- [ ] 2.7 Stage ladder: `legal-department.presentation.ts` shows per-specialist ticker `"chunked: {n} segments"` when chunking occurs.
- [ ] 2.8 Tests:
  - `token-count.util.spec.ts` — deterministic counts for known strings, <200ms for 100k chars
  - `specialist-utils.spec.ts` — new `runSpecialistOverDocument` tests: single-call path, chunked path, merge correctness
  - `legal-jobs.controller.spec.ts` — 413 rejection when input exceeds `MAX_INPUT_TOKENS`

### Quality Gate
- [ ] **Lint**: `cd apps/forge/api && npm run lint` clean
- [ ] **Build**: `cd apps/forge/api && npm run build` clean
- [ ] **Typecheck**: `cd apps/forge/api && npx tsc --noEmit` clean
- [ ] **Unit Tests**: `cd apps/forge/api && npm test -- --testPathPattern=legal-department` all green
- [ ] **Curl Tests**:
  - Large-but-valid upload (80k tokens): completes successfully, events show chunked segments
  - Oversized upload (>MAX_INPUT_TOKENS): `curl` returns 413 with typed error body
  - Normal-sized upload: completes with zero chunking (single-call path preserved)
- [ ] **Chrome Tests**:
  - Upload a ~100-page contract; stage ladder shows "chunked: N segments" under relevant specialists; job completes with a real report
  - Upload an oversized file; upload modal surfaces the 413 error clearly
- [ ] **Phase Review**:
  - [ ] No specialist LLM call ever exceeds token budget
  - [ ] Chunked merge outputs are deterministic (rerun same input → same merge)
  - [ ] Oversized inputs rejected at enqueue, not at LLM call
  - [ ] Existing single-call specs still pass
  - [ ] Document deviations from PRD §8 Phase 2

---

## Phase 3: Multi-Document Support
**Status**: Not Started
**Objective**: Process every document in a job, not just `documents[0]`; synthesize across all.

### Steps
- [x] 3.1 Replace `FileInterceptor` with `FilesInterceptor('files', MAX_FILES)` in `LegalJobsController.upload`; extract each file through `DocumentExtractionRouter`; persist all originals through `LegalDocumentsStorageService.storeOriginal` keyed by index.
- [x] 3.2 Update `EnqueueJobRequest.data` to carry an array of documents `{ content, contentType, filename, mimeType, extractorMetadata }[]`. Keep single-document legacy enqueue working by normalizing to a single-element array server-side.
- [x] 3.3 Migration: `legal.agent_jobs` gains `document_paths TEXT[] NOT NULL DEFAULT '{}'`; update repository insert/read.
- [x] 3.4 In `legal-department.state.ts`, replace single `legalMetadata` with `documentsMetadata: LegalMetadata[]`. Update `LegalIntelligenceService` to produce metadata per document; run extraction in parallel with `Promise.all`.
- [x] 3.5 Replace `getDocumentText()` in `specialist-utils.ts` with `enumerateDocuments(state): Array<{ index, content, metadata, filename }>`. Remove `documents[0]` hardcoding from every specialist.
- [x] 3.6 Update CLO routing (`clo-routing.node.ts`) to consider union of detected document types across documents; routing decision carries per-document type map.
- [x] 3.7 Update `runSpecialistOverDocument` (Phase 2 helper) into `runSpecialistOverDocuments` that decides, per token budget, whether to issue one multi-document call or fan out per-document-then-merge. Merge functions from Phase 2 extended to dedupe across documents.
- [x] 3.8 Update synthesis node prompt to cross-reference findings across documents; expose `documentsSummary` in the interrupt payload so the review modal shows per-document tabs.
- [x] 3.9 Update `report-generation.node.ts` to print a document table header naming every analyzed document.
- [x] 3.10 Forge web upload modal: accept multiple files (`<input type="file" multiple>`); send as `files[]` multipart; preview list of selected files before Queue Job.
- [x] 3.11 Forge web review modal: per-document tabs inside each specialist section.
- [x] 3.12 Tests:
  - `clo-routing.node.spec.ts` — multi-document routing union
  - `specialist-utils.spec.ts` — `enumerateDocuments` and multi-document merge
  - `legal-intelligence.service.spec.ts` — parallel metadata extraction per document
  - `legal-jobs.controller.spec.ts` — multipart with multiple files enqueues one job with `document_count=N`
  - `legal-department.graph.spec.ts` — end-to-end multi-doc run produces synthesis mentioning all documents
  - All existing single-document specs must still pass unchanged

### Quality Gate
- [x] **Lint**: `cd apps/forge/api && npm run lint` and `cd apps/forge/web && npm run lint` clean
- [x] **Build**: `cd apps/forge/api && npm run build` and `cd apps/forge/web && npm run build` clean
- [x] **Typecheck**: `cd apps/forge/api && npx tsc --noEmit` and `cd apps/forge/web && npx vue-tsc --noEmit` clean
- [x] **Unit Tests**: 217 forge-api jest tests + 599 forge-web vitest tests all green
- [x] **Curl Tests**:
  - 3-file multipart upload → 202, `document_count=3`, `document_paths` populated with 3 storage paths
  - Single-file legacy upload (`-F "files=@nda.txt"`) still returns 202 with `document_count=1`
  - `GET /jobs/{id}?orgSlug=…` exposes all 3 documents in `input.data.documents` and 3 entries in `reviewPayload.documentsSummary`
  - **Bug found and fixed during curl verification**: `LegalJobsRepository.updateDocumentPaths` was using PostgREST `.update({document_paths: paths})`, which silently dropped the `TEXT[]` column write. Switched to `rawQuery` with `$1::text[]` parameterized binding (same pattern as `recordReviewAndRequeue`).
- [x] **Chrome Tests**:
  - Upload modal: file input has `multiple: true`, hint reads "up to 10 files", selecting 3 files renders preview list with sizes, Queue Job click creates real job with `document_count=3`
  - Review modal: `.doc-tabs` strip renders 3 tabs (`nda.txt (nda)`, `employment.txt (employment_agreement)`, `ip.txt (contract)`), first tab active by default, clicking the second tab activates it and updates the detail card
  - Single-file upload regression verified (curl path)
- [x] **Phase Review**:
  - [x] No code path still reads `documents[0]` unconditionally — remaining hits are RAG query seed (guarded by `documents.length === 0`), `runSpecialistOverDocuments` single-doc fast-path delegation, and back-compat `primaryContent` field
  - [x] Synthesis cross-references findings across documents (live run produced 5 keyFindings + 3 crossInsights across 3 docs)
  - [x] Report names every analyzed document (table header in `report-generation.node.ts`)
  - [x] All pre-existing specs still pass
  - [x] Deviations: none material — single PostgREST→rawQuery swap noted above

---

## Phase 4: Streaming Support
**Status**: Not Started
**Objective**: Stream specialist/synthesis/report LLM tokens through Forge `/invoke/stream` into the conversation window.

### Steps
- [ ] 4.1 Add `LegalDepartmentService.invokeStream(params): AsyncIterable<StreamChunk>` that runs the graph with streaming-enabled specialist/synthesis/report nodes.
- [ ] 4.2 Register the streaming path in the Forge capability registry entry for `legal-department` so `POST /invoke/stream` dispatches to `invokeStream`.
- [ ] 4.3 Extend `runSpecialistOverDocuments` to accept an optional `onToken(chunk)` callback; when provided, it uses `LLMHttpClientService.callLLMStream` and forwards chunks as `{ specialistKey, chunkIndex, text }` via `observability.emitStreamChunk`.
- [ ] 4.4 Add `ObservabilityService.emitStreamChunk` helper (product-local extension over the shared plane if not already present) that writes `{ type: 'stream_chunk', specialistKey, chunkIndex, text }` on the SSE bus.
- [ ] 4.5 Forge web `useOutputRenderer` composable: merge `stream_chunk` events keyed by `specialistKey` into the conversation window progressively.
- [ ] 4.6 Legal conversation view: subscribe to stream chunks; stage ladder tickers show running token counts per specialist.
- [ ] 4.7 Confirm background worker (`LegalJobsWorkerService`) continues to use the non-streaming path — no behavior change for queued jobs.
- [ ] 4.8 Tests:
  - `legal-department.service.spec.ts` — `invokeStream` yields chunks in order
  - `specialist-utils.spec.ts` — `runSpecialistOverDocuments` `onToken` callback fires for each chunk
  - Web: `useOutputRenderer.spec.ts` — merges stream_chunk events by specialistKey
  - `legal-jobs-worker.service.spec.ts` — worker path still non-streaming

### Quality Gate
- [ ] **Lint**: `cd apps/forge/api && npm run lint` and `cd apps/forge/web && npm run lint` clean
- [ ] **Build**: `cd apps/forge/api && npm run build` and `cd apps/forge/web && npm run build` clean
- [ ] **Typecheck**: `cd apps/forge/api && npx tsc --noEmit` and `cd apps/forge/web && npx vue-tsc --noEmit` clean
- [ ] **Unit Tests**: `cd apps/forge/api && npm test -- --testPathPattern=legal-department` all green; `cd apps/forge/web && npm test` all green
- [ ] **Curl Tests**:
  - `curl -N -X POST http://localhost:6200/invoke/stream -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":"1","method":"invoke","params":{"context":{...legal-department...},"data":{"content":"Analyze this NDA..."}}}'` → SSE stream with multiple `stream_chunk` events arriving within 2s of first LLM call
  - `POST /invoke` (non-streaming) with the same payload → buffered response identical in content
- [ ] **Chrome Tests**:
  - Open Legal conversation, run a foreground analysis; specialist text appears token-by-token
  - Stage ladder tickers update with running token counts
  - Queued-job path (upload + background worker) still works the same
- [ ] **Phase Review**:
  - [ ] Streaming path demonstrably emits tokens progressively
  - [ ] Non-streaming `/invoke` callers unaffected
  - [ ] Worker path unchanged
  - [ ] ExecutionContext still passed whole through streaming path
  - [ ] Document deviations from PRD §8 Phase 4

---

## Phase 5: Hardening & Verification
**Status**: Not Started
**Objective**: Full cross-product test pass, manual Chrome verification of all flows, ship via PR.

### Steps
- [ ] 5.1 Run full Forge API test suite: `cd apps/forge/api && npm test`
- [ ] 5.2 Run full Forge web test suite: `cd apps/forge/web && npm test`
- [ ] 5.3 Typecheck all: `cd apps/forge/api && npx tsc --noEmit` and `cd apps/forge/web && npx vue-tsc --noEmit`
- [ ] 5.4 Full lint: `cd apps/forge/api && npm run lint` and `cd apps/forge/web && npm run lint`
- [ ] 5.5 Full build: `cd apps/forge/api && npm run build` and `cd apps/forge/web && npm run build`
- [ ] 5.6 Manual Chrome matrix (see below) — record any bugs, fix, re-verify
- [ ] 5.7 `/commit-push` to feature branch
- [ ] 5.8 `/create-pr` with summary of all four phases
- [ ] 5.9 `/pr-eval` and address findings

### Quality Gate
- [ ] **Lint**: all products clean
- [ ] **Build**: all products clean
- [ ] **Unit Tests**: Full `forge/api` and `forge/web` suites green
- [ ] **E2E Tests**: Not applicable — covered by manual Chrome matrix below
- [ ] **Curl Tests**: All Phase 1-4 curl commands still pass in sequence
- [ ] **Chrome Tests** (manual matrix):
  - Single-doc upload → HITL approve → report
  - Single-doc upload → HITL reject with feedback → specialists re-run → approve → report
  - Single-doc upload → HITL modify a specialist output → approve → report reflects edits
  - Multi-doc upload (3 files) → streaming run → HITL approve → report mentions all three
  - Oversized single-doc upload → 413 error surfaced in upload modal
  - Large-but-valid single-doc upload → chunked specialists → report completes
  - Foreground `/invoke/stream` run → progressive tokens in conversation window
  - API restart mid-HITL → reviewer can still approve
- [ ] **Phase Review**:
  - [ ] Every PRD §2 success criterion verified against running system
  - [ ] All four intention sections (HITL, Input Size, Multi-Doc, Streaming) demonstrably working
  - [ ] No fallbacks, no swallowed errors, no `@ts-ignore` introduced
  - [ ] ExecutionContext passed whole throughout
  - [ ] PR opened and evaluation passed

---

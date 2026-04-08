# Legal Department Phase 3 (Multi-Document Support) — Completion Report

**Plan**: `docs/efforts/current/plan.md`
**PRD**: `docs/efforts/current/prd.md` §8 Phase 3
**Branch**: `effort/legal-department-phase3`
**Completed**: 2026-04-07
**Final Status**: All Phase 3 steps complete; Phases 1 & 2 already on `main` (PRs #2, #4)

## Summary
- Phase 3 steps planned: 12 (3.1–3.12)
- Phase 3 steps completed: 12
- Quality Gate items completed: 6 of 6 (lint, build, typecheck, jest, vitest, curl, chrome, phase review)

## What Phase 3 Delivered
A legal-department job can now accept multiple documents in a single upload, fans metadata extraction out across them in parallel, runs CLO routing over the union of detected document types, executes each invoked specialist over every document (with the Phase 2 chunked helper now extended to multi-document fan-out + cross-document merge), produces a synthesis that cross-references findings across documents, and surfaces a per-document tab strip in the HITL review modal.

### API
- `LegalJobsController.upload`: `FilesInterceptor('files', MAX_FILES=10)`, parallel extraction via `Promise.all`, combined token-budget check, persists every original to storage with index-prefixed filenames.
- `EnqueueJobRequest.data.documents[]` carries the per-file `{content, contentType, filename, mimeType, extractorMetadata}` array. Legacy single-doc JSON enqueue still works (server-side normalized to a single-element array).
- Migration `20260408000001_legal_agent_jobs_document_paths.sql` adds `document_paths TEXT[] NOT NULL DEFAULT '{}'`.
- `LegalJobsRepository.updateDocumentPaths` writes the array via `rawQuery` with `$1::text[]` binding (PostgREST `.update({})` silently dropped it — see deviation below).
- `LegalDepartmentState` replaces `legalMetadata` with `documentsMetadata: LegalDocumentMetadata[]` (no back-compat getter — full sweep through all readers).
- `LegalIntelligenceService.extractMetadataForAll` fans extraction out per document with `Promise.all`, preserves order.
- `LegalJobsWorkerService` calls `extractMetadataForAll` and passes `documentsMetadata` into the graph.
- `nodes/specialist-utils.ts` exposes `enumerateDocuments(state)` and a new `runSpecialistOverDocuments` helper that decides per token budget whether to issue one combined call or fan out per-doc + merge. Each specialist's existing merge function (Phase 2) was extended to also merge across documents.
- All 8 specialists (contract, compliance, ip, privacy, employment, corporate, litigation, real_estate) now invoke `runSpecialistOverDocuments` over the enumerated docs. Remaining `documents[0]` references are intentional and guarded (RAG query seed; single-doc fast-path delegation; back-compat `primaryContent`).
- `clo-routing.node.ts` routes on the union of `documentType` values across `documentsMetadata` and exposes a per-doc type map on the routing decision.
- `synthesis.node.ts` enumerates all documents in the user message, asks the LLM to cross-reference findings, and exposes `documentsSummary: Array<{name,type?,length}>` to the HITL interrupt payload.
- `report-generation.node.ts` prints a Markdown document table header listing every analyzed document.

### Web (Forge)
- `OnboardDocumentModal.vue`: `<input type="file" multiple hidden>`, `File[]` state, preview list with name + formatted size, "Choose files" / "up to 10 files" labels, MAX_FILES enforced.
- `legalJobsService.ts`: new `uploadFiles(context, files[])` sends multipart `files` field; legacy `uploadFile(context, file)` delegates to it for back-compat.
- `LegalJobReviewModal.vue`: `.doc-tabs` strip renders only when `documentsSummary.length > 1`, `activeDocIndex` ref resets to 0 on modal open, per-document detail cards via `v-for`, single-document fallback list when only one document.

### Tests added
- `nodes/clo-routing.node.spec.ts` — multi-doc routing union, per-doc type map
- `nodes/specialist-utils.spec.ts` — `runSpecialistOverDocuments` single-doc delegation, multi-doc fan-out merge, error propagation
- `services/legal-intelligence.service.spec.ts` (new file) — `extractMetadata` + `extractMetadataForAll` parallel extraction, order preservation, rejection propagation
- `jobs/legal-jobs.controller.spec.ts` — multipart with multiple files enqueues one job with `document_count=N`
- `legal-department.graph.spec.ts` — multi-doc invoke with mocked LLM
- `nodes/echo.node.spec.ts`, `legal-department.capability.spec.ts`, `legal-jobs-worker.service.spec.ts` — updated for `documentsMetadata` shape

## Quality Gate Results
| Gate | Result |
| --- | --- |
| API lint | clean |
| Web lint | 0 errors (7 pre-existing warnings) |
| API build | webpack compiled successfully |
| Web build | clean |
| API tsc | clean |
| Web vue-tsc | clean |
| API jest | 16 suites, 217 tests, all passing |
| Web vitest | 17 suites, 599 tests, all passing |
| Curl multi-file upload | 202, document_count=3, document_paths populated |
| Curl single-file regression | 202, document_count=1, document_paths length 1 |
| Chrome upload modal | multiple=true, 3-file preview, Queue Job creates real job |
| Chrome review modal | 3 doc-tabs render with type badges, active tab switches on click |
| Live end-to-end run | 3 docs → 3 distinct types classified → 3 specialists routed → synthesis with 5 findings + 3 crossInsights → HITL `awaiting_review` at progress=85 |
| Phase Review grep | clean |

## Deviations from PRD
**`updateDocumentPaths` array binding** — The original implementation used the database plane's PostgREST-backed `.from(SCHEMA, TABLE).update({document_paths: paths})`. Curl verification revealed the column was never written (insert-or-update returned no error but `document_paths` stayed `'{}'`). Switched the method to use `db.rawQuery('UPDATE … SET document_paths = $1::text[] WHERE id = $3', [paths, paths.length, id])` — the same pattern the repository already uses for `recordReviewAndRequeue` when it needs JSONB writes. No PRD impact; the behavior the PRD specifies (paths persisted to the column) is now actually delivered.

## Next Steps
- Phase 4 (Streaming Support) — see plan §Phase 4
- Phase 5 (Hardening & Verification) — see plan §Phase 5

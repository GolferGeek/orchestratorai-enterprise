# Forge RAG Integration — Implementation Plan

**PRD**: ./prd.md
**Created**: 2026-04-10
**Status**: Not Started

## Progress Tracker

- [x] Phase 1: WorkflowRagService + Org Slug Fix
- [x] Phase 2: Migrate Document-Onboarding Specialists
- [x] Phase 3: Contract-Review RAG + Ingestion Enhancement

---

## Phase 1: WorkflowRagService + Org Slug Fix
**Status**: Complete
**Objective**: Create the shared WorkflowRagService with hybrid search and fix the org slug mismatch that prevents RAG lookups from working.

### Steps
- [ ] 1.1 Create `apps/forge/api/src/agents/shared/services/workflow-rag.service.ts`:
  - `@Injectable()` class with `getContext(params: RagContextParams): Promise<string>`
  - Inject `RAG_STORAGE_SERVICE` (for `getCollectionBySlug`) and `QueryService` (for `queryByComplexity`)
  - Resolve collection by slug + orgSlug, call `queryByComplexity(collectionId, orgSlug, 'hybrid', dto, collection.embeddingModel)`
  - Format results as `\n\n---\nRelevant Reference Material:\n[filename] content\n\n...`
  - Wrap entire method in try/catch — return `''` on any error, log warning
- [ ] 1.2 Register `WorkflowRagService` and `QueryService` in `SharedServicesModule` (providers + exports)
- [ ] 1.3 Fix org slug in `scripts/ingest-law-documents.ts`: change `ORG_SLUG` from `'legal'` to `'big-ideas'`
- [ ] 1.4 Fix org slug in migration `apps/auth/api/supabase/migrations/migrations-rag/20260105000010_create_legal_collections.sql`: change all 5 `organization_slug` values from `'legal'` to `'big-ideas'`. Apply same change in `apps/compose/api/` and `apps/forge/api/` copies of this migration.
- [ ] 1.5 Write unit test for `WorkflowRagService` in `apps/forge/api/src/agents/shared/services/__tests__/workflow-rag.service.spec.ts`:
  - Test: returns formatted context when collection exists and has results
  - Test: returns empty string when collection not found
  - Test: returns empty string when query returns no results
  - Test: returns empty string and logs warning on error (soft-fail)

### Quality Gate

- [ ] **Lint**: `cd apps/forge/api && npm run lint`
- [ ] **Build**: `cd apps/forge/api && npm run build`
- [ ] **Unit Tests**: `cd apps/forge/api && npx jest workflow-rag --no-coverage`
- [ ] **Phase Review**:
  - [ ] WorkflowRagService created with hybrid search via `queryByComplexity`
  - [ ] Service registered in SharedServicesModule
  - [ ] Org slug fixed in ingestion script and all 3 copies of the migration
  - [ ] Soft-fail behavior verified in unit tests

---

## Phase 2: Migrate Document-Onboarding Specialists
**Status**: Complete
**Objective**: Replace `queryCollectionForContext()` with `WorkflowRagService.getContext()` in all 8 specialist nodes so they get hybrid search.

### Steps
- [ ] 2.1 Update `legal-department.service.ts`: inject `WorkflowRagService` instead of `RAG_STORAGE_SERVICE`. Pass `workflowRag` to `buildLegalDepartmentGraph()`
- [ ] 2.2 Update `legal-department.graph.ts`: change `ragService?: RagStorageService` param to `workflowRag?: WorkflowRagService`. Pass `workflowRag` to each specialist node factory
- [ ] 2.3 Update all 8 specialist node factories to accept `workflowRag?: WorkflowRagService` instead of `ragService?: RagStorageService`:
  - `contract-agent.node.ts`
  - `compliance-agent.node.ts`
  - `ip-agent.node.ts`
  - `privacy-agent.node.ts`
  - `employment-agent.node.ts`
  - `corporate-agent.node.ts`
  - `litigation-agent.node.ts`
  - `real-estate-agent.node.ts`
- [ ] 2.4 In each specialist node, replace `queryCollectionForContext(ragService, ...)` calls with `workflowRag?.getContext(...)` calls. Preserve the same collection slugs per specialist.
- [ ] 2.5 Remove `queryCollectionForContext()` function from `specialist-utils.ts`
- [ ] 2.6 Remove `RagStorageService` / `RAG_STORAGE_SERVICE` imports from `legal-department.service.ts`, `legal-department.graph.ts`, and `legal-department.module.ts` (if no longer used directly)
- [ ] 2.7 Update `specialist-utils.spec.ts`: replace `queryCollectionForContext` tests with equivalent tests using mocked `WorkflowRagService`. Keep existing non-RAG tests unchanged.

### Quality Gate

- [ ] **Lint**: `cd apps/forge/api && npm run lint`
- [ ] **Build**: `cd apps/forge/api && npm run build`
- [ ] **Unit Tests**: `cd apps/forge/api && npx jest --no-coverage`
- [ ] **Phase Review**:
  - [ ] All 8 specialists use `workflowRag.getContext()` — grep confirms zero remaining references to `queryCollectionForContext`
  - [ ] `queryCollectionForContext` removed from specialist-utils.ts
  - [ ] Collection slugs per specialist unchanged from PRD section 4.4 table
  - [ ] RAG_STORAGE_SERVICE no longer directly injected in legal-department.service.ts
  - [ ] All existing tests pass (specialist-utils.spec.ts updated)

---

## Phase 3: Contract-Review RAG + Ingestion Enhancement
**Status**: Complete
**Objective**: Wire RAG into contract-review specialists and make the ingestion script idempotent with corrected org slug.

### Steps
- [ ] 3.1 Update `runContractReviewSpecialist()` in `specialist-utils.ts`:
  - Add optional params: `workflowRag?: WorkflowRagService`, `collectionSlugs?: string[]`
  - After building the clause map user message, query each collection slug via `workflowRag.getContext()`
  - Concatenate RAG results and append to user message before the LLM call
  - If no workflowRag or no results, proceed unchanged (backward compat)
- [ ] 3.2 Update contract-review specialist factory (`workflows/contract-review/nodes/specialists.ts`):
  - Add `workflowRag` to the specialist node creation
  - Map each specialist key to its collection slugs per PRD section 4.4 table
  - Pass `workflowRag` and `collectionSlugs` to `runContractReviewSpecialist()`
- [ ] 3.3 Update contract-review graph to receive and pass `workflowRag` from the service layer
- [ ] 3.4 Make ingestion script idempotent: before `createDocument()`, query for existing document with same `file_hash` in the collection. Skip if found, log "skipping already-ingested".
- [ ] 3.5 Review seed content in `docs/RAG-filler/law/` — check that each collection has substantive enough content for hybrid search to return meaningful results. Add content if gaps exist.
- [ ] 3.6 Write/update tests:
  - Test `runContractReviewSpecialist` with mocked `workflowRag` — verify RAG context appears in user message
  - Test `runContractReviewSpecialist` without `workflowRag` — verify backward compat (no RAG, no error)

### Quality Gate

- [ ] **Lint**: `cd apps/forge/api && npm run lint`
- [ ] **Build**: `cd apps/forge/api && npm run build`
- [ ] **Unit Tests**: `cd apps/forge/api && npx jest --no-coverage`
- [ ] **Phase Review**:
  - [ ] `runContractReviewSpecialist` accepts and uses `workflowRag` + `collectionSlugs`
  - [ ] Contract-review specialists pass correct collection slugs per PRD table
  - [ ] Ingestion script is idempotent (re-run skips existing docs)
  - [ ] Org slug is `'big-ideas'` in both script and migration
  - [ ] Seed content reviewed — each collection has adequate documents for hybrid search
  - [ ] All tests pass including new contract-review RAG tests

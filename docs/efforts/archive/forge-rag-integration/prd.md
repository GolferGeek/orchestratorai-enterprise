# Forge RAG Integration — Product Requirements Document

## 1. Overview

Forge LangGraph workflows need a clean, shared way to query RAG collections during execution. Today, the legal department specialists use keyword-only search via a utility function in `specialist-utils.ts`, and the contract-review workflow has no RAG at all. Additionally, the collections are seeded under org `'legal'` but workflows run under org `'big-ideas'`, so RAG lookups silently return nothing.

This effort creates a shared `WorkflowRagService` with hybrid search (vector + keyword via RRF fusion), fixes the org slug mismatch, wires RAG into contract-review, and enhances the ingestion script for idempotent re-runs.

## 2. Goals & Success Criteria

| Goal | Success Criterion |
|------|-------------------|
| Shared RAG service | Any LangGraph node can query a RAG collection in one call via `WorkflowRagService` |
| Hybrid search | WorkflowRagService uses `queryByComplexity(..., 'hybrid', ...)` — vector + keyword with RRF fusion |
| Org slug fix | Collections are seeded under `'big-ideas'` (matching the workflow org), or the service resolves the mismatch |
| Contract-review RAG | `runContractReviewSpecialist()` queries RAG before the LLM call; clause risk assessment is informed by reference material |
| Specialist migration | All 8 document-onboarding specialists use WorkflowRagService instead of `queryCollectionForContext()` |
| Idempotent ingestion | `scripts/ingest-law-documents.ts` can be re-run safely — skips already-ingested documents |
| Soft-fail guarantee | No workflow fails due to RAG unavailability — empty context returned, warning logged |

## 3. User Stories

**Legal workflow user:**
- I upload a contract for review. The specialists reference standard clause libraries and contract templates when assessing clause risk, producing more grounded and specific recommendations.
- I upload a document for onboarding. The specialists find semantically relevant legal reference material (not just keyword matches), improving the quality of their analysis.

**Workflow developer:**
- When building a new Forge workflow (legal, marketing, finance), I inject `WorkflowRagService` and call `getContext()` with a collection slug. One line gives me formatted RAG context for my LLM prompt.

## 4. Technical Requirements

### 4.1 WorkflowRagService

**Location:** `apps/forge/api/src/agents/shared/services/workflow-rag.service.ts`

**Injection:** `@Injectable()`, registered in `SharedServicesModule` (global). Injects `QueryService` from `../../rag/query.service` and `RAG_STORAGE_SERVICE` from `@orchestratorai/planes/rag`.

**Interface:**

```typescript
interface RagContextParams {
  collectionSlug: string;
  orgSlug: string;
  query: string;
  topK?: number;            // default 5
  similarityThreshold?: number;  // default uses model-calibrated threshold
}

class WorkflowRagService {
  async getContext(params: RagContextParams): Promise<string>;
}
```

**Behavior of `getContext()`:**

1. Resolve collection: `ragStorage.getCollectionBySlug(slug, orgSlug)` — if null, log warning, return `''`
2. Call `queryService.queryByComplexity(collectionId, orgSlug, 'hybrid', dto, embeddingModel)` — this does vector + keyword + RRF fusion
3. If no results, return `''`
4. Format results as:
   ```
   \n\n---\nRelevant Reference Material:\n[filename] content\n\n[filename] content
   ```
5. Wrap in try/catch — any error returns `''` with a warning log (best-effort)

**Why `queryByComplexity` instead of `queryCollection`:** The `queryCollection` method's `strategy` parameter supports `basic`, `mmr`, and `reranking` — but NOT `hybrid`. Hybrid search is only available via `queryByComplexity(..., 'hybrid', ...)`, which calls the private `hybridSearch` method (vector search + keyword search + RRF fusion with k=60).

**Dependency:** `WorkflowRagService` needs `QueryService`, which requires `EMBEDDING_SERVICE`. The `RagModule` already provides both — but `SharedServicesModule` doesn't import `RagModule`. Either:
- (a) Import `RagModule` into `SharedServicesModule`, or
- (b) Import `QueryService` directly and rely on `RagStorageModule` (global) + `EMBEDDING_SERVICE` being available

Option (b) is cleaner — `QueryService` can be directly provided in `SharedServicesModule` since its dependencies (`RAG_STORAGE_SERVICE`, `EMBEDDING_SERVICE`) are already globally available via `RagStorageModule`.

### 4.2 Org Slug Fix

**The bug:** Collections are created by the migration (`20260105000010_create_legal_collections.sql`) and seeded by the ingestion script (`scripts/ingest-law-documents.ts`) under `organization_slug = 'legal'`. But the legal department workflows run under `orgSlug: 'big-ideas'` (the frontend default). Every RAG lookup calls `getCollectionBySlug(slug, 'big-ideas')`, finds nothing, and returns `''`.

**The fix:** Change the ingestion script's `ORG_SLUG` from `'legal'` to `'big-ideas'`. Update the migration to use `'big-ideas'` as well. This is the correct fix because:
- `'big-ideas'` is the actual org where legal department users operate
- Collections must be in the same org as the users who trigger workflows
- The migration uses `ON CONFLICT ... DO UPDATE`, so re-running with the new org is safe

### 4.3 Migrate Document-Onboarding Specialists

Replace `queryCollectionForContext()` calls in all 8 specialist nodes with `WorkflowRagService.getContext()`.

**Current pattern** (each specialist node):
```typescript
const ragContext = await queryCollectionForContext(
  ragService, ctx.orgSlug, 'law-contracts-hybrid', documents[0]!.content,
);
```

**New pattern:**
```typescript
const ragContext = await workflowRag.getContext({
  collectionSlug: 'law-contracts-hybrid',
  orgSlug: ctx.orgSlug,
  query: documents[0]!.content,
});
```

**Changes required:**
- Each specialist node factory receives `workflowRag: WorkflowRagService` instead of `ragService?: RagStorageService`
- `legal-department.graph.ts` passes `workflowRag` to node factories instead of `ragService`
- `legal-department.service.ts` injects `WorkflowRagService` instead of `RAG_STORAGE_SERVICE`
- `queryCollectionForContext()` is removed from `specialist-utils.ts` after migration
- Collection slugs per specialist remain unchanged

### 4.4 Wire RAG into Contract-Review

**Current state:** `runContractReviewSpecialist()` builds a system message (domain prompt + memory + annotation schema) and user message (clause map), then makes a single LLM call. No RAG.

**Change:** Add RAG context to the user message before the LLM call.

```typescript
export async function runContractReviewSpecialist(opts: {
  llmClient: LLMHttpClientService;
  observability: ObservabilityService;
  state: LegalDepartmentState;
  domainPrompt: string;
  callerName: string;
  progressLabel: string;
  workflowRag?: WorkflowRagService;        // NEW — optional for backward compat
  collectionSlugs?: string[];               // NEW — which collections to query
}): Promise<ClauseAnnotation[]>
```

**Behavior:**
1. Build clause map user message as before
2. If `workflowRag` and `collectionSlugs` are provided, query each collection with the clause map text as the query
3. Append RAG context to user message: `\n\n---\nRelevant Legal Reference Material:\n${ragContext}`
4. Proceed with LLM call as before
5. If RAG fails or returns nothing, proceed without — no behavior change for the LLM call

**Collection mapping for contract-review specialists** (same as their document-onboarding collections):

| Specialist | Collection slugs |
|---|---|
| contract | `law-contracts-hybrid` |
| compliance | `law-firm-policies-attributed` |
| ip | `law-contracts-hybrid`, `law-firm-policies-attributed` |
| privacy | `law-firm-policies-attributed`, `law-contracts-hybrid` |
| employment | `law-contracts-hybrid` |
| corporate | `law-firm-policies-attributed`, `law-estate-planning-attributed` |
| litigation | `law-litigation-cross-reference` |
| realEstate | `law-estate-planning-attributed` |

The contract-review specialist factory (`createSpecialistNode` in `workflows/contract-review/nodes/specialists.ts`) passes the collection slugs to `runContractReviewSpecialist`.

### 4.5 Enhance Ingestion Script

**File:** `scripts/ingest-law-documents.ts`

**Changes:**
1. **Idempotency:** Before creating a document, check if a document with the same `file_hash` already exists in the collection. Skip if so.
2. **Org slug:** Change `ORG_SLUG` from `'legal'` to `'big-ideas'`
3. **Review seed content:** Evaluate existing 15 markdown filler docs for hybrid search adequacy. Add more substantive content if gaps exist (e.g., more clause examples in the contracts collection, regulatory framework summaries in the policies collection).

**Migration update:** `migrations-rag/20260105000010_create_legal_collections.sql` — change `organization_slug` from `'legal'` to `'big-ideas'` for all 5 collection inserts.

### 4.6 No Frontend Changes

No changes to Forge Web, Admin, or Compose. RAG management stays in Admin. Forge workflows consume collections at the code level.

### 4.7 No Data Model Changes

No schema changes. Existing `rag_data` tables and functions are sufficient.

## 5. Non-Functional Requirements

- **Performance:** Hybrid search adds one vector search + one keyword search + RRF merge per specialist per collection. With `topK=5` this is fast (<100ms per query). Acceptable overhead for workflow quality improvement.
- **Reliability:** Best-effort RAG — all calls wrapped in try/catch. No workflow degradation if RAG plane is unavailable or collection is empty.
- **Observability:** Warning logs when collection not found or RAG query fails. No new observability events needed.
- **Security:** `WorkflowRagService` uses the existing `RAG_STORAGE_SERVICE` which enforces org-scoped access. No new auth surface.

## 6. Out of Scope

- RAG management UI in Forge — Admin owns that
- New RAG plane features (reranking, MMR improvements) — use existing `queryByComplexity`
- Runtime collection selection by users — collection slugs are code-level decisions
- Changes to Compose RAG agent type — already works
- New collections for non-legal workflows — pattern is established, collections created per-sector later
- Changes to the `rag_search` stored function's vector dimension (hardcoded to 768) — separate concern

## 7. Dependencies & Risks

| Dependency | Status | Risk |
|---|---|---|
| RAG_STORAGE_SERVICE plane | Done | None |
| EMBEDDING_SERVICE plane | Done | None |
| QueryService with hybrid search | Done | None |
| Ollama with nomic-embed-text | Required for ingestion | Low — well-established local setup |
| Existing 15 filler docs | Done | Low — may need enrichment |

**Risks:**
- **Org slug mismatch is a silent failure.** If the fix is incomplete (migration updated but script not, or vice versa), RAG continues to silently return nothing. Mitigation: single commit changes both, ingestion script logs which org it's seeding.
- **Hybrid search requires embeddings.** If Ollama is unavailable during ingestion, documents get no embeddings and vector search returns nothing. Keyword search still works as fallback. Mitigation: script checks Ollama availability before starting.
- **Token budget pressure.** Adding RAG context to the contract-review LLM call increases input tokens. The call uses fixed `maxTokens: 4000` and a single-call pattern (no chunking). If the clause map is already large, RAG context could push past the model's context window. Mitigation: cap RAG context to a reasonable length (e.g., 2000 tokens) and truncate if needed.

## 8. Phasing

### Phase 1: WorkflowRagService + Org Slug Fix
- Create `WorkflowRagService` in `agents/shared/services/`
- Register in `SharedServicesModule`
- Fix org slug in ingestion script (`'legal'` → `'big-ideas'`)
- Fix org slug in migration SQL
- **Gate:** Service instantiates, `getContext()` returns formatted results for a known collection

### Phase 2: Migrate Document-Onboarding Specialists
- Replace `queryCollectionForContext()` with `WorkflowRagService.getContext()` in all 8 specialist nodes
- Update `legal-department.service.ts` and `legal-department.graph.ts` to inject/pass `WorkflowRagService`
- Remove `queryCollectionForContext()` from `specialist-utils.ts`
- **Gate:** Document onboarding runs successfully; specialists get hybrid search results (verify with seeded collections)

### Phase 3: Contract-Review RAG + Ingestion Enhancement
- Add `workflowRag` and `collectionSlugs` params to `runContractReviewSpecialist()`
- Wire collection slugs in contract-review specialist factory
- Make ingestion script idempotent (skip already-ingested docs by file_hash)
- Review and enhance seed content if gaps exist
- Re-run ingestion with corrected org slug
- **Gate:** Contract review produces clause annotations informed by RAG context; ingestion script runs cleanly on fresh and existing databases

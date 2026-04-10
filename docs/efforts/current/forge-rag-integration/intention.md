# Intention: Forge RAG Integration

## What

Create a shared `WorkflowRagService` for Forge LangGraph workflows to query RAG collections. Upgrade from keyword-only to hybrid search. Wire RAG into the contract-review workflow (currently has no RAG). Enhance the ingestion script with any additional seed content needed.

## What's already built

### Infrastructure (all complete)
- `packages/planes/rag/` — RAG_STORAGE_SERVICE, EMBEDDING_SERVICE, 3 providers
- Database schema `rag_data` with pgvector HNSW indexes
- `RagModule` in Forge API with full HTTP endpoints
- Admin RAG management UI
- Compose RAG agent type with family runner

### Legal Department specialists (document-onboarding path)
- 8 specialist nodes call `queryCollectionForContext()` in `specialist-utils.ts`
- Uses `RAG_STORAGE_SERVICE` directly (plane injection)
- **Keyword search only** — no vector/semantic search
- Best-effort: returns empty string if collection missing
- Collection slugs per specialist:
  - contract-agent → `law-contracts-hybrid`
  - employment-agent → `law-contracts-hybrid`
  - ip-agent → `law-contracts-hybrid` + `law-firm-policies-attributed`
  - privacy-agent → `law-firm-policies-attributed` + `law-contracts-hybrid`
  - compliance-agent → `law-firm-policies-attributed`
  - corporate-agent → `law-firm-policies-attributed` + `law-estate-planning-attributed`
  - litigation-agent → `law-litigation-cross-reference`
  - real-estate-agent → `law-estate-planning-attributed`

### Contract-review workflow — NO RAG
- `runContractReviewSpecialist()` in `specialist-utils.ts` works from the clauseMap only
- Specialists in contract-review mode never query RAG collections
- Missing opportunity: clause library and contract templates would improve risk assessment

### Ingestion script and seed data
- `scripts/ingest-law-documents.ts` — seeds collections from `docs/RAG-filler/law/`
- Migration creates 5 collections in org `'legal'` (4 used by specialists + `law-client-intake-temporal`)
- 15 markdown filler docs across: firm-policies, contracts, litigation, estate-planning, client-intake
- Uses Ollama `nomic-embed-text` for embeddings

### What was removed (this effort)
- HR Assistant agent — proof-of-concept, HR should be a Compose RAG agent
- `RagHttpClientService` — HTTP loopback pattern, no remaining consumers

## What remains

### 1. Create WorkflowRagService
Shared injectable service in `agents/shared/services/`:
- Accepts collection slug + org slug + query text + options
- Uses **hybrid search** (vector + keyword via RRF) when embeddings exist, keyword-only as fallback
- Returns formatted context string ready for LLM prompt injection
- Soft-fails gracefully — returns empty string, logs warning
- Injectable via SharedServicesModule (global)

### 2. Migrate document-onboarding specialists
- Replace `queryCollectionForContext()` in `specialist-utils.ts` with WorkflowRagService
- All 8 specialists get hybrid search for free
- No behavior change — still best-effort, still same collection slugs

### 3. Wire RAG into contract-review
- `runContractReviewSpecialist()` currently skips RAG entirely
- Add RAG context to contract-review specialists so they can reference the clause library and templates when assessing clause risk
- Same best-effort pattern: if no collection or no results, proceed without

### 4. Enhance ingestion script
- Review existing filler docs for adequacy — are they rich enough for hybrid search to return useful results?
- Add additional seed content where gaps exist (e.g., more clause examples, regulatory reference snippets)
- Ensure the script handles re-runs cleanly (idempotent — skip already-ingested docs)
- All seed content lives in `docs/RAG-filler/law/` — the script is the single entry point for populating collections on a fresh database

## The shape of the thing

### Canonical usage in a workflow node

```typescript
const ragContext = await workflowRag.getContext({
  collectionSlug: 'law-contracts-hybrid',
  orgSlug: ctx.orgSlug,
  query: documentText,
  topK: 5,
});
// ragContext is formatted for prompt injection, or empty string
```

### Search strategy
- Hybrid by default: vector similarity + keyword, merged via Reciprocal Rank Fusion
- Keyword fallback: if collection has no embeddings, keyword search only
- QueryService already supports `strategy: 'hybrid'` — use it

### Who manages what where
- **Admin** — create/manage collections, upload documents. Already built.
- **Forge workflows** — consume only. Collection slug is a code-level decision.
- **Compose** — RAG agent type lets users pick a collection. Already built.
- **Ingestion script** — seeds collections on fresh database. Enhanced in this effort.

## Why

Legal workflows analyze documents but currently only have the uploaded document as context (plus keyword search that returns poor results without hybrid). With proper RAG:
- Contract review specialists can reference standard clause libraries when assessing risk
- Document onboarding specialists get semantically relevant legal reference material, not just keyword matches
- Every future Forge sector (marketing, finance) gets RAG in one line

## Constraints

- RAG is always best-effort — never block a workflow because RAG is unavailable
- Workflow code defines which collection to use — no runtime user selection in Forge
- Use existing QueryService hybrid search — don't build new search logic
- Do NOT add RAG management UI to Forge — Admin owns that
- Ingestion script must be idempotent — safe to re-run on existing data
- All seed content in `docs/RAG-filler/law/` — single source for legal collections

## Dependencies

- RAG plane — done
- Database schema — done
- Legal Department specialist nodes — done
- Admin RAG management — done
- Ingestion script — done (enhancing)

## Estimated scope

2 days. Shared service + migrate specialists + wire contract-review + enhance seed content.

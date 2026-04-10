# Intention: Forge RAG Integration

## What

Create a shared `WorkflowRagService` that any Forge LangGraph workflow can use to query RAG collections with one line of code. Upgrade from keyword-only search to hybrid search (vector + keyword). This is the canonical pattern for how Forge workflows consume knowledge bases managed in Admin.

## What's already built

### Infrastructure (all complete)
- `packages/planes/rag/` — RAG_STORAGE_SERVICE with full interface (collections, documents, chunks, vector search, keyword search)
- EMBEDDING_SERVICE with model router (Ollama, OpenAI, Vertex AI)
- Database schema `rag_data` with pgvector HNSW indexes
- `RagModule` in Forge API with full HTTP endpoints including `/rag/internal/query`
- Admin RAG management UI — collections, documents, access control
- Compose RAG agent type with family runner

### Legal Department (the one existing consumer)
- 8 specialist nodes each call `queryCollectionForContext()` in `specialist-utils.ts`
- Uses `RAG_STORAGE_SERVICE` directly (plane injection, not HTTP)
- Keyword search only — no vector/semantic search
- Best-effort: returns empty string if collection doesn't exist or RAG is down
- Each specialist has a hardcoded collection slug (e.g., `'law-contracts-hybrid'`)
- Context appended as "Relevant Legal Reference Material" in user message

### What was removed (this effort)
- HR Assistant agent — was a proof-of-concept, not a real workflow. HR should be a Compose RAG agent.
- `RagHttpClientService` — HTTP loopback pattern had no remaining consumers after HR removal.

## What remains

### 1. Create WorkflowRagService
A shared, injectable service in `agents/shared/services/` that:
- Accepts collection slug + org slug + query text + options
- Uses **hybrid search** (vector + keyword via RRF fusion) when embeddings exist, keyword-only as fallback
- Returns formatted context string ready for LLM prompt injection
- Soft-fails gracefully — returns empty string, logs warning
- Handles "collection doesn't exist yet" cleanly
- Injectable in any LangGraph node via SharedServicesModule

### 2. Migrate Legal Department specialists
- Replace `queryCollectionForContext()` in `specialist-utils.ts` with the new WorkflowRagService
- All 8 specialist nodes get hybrid search for free
- No behavior change — still best-effort, still same collection slugs

### 3. Make it easy for new workflows
- Service is automatically available via SharedServicesModule (global)
- One-line usage pattern established and documented in the service

## The shape of the thing

### Canonical usage

```typescript
// In any workflow node:
const ragContext = await workflowRag.getContext({
  collectionSlug: 'case-law-contracts',
  orgSlug: ctx.orgSlug,
  query: documentText,
  topK: 5,
});

// ragContext is formatted for prompt injection, or empty string
userMessage += ragContext;
```

### Search strategy
- Hybrid by default: vector similarity + keyword, merged via Reciprocal Rank Fusion
- Keyword fallback: if collection has no embeddings, keyword search only
- QueryService already supports `strategy: 'hybrid'` — use it

### Who manages what where
- **Admin** — create/manage collections, upload documents, set access. Already built.
- **Forge workflows** — consume only. Collection slug is a code-level decision per workflow.
- **Compose** — RAG agent type lets users pick a collection at config time. Already built.

## Why

Every Forge sector (legal, marketing, finance) will need RAG. A shared service means:
- New workflows get RAG in one line
- Search quality is consistent (hybrid > keyword-only)
- Error handling is consistent (soft-fail, logged)
- One place to improve search (reranking, MMR) benefits all workflows

## Constraints

- RAG is always best-effort in workflows — never block a workflow because RAG is unavailable
- Workflow code defines which collection to use — no runtime user selection in Forge
- Use existing QueryService hybrid search — don't build new search logic
- Do NOT add RAG management UI to Forge — Admin owns that

## Dependencies

- RAG plane (packages/planes/rag/) — done
- Database schema (rag_data) — done
- Legal Department specialist nodes — done
- Admin RAG management — done

## Estimated scope

1 day. Shared service + migrate legal specialists + verify.

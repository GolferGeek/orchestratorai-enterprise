# Intention: Forge RAG Integration

## What

Establish a clean, canonical pattern for Forge LangGraph workflows to query RAG collections during execution. Today two competing patterns exist — unify them into one, make it robust, and wire it into the legal workflows so they can draw on knowledge base collections managed in Admin.

Admin already has the RAG management UI. Compose already has the RAG agent type. This effort is purely about **Forge workflows consuming RAG well**.

## What's already built

### Two competing RAG patterns in Forge (the problem)

**Pattern A: RagHttpClientService (HTTP loopback)**
- Used by: HR Assistant only
- Calls `POST /rag/internal/query` on itself (loopback to same API)
- Uses vector similarity search
- Hard fails if RAG unavailable
- Lives in `SharedServicesModule` (global)

**Pattern B: Direct RagStorageService injection**
- Used by: Legal Department specialists
- Injects `RAG_STORAGE_SERVICE` from `@orchestratorai/planes/rag` directly
- Uses keyword search (not vector)
- Soft fails — proceeds without context if RAG is unavailable
- `queryCollectionForContext()` utility in `specialist-utils.ts`

Neither is wrong, but having two paths means:
- No shared query strategy (one uses vector search, one uses keyword search)
- No shared error handling philosophy (hard fail vs soft fail)
- No shared context formatting for LLM prompts
- New workflows have to choose between patterns with no guidance

### Infrastructure (all complete)
- `packages/planes/rag/` — RAG_STORAGE_SERVICE, EMBEDDING_SERVICE, 3 providers
- Database schema `rag_data` with pgvector HNSW indexes
- Embedding model router (Ollama, OpenAI, Vertex AI)
- `RagModule` in Forge API with full HTTP endpoints (collections, documents, query, Q&A)
- `RagHttpClientService` in SharedServicesModule
- `/rag/internal/query` endpoint (@Public, no JWT)
- Admin RAG management UI — collections, documents, access control
- Compose RAG agent type with family runner

### Legal Department workflow RAG usage
- 8 specialists each call `queryCollectionForContext()` with a hardcoded collection slug
- Uses keyword search only (no vector/semantic search)
- Best-effort: returns empty string if collection doesn't exist or RAG is unavailable
- Context appended as "Relevant Legal Reference Material" in the user message

## What remains

### 1. Unify the RAG query pattern
- Choose ONE canonical way for workflow nodes to query RAG
- Direct plane injection (`RAG_STORAGE_SERVICE`) is better than HTTP loopback — no network hop, no port dependency, type-safe
- Create a shared `WorkflowRagService` (or similar) in `agents/shared/services/` that:
  - Accepts collection slug + org slug + query text
  - Uses **hybrid search** (vector + keyword via RRF fusion) when embeddings exist, keyword-only as fallback
  - Returns formatted context ready for LLM prompt injection
  - Soft-fails gracefully (returns empty context, logs warning)
  - Handles the "collection doesn't exist yet" case cleanly

### 2. Migrate existing consumers
- Legal Department: replace `queryCollectionForContext()` in `specialist-utils.ts` with the new shared service
- HR Assistant: replace `RagHttpClientService` usage with the new shared service
- Deprecate `RagHttpClientService` (or keep for external consumers only)

### 3. Make it easy for new workflows
- The shared service should be injectable in any LangGraph node with zero setup
- Document the pattern: "to add RAG to a workflow node, inject WorkflowRagService, call `getContext(collectionSlug, orgSlug, query)`"
- Each workflow defines its collection slug(s) at the code level — no runtime user choice

## The shape of the thing

### Canonical usage in a workflow node

```typescript
// In any specialist node factory:
const ragContext = await workflowRag.getContext({
  collectionSlug: 'case-law-contracts',
  orgSlug: ctx.orgSlug,
  query: documentText,
  topK: 5,
});

// ragContext is already formatted for prompt injection
// Empty string if collection doesn't exist or has no results
const userMessage = `${documentText}${ragContext}`;
```

### Search strategy
- **Hybrid by default**: vector similarity + keyword search, merged via Reciprocal Rank Fusion (RRF)
- **Keyword fallback**: if the collection has no embeddings yet, keyword search only
- The QueryService already supports hybrid mode (`strategy: 'hybrid'`) — use it

### Where collections are managed
- **Admin** — the single place to create/manage collections. Already built.
- **Forge workflows** — consume only. Collection slug is a code-level decision.
- **Compose** — RAG agent type lets users pick a collection at agent config time. Already built.

## Why

Every Forge sector (legal, marketing, finance, HR) will need RAG. Having two competing patterns creates confusion and inconsistency. A unified service means:
- New workflows get RAG in one line of code
- Search quality is consistent (hybrid > keyword-only)
- Error handling is consistent (soft-fail, logged)
- One place to improve search (reranking, MMR) benefits all workflows

## Constraints

- Do NOT add RAG management to Forge UI — Admin owns that
- Do NOT change the RAG plane interface — use it as-is
- Workflow code defines which collection to use — no runtime user selection in Forge
- RAG is always best-effort in workflows — never block a workflow because RAG is unavailable
- Use existing hybrid search in QueryService — don't build new search logic

## Dependencies

- RAG plane (packages/planes/rag/) — done
- Database schema (rag_data) — done
- Admin RAG management UI — done
- Legal Department workflow with specialist nodes — done

## Estimated scope

1-2 days. Shared service + migrate 2 existing consumers + verify.

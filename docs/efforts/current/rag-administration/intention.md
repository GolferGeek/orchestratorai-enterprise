# Intention: RAG Administration

## What

Build the RAG administration UI in Admin — the single place to manage knowledge base collections across the platform. Collections created here are consumed by Forge workflows (which define their collection at the code level) and Compose RAG agents (where users pick a collection at agent configuration time).

## What's already built

### Infrastructure (complete)
- `packages/planes/rag/` — RAG_STORAGE_SERVICE with full interface (collections, documents, chunks, vector search, keyword search)
- EMBEDDING_SERVICE with model router (Ollama, OpenAI, Vertex AI)
- 3 storage providers (Supabase, PostgreSQL, SQL Server)
- Database schema `rag_data` with pgvector HNSW indexes
- Stored functions for CRUD, search, and access control

### Compose (complete)
- RAG family runner — queries a collection, augments prompt, generates response
- RAG agent type in agent definitions — users pick a collection slug at config time
- Full RAG API endpoints (collections, documents, query, Q&A)

### Forge (backend complete)
- RagModule with all controllers/services registered in AppModule
- RagHttpClientService for LangGraph nodes to query collections internally (no JWT)
- `/rag/internal/query` endpoint for service-to-service calls
- Workflows define which collection they use at the code level — no runtime user choice

### Admin (nothing)
- No RAG UI exists in Admin
- Admin API has no RAG-related modules

## What remains

### Admin RAG Management UI
- **Collections list page** — view all collections across orgs, with stats (document count, chunk count, status)
- **Collection detail page** — view/edit collection settings (name, slug, embedding model, chunk size/overlap, access control)
- **Document management** — upload documents to a collection, view processing status, delete documents
- **Collection creation** — create new collections with org assignment, embedding model selection, chunking config
- **Access control** — set required_role and allowed_users per collection (existing schema supports this)

### Admin API RAG Module
- Admin API needs endpoints that proxy to the RAG plane (or import RagStorageModule directly)
- Collections CRUD, document upload/delete, status monitoring
- Scoped to admin entitlements — only admins manage collections

## The shape of the thing

### Who manages what where

| Action | Where | Who |
|--------|-------|-----|
| Create/edit/delete collections | Admin | Admins |
| Upload/manage documents | Admin | Admins |
| Set collection access control | Admin | Admins |
| Pick a collection for a RAG agent | Compose | Users configuring agents |
| Query a collection at runtime | Compose (via RAG runner) | End users |
| Query a collection from a workflow | Forge (via RagHttpClientService) | Workflow code (not users) |

### Admin UI pages

```
/admin/rag                          ← Collections list
/admin/rag/collections/new          ← Create collection
/admin/rag/collections/:id          ← Collection detail + documents
```

### Key decisions
- **Admin is the single admin interface.** Compose and Forge consume collections but don't manage them.
- **Forge workflows define their collection in code.** There is no collection picker in the Forge UI. When a workflow needs legal case law, the developer wires `collectionSlug: 'case-law'` into the node.
- **Compose RAG agents pick their collection at config time.** The agent definition's `collectionSlug` field already supports this.
- **No new RAG infrastructure needed.** The plane, providers, schema, and embedding pipeline are complete. This effort is purely about the admin UI and API layer.

## Why

RAG collections are a shared resource. Legal workflows, marketing workflows, finance workflows, and Compose agents all need access to knowledge bases. Without a central admin UI, collection management happens through API calls or database access — fragile and invisible.

Admins need to see what collections exist, what's in them, whether documents processed successfully, and who has access. This is table stakes for operating RAG at scale.

## Constraints

- Admin is the ONLY place for collection CRUD — don't add management UI to Forge or Compose
- Use existing RAG plane (RAG_STORAGE_SERVICE) — no new storage abstraction
- Use existing embedding pipeline — no new embedding infrastructure
- Follow Admin product patterns (existing page layout, navigation, Ionic components)
- Collections are org-scoped — respect multi-tenancy throughout

## Dependencies

- RAG plane (packages/planes/rag/) — done
- Database schema (rag_data) — done
- Embedding pipeline — done
- Admin API auth hardening — done (PR #10)

## Estimated scope

2-3 days. Admin API module + 3 web pages (list, create, detail/documents).

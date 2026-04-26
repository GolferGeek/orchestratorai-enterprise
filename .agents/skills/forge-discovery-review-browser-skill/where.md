# Discovery Review — Where Everything Is

## Navigation
- Direct URL: `http://localhost:6201/app/agents/legal-department/discovery-review`
- Sidebar: Legal Department → Discovery Review

## Submitting a Job

**Modal**: `CreateDiscoveryReviewModal`

Form fields:
- **File dropzone** — multi-file upload (the discovery production)
- **Matter ID** input
- **Matter Name** input
- **Claims** textarea — one claim per line (what the case is about)
- **Date Range Start** — YYYY-MM-DD format
- **Date Range End** — YYYY-MM-DD format
- **Key Parties** textarea — one party per line
- **Key Topics** textarea — one topic per line
- **Exclusions** textarea — documents to skip (optional)
- **Button**: "Queue Job"

## Inline View

Results appear as inline `DiscoveryReviewView`:
- **Document coding grid** — one row per document: filename, AI-assigned privilege, relevance, hot-doc flags, status
- **Batch review indicators** — which batch gates have passed/pending
- **Production set summary** — count of documents in each final status

## Four HITL Gates (BatchReviewPanel)

Each gate opens `LegalJobReviewModal` → `BatchReviewPanel`.

The `BatchReviewPanel` shows a paginated list of documents with AI coding. For each document:
- AI recommendation badge
- Override dropdown (change coding)
- Notes field

Gates in order:
1. **`batch_hitl_privilege`** — privilege review
2. **`batch_hitl_relevance`** — relevance coding
3. **`batch_hitl_hot_docs`** — key document review
4. **`batch_hitl_sample`** — sampling verification

Each gate must be approved before the next one opens.

## SSE Stages (StageLadder)

| Stage | Label |
|-------|-------|
| `protocol_validation` | Validating Protocol |
| `ingest` | Ingesting Documents |
| `classify_all` | AI Classification |
| `dispatch_loop` / `code_document` | Coding Documents |
| `build_batches` | Building Batches |
| `batch_hitl_privilege` | Review: Privilege |
| `batch_hitl_relevance` | Review: Relevance |
| `batch_hitl_hot_docs` | Review: Hot Documents |
| `batch_hitl_sample` | Review: Sample Check |
| `calibration_check` | Calibration |
| `generate_production_set` | Generating Production Set |

## API Endpoints
```
POST /agents/legal-department/invoke  (multipart)
GET  /agents/legal-department/jobs/:id
POST /agents/legal-department/jobs/:id/review?batch=privilege|relevance|hot_docs|sample
GET  /agents/legal-department/jobs/:id/stream
```

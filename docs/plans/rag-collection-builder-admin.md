# RAG Collection Builder — Admin Product Enhancement

## Goal
Port the full RAG Collection Builder from the dev repo into the Admin product, matching all functionality: enhanced collection creation (complexity types, embedding models, chunking config, RBAC), document upload with processing pipeline (extract, chunk, embed), and the full document management UI (file upload, folder upload with tree selector, batch progress).

## Architecture Decision
- Admin API handles RAG CRUD **and** document processing directly
- Uses `EMBEDDING_SERVICE` and `RagStorageModule` from `packages/planes/rag/`
- Copies extractors and chunking service from Compose (business logic, not infrastructure)
- Database schema already exists (rag_data tables + migrations)

## Phase 1: Backend — Enhanced Collection CRUD
**Files:** `apps/admin/api/src/rag-management/`

1. Update `CreateRagCollectionDto` with all fields:
   - embeddingModel (default: nomic-embed-text)
   - chunkSize (100-4000, default: 1000)
   - chunkOverlap (0-1000, default: 200)
   - complexityType (basic, attributed, hybrid, cross-reference, temporal)
   - requiredRole, allowedUsers, privateToCreator
2. Add `UpdateRagCollectionDto` (name, description, requiredRole, allowedUsers, complexityType)
3. Update service to pass all fields to database
4. Add PATCH endpoint to controller
5. Update response types to include all collection fields

## Phase 2: Backend — Document Upload & Processing
**Files:** `apps/admin/api/src/rag-management/`

1. Add extractors: `extractors/pdf-extractor.service.ts`, `docx-extractor.service.ts`, `text-extractor.service.ts`
2. Add `chunking.service.ts`
3. Add `document-processor.service.ts` (extract → chunk → embed → store)
4. Add controller endpoints:
   - POST `/collections/:id/documents` (multipart form-data upload)
   - DELETE `/collections/:id/documents/:documentId`
   - GET `/collections/:id/documents/:documentId/chunks`
5. Import `RagStorageModule` into `RagManagementModule` for EMBEDDING_SERVICE
6. Wire up services in module

## Phase 3: Frontend — Enhanced Collection Creation
**Files:** `apps/admin/web/src/`

1. Update types in `admin-api.service.ts`:
   - Full RagCollection with embeddingModel, chunkSize, chunkOverlap, complexityType, status, requiredRole, allowedUsers, chunkCount, totalTokens
   - Full CreateRagCollectionRequest with all config fields
2. Update `RagCollectionsPage.vue` create modal:
   - Embedding model dropdown (6 options)
   - Chunk size/overlap inputs with validation
   - Complexity type selector with descriptions
   - Access control (private toggle)
3. Display complexity type and embedding model in collections list

## Phase 4: Frontend — Collection Detail & Document Upload
**Files:** `apps/admin/web/src/`

1. Rewrite `RagCollectionDetailPage.vue`:
   - Collection info card with all metadata
   - Documents list with status badges, chunk/token counts
   - Upload modal with Files/Folder tabs
   - Drag-drop file upload area
   - Upload progress tracking
   - Delete document confirmation
2. Add `components/rag/FolderTreeSelector.vue` — tree-based file selector
3. Add `components/rag/FolderTreeNode.vue` — recursive tree node
4. Update `rag.store.ts` with batch upload state

## Phase 5: Build Verification
- Rebuild Admin API (`nest build`)
- Check Admin Web compiles (Vite)

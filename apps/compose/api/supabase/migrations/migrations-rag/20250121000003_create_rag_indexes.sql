-- =============================================================================
-- RAG DATABASE: Create Indexes
-- =============================================================================
-- HNSW index for vector similarity search + B-tree indexes for filtering
-- Per PRD §4.3.3 and §7.1
-- =============================================================================

-- Set search path to rag_data schema
SET search_path TO rag_data, public;

-- =============================================================================
-- COLLECTIONS INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_rag_collections_org
    ON rag_data.rag_collections(organization_slug);

CREATE INDEX IF NOT EXISTS idx_rag_collections_org_slug
    ON rag_data.rag_collections(organization_slug, slug);

CREATE INDEX IF NOT EXISTS idx_rag_collections_status
    ON rag_data.rag_collections(status);

-- =============================================================================
-- DOCUMENTS INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_rag_documents_collection
    ON rag_data.rag_documents(collection_id);

CREATE INDEX IF NOT EXISTS idx_rag_documents_org
    ON rag_data.rag_documents(organization_slug);

CREATE INDEX IF NOT EXISTS idx_rag_documents_status
    ON rag_data.rag_documents(status);

CREATE INDEX IF NOT EXISTS idx_rag_documents_hash
    ON rag_data.rag_documents(file_hash);

-- =============================================================================
-- CHUNKS INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_rag_chunks_collection
    ON rag_data.rag_document_chunks(collection_id);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_document
    ON rag_data.rag_document_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_org
    ON rag_data.rag_document_chunks(organization_slug);

-- =============================================================================
-- HNSW INDEX FOR VECTOR SIMILARITY SEARCH (PRD §4.3.3)
-- =============================================================================
-- HNSW provides fast approximate nearest neighbor search
-- m = 16: number of bi-directional links per node (higher = better quality, more memory)
-- ef_construction = 64: size of dynamic candidate list during construction

CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding
    ON rag_data.rag_document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

COMMENT ON INDEX rag_data.idx_rag_chunks_embedding IS 'HNSW index for fast vector similarity search (PRD §4.3.3)';

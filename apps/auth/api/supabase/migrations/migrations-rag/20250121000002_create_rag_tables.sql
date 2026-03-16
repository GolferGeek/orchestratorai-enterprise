-- =============================================================================
-- RAG DATABASE: Create Core Tables
-- =============================================================================
-- Collections, Documents, and Document Chunks tables
-- Per PRD §4.3: Uses organization_slug for multi-tenant isolation
-- =============================================================================

-- Set search path to rag_data schema
SET search_path TO rag_data, public;

-- =============================================================================
-- COLLECTIONS TABLE (PRD §4.3.1)
-- =============================================================================
CREATE TABLE IF NOT EXISTS rag_data.rag_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Organization isolation (validated by API before calling)
    organization_slug TEXT NOT NULL,

    -- Basic info
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,

    -- Embedding configuration
    embedding_model VARCHAR(100) NOT NULL DEFAULT 'nomic-embed-text',
    embedding_dimensions INTEGER NOT NULL DEFAULT 768,

    -- Chunking configuration
    chunk_size INTEGER NOT NULL DEFAULT 1000,
    chunk_overlap INTEGER NOT NULL DEFAULT 200,

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, processing, error

    -- Role-based access (NULL = all org members, 'director', 'c-level')
    required_role TEXT DEFAULT NULL,

    -- Statistics (denormalized for performance)
    document_count INTEGER NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,

    -- Constraints
    UNIQUE(organization_slug, slug)
);

COMMENT ON TABLE rag_data.rag_collections IS 'RAG collection definitions with embedding configuration (PRD §4.3.1)';

-- =============================================================================
-- DOCUMENTS TABLE (PRD §4.2.2)
-- =============================================================================
CREATE TABLE IF NOT EXISTS rag_data.rag_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES rag_data.rag_collections(id) ON DELETE CASCADE,

    -- Denormalized for efficient org filtering
    organization_slug TEXT NOT NULL,

    -- File info
    filename VARCHAR(500) NOT NULL,
    file_type VARCHAR(50) NOT NULL, -- pdf, txt, md, docx
    file_size INTEGER NOT NULL, -- bytes
    file_hash VARCHAR(64), -- SHA-256 for deduplication

    -- Storage
    storage_path TEXT, -- Supabase storage path if stored

    -- Processing status
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, error
    error_message TEXT,

    -- Processing results
    chunk_count INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0,

    -- Metadata (title, author, page_count, etc.)
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_by UUID
);

COMMENT ON TABLE rag_data.rag_documents IS 'Source documents ingested into RAG collections (PRD §4.2.2)';

-- =============================================================================
-- DOCUMENT CHUNKS TABLE (PRD §4.2.3)
-- =============================================================================
CREATE TABLE IF NOT EXISTS rag_data.rag_document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES rag_data.rag_documents(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES rag_data.rag_collections(id) ON DELETE CASCADE,

    -- Denormalized for efficient org filtering
    organization_slug TEXT NOT NULL,

    -- Chunk content
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL, -- Order within document

    -- Embedding (768 dimensions for Ollama nomic-embed-text default)
    embedding vector(768),

    -- Token info
    token_count INTEGER NOT NULL DEFAULT 0,

    -- Source location
    page_number INTEGER, -- For PDFs
    char_offset INTEGER, -- Character offset in original

    -- Metadata (headers, section title, etc.)
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE rag_data.rag_document_chunks IS 'Document chunks with vector embeddings for semantic search (PRD §4.2.3)';

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================
CREATE OR REPLACE FUNCTION rag_data.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_collections_updated_at
    BEFORE UPDATE ON rag_data.rag_collections
    FOR EACH ROW EXECUTE FUNCTION rag_data.set_updated_at();

CREATE TRIGGER set_documents_updated_at
    BEFORE UPDATE ON rag_data.rag_documents
    FOR EACH ROW EXECUTE FUNCTION rag_data.set_updated_at();

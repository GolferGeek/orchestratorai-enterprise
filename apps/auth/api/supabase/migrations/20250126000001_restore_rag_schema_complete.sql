-- =============================================================================
-- RAG DATABASE: Complete Schema Restoration
-- =============================================================================
-- Restores all RAG schema tables, indexes, functions, triggers, and constraints
-- Based on backup snapshot from 2025-01-26
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
    
    -- User-level access control (NULL = all org members, array = specific users)
    allowed_users UUID[] DEFAULT NULL,
    
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
-- INDEXES
-- =============================================================================

-- Collections indexes
CREATE INDEX IF NOT EXISTS idx_rag_collections_org
    ON rag_data.rag_collections(organization_slug);

CREATE INDEX IF NOT EXISTS idx_rag_collections_org_slug
    ON rag_data.rag_collections(organization_slug, slug);

CREATE INDEX IF NOT EXISTS idx_rag_collections_status
    ON rag_data.rag_collections(status);

CREATE INDEX IF NOT EXISTS idx_rag_collections_allowed_users
    ON rag_data.rag_collections USING GIN (allowed_users);

-- Documents indexes
CREATE INDEX IF NOT EXISTS idx_rag_documents_collection
    ON rag_data.rag_documents(collection_id);

CREATE INDEX IF NOT EXISTS idx_rag_documents_org
    ON rag_data.rag_documents(organization_slug);

CREATE INDEX IF NOT EXISTS idx_rag_documents_status
    ON rag_data.rag_documents(status);

CREATE INDEX IF NOT EXISTS idx_rag_documents_hash
    ON rag_data.rag_documents(file_hash);

-- Chunks indexes
CREATE INDEX IF NOT EXISTS idx_rag_chunks_collection
    ON rag_data.rag_document_chunks(collection_id);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_document
    ON rag_data.rag_document_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_org
    ON rag_data.rag_document_chunks(organization_slug);

-- HNSW index for vector similarity search (PRD §4.3.3)
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding
    ON rag_data.rag_document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

COMMENT ON INDEX rag_data.idx_rag_chunks_embedding IS 'HNSW index for fast vector similarity search (PRD §4.3.3)';

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION rag_data.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS set_collections_updated_at ON rag_data.rag_collections;
CREATE TRIGGER set_collections_updated_at
    BEFORE UPDATE ON rag_data.rag_collections
    FOR EACH ROW EXECUTE FUNCTION rag_data.set_updated_at();

DROP TRIGGER IF EXISTS set_documents_updated_at ON rag_data.rag_documents;
CREATE TRIGGER set_documents_updated_at
    BEFORE UPDATE ON rag_data.rag_documents
    FOR EACH ROW EXECUTE FUNCTION rag_data.set_updated_at();

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- =============================================================================
-- COLLECTION FUNCTIONS (PRD §4.4.1)
-- =============================================================================

-- Get all collections for an organization (with optional user filtering)
CREATE OR REPLACE FUNCTION rag_data.rag_get_collections(
    p_organization_slug TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS SETOF rag_data.rag_collections
LANGUAGE sql STABLE
AS $$
    SELECT *
    FROM rag_data.rag_collections
    WHERE organization_slug = p_organization_slug
      AND (
          -- No user filter = return all (for admin queries)
          p_user_id IS NULL
          -- Or user has access
          OR allowed_users IS NULL
          OR created_by = p_user_id
          OR p_user_id = ANY(allowed_users)
      )
    ORDER BY created_at DESC;
$$;

-- Get single collection (with org validation)
CREATE OR REPLACE FUNCTION rag_data.rag_get_collection(
    p_collection_id UUID,
    p_organization_slug TEXT
)
RETURNS TABLE (
    id UUID,
    organization_slug TEXT,
    name VARCHAR(255),
    slug VARCHAR(255),
    description TEXT,
    embedding_model VARCHAR(100),
    embedding_dimensions INTEGER,
    chunk_size INTEGER,
    chunk_overlap INTEGER,
    status VARCHAR(50),
    required_role TEXT,
    document_count INTEGER,
    chunk_count INTEGER,
    total_tokens INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    created_by UUID
)
LANGUAGE sql STABLE
AS $$
    SELECT id, organization_slug, name, slug, description, embedding_model,
           embedding_dimensions, chunk_size, chunk_overlap, status, required_role,
           document_count, chunk_count, total_tokens, created_at, updated_at, created_by
    FROM rag_data.rag_collections
    WHERE id = p_collection_id
      AND organization_slug = p_organization_slug;
$$;

-- Create a new collection (with access control)
CREATE OR REPLACE FUNCTION rag_data.rag_create_collection(
    p_organization_slug TEXT,
    p_name VARCHAR(255),
    p_slug VARCHAR(255),
    p_description TEXT DEFAULT NULL,
    p_embedding_model VARCHAR(100) DEFAULT 'nomic-embed-text',
    p_embedding_dimensions INTEGER DEFAULT 768,
    p_chunk_size INTEGER DEFAULT 1000,
    p_chunk_overlap INTEGER DEFAULT 200,
    p_created_by UUID DEFAULT NULL,
    p_required_role TEXT DEFAULT NULL,
    p_allowed_users UUID[] DEFAULT NULL
)
RETURNS rag_data.rag_collections
LANGUAGE sql
AS $$
    INSERT INTO rag_data.rag_collections (
        organization_slug,
        name,
        slug,
        description,
        embedding_model,
        embedding_dimensions,
        chunk_size,
        chunk_overlap,
        created_by,
        required_role,
        allowed_users
    ) VALUES (
        p_organization_slug,
        p_name,
        p_slug,
        p_description,
        p_embedding_model,
        p_embedding_dimensions,
        p_chunk_size,
        p_chunk_overlap,
        p_created_by,
        p_required_role,
        p_allowed_users
    )
    RETURNING *;
$$;

-- Update collection (with access control)
CREATE OR REPLACE FUNCTION rag_data.rag_update_collection(
    p_collection_id UUID,
    p_organization_slug TEXT,
    p_name VARCHAR(255) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_required_role TEXT DEFAULT NULL,
    p_allowed_users UUID[] DEFAULT NULL,
    p_clear_allowed_users BOOLEAN DEFAULT FALSE
)
RETURNS rag_data.rag_collections
LANGUAGE plpgsql
AS $$
DECLARE
    v_result rag_data.rag_collections;
BEGIN
    UPDATE rag_data.rag_collections
    SET
        name = COALESCE(p_name, name),
        description = COALESCE(p_description, description),
        required_role = COALESCE(p_required_role, required_role),
        -- Handle allowed_users: explicit NULL clears, array updates, or keep existing
        allowed_users = CASE
            WHEN p_clear_allowed_users THEN NULL
            WHEN p_allowed_users IS NOT NULL THEN p_allowed_users
            ELSE allowed_users
        END,
        updated_at = NOW()
    WHERE id = p_collection_id
      AND organization_slug = p_organization_slug
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

-- Delete collection (with org validation)
CREATE OR REPLACE FUNCTION rag_data.rag_delete_collection(
    p_collection_id UUID,
    p_organization_slug TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM rag_data.rag_collections
    WHERE id = p_collection_id
      AND organization_slug = p_organization_slug;
    RETURN FOUND;
END;
$$;

-- Check if user can access collection
CREATE OR REPLACE FUNCTION rag_data.rag_user_can_access_collection(
    p_collection_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_collection RECORD;
BEGIN
    SELECT allowed_users, created_by
    INTO v_collection
    FROM rag_data.rag_collections
    WHERE id = p_collection_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- NULL allowed_users = everyone in org can access
    IF v_collection.allowed_users IS NULL THEN
        RETURN TRUE;
    END IF;

    -- User is the creator
    IF v_collection.created_by = p_user_id THEN
        RETURN TRUE;
    END IF;

    -- User is in allowed_users array
    IF p_user_id = ANY(v_collection.allowed_users) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION rag_data.rag_user_can_access_collection IS 'Check if user has access to a collection based on allowed_users or created_by';

-- =============================================================================
-- DOCUMENT FUNCTIONS (PRD §4.4.2)
-- =============================================================================

-- Get documents for a collection (with org validation)
CREATE OR REPLACE FUNCTION rag_data.rag_get_documents(
    p_collection_id UUID,
    p_organization_slug TEXT
)
RETURNS TABLE (
    id UUID,
    collection_id UUID,
    filename VARCHAR(500),
    file_type VARCHAR(50),
    file_size INTEGER,
    status VARCHAR(50),
    error_message TEXT,
    chunk_count INTEGER,
    token_count INTEGER,
    metadata JSONB,
    created_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
    SELECT d.id, d.collection_id, d.filename, d.file_type, d.file_size, d.status,
           d.error_message, d.chunk_count, d.token_count, d.metadata,
           d.created_at, d.processed_at
    FROM rag_data.rag_documents d
    JOIN rag_data.rag_collections c ON d.collection_id = c.id
    WHERE d.collection_id = p_collection_id
      AND c.organization_slug = p_organization_slug
    ORDER BY d.created_at DESC;
$$;

-- Get single document
CREATE OR REPLACE FUNCTION rag_data.rag_get_document(
    p_document_id UUID,
    p_organization_slug TEXT
)
RETURNS TABLE (
    id UUID,
    collection_id UUID,
    filename VARCHAR(500),
    file_type VARCHAR(50),
    file_size INTEGER,
    file_hash VARCHAR(64),
    storage_path TEXT,
    status VARCHAR(50),
    error_message TEXT,
    chunk_count INTEGER,
    token_count INTEGER,
    metadata JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
    SELECT d.id, d.collection_id, d.filename, d.file_type, d.file_size,
           d.file_hash, d.storage_path, d.status, d.error_message,
           d.chunk_count, d.token_count, d.metadata,
           d.created_at, d.updated_at, d.processed_at
    FROM rag_data.rag_documents d
    WHERE d.id = p_document_id
      AND d.organization_slug = p_organization_slug;
$$;

-- Insert document (returns NULL if collection doesn't belong to org)
CREATE OR REPLACE FUNCTION rag_data.rag_insert_document(
    p_collection_id UUID,
    p_organization_slug TEXT,
    p_filename VARCHAR(500),
    p_file_type VARCHAR(50),
    p_file_size INTEGER,
    p_file_hash VARCHAR(64) DEFAULT NULL,
    p_storage_path TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS rag_data.rag_documents
LANGUAGE plpgsql
AS $$
DECLARE
    v_collection_exists BOOLEAN;
    v_result rag_data.rag_documents;
BEGIN
    -- Verify collection belongs to organization
    SELECT EXISTS(
        SELECT 1 FROM rag_data.rag_collections
        WHERE id = p_collection_id AND organization_slug = p_organization_slug
    ) INTO v_collection_exists;

    IF NOT v_collection_exists THEN
        RETURN NULL;
    END IF;

    INSERT INTO rag_data.rag_documents (
        collection_id, organization_slug, filename, file_type, file_size,
        file_hash, storage_path, created_by
    )
    VALUES (
        p_collection_id, p_organization_slug, p_filename, p_file_type, p_file_size,
        p_file_hash, p_storage_path, p_created_by
    )
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

-- Update document status
CREATE OR REPLACE FUNCTION rag_data.rag_update_document_status(
    p_document_id UUID,
    p_organization_slug TEXT,
    p_status VARCHAR(50),
    p_error_message TEXT DEFAULT NULL,
    p_chunk_count INTEGER DEFAULT NULL,
    p_token_count INTEGER DEFAULT NULL
)
RETURNS rag_data.rag_documents
LANGUAGE plpgsql
AS $$
DECLARE
    v_result rag_data.rag_documents;
BEGIN
    UPDATE rag_data.rag_documents
    SET
        status = p_status,
        error_message = p_error_message,
        chunk_count = COALESCE(p_chunk_count, chunk_count),
        token_count = COALESCE(p_token_count, token_count),
        processed_at = CASE WHEN p_status = 'completed' THEN NOW() ELSE processed_at END,
        updated_at = NOW()
    WHERE id = p_document_id
      AND organization_slug = p_organization_slug
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

-- Delete document (and its chunks via CASCADE)
CREATE OR REPLACE FUNCTION rag_data.rag_delete_document(
    p_document_id UUID,
    p_organization_slug TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_collection_id UUID;
    v_chunk_count INTEGER;
BEGIN
    -- Get collection and chunk count before delete
    SELECT collection_id, chunk_count INTO v_collection_id, v_chunk_count
    FROM rag_data.rag_documents
    WHERE id = p_document_id AND organization_slug = p_organization_slug;

    IF v_collection_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Delete document (chunks deleted via CASCADE)
    DELETE FROM rag_data.rag_documents
    WHERE id = p_document_id AND organization_slug = p_organization_slug;

    -- Update collection stats
    UPDATE rag_data.rag_collections
    SET document_count = document_count - 1,
        chunk_count = chunk_count - COALESCE(v_chunk_count, 0),
        updated_at = NOW()
    WHERE id = v_collection_id;

    RETURN TRUE;
END;
$$;

-- =============================================================================
-- CHUNK FUNCTIONS (PRD §4.4.3)
-- =============================================================================

-- Insert chunks (batch insert with org validation)
CREATE OR REPLACE FUNCTION rag_data.rag_insert_chunks(
    p_document_id UUID,
    p_organization_slug TEXT,
    p_chunks JSONB  -- Array of {content, chunk_index, embedding, token_count, page_number, metadata}
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_collection_id UUID;
    v_inserted INTEGER := 0;
    v_total_tokens INTEGER := 0;
    v_chunk JSONB;
BEGIN
    -- Get collection_id and verify org ownership
    SELECT d.collection_id INTO v_collection_id
    FROM rag_data.rag_documents d
    JOIN rag_data.rag_collections c ON d.collection_id = c.id
    WHERE d.id = p_document_id
      AND c.organization_slug = p_organization_slug;

    IF v_collection_id IS NULL THEN
        RETURN 0;
    END IF;

    -- Insert all chunks
    FOR v_chunk IN SELECT * FROM jsonb_array_elements(p_chunks)
    LOOP
        INSERT INTO rag_data.rag_document_chunks (
            document_id, collection_id, organization_slug, content, chunk_index,
            embedding, token_count, page_number, char_offset, metadata
        )
        VALUES (
            p_document_id,
            v_collection_id,
            p_organization_slug,
            v_chunk->>'content',
            (v_chunk->>'chunk_index')::INTEGER,
            CASE
                WHEN v_chunk ? 'embedding' AND v_chunk->>'embedding' IS NOT NULL
                THEN (v_chunk->>'embedding')::vector
                ELSE NULL
            END,
            COALESCE((v_chunk->>'token_count')::INTEGER, 0),
            (v_chunk->>'page_number')::INTEGER,
            (v_chunk->>'char_offset')::INTEGER,
            COALESCE(v_chunk->'metadata', '{}'::JSONB)
        );
        v_inserted := v_inserted + 1;
        v_total_tokens := v_total_tokens + COALESCE((v_chunk->>'token_count')::INTEGER, 0);
    END LOOP;

    -- Update document stats
    UPDATE rag_data.rag_documents
    SET chunk_count = v_inserted,
        token_count = v_total_tokens,
        status = 'completed',
        processed_at = NOW()
    WHERE id = p_document_id;

    -- Update collection stats
    UPDATE rag_data.rag_collections
    SET chunk_count = chunk_count + v_inserted,
        document_count = document_count + 1,
        total_tokens = total_tokens + v_total_tokens,
        updated_at = NOW()
    WHERE id = v_collection_id;

    RETURN v_inserted;
END;
$$;

-- Get chunks for a document
CREATE OR REPLACE FUNCTION rag_data.rag_get_document_chunks(
    p_document_id UUID,
    p_organization_slug TEXT
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    chunk_index INTEGER,
    token_count INTEGER,
    page_number INTEGER,
    metadata JSONB
)
LANGUAGE sql STABLE
AS $$
    SELECT c.id, c.content, c.chunk_index, c.token_count, c.page_number, c.metadata
    FROM rag_data.rag_document_chunks c
    WHERE c.document_id = p_document_id
      AND c.organization_slug = p_organization_slug
    ORDER BY c.chunk_index;
$$;

-- =============================================================================
-- VECTOR SEARCH FUNCTION (PRD §4.4.4)
-- =============================================================================

-- Search chunks by similarity (THE MAIN QUERY FUNCTION)
CREATE OR REPLACE FUNCTION rag_data.rag_search(
    p_collection_id UUID,
    p_organization_slug TEXT,
    p_query_embedding vector(768),
    p_top_k INTEGER DEFAULT 5,
    p_similarity_threshold DOUBLE PRECISION DEFAULT 0.5
)
RETURNS TABLE (
    chunk_id UUID,
    document_id UUID,
    document_filename VARCHAR(500),
    content TEXT,
    score DOUBLE PRECISION,
    page_number INTEGER,
    chunk_index INTEGER,
    metadata JSONB
)
LANGUAGE sql STABLE
AS $$
    SELECT
        c.id AS chunk_id,
        c.document_id,
        d.filename AS document_filename,
        c.content,
        1 - (c.embedding <=> p_query_embedding) AS score,
        c.page_number,
        c.chunk_index,
        c.metadata
    FROM rag_data.rag_document_chunks c
    JOIN rag_data.rag_documents d ON c.document_id = d.id
    JOIN rag_data.rag_collections col ON c.collection_id = col.id
    WHERE c.collection_id = p_collection_id
      AND col.organization_slug = p_organization_slug
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> p_query_embedding) >= p_similarity_threshold
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT p_top_k;
$$;

COMMENT ON FUNCTION rag_data.rag_search IS 'Vector similarity search for RAG queries (PRD §4.4.4)';

-- =============================================================================
-- SUCCESS NOTIFICATION
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'RAG Schema Complete Restoration Successful';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Created: rag_collections table';
    RAISE NOTICE 'Created: rag_documents table';
    RAISE NOTICE 'Created: rag_document_chunks table';
    RAISE NOTICE 'Created: All indexes (including HNSW vector index)';
    RAISE NOTICE 'Created: All functions (collections, documents, chunks, search)';
    RAISE NOTICE 'Created: All triggers (updated_at)';
    RAISE NOTICE '================================================';
END $$;


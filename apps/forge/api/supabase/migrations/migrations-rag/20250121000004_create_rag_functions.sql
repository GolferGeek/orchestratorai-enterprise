-- =============================================================================
-- Set search path to rag_data schema
SET search_path TO rag_data, public;

-- RAG DATABASE: PostgreSQL Functions (API Interface)
-- =============================================================================
-- All RAG access goes through these functions for organization isolation
-- Per PRD §4.4: Functions require organization_slug parameter
-- =============================================================================

-- =============================================================================
-- COLLECTION FUNCTIONS (PRD §4.4.1)
-- =============================================================================

-- Get all collections for an organization
CREATE OR REPLACE FUNCTION rag_get_collections(
    p_organization_slug TEXT
)
RETURNS TABLE (
    id UUID,
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
    updated_at TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
    SELECT id, name, slug, description, embedding_model, embedding_dimensions,
           chunk_size, chunk_overlap, status, required_role,
           document_count, chunk_count, total_tokens, created_at, updated_at
    FROM rag_data.rag_collections
    WHERE organization_slug = p_organization_slug
    ORDER BY created_at DESC;
$$;

-- Get single collection (with org validation)
CREATE OR REPLACE FUNCTION rag_get_collection(
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

-- Create a new collection
CREATE OR REPLACE FUNCTION rag_create_collection(
    p_organization_slug TEXT,
    p_name VARCHAR(255),
    p_slug VARCHAR(255),
    p_description TEXT DEFAULT NULL,
    p_embedding_model VARCHAR(100) DEFAULT 'nomic-embed-text',
    p_embedding_dimensions INTEGER DEFAULT 768,
    p_chunk_size INTEGER DEFAULT 1000,
    p_chunk_overlap INTEGER DEFAULT 200,
    p_created_by UUID DEFAULT NULL
)
RETURNS rag_data.rag_collections
LANGUAGE sql
AS $$
    INSERT INTO rag_data.rag_collections (
        organization_slug, name, slug, description,
        embedding_model, embedding_dimensions, chunk_size, chunk_overlap, created_by
    )
    VALUES (
        p_organization_slug, p_name, p_slug, p_description,
        p_embedding_model, p_embedding_dimensions, p_chunk_size, p_chunk_overlap, p_created_by
    )
    RETURNING *;
$$;

-- Update collection
CREATE OR REPLACE FUNCTION rag_update_collection(
    p_collection_id UUID,
    p_organization_slug TEXT,
    p_name VARCHAR(255) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_required_role TEXT DEFAULT NULL
)
RETURNS rag_data.rag_collections
LANGUAGE plpgsql
AS $$
DECLARE
    v_result rag_collections;
BEGIN
    UPDATE rag_data.rag_collections
    SET
        name = COALESCE(p_name, name),
        description = COALESCE(p_description, description),
        required_role = p_required_role,
        updated_at = NOW()
    WHERE id = p_collection_id
      AND organization_slug = p_organization_slug
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

-- Delete collection (with org validation)
CREATE OR REPLACE FUNCTION rag_delete_collection(
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

-- =============================================================================
-- DOCUMENT FUNCTIONS (PRD §4.4.2)
-- =============================================================================

-- Get documents for a collection (with org validation)
CREATE OR REPLACE FUNCTION rag_get_documents(
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
    JOIN rag_collections c ON d.collection_id = c.id
    WHERE d.collection_id = p_collection_id
      AND c.organization_slug = p_organization_slug
    ORDER BY d.created_at DESC;
$$;

-- Get single document
CREATE OR REPLACE FUNCTION rag_get_document(
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
CREATE OR REPLACE FUNCTION rag_insert_document(
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
    v_result rag_documents;
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
CREATE OR REPLACE FUNCTION rag_update_document_status(
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
    v_result rag_documents;
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
CREATE OR REPLACE FUNCTION rag_delete_document(
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
CREATE OR REPLACE FUNCTION rag_insert_chunks(
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
    JOIN rag_collections c ON d.collection_id = c.id
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
CREATE OR REPLACE FUNCTION rag_get_document_chunks(
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
CREATE OR REPLACE FUNCTION rag_search(
    p_collection_id UUID,
    p_organization_slug TEXT,
    p_query_embedding vector(768),
    p_top_k INTEGER DEFAULT 5,
    p_similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    chunk_id UUID,
    document_id UUID,
    document_filename VARCHAR(500),
    content TEXT,
    score FLOAT,
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
    JOIN rag_documents d ON c.document_id = d.id
    JOIN rag_collections col ON c.collection_id = col.id
    WHERE c.collection_id = p_collection_id
      AND col.organization_slug = p_organization_slug
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> p_query_embedding) >= p_similarity_threshold
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT p_top_k;
$$;

COMMENT ON FUNCTION rag_search IS 'Vector similarity search for RAG queries (PRD §4.4.4)';

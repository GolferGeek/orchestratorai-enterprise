-- =============================================================================
-- Add Original Document Content Storage
-- =============================================================================
-- 1. Add content column to store original document text
-- 2. Update insert function to accept content
-- 3. Add function to retrieve document content
-- 4. Clear existing legal RAG data for re-ingestion
-- =============================================================================

SET search_path TO rag_data, public;

-- =============================================================================
-- 1. Add content column to rag_documents
-- =============================================================================
ALTER TABLE rag_data.rag_documents
ADD COLUMN IF NOT EXISTS content TEXT;

COMMENT ON COLUMN rag_data.rag_documents.content IS 'Original document text content for display and highlighting';

-- =============================================================================
-- 2. Update rag_insert_document to accept content parameter
-- =============================================================================
CREATE OR REPLACE FUNCTION rag_insert_document(
    p_collection_id UUID,
    p_organization_slug TEXT,
    p_filename VARCHAR(500),
    p_file_type VARCHAR(50),
    p_file_size INTEGER,
    p_file_hash VARCHAR(64) DEFAULT NULL,
    p_storage_path TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL,
    p_content TEXT DEFAULT NULL
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
        file_hash, storage_path, created_by, content
    )
    VALUES (
        p_collection_id, p_organization_slug, p_filename, p_file_type, p_file_size,
        p_file_hash, p_storage_path, p_created_by, p_content
    )
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

-- =============================================================================
-- 3. Add function to get document content
-- =============================================================================
CREATE OR REPLACE FUNCTION rag_get_document_content(
    p_document_id UUID,
    p_organization_slug TEXT
)
RETURNS TABLE (
    id UUID,
    filename VARCHAR(500),
    file_type VARCHAR(50),
    content TEXT,
    chunk_count INTEGER
)
LANGUAGE sql STABLE
AS $$
    SELECT d.id, d.filename, d.file_type, d.content, d.chunk_count
    FROM rag_data.rag_documents d
    WHERE d.id = p_document_id
      AND d.organization_slug = p_organization_slug;
$$;

COMMENT ON FUNCTION rag_get_document_content IS 'Retrieve original document content for display/highlighting';

-- =============================================================================
-- 4. Update rag_get_document to include content
-- =============================================================================
-- Must drop first because we're changing the return type
DROP FUNCTION IF EXISTS rag_data.rag_get_document(uuid, text);

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
    content TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
    SELECT d.id, d.collection_id, d.filename, d.file_type, d.file_size,
           d.file_hash, d.storage_path, d.status, d.error_message,
           d.chunk_count, d.token_count, d.metadata, d.content,
           d.created_at, d.updated_at, d.processed_at
    FROM rag_data.rag_documents d
    WHERE d.id = p_document_id
      AND d.organization_slug = p_organization_slug;
$$;

-- =============================================================================
-- 5. Clear existing legal RAG data for re-ingestion
-- =============================================================================
-- Delete all chunks for legal org documents
DELETE FROM rag_data.rag_document_chunks
WHERE organization_slug = 'legal';

-- Delete all documents for legal org
DELETE FROM rag_data.rag_documents
WHERE organization_slug = 'legal';

-- Reset collection stats for legal collections
UPDATE rag_data.rag_collections
SET document_count = 0,
    chunk_count = 0,
    total_tokens = 0,
    updated_at = NOW()
WHERE organization_slug = 'legal';

-- =============================================================================
-- 6. Update rag_search to include char_offset for highlighting
-- =============================================================================
DROP FUNCTION IF EXISTS rag_data.rag_search(uuid, text, vector(768), integer, double precision);

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
    char_offset INTEGER,
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
        c.char_offset,
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

COMMENT ON FUNCTION rag_search IS 'Vector similarity search for RAG queries with char_offset for highlighting';

-- =============================================================================
-- Verification
-- =============================================================================
DO $$
DECLARE
    v_has_content BOOLEAN;
    v_legal_docs INTEGER;
BEGIN
    -- Check if content column exists
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'rag_data'
        AND table_name = 'rag_documents'
        AND column_name = 'content'
    ) INTO v_has_content;

    -- Check legal documents count
    SELECT COUNT(*) INTO v_legal_docs
    FROM rag_data.rag_documents
    WHERE organization_slug = 'legal';

    RAISE NOTICE '================================================';
    RAISE NOTICE 'Document Content Storage Migration Complete';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Content column added: %', v_has_content;
    RAISE NOTICE 'Legal documents remaining: % (should be 0)', v_legal_docs;
    RAISE NOTICE '';
    RAISE NOTICE 'Next step: Re-run ingestion script to populate';
    RAISE NOTICE 'documents with original content stored.';
    RAISE NOTICE '================================================';
END $$;

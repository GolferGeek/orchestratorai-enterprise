-- =============================================================================
-- RAG DATABASE: Add Complexity Type to Collections
-- =============================================================================
-- Supports 5 RAG complexity types: basic, attributed, hybrid, cross-reference, temporal
-- Per Advanced RAG Implementation Plan
-- =============================================================================

SET search_path TO rag_data, public;

-- =============================================================================
-- ADD COMPLEXITY_TYPE COLUMN TO RAG_COLLECTIONS
-- =============================================================================

-- Add complexity_type column with default 'basic' for backwards compatibility
ALTER TABLE rag_data.rag_collections
  ADD COLUMN IF NOT EXISTS complexity_type VARCHAR(50) DEFAULT 'basic';

-- Add constraint for valid complexity types
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'valid_complexity_type'
    ) THEN
        ALTER TABLE rag_data.rag_collections
            ADD CONSTRAINT valid_complexity_type
            CHECK (complexity_type IN ('basic', 'attributed', 'hybrid', 'cross-reference', 'temporal'));
    END IF;
END $$;

-- Create index for complexity_type queries
CREATE INDEX IF NOT EXISTS idx_rag_collections_complexity_type
  ON rag_data.rag_collections(complexity_type);

COMMENT ON COLUMN rag_data.rag_collections.complexity_type IS
  'RAG retrieval strategy: basic (semantic), attributed (with citations), hybrid (keyword+semantic), cross-reference (linked docs), temporal (version-aware)';

-- =============================================================================
-- UPDATE rag_get_collections FUNCTION TO INCLUDE complexity_type
-- =============================================================================
-- Note: This overrides the function from 20250121000005 to add complexity_type
-- Keeps the user filtering logic intact

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

-- =============================================================================
-- UPDATE rag_get_collection FUNCTION TO INCLUDE complexity_type
-- =============================================================================

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
    allowed_users UUID[],
    complexity_type VARCHAR(50),
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
           allowed_users, complexity_type, document_count, chunk_count, total_tokens,
           created_at, updated_at, created_by
    FROM rag_data.rag_collections
    WHERE id = p_collection_id
      AND organization_slug = p_organization_slug;
$$;

-- =============================================================================
-- UPDATE rag_create_collection FUNCTION TO ACCEPT complexity_type
-- =============================================================================
-- Note: This extends the function from 20250121000005 to add complexity_type
-- as the 12th parameter after allowed_users

CREATE OR REPLACE FUNCTION rag_data.rag_create_collection(
    p_organization_slug TEXT,
    p_name VARCHAR(255),
    p_slug VARCHAR(255),
    p_description TEXT,
    p_embedding_model VARCHAR(100),
    p_embedding_dimensions INTEGER,
    p_chunk_size INTEGER,
    p_chunk_overlap INTEGER,
    p_created_by UUID,
    p_required_role TEXT DEFAULT NULL,
    p_allowed_users UUID[] DEFAULT NULL,
    p_complexity_type VARCHAR(50) DEFAULT 'basic'
)
RETURNS rag_data.rag_collections
LANGUAGE sql
AS $$
    INSERT INTO rag_data.rag_collections (
        organization_slug, name, slug, description,
        embedding_model, embedding_dimensions, chunk_size, chunk_overlap,
        created_by, required_role, allowed_users, complexity_type
    )
    VALUES (
        p_organization_slug, p_name, p_slug, p_description,
        p_embedding_model, p_embedding_dimensions, p_chunk_size, p_chunk_overlap,
        p_created_by, p_required_role, p_allowed_users, p_complexity_type
    )
    RETURNING *;
$$;

-- =============================================================================
-- UPDATE rag_update_collection FUNCTION TO ALLOW complexity_type UPDATES
-- =============================================================================
-- Note: This extends the function from 20250121000005 to add complexity_type
-- as the 8th parameter after clear_allowed_users

CREATE OR REPLACE FUNCTION rag_data.rag_update_collection(
    p_collection_id UUID,
    p_organization_slug TEXT,
    p_name VARCHAR(255) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_required_role TEXT DEFAULT NULL,
    p_allowed_users UUID[] DEFAULT NULL,
    p_clear_allowed_users BOOLEAN DEFAULT FALSE,
    p_complexity_type VARCHAR(50) DEFAULT NULL
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
        -- Handle complexity_type: update if provided, otherwise keep existing
        complexity_type = COALESCE(p_complexity_type, complexity_type),
        updated_at = NOW()
    WHERE id = p_collection_id
      AND organization_slug = p_organization_slug
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

-- =============================================================================
-- ADD FUNCTION TO GET COLLECTION BY SLUG (for RAG runner)
-- =============================================================================

CREATE OR REPLACE FUNCTION rag_data.rag_get_collection_by_slug(
    p_collection_slug VARCHAR(255),
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
    allowed_users UUID[],
    complexity_type VARCHAR(50),
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
           allowed_users, complexity_type, document_count, chunk_count, total_tokens,
           created_at, updated_at, created_by
    FROM rag_data.rag_collections
    WHERE slug = p_collection_slug
      AND organization_slug = p_organization_slug;
$$;

COMMENT ON FUNCTION rag_data.rag_get_collection_by_slug IS 'Get collection by slug for RAG agent runners';

-- =============================================================================
-- Success notification
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'RAG Complexity Type Migration Complete';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Added: complexity_type VARCHAR(50) column';
    RAISE NOTICE 'Valid types: basic, attributed, hybrid, cross-reference, temporal';
    RAISE NOTICE 'Updated: rag_get_collections() returns complexity_type';
    RAISE NOTICE 'Updated: rag_get_collection() returns complexity_type';
    RAISE NOTICE 'Updated: rag_create_collection() accepts complexity_type';
    RAISE NOTICE 'Updated: rag_update_collection() accepts complexity_type';
    RAISE NOTICE 'Added: rag_get_collection_by_slug() for RAG runner';
    RAISE NOTICE '================================================';
END $$;

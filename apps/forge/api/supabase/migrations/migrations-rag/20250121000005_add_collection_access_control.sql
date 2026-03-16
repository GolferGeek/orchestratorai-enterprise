-- =============================================================================
-- RAG DATABASE: Add Collection Access Control
-- =============================================================================
-- Adds user-level access control to collections
-- Users can restrict collections to specific users and/or roles
-- =============================================================================

-- Set search path to rag_data schema
SET search_path TO rag_data, public;

-- Add allowed_users column to rag_collections
-- NULL = all org members with appropriate permissions can access
-- Empty array = only created_by can access (plus those with required_role)
-- Array with UUIDs = those specific users can access
ALTER TABLE rag_data.rag_collections
  ADD COLUMN IF NOT EXISTS allowed_users UUID[] DEFAULT NULL;

-- Create index for efficient user access lookups
CREATE INDEX IF NOT EXISTS idx_rag_collections_allowed_users
  ON rag_data.rag_collections USING GIN (allowed_users);

-- =============================================================================
-- ACCESS CHECK FUNCTION
-- =============================================================================
-- Returns TRUE if user can access the collection
-- Access granted if:
--   1. allowed_users is NULL (org-wide access), OR
--   2. user_id is in allowed_users array, OR
--   3. user_id is created_by, OR
--   4. user has the required_role (checked at application level)

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

COMMENT ON FUNCTION rag_data.rag_user_can_access_collection IS
  'Check if user has access to a collection based on allowed_users or created_by';

-- =============================================================================
-- UPDATE GET COLLECTIONS FUNCTION
-- =============================================================================
-- Modify to filter by user access

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
-- UPDATE CREATE COLLECTION FUNCTION
-- =============================================================================
-- Add allowed_users parameter

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

-- =============================================================================
-- UPDATE UPDATE COLLECTION FUNCTION
-- =============================================================================
-- Add allowed_users parameter

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

-- =============================================================================
-- Success notification
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'RAG Collection Access Control Migration Complete';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Added: allowed_users UUID[] column';
    RAISE NOTICE 'Added: rag_user_can_access_collection() function';
    RAISE NOTICE 'Updated: rag_get_collections() with user filtering';
    RAISE NOTICE 'Updated: rag_create_collection() with allowed_users';
    RAISE NOTICE 'Updated: rag_update_collection() with allowed_users';
    RAISE NOTICE '================================================';
END $$;

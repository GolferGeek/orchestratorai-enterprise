-- RAG content is scoped by organization; an item with no organization is
-- global. Matt's rule (2026-10-15): a RAG item with an organization set is
-- visible only to that organization; one with organization NULL is visible to
-- every organization.
--
-- Found by the security review of fix/picker-reland: the legal assistants are
-- {legal,global}, and the RAG runner searched the agent's home org ('legal')
-- whoever called it, so any org's member could read the legal collections.
-- The runner now searches the caller's org (apps/api); this migration makes
-- the database enforce the same rule on every read, whatever the caller passes.
--
-- 1. organization_slug may be NULL on collections, documents and chunks
--    (global). A global collection's slug is unique among global collections.
-- 2. Every rag_data read function returns rows of the caller's organization
--    plus global ones, and decides by the COLLECTION's organization (a
--    document or chunk is never visible when its collection is not).
--    rag_get_collection_by_slug prefers the organization's own collection
--    over a global one with the same slug.
-- 3. Write functions are unchanged: they match organization_slug = the
--    caller's, which NULL never equals, so no organization can change or
--    delete a global item through them.
-- 4. RLS on for every rag_data table with no policies, as for public and authz
--    (20261006150000): the API reaches rag_data as postgres, the owner, which
--    bypasses RLS. anon and
--    authenticated hold no grant here; if one ever comes back, rows still
--    do not.
--
-- Idempotent: DROP NOT NULL, CREATE ... IF NOT EXISTS, CREATE OR REPLACE and
-- ENABLE RLS can all run twice. Function signatures are unchanged, so owners
-- and grants are kept.
--
-- Rollback: CREATE OR REPLACE the functions from supabase/baseline/schema.sql,
-- DISABLE ROW LEVEL SECURITY, and SET NOT NULL (only once no row is global).
--
-- Kept that way by apps/api/src/rag/rag-org-scope.integration.spec.ts and
-- apps/api/src/common/security/database-lockdown.integration.spec.ts.

BEGIN;

-- DROP NOT NULL and ENABLE RLS take ACCESS EXCLUSIVE locks; give up rather
-- than stall RAG traffic behind a long search.
SET LOCAL lock_timeout = '5s';

-- Visibility is now decided by the collection's organization. A document or
-- chunk stamped with another organization than its collection's would change
-- who sees it, so stop if one exists.
DO $$
DECLARE
  v_documents bigint;
  v_chunks bigint;
BEGIN
  SELECT count(*) INTO v_documents
    FROM rag_data.rag_documents d
    JOIN rag_data.rag_collections c ON c.id = d.collection_id
   WHERE d.organization_slug IS DISTINCT FROM c.organization_slug;
  SELECT count(*) INTO v_chunks
    FROM rag_data.rag_document_chunks ch
    JOIN rag_data.rag_collections c ON c.id = ch.collection_id
    JOIN rag_data.rag_documents d ON d.id = ch.document_id
   WHERE ch.organization_slug IS DISTINCT FROM c.organization_slug
      OR ch.collection_id <> d.collection_id;
  IF v_documents > 0 OR v_chunks > 0 THEN
    RAISE EXCEPTION 'RAG rows disagree with their collection''s organization: % documents, % chunks', v_documents, v_chunks;
  END IF;
END $$;

ALTER TABLE rag_data.rag_collections ALTER COLUMN organization_slug DROP NOT NULL;
ALTER TABLE rag_data.rag_documents ALTER COLUMN organization_slug DROP NOT NULL;
ALTER TABLE rag_data.rag_document_chunks ALTER COLUMN organization_slug DROP NOT NULL;

COMMENT ON COLUMN rag_data.rag_collections.organization_slug IS
  'The organization that sees this collection; NULL = global (every organization sees it).';

CREATE UNIQUE INDEX IF NOT EXISTS rag_collections_global_slug_key
  ON rag_data.rag_collections (slug) WHERE organization_slug IS NULL;

CREATE OR REPLACE FUNCTION rag_data.rag_get_collections(p_organization_slug text, p_user_id uuid DEFAULT NULL::uuid) RETURNS SETOF rag_data.rag_collections
    LANGUAGE sql STABLE
    AS $$
    SELECT *
    FROM rag_data.rag_collections
    WHERE (organization_slug = p_organization_slug OR organization_slug IS NULL)
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

CREATE OR REPLACE FUNCTION rag_data.rag_get_collection(p_collection_id uuid, p_organization_slug text) RETURNS TABLE(id uuid, organization_slug text, name character varying, slug character varying, description text, embedding_model character varying, embedding_dimensions integer, chunk_size integer, chunk_overlap integer, status character varying, required_role text, allowed_users uuid[], complexity_type character varying, document_count integer, chunk_count integer, total_tokens integer, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid)
    LANGUAGE sql STABLE
    AS $$
    SELECT id, organization_slug, name, slug, description, embedding_model,
           embedding_dimensions, chunk_size, chunk_overlap, status, required_role,
           allowed_users, complexity_type, document_count, chunk_count, total_tokens,
           created_at, updated_at, created_by
    FROM rag_data.rag_collections
    WHERE id = p_collection_id
      AND (organization_slug = p_organization_slug OR organization_slug IS NULL);
$$;

CREATE OR REPLACE FUNCTION rag_data.rag_get_collection_by_slug(p_collection_slug character varying, p_organization_slug text) RETURNS TABLE(id uuid, organization_slug text, name character varying, slug character varying, description text, embedding_model character varying, embedding_dimensions integer, chunk_size integer, chunk_overlap integer, status character varying, required_role text, allowed_users uuid[], complexity_type character varying, document_count integer, chunk_count integer, total_tokens integer, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid)
    LANGUAGE sql STABLE
    AS $$
    SELECT c.id, c.organization_slug, c.name, c.slug, c.description, c.embedding_model,
           c.embedding_dimensions, c.chunk_size, c.chunk_overlap, c.status, c.required_role,
           c.allowed_users, c.complexity_type, c.document_count, c.chunk_count, c.total_tokens,
           c.created_at, c.updated_at, c.created_by
    FROM rag_data.rag_collections c
    WHERE c.slug = p_collection_slug
      AND (c.organization_slug = p_organization_slug OR c.organization_slug IS NULL)
    -- The organization's own collection wins over a global one with the same slug.
    ORDER BY c.organization_slug IS NULL
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION rag_data.rag_get_documents(p_collection_id uuid, p_organization_slug text) RETURNS TABLE(id uuid, collection_id uuid, filename character varying, file_type character varying, file_size integer, status character varying, error_message text, chunk_count integer, token_count integer, metadata jsonb, created_at timestamp with time zone, processed_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
    SELECT d.id, d.collection_id, d.filename, d.file_type, d.file_size, d.status,
           d.error_message, d.chunk_count, d.token_count, d.metadata,
           d.created_at, d.processed_at
    FROM rag_data.rag_documents d
    JOIN rag_data.rag_collections c ON d.collection_id = c.id
    WHERE d.collection_id = p_collection_id
      AND (c.organization_slug = p_organization_slug OR c.organization_slug IS NULL)
    ORDER BY d.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION rag_data.rag_get_document(p_document_id uuid, p_organization_slug text) RETURNS TABLE(id uuid, collection_id uuid, filename character varying, file_type character varying, file_size integer, file_hash character varying, storage_path text, status character varying, error_message text, chunk_count integer, token_count integer, metadata jsonb, content text, created_at timestamp with time zone, updated_at timestamp with time zone, processed_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
    SELECT d.id, d.collection_id, d.filename, d.file_type, d.file_size,
           d.file_hash, d.storage_path, d.status, d.error_message,
           d.chunk_count, d.token_count, d.metadata, d.content,
           d.created_at, d.updated_at, d.processed_at
    FROM rag_data.rag_documents d
    JOIN rag_data.rag_collections c ON d.collection_id = c.id
    WHERE d.id = p_document_id
      AND (c.organization_slug = p_organization_slug OR c.organization_slug IS NULL);
$$;

CREATE OR REPLACE FUNCTION rag_data.rag_get_document_content(p_document_id uuid, p_organization_slug text) RETURNS TABLE(id uuid, filename character varying, file_type character varying, content text, chunk_count integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT d.id, d.filename, d.file_type, d.content, d.chunk_count
    FROM rag_data.rag_documents d
    JOIN rag_data.rag_collections c ON d.collection_id = c.id
    WHERE d.id = p_document_id
      AND (c.organization_slug = p_organization_slug OR c.organization_slug IS NULL);
$$;

CREATE OR REPLACE FUNCTION rag_data.rag_get_document_chunks(p_document_id uuid, p_organization_slug text) RETURNS TABLE(id uuid, content text, chunk_index integer, token_count integer, page_number integer, metadata jsonb)
    LANGUAGE sql STABLE
    AS $$
    SELECT ch.id, ch.content, ch.chunk_index, ch.token_count, ch.page_number, ch.metadata
    FROM rag_data.rag_document_chunks ch
    JOIN rag_data.rag_collections c ON ch.collection_id = c.id
    WHERE ch.document_id = p_document_id
      AND (c.organization_slug = p_organization_slug OR c.organization_slug IS NULL)
    ORDER BY ch.chunk_index;
$$;

CREATE OR REPLACE FUNCTION rag_data.rag_search(p_collection_id uuid, p_organization_slug text, p_query_embedding rag_data.vector, p_top_k integer DEFAULT 5, p_similarity_threshold double precision DEFAULT 0.5) RETURNS TABLE(chunk_id uuid, document_id uuid, document_filename character varying, content text, score double precision, page_number integer, chunk_index integer, char_offset integer, metadata jsonb, enrichment_version text)
    LANGUAGE sql STABLE
    AS $$
    SELECT
        c.id AS chunk_id,
        c.document_id,
        d.filename AS document_filename,
        c.content,
        1 - (c.embedding OPERATOR(rag_data.<=>) p_query_embedding) AS score,
        c.page_number,
        c.chunk_index,
        c.char_offset,
        c.metadata,
        c.enrichment_version
    FROM rag_data.rag_document_chunks c
    JOIN rag_data.rag_documents d ON c.document_id = d.id
    JOIN rag_data.rag_collections col ON c.collection_id = col.id
    WHERE c.collection_id = p_collection_id
      AND (col.organization_slug = p_organization_slug OR col.organization_slug IS NULL)
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding OPERATOR(rag_data.<=>) p_query_embedding) >= p_similarity_threshold
    ORDER BY c.embedding OPERATOR(rag_data.<=>) p_query_embedding
    LIMIT p_top_k;
$$;

ALTER TABLE rag_data.rag_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_data.rag_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_data.rag_document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_data.rag_feedback_signals ENABLE ROW LEVEL SECURITY;

COMMIT;

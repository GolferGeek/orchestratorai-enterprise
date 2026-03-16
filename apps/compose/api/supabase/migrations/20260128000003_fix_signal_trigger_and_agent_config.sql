-- =============================================================================
-- FIX SIGNAL TRIGGER AND AGENT CONFIGURATION
-- =============================================================================
-- 1. Update enforce_signal_is_test trigger to use crawler.sources
--    (prediction.sources was migrated to crawler.sources)
-- 2. Update legal-intake-agent to use correct RAG collection slug
-- 3. Fix legal-intake RAG collection organization_slug from '*' to 'legal'
-- =============================================================================

-- =============================================================================
-- 1. FIX TRIGGER: enforce_signal_is_test
-- =============================================================================
-- The trigger was referencing prediction.sources which no longer exists.
-- Sources were migrated to crawler.sources in migration 20260124000014.

CREATE OR REPLACE FUNCTION prediction.enforce_signal_is_test()
RETURNS TRIGGER AS $$
DECLARE
  source_is_test BOOLEAN;
BEGIN
  -- Check source's is_test status from crawler.sources (migrated from prediction.sources)
  SELECT is_test INTO source_is_test
  FROM crawler.sources
  WHERE id = NEW.source_id;

  -- If source not found in crawler.sources, allow the insert (source may be optional)
  IF source_is_test IS NULL THEN
    RETURN NEW;
  END IF;

  -- If source is test, signal must be test
  IF source_is_test = true AND NEW.is_test = false THEN
    RAISE EXCEPTION 'INV-02 Violation: Signal must have is_test=true when source has is_test=true. Source ID: %, Signal is_test: %',
      NEW.source_id, NEW.is_test;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION prediction.enforce_signal_is_test() IS
'Enforces that signals from test sources must be marked as test. Uses crawler.sources (migrated from prediction.sources).';

-- =============================================================================
-- 2. FIX AGENT CONFIG: legal-intake-agent RAG collection slug
-- =============================================================================
-- The agent was configured with collection_slug "law-client-intake-temporal"
-- but the actual collection was created with slug "legal-intake"

UPDATE public.agents
SET metadata = jsonb_set(
  metadata,
  '{rag_config,collection_slug}',
  '"legal-intake"'
)
WHERE slug = 'legal-intake-agent'
  AND metadata->'rag_config'->>'collection_slug' = 'law-client-intake-temporal';

-- Also fix similarity_threshold from 0.6 to 0.4 (actual similarity scores are ~0.5-0.56)
UPDATE public.agents
SET metadata = jsonb_set(
  metadata,
  '{rag_config,similarity_threshold}',
  '0.4'
)
WHERE slug = 'legal-intake-agent'
  AND (metadata->'rag_config'->>'similarity_threshold')::numeric >= 0.6;

-- =============================================================================
-- 3. FIX RAG COLLECTION: organization_slug was '*' instead of 'legal'
-- =============================================================================
-- The collection was created with organization_slug='*' (all orgs) but
-- the frontend queries for specific org, so it needs to be 'legal'

-- Fix collection
UPDATE rag_data.rag_collections
SET organization_slug = 'legal'
WHERE slug = 'legal-intake'
  AND organization_slug = '*';

-- Fix documents
UPDATE rag_data.rag_documents
SET organization_slug = 'legal'
WHERE collection_id IN (
  SELECT id FROM rag_data.rag_collections WHERE slug = 'legal-intake'
)
AND organization_slug = '*';

-- Fix chunks
UPDATE rag_data.rag_document_chunks
SET organization_slug = 'legal'
WHERE collection_id IN (
  SELECT id FROM rag_data.rag_collections WHERE slug = 'legal-intake'
)
AND organization_slug = '*';

-- =============================================================================
-- 4. FIX RAG_SEARCH FUNCTION: Missing SET search_path
-- =============================================================================
-- The rag_search function was failing because it couldn't find tables and
-- operators in the rag_data schema. Adding SET search_path fixes this.

CREATE OR REPLACE FUNCTION rag_data.rag_search(
    p_collection_id UUID,
    p_organization_slug TEXT,
    p_query_embedding rag_data.vector,
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
SET search_path TO rag_data, public
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
    FROM rag_document_chunks c
    JOIN rag_documents d ON c.document_id = d.id
    JOIN rag_collections col ON c.collection_id = col.id
    WHERE c.collection_id = p_collection_id
      AND col.organization_slug = p_organization_slug
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> p_query_embedding) >= p_similarity_threshold
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT p_top_k;
$$;

COMMENT ON FUNCTION rag_data.rag_search IS 'Vector similarity search for RAG queries';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  v_trigger_source TEXT;
  v_agent_collection TEXT;
  v_rag_collection_org TEXT;
BEGIN
  -- Verify trigger was updated
  SELECT prosrc INTO v_trigger_source
  FROM pg_proc
  WHERE proname = 'enforce_signal_is_test'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'prediction');

  IF v_trigger_source LIKE '%crawler.sources%' THEN
    RAISE NOTICE 'Trigger enforce_signal_is_test: UPDATED to use crawler.sources';
  ELSE
    RAISE WARNING 'Trigger enforce_signal_is_test: Still using old table reference!';
  END IF;

  -- Verify agent config
  SELECT metadata->'rag_config'->>'collection_slug' INTO v_agent_collection
  FROM public.agents
  WHERE slug = 'legal-intake-agent';

  RAISE NOTICE 'legal-intake-agent collection_slug: %', COALESCE(v_agent_collection, 'NOT FOUND');

  -- Verify RAG collection org
  SELECT organization_slug INTO v_rag_collection_org
  FROM rag_data.rag_collections
  WHERE slug = 'legal-intake';

  RAISE NOTICE 'legal-intake collection organization_slug: %', COALESCE(v_rag_collection_org, 'NOT FOUND');

  RAISE NOTICE '================================================';
  RAISE NOTICE 'Migration 20260128000003 complete';
  RAISE NOTICE '================================================';
END $$;

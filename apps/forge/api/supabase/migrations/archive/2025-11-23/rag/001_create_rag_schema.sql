-- =============================================================================
-- RAG DATA SCHEMA
-- =============================================================================
-- RAG collections, documents, chunks, and vector embeddings
-- Supports multiple RAG strategies and organization-specific collections
-- Created: Phase 1 - Multi-Database Setup
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS rag;
COMMENT ON SCHEMA rag IS 'RAG collections, documents, chunks, and vector embeddings';

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- RAG COLLECTIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS rag.collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  organization_slug TEXT, -- Links to orchestrator_ai.organizations
  embedding_model TEXT NOT NULL, -- 'text-embedding-3-small', 'text-embedding-ada-002', etc.
  embedding_dimensions INTEGER NOT NULL, -- 1536 for ada-002, 384 for MiniLM, etc.
  chunk_size INTEGER DEFAULT 1000,
  chunk_overlap INTEGER DEFAULT 200,
  chunking_strategy TEXT DEFAULT 'recursive', -- 'recursive', 'semantic', 'fixed'
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collections_slug ON rag.collections(slug);
CREATE INDEX idx_collections_org ON rag.collections(organization_slug);

COMMENT ON TABLE rag.collections IS 'RAG collection definitions with embedding configuration';

-- =============================================================================
-- DOCUMENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS rag.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES rag.collections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT, -- 'pdf', 'markdown', 'html', 'text', 'docx', 'url'
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_collection ON rag.documents(collection_id);
CREATE INDEX idx_documents_source_type ON rag.documents(source_type);

COMMENT ON TABLE rag.documents IS 'Source documents ingested into RAG collections';

-- =============================================================================
-- CHUNKS TABLE (with vector embeddings)
-- =============================================================================

CREATE TABLE IF NOT EXISTS rag.chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES rag.documents(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES rag.collections(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL, -- Position within document
  embedding vector, -- Vector embedding (dimensions set per collection)
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chunks_document ON rag.chunks(document_id);
CREATE INDEX idx_chunks_collection ON rag.chunks(collection_id);

-- Vector similarity search index (will be created after embeddings are added)
-- CREATE INDEX idx_chunks_embedding ON rag.chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE rag.chunks IS 'Document chunks with vector embeddings for semantic search';

-- =============================================================================
-- QUERY LOG TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS rag.query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES rag.collections(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  query_embedding vector,
  top_k INTEGER DEFAULT 5,
  strategy TEXT DEFAULT 'basic', -- 'basic', 'reranking', 'hybrid', 'multi-query'
  results_count INTEGER,
  execution_time_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_query_log_collection ON rag.query_log(collection_id);
CREATE INDEX idx_query_log_created ON rag.query_log(created_at DESC);

COMMENT ON TABLE rag.query_log IS 'RAG query history and performance metrics';

-- =============================================================================
-- RERANKING SCORES TABLE (for advanced RAG)
-- =============================================================================

CREATE TABLE IF NOT EXISTS rag.reranking_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_log_id UUID NOT NULL REFERENCES rag.query_log(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES rag.chunks(id) ON DELETE CASCADE,
  initial_score DECIMAL(10,6), -- Vector similarity score
  rerank_score DECIMAL(10,6), -- Reranking model score
  final_rank INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reranking_query ON rag.reranking_scores(query_log_id);
CREATE INDEX idx_reranking_chunk ON rag.reranking_scores(chunk_id);

COMMENT ON TABLE rag.reranking_scores IS 'Reranking scores for advanced RAG strategies';

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION rag.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_collections_updated_at BEFORE UPDATE ON rag.collections
  FOR EACH ROW EXECUTE FUNCTION rag.set_updated_at();

CREATE TRIGGER set_documents_updated_at BEFORE UPDATE ON rag.documents
  FOR EACH ROW EXECUTE FUNCTION rag.set_updated_at();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to search chunks by similarity
CREATE OR REPLACE FUNCTION rag.search_chunks(
  p_collection_id UUID,
  p_query_embedding vector,
  p_top_k INTEGER DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  content TEXT,
  similarity FLOAT,
  document_title TEXT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity,
    d.title,
    c.metadata
  FROM rag.chunks c
  JOIN rag.documents d ON c.document_id = d.id
  WHERE c.collection_id = p_collection_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_top_k;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION rag.search_chunks IS 'Semantic search for chunks using vector similarity';

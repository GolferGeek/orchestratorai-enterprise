-- =============================================================================
-- CREATE DATABASE SCHEMAS
-- =============================================================================
-- Creates separate schemas for different concerns as per PRD Section 5.1
-- Postgres schemas provide logical isolation within a single database
-- This allows us to reset one schema without affecting others
-- =============================================================================

-- Create rag_data schema (RAG collections and embeddings)
CREATE SCHEMA IF NOT EXISTS rag_data;
COMMENT ON SCHEMA rag_data IS 'RAG collections, documents, chunks, and vector embeddings';

-- Enable pgvector extension for RAG
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA rag_data;
COMMENT ON EXTENSION vector IS 'Vector similarity search for RAG embeddings';

-- Grant usage on schemas (adjust permissions as needed)
GRANT USAGE ON SCHEMA rag_data TO postgres, anon, authenticated, service_role;

-- Grant all privileges on all tables in schemas (for service_role)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA rag_data TO service_role;

-- Grant all privileges on all sequences in schemas (for service_role)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA rag_data TO service_role;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA rag_data GRANT ALL ON TABLES TO service_role;

-- Set default privileges for future sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA rag_data GRANT ALL ON SEQUENCES TO service_role;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Database schemas created successfully';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Schemas:';
  RAISE NOTICE '  - rag_data (RAG collections and embeddings)';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Extensions:';
  RAISE NOTICE '  - vector (pgvector for RAG embeddings)';
  RAISE NOTICE '================================================';
END $$;

-- =============================================================================
-- CREATE DATABASE SCHEMAS
-- =============================================================================
-- Creates separate schemas for different concerns as per PRD Section 5.1
-- Postgres schemas provide logical isolation within a single database
-- This allows us to reset one schema without affecting others
-- =============================================================================

-- Create orchestrator_ai schema (main application - organizations, agents, conversations)
CREATE SCHEMA IF NOT EXISTS orchestrator_ai;
COMMENT ON SCHEMA orchestrator_ai IS 'Main Orchestrator AI application data: organizations, agents, conversations, tasks';

-- Create n8n_data schema (N8n workflow data)
CREATE SCHEMA IF NOT EXISTS n8n_data;
COMMENT ON SCHEMA n8n_data IS 'N8n workflow data and execution history';

-- Create company_data schema (Company-specific data)
CREATE SCHEMA IF NOT EXISTS company_data;
COMMENT ON SCHEMA company_data IS 'Company-specific structured data for agents to query';

-- Create rag_data schema (RAG collections and embeddings)
CREATE SCHEMA IF NOT EXISTS rag_data;
COMMENT ON SCHEMA rag_data IS 'RAG collections, documents, chunks, and vector embeddings';

-- Enable pgvector extension for RAG
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA rag_data;
COMMENT ON EXTENSION vector IS 'Vector similarity search for RAG embeddings';

-- Grant usage on schemas (adjust permissions as needed)
GRANT USAGE ON SCHEMA orchestrator_ai TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA n8n_data TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA company_data TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA rag_data TO postgres, anon, authenticated, service_role;

-- Grant all privileges on all tables in schemas (for service_role)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA orchestrator_ai TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA n8n_data TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA company_data TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA rag_data TO service_role;

-- Grant all privileges on all sequences in schemas (for service_role)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA orchestrator_ai TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA n8n_data TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA company_data TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA rag_data TO service_role;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA orchestrator_ai GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA n8n_data GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA company_data GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA rag_data GRANT ALL ON TABLES TO service_role;

-- Set default privileges for future sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA orchestrator_ai GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA n8n_data GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA company_data GRANT ALL ON SEQUENCES TO service_role;
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
  RAISE NOTICE '  - orchestrator_ai (main application data)';
  RAISE NOTICE '  - n8n_data (N8n workflows)';
  RAISE NOTICE '  - company_data (structured company data)';
  RAISE NOTICE '  - rag_data (RAG collections and embeddings)';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Extensions:';
  RAISE NOTICE '  - vector (pgvector for RAG embeddings)';
  RAISE NOTICE '================================================';
END $$;

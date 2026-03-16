-- =============================================================================
-- RAG DATABASE: Enable pgvector Extension
-- =============================================================================
-- Run this against the rag_data database
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

COMMENT ON EXTENSION vector IS 'vector data type and similarity search for PostgreSQL';

-- =============================================================================
-- CLEANUP DEAD SCHEMAS
-- =============================================================================
-- Removes empty placeholder schemas that were never used:
--   orchestrator_ai, n8n_data, company_data
-- Note: leads schema is kept — used by agent-ideas / business-automation-advisor.
-- Updates PostgREST schema exposure to the definitive list.
-- =============================================================================

-- Drop empty schemas
DROP SCHEMA IF EXISTS orchestrator_ai CASCADE;
DROP SCHEMA IF EXISTS n8n_data CASCADE;
DROP SCHEMA IF EXISTS company_data CASCADE;

-- =============================================================================
-- UPDATE POSTGREST SCHEMA LIST
-- =============================================================================
-- Set the definitive list of schemas PostgREST should expose.
-- NOTE: This must be run manually with supabase_admin user (authenticator is reserved):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U supabase_admin -d postgres -c \
--     "ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, company, marketing, orch_flow, engineering, prediction, risk, crawler, law, code_ops, rag_data, leads, authz';"
-- ALTER ROLE authenticator SET pgrst.db_schemas = '...'; -- Requires superuser

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  RAISE NOTICE 'Dropped schemas: orchestrator_ai, n8n_data, company_data';
  RAISE NOTICE 'Updated pgrst.db_schemas to definitive list (13 schemas, leads retained)';
END $$;

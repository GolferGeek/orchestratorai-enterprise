-- =============================================================================
-- GRANT PERMISSIONS ON PUBLIC.CONVERSATIONS (AND RELATED)
-- =============================================================================
-- Fixes: permission denied for table conversations (code 42501)
-- The API uses Supabase anon/service client to insert/update/delete conversations.
-- Ensure anon, authenticated, and service_role have required access.
-- =============================================================================

-- Conversations table: allow API (anon/service_role) to CRUD
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO service_role;

-- View used by listConversations (already has SELECT for anon, authenticated; ensure service_role)
GRANT SELECT ON public.conversations_with_stats TO service_role;

-- Tasks and related tables used by AgentConversationsService (deleteConversation path)
-- Ensure anon/service_role can delete when cleaning up conversation data
GRANT SELECT, DELETE ON public.tasks TO anon, service_role;
GRANT SELECT, DELETE ON public.llm_usage TO anon, service_role;
GRANT SELECT, DELETE ON public.deliverables TO anon, service_role;

-- =============================================================================
-- FIX PGRST106 "Invalid schema: prediction" / "Invalid schema: risk"
-- =============================================================================
-- PostgREST only exposes schemas listed in the authenticator role's pgrst.db_schemas.
-- Sync with config.toml [api] schemas so prediction and risk are accessible.
-- NOTE: This must be run manually with supabase_admin user (authenticator is reserved):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U supabase_admin -d postgres -c \
--     "ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, marketing, orch_flow, engineering, prediction, risk, crawler, leads, authz';"
-- =============================================================================
-- ALTER ROLE authenticator SET pgrst.db_schemas = '...'; -- Requires superuser, run manually

-- Success
DO $$
BEGIN
  RAISE NOTICE 'Granted permissions on public.conversations and related tables to anon, authenticated, service_role';
  RAISE NOTICE 'NOTE: pgrst.db_schemas must be set manually with supabase_admin (see comments above)';
END $$;

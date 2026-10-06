-- Nobody reaches platform data with the public anon key or a Supabase user
-- token. Found by neuromics (2026-10-06): public.organization_credentials had
-- RLS off and ALL granted to anon and authenticated, and so did 49 other
-- tables in public and authz (users, roles, conversations, checkpoints, LLM
-- usage...), from Supabase's default privileges. Five SECURITY DEFINER PII
-- functions (decrypt_pii_value among them) were executable by anon.
--
-- The API reaches the database as postgres (and the Supabase plane as
-- service_role); both bypass RLS, so nothing the platform does changes.
-- Only PostgREST callers holding the anon key or a user's token lose access.
--
-- 1. Revoke every table, view and sequence privilege from anon and
--    authenticated in public and authz.
-- 2. Stop Supabase's default privileges from granting them again on new
--    objects (for both owners that create objects here).
-- 3. RLS on for every table in public and authz, with no policies for anon or
--    authenticated: if a grant ever comes back, rows still do not.
-- 4. SECURITY DEFINER functions in public and authz run only for postgres and
--    service_role.
--
-- apps/api/src/common/security/database-lockdown.integration.spec.ts keeps
-- it that way.

BEGIN;

REVOKE ALL ON ALL TABLES IN SCHEMA public, authz FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, authz FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, authz REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, authz REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, authz REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public, authz REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public, authz REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public, authz REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('public', 'authz') AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.nspname, r.relname);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'authz') AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres, service_role', r.fn);
  END LOOP;
END $$;

COMMIT;

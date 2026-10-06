-- 20261006150000 limited SECURITY DEFINER functions in public and authz to
-- postgres and service_role. The same holds for the app's other schemas:
-- ambient.capture_database_change, orch_flow.get_user_team_ids,
-- orch_flow.handle_new_user and prediction.user_has_org_access were still
-- executable by anon and authenticated (through PUBLIC). Triggers that use
-- them keep working: EXECUTE is checked when a trigger is created, not when
-- it fires.

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname NOT IN (
        'pg_catalog', 'information_schema', 'pg_toast', 'auth', 'storage', 'realtime', '_realtime',
        'extensions', 'graphql', 'graphql_public', 'net', 'pgsodium', 'pgsodium_masks', 'vault',
        'supabase_functions', 'supabase_migrations', 'pgbouncer', 'cron'
      )
      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres, service_role', r.fn);
  END LOOP;
END $$;

COMMIT;

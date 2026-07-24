-- =============================================================================
-- CLOUD SQL POST-MIGRATION GRANTS
-- =============================================================================
-- Schema and table creation belongs exclusively to the baseline and ordered
-- migrations. This final step only grants the application role access.

DO $$
DECLARE
  schema_name_value TEXT;
BEGIN
  FOR schema_name_value IN
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name NOT IN (
      'information_schema',
      'pg_catalog',
      'pg_toast'
    )
  LOOP
    EXECUTE format(
      'GRANT USAGE ON SCHEMA %I TO orchestrator_app',
      schema_name_value
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO orchestrator_app',
      schema_name_value
    );
    EXECUTE format(
      'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO orchestrator_app',
      schema_name_value
    );
    EXECUTE format(
      'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO orchestrator_app',
      schema_name_value
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO orchestrator_app',
      schema_name_value
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO orchestrator_app',
      schema_name_value
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO orchestrator_app',
      schema_name_value
    );
  END LOOP;
END
$$;

DO $$
BEGIN
  IF NOT has_schema_privilege('orchestrator_app', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'orchestrator_app is missing USAGE on public schema';
  END IF;
  IF NOT has_table_privilege(
    'orchestrator_app',
    'public.agents',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'orchestrator_app is missing SELECT on public.agents';
  END IF;
END
$$;

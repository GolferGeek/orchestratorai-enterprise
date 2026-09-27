-- The ambient schema came from the baseline dump owned by supabase_admin, with
-- no grants to postgres, the role the API connects as: every ambient read and
-- write (triggers, executions, adapter state) failed with "permission
-- denied". Like every other app schema, it belongs to postgres.
ALTER SCHEMA ambient OWNER TO postgres;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'ambient' LOOP
    EXECUTE format('ALTER TABLE ambient.%I OWNER TO postgres', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'ambient' LOOP
    EXECUTE format('ALTER SEQUENCE ambient.%I OWNER TO postgres', r.sequencename);
  END LOOP;
  FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'ambient' LOOP
    EXECUTE format('ALTER VIEW ambient.%I OWNER TO postgres', r.viewname);
  END LOOP;
END
$$;

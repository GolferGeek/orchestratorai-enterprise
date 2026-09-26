-- Empty the legal schema.
--
-- Legal workflows live in orchestratorai-local. Enterprise has no legal
-- workflows and no code that reads this schema; its tables (matters, clients,
-- contracts, memory_*, sentinel_*, agent_jobs, …) came from the old Forge
-- product (20260406100001 created the schema) and from restores of local.
-- If enterprise ever adds a legal workflow, it brings its own tables under the
-- workflow runtime. Decision 6, Matt, 2026-09-26.
--
-- Not affected: the Legal org's RAG agents (public.agents) read rag_data
-- collections (law-*), not this schema.
--
-- Backed up before this ran (pg_dump, outside git, 67/67 tables verified):
--   ~/backups/orchestratorai-enterprise/20260926-pre-legal-schema-drop.sql.gz
--
-- The schema itself stays, empty: PostgREST exposes it (PGRST_DB_SCHEMAS in
-- the running Supabase stack), and dropping an exposed schema makes PostgREST
-- fail to load its schema cache, taking the REST API down. `legal` is removed
-- from supabase/config.toml in the same commit; once Supabase has been
-- restarted with that config, a follow-up migration drops the empty schema.
--
-- CASCADE on the tables is used only after proving nothing outside the schema
-- depends on them, so it removes only the schema's own objects. If anything
-- outside legal depends on it, the guard raises and nothing is dropped.

BEGIN;

DO $$
DECLARE
  legal_rel oid[];
  outside int;
BEGIN
  SELECT array_agg(c.oid) INTO legal_rel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'legal';

  SELECT count(*) INTO outside FROM (
    SELECT 1 FROM pg_constraint
     WHERE contype = 'f' AND confrelid = ANY (legal_rel)
       AND NOT (conrelid = ANY (legal_rel))
    UNION ALL
    SELECT 1 FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid
      JOIN pg_class v ON v.oid = r.ev_class
     WHERE d.refobjid = ANY (legal_rel) AND NOT (v.oid = ANY (legal_rel))
    UNION ALL
    SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname NOT IN ('legal', 'pg_catalog', 'information_schema')
       AND p.prosrc ~ 'legal\.'
    UNION ALL
    SELECT 1 FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace cn ON cn.oid = c.relnamespace
      JOIN pg_type t ON t.oid = a.atttypid
      JOIN pg_namespace tn ON tn.oid = t.typnamespace
     WHERE tn.nspname = 'legal' AND cn.nspname NOT IN ('legal', 'pg_toast')
       AND a.attnum > 0
  ) deps;

  IF outside > 0 THEN
    RAISE EXCEPTION 'legal schema has % dependents outside it; not dropping', outside;
  END IF;
END $$;

DO $$
DECLARE
  obj record;
BEGIN
  FOR obj IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'legal'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS legal.%I CASCADE', obj.tablename);
  END LOOP;
  FOR obj IN
    SELECT p.oid::regprocedure AS fn
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'legal'
  LOOP
    EXECUTE format('DROP FUNCTION %s', obj.fn);
  END LOOP;
END $$;

DO $$
DECLARE
  remaining int;
BEGIN
  SELECT count(*) INTO remaining FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'legal';
  IF remaining > 0 THEN
    RAISE EXCEPTION 'legal schema still has % relations after emptying', remaining;
  END IF;
END $$;

COMMIT;

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

-- LangGraph manages its own checkpoint/store tables at runtime: the graph
-- checkpointer runs ALTER TABLE during setup(), which requires ownership, not
-- just DML grants. Hand these tables to the application role so the runtime can
-- migrate them.
DO $$
DECLARE
  langgraph_table TEXT;
BEGIN
  FOR langgraph_table IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND (tablename LIKE 'checkpoint%' OR tablename LIKE 'store%')
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I OWNER TO orchestrator_app',
      langgraph_table
    );
  END LOOP;
END
$$;

-- Application functions (rbac_*, etc.) reference tables in sibling schemas
-- (authz, marketing, …) without schema qualification, relying on search_path.
-- The app role otherwise defaults to just 'public', so those functions fail at
-- runtime (e.g. "relation \"rbac_user_org_roles\" does not exist"). Give the app
-- role a search_path spanning every application schema.
DO $$
DECLARE
  schema_list TEXT;
BEGIN
  SELECT string_agg(quote_ident(nspname), ', ' ORDER BY (nspname <> 'public'), nspname)
  INTO schema_list
  FROM pg_namespace
  WHERE nspname NOT LIKE 'pg_%'
    AND nspname NOT IN ('information_schema', 'orchestrator_deploy');
  EXECUTE format('ALTER ROLE orchestrator_app SET search_path = %s', schema_list);
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

-- The seeded Marketing Swarm model configs assume the local/multi-provider
-- profile (Ollama models, provider 'xai', 'claude-sonnet-4-6') and do not
-- resolve through OpenRouter, so the swarm cannot run on this profile.
-- Normalize them to valid OpenRouter model ids inside the allow-list. Idempotent
-- and guarded so it is a no-op where the marketing schema is not present.
DO $$
BEGIN
  IF to_regclass('marketing.agent_llm_configs') IS NULL THEN
    RETURN;
  END IF;

  -- xAI: correct the provider slug and pick a current, valid Grok.
  UPDATE marketing.agent_llm_configs
    SET llm_provider = 'x-ai', llm_model = 'grok-4.5',
        display_name = 'Grok 4.5', is_local = false
    WHERE llm_provider = 'xai';

  -- Anthropic: 'claude-sonnet-4-6' is not an OpenRouter id.
  UPDATE marketing.agent_llm_configs
    SET llm_model = 'claude-sonnet-5', display_name = 'Claude Sonnet 5'
    WHERE llm_provider = 'anthropic' AND llm_model = 'claude-sonnet-4-6';

  -- '-google' variant agents were mislabeled (openai/gpt-4o) — use a real Google model.
  UPDATE marketing.agent_llm_configs
    SET llm_provider = 'google', llm_model = 'gemini-2.5-flash',
        display_name = 'Gemini 2.5 Flash', is_local = false
    WHERE agent_slug LIKE '%-google' AND llm_provider = 'openai';

  -- '-ollama' variant agents -> OpenAI (their distinct working model).
  UPDATE marketing.agent_llm_configs
    SET llm_provider = 'openai', llm_model = 'gpt-4o',
        display_name = 'GPT-4o', is_local = false
    WHERE agent_slug LIKE '%-ollama' AND llm_provider = 'ollama';

  -- Remove all remaining local (Ollama) configs — non-functional on OpenRouter.
  DELETE FROM marketing.agent_llm_configs WHERE llm_provider = 'ollama';

  -- Any agent left without a config gets a default GPT-4o.
  INSERT INTO marketing.agent_llm_configs
    (id, agent_slug, llm_provider, llm_model, display_name, is_default, created_at, is_local)
  SELECT gen_random_uuid(), a.slug, 'openai', 'gpt-4o', 'GPT-4o', true, now(), false
  FROM marketing.agents a
  WHERE NOT EXISTS (
    SELECT 1 FROM marketing.agent_llm_configs c WHERE c.agent_slug = a.slug
  );

  -- Ensure each agent still has exactly one default.
  WITH need AS (
    SELECT agent_slug FROM marketing.agent_llm_configs
    GROUP BY agent_slug HAVING NOT bool_or(is_default)
  ),
  pick AS (
    SELECT DISTINCT ON (agent_slug) id FROM marketing.agent_llm_configs
    WHERE agent_slug IN (SELECT agent_slug FROM need)
    ORDER BY agent_slug, created_at
  )
  UPDATE marketing.agent_llm_configs SET is_default = true
    WHERE id IN (SELECT id FROM pick);
END
$$;

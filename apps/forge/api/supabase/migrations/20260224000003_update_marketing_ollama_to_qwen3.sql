-- =============================================================================
-- MIGRATION: Update marketing Ollama agents from qwen2.5:7b to qwen3:8b
-- =============================================================================
-- The marketing swarm writers, editors, and evaluators were defaulted to
-- Ollama qwen2.5:7b which is no longer in use. Update them to qwen3:8b.
-- =============================================================================

-- Ensure qwen3:8b exists in public.llm_models (idempotent)
<<<<<<<< HEAD:apps/api/supabase/migrations/20260224000002_update_marketing_ollama_to_qwen3.sql
INSERT INTO public.llm_models (model_name, provider_name, display_name, model_type, context_window, max_output_tokens, speed_tier, is_active)
VALUES ('qwen3:8b', 'ollama', 'Qwen 3 8B', 'text-generation', 32768, 8192, 'fast', true)
========
INSERT INTO public.llm_models (model_name, provider_name, display_name, model_type, context_window, max_output_tokens, speed_tier, is_active, is_local)
VALUES ('qwen3:8b', 'ollama', 'Qwen 3 8B', 'text-generation', 32768, 8192, 'fast', true, true)
>>>>>>>> 71d613e0 (refactor(api): enhance environment variable retrieval and error handling in customer service):apps/api/supabase/migrations/20260224000003_update_marketing_ollama_to_qwen3.sql
ON CONFLICT (model_name, provider_name) DO NOTHING;

-- Update all marketing agent_llm_configs from qwen2.5:7b to qwen3:8b
UPDATE marketing.agent_llm_configs
SET llm_model = 'qwen3:8b',
    display_name = 'Qwen 3 8B'
WHERE llm_provider = 'ollama'
  AND llm_model = 'qwen2.5:7b';

DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT count(*) INTO updated_count
  FROM marketing.agent_llm_configs
  WHERE llm_provider = 'ollama' AND llm_model = 'qwen3:8b';

  RAISE NOTICE 'Marketing Ollama agents updated to qwen3:8b. Total Ollama configs: %', updated_count;
END $$;

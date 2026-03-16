-- =============================================================================
-- ADD RAG-RUNNER AGENT TYPE
-- =============================================================================
-- Adds 'rag-runner' to the allowed agent types for RAG-based agents
-- RAG agents query dedicated knowledge base collections and augment LLM responses
-- Created: 2025-01-24
-- =============================================================================

-- Drop and recreate the agent_type check constraint to include 'rag-runner'
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;

ALTER TABLE public.agents ADD CONSTRAINT agents_agent_type_check
  CHECK (agent_type IN ('context', 'api', 'external', 'rag-runner', 'orchestrator'));

-- =============================================================================
-- UPDATE AGENT CONSTRAINTS
-- =============================================================================
-- rag-runner agents need llm_config (like context) but no endpoint (unlike api/external)
-- orchestrator agents may or may not have llm_config/endpoint (flexible)

-- Drop old constraints
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_context_no_endpoint;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_api_has_endpoint;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_api_no_llm;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_context_has_llm;

-- endpoint is null for context and rag-runner agents
ALTER TABLE public.agents ADD CONSTRAINT agents_context_no_endpoint
  CHECK (agent_type NOT IN ('context', 'rag-runner') OR endpoint IS NULL);

-- endpoint required for api and external agents
ALTER TABLE public.agents ADD CONSTRAINT agents_api_has_endpoint
  CHECK (agent_type IN ('context', 'rag-runner', 'orchestrator') OR endpoint IS NOT NULL);

-- llm_config is null for api and external agents
ALTER TABLE public.agents ADD CONSTRAINT agents_api_no_llm
  CHECK (agent_type IN ('context', 'rag-runner', 'orchestrator') OR llm_config IS NULL);

-- llm_config required for context and rag-runner agents
ALTER TABLE public.agents ADD CONSTRAINT agents_context_has_llm
  CHECK (agent_type NOT IN ('context', 'rag-runner') OR llm_config IS NOT NULL);

-- Add comment documenting the agent types
COMMENT ON COLUMN public.agents.agent_type IS
  'Type of agent: context (LLM-based), api (webhook/HTTP), external (A2A protocol), rag-runner (RAG knowledge base), orchestrator (multi-agent coordination)';

-- =============================================================================
-- ADD OLLAMA PROVIDER (if not exists)
-- =============================================================================

INSERT INTO public.llm_providers (
  name, display_name, api_base_url, is_active
) VALUES (
  'ollama', 'Ollama', 'http://localhost:11434', true
) ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- ADD GPT-OSS:20B MODEL (Default for sovereign/internal use)
-- =============================================================================

INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, speed_tier,
  is_local, is_currently_loaded, is_active
) VALUES (
  'gpt-oss:20b', 'ollama', 'GPT-OSS 20B', 'text-generation',
  32768, 8192, 'medium',
  true, true, true
) ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_currently_loaded = EXCLUDED.is_currently_loaded,
  is_active = EXCLUDED.is_active;

-- =============================================================================
-- Success notification
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Agent Type Migration Complete';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Added: rag-runner agent type';
    RAISE NOTICE 'Added: orchestrator agent type (for future use)';
    RAISE NOTICE 'Updated: endpoint/llm_config constraints for new types';
    RAISE NOTICE 'Added: gpt-oss:20b as default local model';
    RAISE NOTICE '================================================';
END $$;

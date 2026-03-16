-- =============================================================================
-- ADD MEDIA AGENT TYPE
-- =============================================================================
-- Adds 'media' to the allowed agent types for image/video generation agents
-- Media agents generate images, videos, and other media assets
-- Created: 2025-12-17
-- =============================================================================

-- Drop and recreate the agent_type check constraint to include 'media'
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;

ALTER TABLE public.agents ADD CONSTRAINT agents_agent_type_check
  CHECK (agent_type IN ('context', 'api', 'external', 'rag-runner', 'orchestrator', 'media'));

-- =============================================================================
-- UPDATE AGENT CONSTRAINTS
-- =============================================================================
-- media agents need llm_config (like context) but no endpoint

-- Drop old constraints
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_context_no_endpoint;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_api_has_endpoint;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_api_no_llm;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_context_has_llm;

-- endpoint is null for context, rag-runner, and media agents
ALTER TABLE public.agents ADD CONSTRAINT agents_context_no_endpoint
  CHECK (agent_type NOT IN ('context', 'rag-runner', 'media') OR endpoint IS NULL);

-- endpoint required for api and external agents
ALTER TABLE public.agents ADD CONSTRAINT agents_api_has_endpoint
  CHECK (agent_type IN ('context', 'rag-runner', 'orchestrator', 'media') OR endpoint IS NOT NULL);

-- llm_config is null for api and external agents
ALTER TABLE public.agents ADD CONSTRAINT agents_api_no_llm
  CHECK (agent_type IN ('context', 'rag-runner', 'orchestrator', 'media') OR llm_config IS NULL);

-- llm_config optional for media agents (they use provider/model from metadata)
-- Only context and rag-runner require llm_config
ALTER TABLE public.agents ADD CONSTRAINT agents_context_has_llm
  CHECK (agent_type NOT IN ('context', 'rag-runner') OR llm_config IS NOT NULL);

-- Add comment documenting the agent types
COMMENT ON COLUMN public.agents.agent_type IS
  'Type of agent: context (LLM-based), api (webhook/HTTP), external (A2A protocol), rag-runner (RAG knowledge base), orchestrator (multi-agent coordination), media (image/video generation)';

-- =============================================================================
-- Success notification
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Media Agent Type Migration Complete';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Added: media agent type for image/video generation';
    RAISE NOTICE 'Updated: endpoint/llm_config constraints for media type';
    RAISE NOTICE '================================================';
END $$;

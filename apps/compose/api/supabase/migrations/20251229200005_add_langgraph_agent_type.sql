-- =============================================================================
-- ADD LANGGRAPH AGENT TYPE
-- =============================================================================
-- Adds 'langgraph' to the allowed agent types for LangGraph workflow agents
-- LangGraph agents are workflow-based agents that use state machines and checkpointing
-- Created: 2025-12-29
-- =============================================================================

-- Drop and recreate the agent_type check constraint to include 'langgraph'
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;

ALTER TABLE public.agents ADD CONSTRAINT agents_agent_type_check
  CHECK (agent_type IN ('context', 'api', 'external', 'rag-runner', 'orchestrator', 'media', 'langgraph'));

-- =============================================================================
-- UPDATE AGENT CONSTRAINTS
-- =============================================================================
-- langgraph agents don't need endpoint (they use internal workflow) but may have llm_config

-- Drop old constraints
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_context_no_endpoint;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_api_has_endpoint;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_api_no_llm;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_context_has_llm;

-- endpoint is null for context, rag-runner, media, and langgraph agents
ALTER TABLE public.agents ADD CONSTRAINT agents_context_no_endpoint
  CHECK (agent_type NOT IN ('context', 'rag-runner', 'media', 'langgraph') OR endpoint IS NULL);

-- endpoint required for api and external agents only
ALTER TABLE public.agents ADD CONSTRAINT agents_api_has_endpoint
  CHECK (agent_type IN ('context', 'rag-runner', 'orchestrator', 'media', 'langgraph') OR endpoint IS NOT NULL);

-- llm_config is null for api and external agents
ALTER TABLE public.agents ADD CONSTRAINT agents_api_no_llm
  CHECK (agent_type IN ('context', 'rag-runner', 'orchestrator', 'media', 'langgraph') OR llm_config IS NULL);

-- llm_config required only for context and rag-runner (langgraph manages its own LLM)
ALTER TABLE public.agents ADD CONSTRAINT agents_context_has_llm
  CHECK (agent_type NOT IN ('context', 'rag-runner') OR llm_config IS NOT NULL);

-- Update column comment
COMMENT ON COLUMN public.agents.agent_type IS
  'Type of agent: context (LLM-based), api (webhook/HTTP), external (A2A protocol), rag-runner (RAG knowledge base), orchestrator (multi-agent coordination), media (image/video generation), langgraph (workflow-based)';

-- =============================================================================
-- Success notification
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'LangGraph Agent Type Migration Complete';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Added: langgraph agent type for workflow-based agents';
    RAISE NOTICE 'Updated: endpoint/llm_config constraints for langgraph type';
    RAISE NOTICE '================================================';
END $$;

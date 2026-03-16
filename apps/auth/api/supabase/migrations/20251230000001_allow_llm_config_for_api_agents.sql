-- =============================================================================
-- ALLOW LLM_CONFIG FOR API AGENTS
-- =============================================================================
-- The llm_config field is used by the frontend to set the correct model
-- when an agent is selected. This applies to ALL agent types, not just
-- context agents.
--
-- For API agents (like CAD Agent), llm_config specifies the preferred
-- model that should be used when making LLM calls through the agent.
-- The frontend reads this and sets it in the ExecutionContext.
--
-- Created: 2025-12-30
-- =============================================================================

-- Drop the constraint that prevents API agents from having llm_config
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_api_no_llm;

-- Update comment to reflect new usage
COMMENT ON COLUMN public.agents.llm_config IS 'LLM provider and parameters - used by frontend to set ExecutionContext. Required for context agents, optional for API/external agents.';

-- =============================================================================
-- UPDATE CAD AGENT WITH LLM CONFIG
-- =============================================================================

UPDATE public.agents
SET
    llm_config = '{
        "provider": "ollama",
        "model": "qwen2.5-coder:14b",
        "parameters": {
            "temperature": 0.7,
            "maxTokens": 4000
        }
    }'::JSONB,
    updated_at = NOW()
WHERE slug = 'cad-agent';

-- Also remove the defaultLLM from metadata since it's now in llm_config
UPDATE public.agents
SET
    metadata = metadata - 'defaultLLM',
    updated_at = NOW()
WHERE slug = 'cad-agent' AND metadata ? 'defaultLLM';

-- =============================================================================
-- Verification
-- =============================================================================

DO $$
DECLARE
    cad_llm_config JSONB;
BEGIN
    SELECT llm_config INTO cad_llm_config
    FROM public.agents
    WHERE slug = 'cad-agent';

    IF cad_llm_config IS NULL THEN
        RAISE EXCEPTION 'CAD Agent llm_config was not set';
    END IF;

    IF cad_llm_config->>'model' != 'qwen2.5-coder:14b' THEN
        RAISE EXCEPTION 'CAD Agent model is not qwen2.5-coder:14b';
    END IF;

    RAISE NOTICE '================================================';
    RAISE NOTICE 'LLM config constraint updated';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'API agents can now have llm_config';
    RAISE NOTICE 'CAD Agent llm_config: %', cad_llm_config;
    RAISE NOTICE '================================================';
END $$;

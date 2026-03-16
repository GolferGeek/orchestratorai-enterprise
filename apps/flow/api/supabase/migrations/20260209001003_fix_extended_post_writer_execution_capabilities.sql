-- =============================================================================
-- Fix Extended Post Writer: Change agent_type to 'api' and configure endpoint
-- =============================================================================
-- ROOT CAUSE: The extended-post-writer was registered as agent_type='context'.
-- This caused the mode router to select the context runner (LLM + context files)
-- instead of the API runner (HTTP call to LangGraph).
-- Without the API runner, the LangGraph /generate endpoint was never called,
-- so interrupt() was never triggered and HITL never showed.
--
-- Fix:
-- 1. Change agent_type from 'context' to 'api' (with endpoint - required by check constraint)
-- 2. Set endpoint with LangGraph URL for HTTP calls
-- 3. Update execution_capabilities (can_converse: false, can_build: true)
-- =============================================================================

UPDATE public.agents
SET
  agent_type = 'api',
  endpoint = '{"url": "http://localhost:6200/extended-post-writer/generate", "method": "POST", "headers": {"Content-Type": "application/json"}}'::jsonb,
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{execution_capabilities}',
      '{"can_converse": false, "can_plan": false, "can_build": true, "requires_human_gate": true}'::jsonb,
      true
    ),
    '{forwardConverse}',
    'false'::jsonb
  ),
  updated_at = NOW()
WHERE slug = 'extended-post-writer';

DO $$
BEGIN
  RAISE NOTICE 'Fixed extended-post-writer: agent_type=api, endpoint configured, execution_capabilities updated';
END $$;

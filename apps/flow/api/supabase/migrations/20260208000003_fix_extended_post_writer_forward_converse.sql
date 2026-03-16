-- =============================================================================
-- Fix Extended Post Writer: Add forwardConverse flag
-- =============================================================================
-- The extended-post-writer agent was missing forwardConverse: true in its metadata.
-- Without this flag, CONVERSE requests use the default LLM conversation path
-- instead of forwarding to the LangGraph endpoint, bypassing HITL entirely.
-- =============================================================================

UPDATE public.agents
SET
  metadata = metadata || '{"forwardConverse": true}'::jsonb,
  updated_at = NOW()
WHERE slug = 'extended-post-writer';

DO $$
BEGIN
  RAISE NOTICE 'Fixed extended-post-writer: added forwardConverse=true to metadata';
END $$;

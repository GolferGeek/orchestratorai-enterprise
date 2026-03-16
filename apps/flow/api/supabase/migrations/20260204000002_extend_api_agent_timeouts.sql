-- =============================================================================
-- MIGRATION: Extend API Agent Timeouts for Sovereign Mode (Ollama)
-- =============================================================================
-- Increases timeout from 120 seconds to 10 minutes (600000ms) to accommodate
-- slow local models like deepseek-r1:70b during sovereign mode operation.
-- Created: 2026-02-04
-- =============================================================================

-- Update all API agents that have a 120000ms timeout in their endpoint config
UPDATE public.agents
SET endpoint = jsonb_set(
  endpoint,
  '{timeout}',
  '600000'::jsonb,
  true
)
WHERE agent_type = 'api'
  AND endpoint IS NOT NULL
  AND endpoint->>'timeout' IS NOT NULL
  AND (endpoint->>'timeout')::integer <= 300000;

-- Specifically update legal-department if not caught above
UPDATE public.agents
SET endpoint = jsonb_set(
  COALESCE(endpoint, '{}'::jsonb),
  '{timeout}',
  '600000'::jsonb,
  true
)
WHERE slug = 'legal-department';

-- Log the update
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM public.agents
  WHERE agent_type = 'api'
    AND endpoint IS NOT NULL
    AND (endpoint->>'timeout')::integer = 600000;

  RAISE NOTICE '================================================';
  RAISE NOTICE 'Extended API agent timeouts to 10 minutes';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Agents updated: %', updated_count;
  RAISE NOTICE 'New timeout: 600000ms (10 minutes)';
  RAISE NOTICE 'Reason: Accommodate slow local models (Ollama/sovereign mode)';
  RAISE NOTICE '================================================';
END $$;

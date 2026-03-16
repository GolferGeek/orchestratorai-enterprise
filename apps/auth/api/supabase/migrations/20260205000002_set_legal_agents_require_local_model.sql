-- Set require_local_model = true for all legal department agents
-- Legal agents handle sensitive client data and should use local LLMs only
-- This enforces sovereign mode (Ollama-only) for all legal department agents
-- Note: Only updates agents with department = 'legal', not agents tagged with 'legal'

UPDATE public.agents
SET require_local_model = true,
    updated_at = NOW()
WHERE department = 'legal'
  AND (require_local_model IS NULL OR require_local_model = false);

-- Log the update
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % legal department agents to require local model (sovereign mode)', updated_count;
END $$;

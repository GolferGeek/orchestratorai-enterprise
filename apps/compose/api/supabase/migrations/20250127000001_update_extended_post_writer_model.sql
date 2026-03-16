-- =============================================================================
-- UPDATE EXTENDED POST WRITER DEFAULT MODEL
-- =============================================================================
-- Changes default LLM from Anthropic Claude to Ollama llama3.2:1b for faster testing
-- Created: 2025-11-27
-- =============================================================================

UPDATE public.agents
SET
  agent_type = 'context',
  endpoint = NULL,
  llm_config = '{
    "provider": "ollama",
    "model": "llama3.2:1b"
  }'::JSONB,
  updated_at = NOW()
WHERE slug = 'extended-post-writer';

-- Log success
DO $$
BEGIN
  RAISE NOTICE 'Updated extended-post-writer to use ollama/llama3.2:1b';
END $$;

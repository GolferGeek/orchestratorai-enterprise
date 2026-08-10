-- Normalize Marketing Swarm Anthropic defaults to OpenRouter catalog names
-- (dot version). UI resolves these onto bare catalog model ids.

BEGIN;

UPDATE marketing.agent_llm_configs
SET llm_model = 'claude-sonnet-4.6',
    display_name = 'Claude Sonnet 4.6'
WHERE llm_provider = 'anthropic'
  AND llm_model = 'claude-sonnet-4-6';

COMMIT;

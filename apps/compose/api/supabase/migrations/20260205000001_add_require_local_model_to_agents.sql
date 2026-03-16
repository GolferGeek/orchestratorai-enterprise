-- Add require_local_model field to agents table
-- This enforces local-only LLM providers (e.g., Ollama) for PII/IP protection

ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS require_local_model boolean DEFAULT false;

COMMENT ON COLUMN public.agents.require_local_model IS
  'When true, this agent can only use local LLM providers (e.g., Ollama). Enforces sovereign mode.';

-- Partial index for efficient queries filtering agents that require local models
CREATE INDEX IF NOT EXISTS idx_agents_require_local_model
ON public.agents(require_local_model) WHERE require_local_model = true;

-- Add is_local field to llm_providers table
-- This allows marking providers as local (e.g., Ollama, or other local LLM providers)

-- Add the is_local column
ALTER TABLE public.llm_providers
ADD COLUMN IF NOT EXISTS is_local boolean DEFAULT false;

-- Set Ollama as local by default
UPDATE public.llm_providers
SET is_local = true
WHERE LOWER(name) = 'ollama';

-- Add comment to document the field
COMMENT ON COLUMN public.llm_providers.is_local IS 'Indicates if the provider runs locally (e.g., Ollama)';

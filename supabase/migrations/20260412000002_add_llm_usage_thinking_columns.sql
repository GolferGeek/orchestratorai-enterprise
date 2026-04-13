-- Add thinking/reasoning capture columns to llm_usage
-- Used by the reasoning capture system for thinking-capable models (Gemma, etc.)
-- See: forge reasoning capture skill

ALTER TABLE public.llm_usage ADD COLUMN IF NOT EXISTS thinking_content text;
ALTER TABLE public.llm_usage ADD COLUMN IF NOT EXISTS thinking_duration_ms integer;
ALTER TABLE public.llm_usage ADD COLUMN IF NOT EXISTS thinking_token_count integer;

COMMENT ON COLUMN public.llm_usage.thinking_content IS 'Raw thinking/reasoning content from thinking-capable models';
COMMENT ON COLUMN public.llm_usage.thinking_duration_ms IS 'Time spent in thinking phase (ms)';
COMMENT ON COLUMN public.llm_usage.thinking_token_count IS 'Token count for the thinking content';

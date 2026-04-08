-- Phase 4: Reasoning Capture — add thinking columns to public.llm_usage
--
-- These columns are nullable so every existing writer (every LLM call in the
-- system) continues to work without modification. Only the code path that reads
-- LLMResponse.thinkingContent (LLMHttpClientService + RunMetadataService) knows
-- about the new columns. Every other writer leaves them NULL.
--
-- Applied: 2026-04-08

ALTER TABLE public.llm_usage
  ADD COLUMN IF NOT EXISTS thinking_content TEXT,
  ADD COLUMN IF NOT EXISTS thinking_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS thinking_token_count INTEGER;

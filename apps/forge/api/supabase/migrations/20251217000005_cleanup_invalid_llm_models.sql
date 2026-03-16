-- =============================================================================
-- CLEANUP INVALID LLM MODELS
-- =============================================================================
-- This migration removes invalid/deprecated LLM models and corrects model naming
-- to match official API documentation as of December 2025.
--
-- Sources:
-- - Anthropic: https://platform.claude.com/docs/en/about-claude/models/overview
-- - Google: https://ai.google.dev/gemini-api/docs/models
-- - xAI: https://docs.x.ai/docs/models
-- =============================================================================

-- =============================================================================
-- 1. DELETE INVALID ANTHROPIC MODELS
-- =============================================================================

DELETE FROM public.llm_models
WHERE provider_name = 'anthropic'
AND model_name IN (
  'claude-3-5-sonnet-20241022',   -- Old model, not in current API
  'claude-3-opus-20240229',       -- Deprecated
  'claude-4.1-opus',              -- Wrong format
  'claude-4.1-sonnet',            -- Doesn't exist
  'claude-haiku-4-5-20251015',    -- Wrong date (should be 20251001)
  'claude-opus-4.5',              -- Wrong format (should have date)
  'claude-sonnet-4',              -- Incomplete (should have date)
  'claude-sonnet-4-5-20250514'    -- Wrong date (should be 20250929)
);

-- =============================================================================
-- 2. ADD CORRECT ANTHROPIC MODELS IF MISSING
-- =============================================================================

-- Claude Opus 4.5 (correct format: claude-opus-4-5-20251101)
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
)
SELECT
  'claude-opus-4-5-20251101', 'anthropic', 'Claude Opus 4.5', 'text-generation',
  200000, 64000,
  '{"input_per_1k": 0.005, "output_per_1k": 0.025}',
  '["text", "code", "vision", "reasoning"]',
  'flagship', 'moderate', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_models
  WHERE model_name = 'claude-opus-4-5-20251101' AND provider_name = 'anthropic'
);

-- Claude Haiku 4.5 (correct date: 20251001)
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
)
SELECT
  'claude-haiku-4-5-20251001', 'anthropic', 'Claude Haiku 4.5', 'text-generation',
  200000, 64000,
  '{"input_per_1k": 0.001, "output_per_1k": 0.005}',
  '["text", "code", "vision", "reasoning"]',
  'standard', 'fastest', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_models
  WHERE model_name = 'claude-haiku-4-5-20251001' AND provider_name = 'anthropic'
);

-- =============================================================================
-- 3. DELETE INVALID OPENAI MODELS
-- =============================================================================

DELETE FROM public.llm_models
WHERE provider_name = 'openai'
AND model_name IN (
  'gpt-3.5-turbo',        -- Deprecated
  'gpt-4',                -- Use gpt-4-turbo or gpt-4o
  'gpt-4.1',              -- Doesn't exist
  'gpt-4.1-mini',         -- Doesn't exist
  'gpt-4.1-nano',         -- Doesn't exist
  'gpt-5.2-pro',          -- Not a chat model (uses completions API)
  'o1-mini',              -- Deprecated/not available
  'o1-preview',           -- Deprecated/not available
  'o3-pro',               -- Not available yet
  'o4-mini'               -- Not released yet
);

-- Mark o-series models as inactive (limited availability)
UPDATE public.llm_models SET is_active = false
WHERE provider_name = 'openai' AND model_name IN ('o1', 'o3', 'o3-mini');

-- =============================================================================
-- 3b. ADD GPT-5 SERIES MODELS (Released August-December 2025)
-- =============================================================================
-- Sources:
-- - https://openai.com/index/introducing-gpt-5-for-developers/
-- - https://openai.com/index/gpt-5-1-for-developers/
-- - https://openai.com/index/introducing-gpt-5-2/

-- GPT-5 base (August 2025)
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
)
SELECT
  'gpt-5', 'openai', 'GPT-5', 'text-generation',
  128000, 32768,
  '{"input_per_1k": 0.005, "output_per_1k": 0.015}',
  '["text", "code", "vision", "reasoning"]',
  'flagship', 'fast', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_models
  WHERE model_name = 'gpt-5' AND provider_name = 'openai'
);

-- GPT-5 Mini
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
)
SELECT
  'gpt-5-mini', 'openai', 'GPT-5 Mini', 'text-generation',
  128000, 16384,
  '{"input_per_1k": 0.001, "output_per_1k": 0.003}',
  '["text", "code", "vision"]',
  'standard', 'fast', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_models
  WHERE model_name = 'gpt-5-mini' AND provider_name = 'openai'
);

-- GPT-5.1 (Thinking)
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
)
SELECT
  'gpt-5.1', 'openai', 'GPT-5.1', 'text-generation',
  128000, 32768,
  '{"input_per_1k": 0.005, "output_per_1k": 0.015}',
  '["text", "code", "vision", "reasoning"]',
  'flagship', 'fast', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_models
  WHERE model_name = 'gpt-5.1' AND provider_name = 'openai'
);

-- GPT-5.1 Chat (Instant)
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
)
SELECT
  'gpt-5.1-chat-latest', 'openai', 'GPT-5.1 Instant', 'text-generation',
  128000, 32768,
  '{"input_per_1k": 0.003, "output_per_1k": 0.01}',
  '["text", "code", "vision"]',
  'standard', 'fastest', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_models
  WHERE model_name = 'gpt-5.1-chat-latest' AND provider_name = 'openai'
);

-- GPT-5.2 Thinking (December 11, 2025)
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
)
SELECT
  'gpt-5.2', 'openai', 'GPT-5.2 Thinking', 'text-generation',
  128000, 65536,
  '{"input_per_1k": 0.00175, "output_per_1k": 0.014}',
  '["text", "code", "vision", "reasoning"]',
  'flagship', 'fast', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_models
  WHERE model_name = 'gpt-5.2' AND provider_name = 'openai'
);

-- GPT-5.2 Chat (Instant)
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
)
SELECT
  'gpt-5.2-chat-latest', 'openai', 'GPT-5.2 Instant', 'text-generation',
  128000, 32768,
  '{"input_per_1k": 0.001, "output_per_1k": 0.004}',
  '["text", "code", "vision"]',
  'standard', 'fastest', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_models
  WHERE model_name = 'gpt-5.2-chat-latest' AND provider_name = 'openai'
);

-- =============================================================================
-- 4. DELETE INVALID GOOGLE MODELS
-- =============================================================================

DELETE FROM public.llm_models
WHERE provider_name = 'google'
AND model_name IN (
  'gemini-1.5-flash',      -- Old version
  'gemini-1.5-pro',        -- Old version
  'gemini-2.0-pro',        -- Doesn't exist (only flash exists in 2.0)
  'gemini-2.5-flash',      -- Deprecated, use gemini-2.5-flash-lite or gemini-2.5-pro
  'gemini-3-pro',          -- Wrong format (should be gemini-3-pro-preview)
  'gemini-3.0-deep-think', -- Doesn't exist
  'gemini-3.0-pro'         -- Wrong format
);

-- Add correct Gemini 3 Pro model
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
)
SELECT
  'gemini-3-pro-preview', 'google', 'Gemini 3 Pro', 'text-generation',
  1000000, 65536,
  '{"input_per_1k": 0.00125, "output_per_1k": 0.005}',
  '["text", "code", "vision", "reasoning"]',
  'flagship', 'fast', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_models
  WHERE model_name = 'gemini-3-pro-preview' AND provider_name = 'google'
);

-- =============================================================================
-- 5. REMOVE DUPLICATE GROK PROVIDER (use 'xai' instead)
-- =============================================================================

-- Remove all models under 'grok' provider (duplicates of 'xai')
DELETE FROM public.llm_models WHERE provider_name = 'grok';

-- Fix invalid xai model names
DELETE FROM public.llm_models
WHERE provider_name = 'xai'
AND model_name IN (
  'grok-2',         -- Deprecated/not available
  'grok-4.1',       -- Not available
  'grok-4.1-fast'   -- Wrong format
);

-- Add missing valid xai models
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
)
SELECT
  'grok-3-mini', 'xai', 'Grok 3 Mini', 'text-generation',
  131072, 8192,
  '{"input_per_1k": 0.002, "output_per_1k": 0.01}',
  '["text", "code"]',
  'standard', 'fast', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_models
  WHERE model_name = 'grok-3-mini' AND provider_name = 'xai'
);

INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
)
SELECT
  'grok-4-fast', 'xai', 'Grok 4 Fast', 'text-generation',
  2000000, 65536,
  '{"input_per_1k": 0.003, "output_per_1k": 0.015}',
  '["text", "code", "reasoning"]',
  'flagship', 'fast', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_models
  WHERE model_name = 'grok-4-fast' AND provider_name = 'xai'
);

-- =============================================================================
-- 6. CLEANUP LLM_PROVIDERS TABLE
-- =============================================================================

-- Remove duplicate 'grok' provider (keep 'xai')
DELETE FROM public.llm_providers WHERE name = 'grok';

-- Mark Google provider as inactive (API not enabled)
UPDATE public.llm_providers SET is_active = false WHERE name = 'google';

-- Mark all Google models as inactive
UPDATE public.llm_models SET is_active = false WHERE provider_name = 'google';

-- =============================================================================
-- SUCCESS NOTIFICATION
-- =============================================================================

DO $$
DECLARE
  anthropic_count INTEGER;
  google_count INTEGER;
  openai_count INTEGER;
  xai_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO anthropic_count FROM public.llm_models WHERE provider_name = 'anthropic';
  SELECT COUNT(*) INTO google_count FROM public.llm_models WHERE provider_name = 'google';
  SELECT COUNT(*) INTO openai_count FROM public.llm_models WHERE provider_name = 'openai';
  SELECT COUNT(*) INTO xai_count FROM public.llm_models WHERE provider_name = 'xai';

  RAISE NOTICE '================================================';
  RAISE NOTICE 'LLM Models cleanup completed successfully';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Models by provider:';
  RAISE NOTICE '  Anthropic: %', anthropic_count;
  RAISE NOTICE '  Google: %', google_count;
  RAISE NOTICE '  OpenAI: %', openai_count;
  RAISE NOTICE '  xAI: %', xai_count;
  RAISE NOTICE '================================================';
END $$;

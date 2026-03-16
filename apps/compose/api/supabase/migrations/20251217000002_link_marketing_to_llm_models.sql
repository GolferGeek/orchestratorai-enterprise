-- =============================================================================
-- LINK MARKETING SCHEMA TO PUBLIC LLM_MODELS
-- =============================================================================
-- Add foreign key from marketing.agent_llm_configs to public.llm_models
-- This allows pricing lookups via JOIN while keeping existing structure
-- =============================================================================

-- First, ensure all models referenced in marketing.agent_llm_configs exist in public.llm_models
-- Add any missing models that are currently in use

-- Check for claude-sonnet-4-20250514 (used in marketing, may need alias)
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
)
SELECT
  'claude-sonnet-4-20250514', 'anthropic', 'Claude Sonnet 4', 'text-generation',
  200000, 16384,
  '{"input_per_1k": 0.003, "output_per_1k": 0.015}',
  '["text", "code", "vision", "reasoning"]',
  'standard', 'fast', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_models
  WHERE model_name = 'claude-sonnet-4-20250514' AND provider_name = 'anthropic'
);

-- Add llama3.2 (base model name without size suffix)
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
)
SELECT
  'llama3.2', 'ollama', 'Llama 3.2', 'text-generation',
  128000, 4096,
  '{"input_per_1k": 0.0002, "output_per_1k": 0.0002, "note": "estimated electricity cost"}',
  '["text", "code"]',
  'local', 'fast', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_models
  WHERE model_name = 'llama3.2' AND provider_name = 'ollama'
);

-- =============================================================================
-- ADD FOREIGN KEY CONSTRAINT (DEFERRABLE for data migration flexibility)
-- =============================================================================

-- Note: We're adding the FK as DEFERRABLE INITIALLY DEFERRED to allow
-- for future inserts where we might need to add the model first
--
-- If any marketing configs reference models that don't exist, this will fail.
-- In that case, we need to either:
-- 1. Add the missing models to public.llm_models first
-- 2. Update the marketing configs to use existing models

-- Check what models are missing
DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM marketing.agent_llm_configs alc
  LEFT JOIN public.llm_models lm ON (lm.model_name = alc.llm_model AND lm.provider_name = alc.llm_provider)
  WHERE lm.model_name IS NULL;

  IF missing_count > 0 THEN
    RAISE NOTICE 'Found % agent_llm_configs referencing models not in public.llm_models', missing_count;
    RAISE NOTICE 'These will be added to public.llm_models with default pricing';
  END IF;
END $$;

-- Insert any missing models with default pricing
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
)
SELECT DISTINCT
  alc.llm_model,
  alc.llm_provider,
  COALESCE(alc.display_name, alc.llm_model),
  'text-generation',
  128000,
  4096,
  CASE
    WHEN alc.is_local THEN '{"input_per_1k": 0.0002, "output_per_1k": 0.0002, "note": "local model - estimated electricity"}'
    ELSE '{"input_per_1k": 0.003, "output_per_1k": 0.015, "note": "default pricing - please update"}'
  END::jsonb,
  '["text"]'::jsonb,
  CASE WHEN alc.is_local THEN 'local' ELSE 'standard' END,
  CASE WHEN alc.is_local THEN 'fast' ELSE 'medium' END,
  alc.is_local,
  true
FROM marketing.agent_llm_configs alc
LEFT JOIN public.llm_models lm ON (lm.model_name = alc.llm_model AND lm.provider_name = alc.llm_provider)
WHERE lm.model_name IS NULL
ON CONFLICT (model_name, provider_name) DO NOTHING;

-- Also ensure providers exist
INSERT INTO public.llm_providers (name, display_name, is_active, is_local)
SELECT DISTINCT
  alc.llm_provider,
  INITCAP(alc.llm_provider),
  true,
  alc.is_local
FROM marketing.agent_llm_configs alc
LEFT JOIN public.llm_providers lp ON lp.name = alc.llm_provider
WHERE lp.name IS NULL
ON CONFLICT (name) DO NOTHING;

-- Now add the foreign key constraint
ALTER TABLE marketing.agent_llm_configs
ADD CONSTRAINT agent_llm_configs_llm_model_fkey
FOREIGN KEY (llm_model, llm_provider)
REFERENCES public.llm_models(model_name, provider_name)
ON DELETE RESTRICT
ON UPDATE CASCADE
DEFERRABLE INITIALLY DEFERRED;

-- =============================================================================
-- CREATE VIEW FOR EASY PRICING LOOKUP
-- =============================================================================

-- Drop existing view if it exists
DROP VIEW IF EXISTS marketing.agent_llm_configs_with_pricing;

-- Create view that joins configs with pricing
CREATE VIEW marketing.agent_llm_configs_with_pricing AS
SELECT
  alc.id,
  alc.agent_slug,
  alc.llm_provider,
  alc.llm_model,
  alc.display_name,
  alc.is_default,
  alc.is_local,
  alc.created_at,
  lm.pricing_info_json,
  (lm.pricing_info_json->>'input_per_1k')::numeric AS input_cost_per_1k,
  (lm.pricing_info_json->>'output_per_1k')::numeric AS output_cost_per_1k,
  lm.context_window,
  lm.max_output_tokens,
  lm.model_tier,
  lm.speed_tier,
  lm.capabilities
FROM marketing.agent_llm_configs alc
JOIN public.llm_models lm ON (lm.model_name = alc.llm_model AND lm.provider_name = alc.llm_provider);

-- Grant access to the view
GRANT SELECT ON marketing.agent_llm_configs_with_pricing TO authenticated;
GRANT SELECT ON marketing.agent_llm_configs_with_pricing TO service_role;

-- =============================================================================
-- SUCCESS NOTIFICATION
-- =============================================================================

DO $$
DECLARE
  config_count INTEGER;
  with_pricing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO config_count FROM marketing.agent_llm_configs;
  SELECT COUNT(*) INTO with_pricing_count FROM marketing.agent_llm_configs_with_pricing WHERE input_cost_per_1k IS NOT NULL;

  RAISE NOTICE '================================================';
  RAISE NOTICE 'Marketing schema linked to LLM models successfully';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Total agent_llm_configs: %', config_count;
  RAISE NOTICE 'Configs with valid pricing: %', with_pricing_count;
  RAISE NOTICE '';
  RAISE NOTICE 'New view created: marketing.agent_llm_configs_with_pricing';
  RAISE NOTICE 'Use this view to get configs with pricing info';
  RAISE NOTICE '================================================';
END $$;

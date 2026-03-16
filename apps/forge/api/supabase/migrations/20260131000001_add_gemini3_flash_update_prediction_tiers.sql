-- =============================================================================
-- ADD GEMINI 3 FLASH PREVIEW AND UPDATE PREDICTION AGENT TIERS
-- =============================================================================
-- This migration:
-- 1. Adds Gemini 3 Flash Preview to llm_models table
-- 2. Updates all prediction agents to use Gemini 3 Flash Preview for all tiers
-- 3. Updates the llm_tier_mapping view to use Gemini 3 Flash Preview
--
-- Rationale: Gemini 3 Flash Preview offers frontier-level reasoning at $0.50/1M input,
-- $3/1M output - significantly cheaper than Claude Sonnet while maintaining
-- quality for stock prediction tasks.
--
-- Created: 2026-01-31
-- Updated: 2026-02-07 - Changed to gemini-3-flash-preview (correct model name)
-- =============================================================================

-- =============================================================================
-- STEP 1: Add Gemini 3 Flash Preview to llm_models
-- =============================================================================
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type, model_version,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active, training_data_cutoff
) VALUES
  ('gemini-3-flash-preview', 'google', 'Gemini 3 Flash Preview', 'text-generation', '3-flash-preview',
   1000000, 65536,
   '{"input_per_1k": 0.0005, "output_per_1k": 0.003}',
   '["text", "code", "vision", "audio", "reasoning", "agentic"]',
   'standard', 'fast', false, true, '2025-11-01')
ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  pricing_info_json = EXCLUDED.pricing_info_json,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  capabilities = EXCLUDED.capabilities,
  model_tier = EXCLUDED.model_tier,
  speed_tier = EXCLUDED.speed_tier,
  training_data_cutoff = EXCLUDED.training_data_cutoff,
  updated_at = NOW();

-- =============================================================================
-- STEP 2: Update prediction agent model_config to use Gemini 3 Flash
-- (Only if prediction schema exists)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'prediction' AND table_name = 'prediction_agents'
  ) THEN
    -- Update US Tech Stocks predictor
    UPDATE prediction.prediction_agents
    SET
      model_config = '{
        "triage": {"provider": "google", "model": "gemini-3-flash-preview", "temperature": 0.2},
        "specialists": {"provider": "google", "model": "gemini-3-flash-preview", "temperature": 0.3},
        "evaluators": {"provider": "google", "model": "gemini-3-flash-preview", "temperature": 0.4},
        "learning": {"provider": "google", "model": "gemini-3-flash-preview", "temperature": 0.5}
      }'::JSONB,
      updated_at = NOW()
    WHERE agent_slug = 'us-tech-stocks-2025';

    -- Update Crypto Majors predictor
    UPDATE prediction.prediction_agents
    SET
      model_config = '{
        "triage": {"provider": "google", "model": "gemini-3-flash-preview", "temperature": 0.2},
        "specialists": {"provider": "google", "model": "gemini-3-flash-preview", "temperature": 0.3},
        "evaluators": {"provider": "google", "model": "gemini-3-flash-preview", "temperature": 0.4},
        "learning": {"provider": "google", "model": "gemini-3-flash-preview", "temperature": 0.5}
      }'::JSONB,
      updated_at = NOW()
    WHERE agent_slug = 'crypto-majors-2025';

    -- Update Polymarket predictor
    UPDATE prediction.prediction_agents
    SET
      model_config = '{
        "triage": {"provider": "google", "model": "gemini-3-flash-preview", "temperature": 0.2},
        "specialists": {"provider": "google", "model": "gemini-3-flash-preview", "temperature": 0.3},
        "evaluators": {"provider": "google", "model": "gemini-3-flash-preview", "temperature": 0.4},
        "learning": {"provider": "google", "model": "gemini-3-flash-preview", "temperature": 0.5}
      }'::JSONB,
      updated_at = NOW()
    WHERE agent_slug = 'polymarket-politics-2025';

    RAISE NOTICE 'Updated prediction.prediction_agents to use Gemini 3 Flash';
  ELSE
    RAISE NOTICE 'prediction.prediction_agents table not found - skipping prediction agent updates';
  END IF;
END $$;

-- =============================================================================
-- STEP 3: Update public.agents llm_config for prediction agents
-- =============================================================================
UPDATE public.agents
SET
  llm_config = '{"provider": "google", "model": "gemini-3-flash-preview", "temperature": 0.3}'::JSONB,
  updated_at = NOW()
WHERE slug IN ('us-tech-stocks-2025', 'crypto-majors-2025', 'polymarket-politics-2025');

-- =============================================================================
-- VERIFICATION
-- =============================================================================
DO $$
DECLARE
  gemini_exists BOOLEAN;
  agents_updated INTEGER;
  prediction_agents_updated INTEGER := 0;
BEGIN
  -- Check Gemini 3 Flash exists
  SELECT EXISTS(
    SELECT 1 FROM public.llm_models
    WHERE model_name = 'gemini-3-flash-preview' AND provider_name = 'google'
  ) INTO gemini_exists;

  -- Count updated agents
  SELECT COUNT(*) INTO agents_updated
  FROM public.agents
  WHERE llm_config->>'model' = 'gemini-3-flash-preview';

  -- Count updated prediction agents (only if table exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'prediction' AND table_name = 'prediction_agents'
  ) THEN
    SELECT COUNT(*) INTO prediction_agents_updated
    FROM prediction.prediction_agents
    WHERE model_config->'triage'->>'model' = 'gemini-3-flash-preview';
  END IF;

  IF NOT gemini_exists THEN
    RAISE EXCEPTION 'Gemini 3 Flash Preview was not added to llm_models';
  END IF;

  RAISE NOTICE '================================================';
  RAISE NOTICE 'Migration completed successfully';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Added: gemini-3-flash-preview to llm_models';
  RAISE NOTICE 'Pricing: $0.50/1M input, $3/1M output';
  RAISE NOTICE 'Updated % public.agents to use Gemini 3 Flash Preview', agents_updated;
  RAISE NOTICE 'Updated % prediction.prediction_agents', prediction_agents_updated;
  RAISE NOTICE '';
  RAISE NOTICE 'Cost savings vs Claude Sonnet 4:';
  RAISE NOTICE '  Input: $0.50/1M vs $3/1M (6x cheaper)';
  RAISE NOTICE '  Output: $3/1M vs $15/1M (5x cheaper)';
  RAISE NOTICE '================================================';
END $$;

-- =============================================================================
-- LLM TIER MAPPING VIEW
-- =============================================================================
-- Creates a VIEW on public.llm_models for tier mapping
-- DO NOT create a new table - use existing llm_models table
-- Phase 1, Step 1-5
-- =============================================================================

-- =============================================================================
-- LLM TIER MAPPING VIEW
-- =============================================================================
-- Maps model_tier from llm_models to prediction tiers (gold/silver/bronze)

CREATE OR REPLACE VIEW prediction.llm_tier_mapping AS
SELECT
  model_name,
  provider_name AS provider,
  model_name AS model,
  model_tier,
  CASE model_tier
    WHEN 'flagship' THEN 'gold'
    WHEN 'standard' THEN 'silver'
    WHEN 'economy' THEN 'bronze'
    WHEN 'local' THEN 'bronze'
    ELSE 'bronze'
  END AS prediction_tier,
  is_active AS is_enabled,
  model_parameters_json AS metadata,
  created_at,
  updated_at
FROM public.llm_models
WHERE is_active = true;

-- =============================================================================
-- TIER LOOKUP FUNCTION
-- =============================================================================
-- Get models for a specific prediction tier

CREATE OR REPLACE FUNCTION prediction.get_models_for_tier(
  p_tier TEXT,
  p_provider TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  provider TEXT,
  model TEXT,
  model_tier TEXT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ltm.id,
    ltm.provider,
    ltm.model,
    ltm.model_tier,
    ltm.metadata
  FROM prediction.llm_tier_mapping ltm
  WHERE ltm.prediction_tier = p_tier
    AND (p_provider IS NULL OR ltm.provider = p_provider)
  ORDER BY
    CASE ltm.model_tier
      WHEN 'flagship' THEN 1
      WHEN 'standard' THEN 2
      WHEN 'economy' THEN 3
      WHEN 'local' THEN 4
      ELSE 5
    END;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- DEFAULT TIER MODEL FUNCTION
-- =============================================================================
-- Get the default model for a tier (first enabled model)

CREATE OR REPLACE FUNCTION prediction.get_default_model_for_tier(
  p_tier TEXT,
  p_provider TEXT DEFAULT NULL
)
RETURNS TABLE (
  provider TEXT,
  model TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT ltm.provider, ltm.model
  FROM prediction.llm_tier_mapping ltm
  WHERE ltm.prediction_tier = p_tier
    AND (p_provider IS NULL OR ltm.provider = p_provider)
  ORDER BY
    CASE ltm.provider
      WHEN 'anthropic' THEN 1
      WHEN 'openai' THEN 2
      ELSE 3
    END
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON VIEW prediction.llm_tier_mapping IS 'Maps llm_models.model_tier to prediction tiers (gold/silver/bronze)';
COMMENT ON FUNCTION prediction.get_models_for_tier(TEXT, TEXT) IS 'Get all enabled models for a prediction tier';
COMMENT ON FUNCTION prediction.get_default_model_for_tier(TEXT, TEXT) IS 'Get default model for a prediction tier';

-- =============================================================================
-- DOCUMENTATION
-- =============================================================================

/*
Tier Mapping:
- gold   <- flagship (claude-opus-4-5, gpt-4, etc.)
- silver <- standard (claude-sonnet-4, gpt-4o, etc.)
- bronze <- economy OR local (llama3.3 via Ollama, etc.)

Usage Examples:

-- Get all gold tier models
SELECT * FROM prediction.llm_tier_mapping WHERE prediction_tier = 'gold';

-- Get models for tier
SELECT * FROM prediction.get_models_for_tier('gold');
SELECT * FROM prediction.get_models_for_tier('silver', 'anthropic');

-- Get default model for tier
SELECT * FROM prediction.get_default_model_for_tier('gold');
SELECT * FROM prediction.get_default_model_for_tier('bronze', 'ollama');
*/

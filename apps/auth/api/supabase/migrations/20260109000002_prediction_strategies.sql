-- =============================================================================
-- PREDICTION STRATEGIES TABLE
-- =============================================================================
-- Pre-defined investment strategies that control prediction thresholds and behavior
-- Created before universes since universes reference strategies
-- Phase 1, Step 2-2 (moved earlier for FK dependency)
-- =============================================================================

CREATE TABLE prediction.strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Strategy identification
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- Risk profile
  risk_level TEXT NOT NULL,  -- 'low', 'medium', 'high'

  -- Threshold configuration
  thresholds JSONB NOT NULL DEFAULT '{
    "min_predictors": 3,
    "min_combined_strength": 15,
    "min_direction_consensus": 0.7,
    "predictor_ttl_hours": 72,
    "signal_ttl_hours": 48,
    "urgent_confidence_threshold": 0.90,
    "notable_confidence_threshold": 0.70,
    "review_confidence_min": 0.40,
    "review_confidence_max": 0.70
  }'::jsonb,

  -- Analyst weight adjustments
  analyst_weights JSONB DEFAULT '{}'::jsonb,

  -- System strategy (cannot be deleted)
  is_system BOOLEAN NOT NULL DEFAULT false,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (risk_level IN ('low', 'medium', 'high'))
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_prediction_strategies_slug ON prediction.strategies(slug);
CREATE INDEX idx_prediction_strategies_risk ON prediction.strategies(risk_level);
CREATE INDEX idx_prediction_strategies_active ON prediction.strategies(is_active) WHERE is_active = true;
CREATE INDEX idx_prediction_strategies_system ON prediction.strategies(is_system) WHERE is_system = true;

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

CREATE TRIGGER set_prediction_strategies_updated_at
  BEFORE UPDATE ON prediction.strategies
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- =============================================================================
-- SEED SYSTEM STRATEGIES
-- =============================================================================

INSERT INTO prediction.strategies (slug, name, description, risk_level, thresholds, is_system) VALUES
(
  'conservative',
  'Conservative',
  'Higher thresholds, fewer but stronger predictions. Suitable for risk-averse investors.',
  'low',
  '{
    "min_predictors": 4,
    "min_combined_strength": 20,
    "min_direction_consensus": 0.80,
    "predictor_ttl_hours": 48,
    "signal_ttl_hours": 36,
    "urgent_confidence_threshold": 0.95,
    "notable_confidence_threshold": 0.80,
    "review_confidence_min": 0.50,
    "review_confidence_max": 0.80
  }'::jsonb,
  true
),
(
  'balanced',
  'Balanced',
  'Default settings balancing prediction frequency with quality.',
  'medium',
  '{
    "min_predictors": 3,
    "min_combined_strength": 15,
    "min_direction_consensus": 0.70,
    "predictor_ttl_hours": 72,
    "signal_ttl_hours": 48,
    "urgent_confidence_threshold": 0.90,
    "notable_confidence_threshold": 0.70,
    "review_confidence_min": 0.40,
    "review_confidence_max": 0.70
  }'::jsonb,
  true
),
(
  'aggressive',
  'Aggressive',
  'Lower thresholds, more predictions. Suitable for active traders.',
  'high',
  '{
    "min_predictors": 2,
    "min_combined_strength": 10,
    "min_direction_consensus": 0.60,
    "predictor_ttl_hours": 96,
    "signal_ttl_hours": 72,
    "urgent_confidence_threshold": 0.85,
    "notable_confidence_threshold": 0.60,
    "review_confidence_min": 0.30,
    "review_confidence_max": 0.60
  }'::jsonb,
  true
),
(
  'contrarian',
  'Contrarian',
  'Fades consensus, looks for overreactions and reversal opportunities.',
  'medium',
  '{
    "min_predictors": 3,
    "min_combined_strength": 12,
    "min_direction_consensus": 0.65,
    "predictor_ttl_hours": 72,
    "signal_ttl_hours": 48,
    "urgent_confidence_threshold": 0.88,
    "notable_confidence_threshold": 0.68,
    "review_confidence_min": 0.35,
    "review_confidence_max": 0.65,
    "contrarian_mode": true
  }'::jsonb,
  true
),
(
  'technical',
  'Technical Focus',
  'Weights technical analysts higher. Focuses on chart patterns and indicators.',
  'medium',
  '{
    "min_predictors": 3,
    "min_combined_strength": 15,
    "min_direction_consensus": 0.70,
    "predictor_ttl_hours": 72,
    "signal_ttl_hours": 48,
    "urgent_confidence_threshold": 0.90,
    "notable_confidence_threshold": 0.70,
    "review_confidence_min": 0.40,
    "review_confidence_max": 0.70
  }'::jsonb,
  true
);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.strategies IS 'Pre-defined investment strategies controlling prediction behavior';
COMMENT ON COLUMN prediction.strategies.slug IS 'URL-friendly unique identifier';
COMMENT ON COLUMN prediction.strategies.risk_level IS 'Risk level: low, medium, high';
COMMENT ON COLUMN prediction.strategies.thresholds IS 'Threshold configuration for prediction generation';
COMMENT ON COLUMN prediction.strategies.analyst_weights IS 'Per-analyst weight adjustments for this strategy';
COMMENT ON COLUMN prediction.strategies.is_system IS 'System strategies cannot be deleted';

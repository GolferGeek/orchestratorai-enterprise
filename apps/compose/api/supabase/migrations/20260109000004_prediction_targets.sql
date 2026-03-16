-- =============================================================================
-- PREDICTION TARGETS TABLE
-- =============================================================================
-- Individual targets within universes (stocks, coins, elections, markets)
-- Phase 1, Step 1-1
-- =============================================================================

CREATE TABLE prediction.targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent universe
  universe_id UUID NOT NULL REFERENCES prediction.universes(id) ON DELETE CASCADE,

  -- Target identification
  symbol TEXT NOT NULL,  -- e.g., 'AAPL', 'BTC-USD', 'presidential-2028'
  name TEXT NOT NULL,
  target_type TEXT NOT NULL,  -- 'stock', 'crypto', 'election', 'polymarket'

  -- LLM prompt context injection
  context TEXT,  -- Additional context about this target for LLM prompts

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,  -- Additional target-specific data

  -- LLM config override (takes precedence over universe config)
  llm_config_override JSONB DEFAULT NULL,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_archived BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(universe_id, symbol)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_prediction_targets_universe ON prediction.targets(universe_id);
CREATE INDEX idx_prediction_targets_symbol ON prediction.targets(symbol);
CREATE INDEX idx_prediction_targets_type ON prediction.targets(target_type);
CREATE INDEX idx_prediction_targets_active ON prediction.targets(is_active) WHERE is_active = true;
CREATE INDEX idx_prediction_targets_created_at ON prediction.targets(created_at DESC);

-- GIN indexes for JSONB queries
CREATE INDEX idx_prediction_targets_metadata ON prediction.targets USING GIN(metadata);
CREATE INDEX idx_prediction_targets_llm_override ON prediction.targets USING GIN(llm_config_override) WHERE llm_config_override IS NOT NULL;

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

CREATE TRIGGER set_prediction_targets_updated_at
  BEFORE UPDATE ON prediction.targets
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- =============================================================================
-- DOMAIN VALIDATION TRIGGER
-- =============================================================================
-- Ensures target_type matches universe.domain

CREATE OR REPLACE FUNCTION prediction.enforce_target_domain_type()
RETURNS TRIGGER AS $$
DECLARE
  universe_domain TEXT;
  expected_type TEXT;
BEGIN
  -- Get universe domain
  SELECT domain INTO universe_domain
  FROM prediction.universes
  WHERE id = NEW.universe_id;

  -- Map domain to expected target_type
  expected_type := CASE universe_domain
    WHEN 'stocks' THEN 'stock'
    WHEN 'crypto' THEN 'crypto'
    WHEN 'elections' THEN 'election'
    WHEN 'polymarket' THEN 'polymarket'
    ELSE NULL
  END;

  -- Validate
  IF NEW.target_type != expected_type THEN
    RAISE EXCEPTION 'target_type "%" does not match universe domain "%" (expected "%")',
      NEW.target_type, universe_domain, expected_type;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_target_domain_type
  BEFORE INSERT OR UPDATE ON prediction.targets
  FOR EACH ROW
  EXECUTE FUNCTION prediction.enforce_target_domain_type();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.targets IS 'Individual prediction targets within universes';
COMMENT ON COLUMN prediction.targets.universe_id IS 'Parent universe ID';
COMMENT ON COLUMN prediction.targets.symbol IS 'Target symbol (AAPL, BTC-USD, etc.)';
COMMENT ON COLUMN prediction.targets.target_type IS 'Target type: stock, crypto, election, polymarket (must match universe.domain)';
COMMENT ON COLUMN prediction.targets.context IS 'Additional LLM context about this target';
COMMENT ON COLUMN prediction.targets.llm_config_override IS 'LLM config override (highest priority)';

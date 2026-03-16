-- =============================================================================
-- ENHANCE PREDICTION.TEST_SCENARIOS TABLE
-- =============================================================================
-- Extends test scenario definitions for the learning loop
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- PRD Section: 15.3.1 Test Scenarios Table
-- NOTE: Altering existing table to add new columns while preserving FKs
-- =============================================================================

-- Add new columns to existing test_scenarios table
-- NOTE: Using org_slug TEXT instead of org_id UUID since organizations uses slug as PK
ALTER TABLE prediction.test_scenarios
  ADD COLUMN IF NOT EXISTS scenario_type TEXT DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS expected_outcome JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS target_symbols TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add constraints if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_test_scenarios_type'
  ) THEN
    ALTER TABLE prediction.test_scenarios
      ADD CONSTRAINT chk_test_scenarios_type CHECK (scenario_type IN (
        'earnings_beat', 'earnings_miss', 'macro_shock', 'mixed_news',
        'ambiguous_language', 'entity_collision', 'noisy_irrelevant',
        'price_only', 'multi_target', 'scheduled_ingestion',
        'leakage_attempt', 'promotion_happy', 'promotion_rejection',
        'mirror_creation', 'custom'
      ));
  END IF;
END $$;

-- =============================================================================
-- INDEXES (create if not exist)
-- =============================================================================

-- org index already exists as idx_test_scenarios_org on organization_slug
CREATE INDEX IF NOT EXISTS idx_test_scenarios_status ON prediction.test_scenarios(status);
CREATE INDEX IF NOT EXISTS idx_test_scenarios_type ON prediction.test_scenarios(scenario_type);
CREATE INDEX IF NOT EXISTS idx_test_scenarios_created_at ON prediction.test_scenarios(created_at DESC);

-- GIN indexes for array columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_test_scenarios_tags') THEN
    CREATE INDEX idx_test_scenarios_tags ON prediction.test_scenarios USING GIN(tags);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_test_scenarios_target_symbols') THEN
    CREATE INDEX idx_test_scenarios_target_symbols ON prediction.test_scenarios USING GIN(target_symbols);
  END IF;
END $$;

-- =============================================================================
-- TRIGGER FOR UPDATED_AT
-- =============================================================================

CREATE OR REPLACE FUNCTION prediction.set_test_scenarios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_test_scenarios_updated_at ON prediction.test_scenarios;
CREATE TRIGGER set_test_scenarios_updated_at
  BEFORE UPDATE ON prediction.test_scenarios
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_test_scenarios_updated_at();

-- =============================================================================
-- VALIDATION FUNCTION FOR T_ PREFIX
-- =============================================================================

CREATE OR REPLACE FUNCTION prediction.validate_test_target_symbols()
RETURNS TRIGGER AS $$
BEGIN
  -- Check that all target_symbols start with T_ (only if array is not empty)
  IF array_length(NEW.target_symbols, 1) > 0 AND EXISTS (
    SELECT 1 FROM unnest(NEW.target_symbols) AS symbol
    WHERE symbol NOT LIKE 'T_%'
  ) THEN
    RAISE EXCEPTION 'All target_symbols must start with T_ prefix (INV-08)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_test_target_symbols ON prediction.test_scenarios;
CREATE TRIGGER trg_validate_test_target_symbols
  BEFORE INSERT OR UPDATE ON prediction.test_scenarios
  FOR EACH ROW
  EXECUTE FUNCTION prediction.validate_test_target_symbols();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.test_scenarios IS 'Test scenario definitions for the learning loop';
COMMENT ON COLUMN prediction.test_scenarios.scenario_type IS 'Type of scenario: earnings_beat, earnings_miss, macro_shock, etc.';
COMMENT ON COLUMN prediction.test_scenarios.expected_outcome IS 'Expected signals, predictors, and predictions as JSONB';
COMMENT ON COLUMN prediction.test_scenarios.target_symbols IS 'Array of target symbols (must all start with T_)';
COMMENT ON COLUMN prediction.test_scenarios.status IS 'Workflow status: draft, ready, archived';

-- =============================================================================
-- ADD SCENARIOS TABLE
-- =============================================================================
-- Feature 9: Scenario Analysis
-- Stores "what-if" scenarios for risk modeling
-- =============================================================================

-- Create scenarios table for what-if analysis
CREATE TABLE IF NOT EXISTS risk.scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES risk.scopes(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  adjustments JSONB NOT NULL DEFAULT '{}'::jsonb, -- {dimension_slug: adjustment_value}
  baseline_snapshot JSONB DEFAULT '{}'::jsonb, -- Captured baseline data
  results JSONB DEFAULT '{}'::jsonb, -- Calculated results after adjustments
  is_template BOOLEAN DEFAULT FALSE, -- Can be reused as template
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_risk_scenarios_scope ON risk.scenarios(scope_id);
CREATE INDEX IF NOT EXISTS idx_risk_scenarios_template ON risk.scenarios(is_template) WHERE is_template = TRUE;
CREATE INDEX IF NOT EXISTS idx_risk_scenarios_created ON risk.scenarios(created_at DESC);

-- Add comments
COMMENT ON TABLE risk.scenarios IS 'What-if scenarios for risk stress testing and analysis';
COMMENT ON COLUMN risk.scenarios.adjustments IS 'Dimension adjustments: {dimension_slug: adjustment_value (-1.0 to +1.0)}';
COMMENT ON COLUMN risk.scenarios.baseline_snapshot IS 'Captured baseline risk state before adjustments';
COMMENT ON COLUMN risk.scenarios.results IS 'Calculated results after applying adjustments';
COMMENT ON COLUMN risk.scenarios.is_template IS 'If true, this scenario can be reused as a template';

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION risk.update_scenarios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_scenarios_updated_at
  BEFORE UPDATE ON risk.scenarios
  FOR EACH ROW
  EXECUTE FUNCTION risk.update_scenarios_updated_at();

-- Grant permissions
GRANT ALL ON risk.scenarios TO service_role;

-- =============================================================================
-- SCENARIO TEMPLATES - Pre-built stress test scenarios
-- =============================================================================

-- Insert common scenario templates that can be used across scopes
-- Note: These are scope-agnostic templates, will be copied when used

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Scenarios Table Migration Complete';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Created: risk.scenarios table';
  RAISE NOTICE '================================================';
END $$;

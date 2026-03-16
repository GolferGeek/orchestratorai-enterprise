-- =============================================================================
-- CREATE PREDICTION.LEARNING_LINEAGE TABLE
-- =============================================================================
-- Tracks the promotion of test learnings to production
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- PRD Section: 12.4 Learning Lineage
-- INV-09: Promoted learning becomes is_test=false; original preserved
-- =============================================================================

CREATE TABLE prediction.learning_lineage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization scope (uses slug as PK, not UUID)
  organization_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,

  -- Original test learning (preserved, is_test=true)
  test_learning_id UUID NOT NULL REFERENCES prediction.learnings(id) ON DELETE RESTRICT,

  -- Promoted production learning (new record, is_test=false)
  production_learning_id UUID NOT NULL REFERENCES prediction.learnings(id) ON DELETE RESTRICT,

  -- Scenario runs where this learning was validated
  scenario_runs UUID[] DEFAULT '{}',

  -- Validation metrics at promotion time
  validation_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: { "times_applied": 50, "times_helpful": 45, "success_rate": 0.90 }

  -- Backtest results
  backtest_result JSONB DEFAULT NULL,
  -- Example: { "pass": true, "improvement_score": 0.15, "window_days": 30 }

  -- Promotion metadata
  promoted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  promoted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_learning_lineage_different CHECK (test_learning_id != production_learning_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_learning_lineage_org ON prediction.learning_lineage(organization_slug);
CREATE INDEX idx_learning_lineage_test_learning ON prediction.learning_lineage(test_learning_id);
CREATE INDEX idx_learning_lineage_production_learning ON prediction.learning_lineage(production_learning_id);
CREATE INDEX idx_learning_lineage_promoted_by ON prediction.learning_lineage(promoted_by);
CREATE INDEX idx_learning_lineage_promoted_at ON prediction.learning_lineage(promoted_at DESC);
CREATE INDEX idx_learning_lineage_scenario_runs ON prediction.learning_lineage USING GIN(scenario_runs);

-- =============================================================================
-- VALIDATION TRIGGER
-- =============================================================================
-- Ensure test_learning has is_test=true and production_learning has is_test=false

CREATE OR REPLACE FUNCTION prediction.validate_learning_lineage()
RETURNS TRIGGER AS $$
DECLARE
  test_is_test BOOLEAN;
  prod_is_test BOOLEAN;
BEGIN
  -- Check test learning is_test flag
  SELECT is_test INTO test_is_test
  FROM prediction.learnings
  WHERE id = NEW.test_learning_id;

  -- Check production learning is_test flag
  SELECT is_test INTO prod_is_test
  FROM prediction.learnings
  WHERE id = NEW.production_learning_id;

  -- Validate test learning has is_test=true
  IF test_is_test != true THEN
    RAISE EXCEPTION 'INV-09 Violation: test_learning_id must reference a learning with is_test=true. Learning ID: %, is_test: %',
      NEW.test_learning_id, test_is_test;
  END IF;

  -- Validate production learning has is_test=false
  IF prod_is_test != false THEN
    RAISE EXCEPTION 'INV-09 Violation: production_learning_id must reference a learning with is_test=false. Learning ID: %, is_test: %',
      NEW.production_learning_id, prod_is_test;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_learning_lineage
  BEFORE INSERT OR UPDATE ON prediction.learning_lineage
  FOR EACH ROW
  EXECUTE FUNCTION prediction.validate_learning_lineage();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.learning_lineage IS 'Tracks promotion of test learnings to production (INV-09)';
COMMENT ON COLUMN prediction.learning_lineage.test_learning_id IS 'Original test learning (preserved, is_test=true)';
COMMENT ON COLUMN prediction.learning_lineage.production_learning_id IS 'Promoted production learning (is_test=false)';
COMMENT ON COLUMN prediction.learning_lineage.scenario_runs IS 'Array of scenario_run IDs where learning was validated';
COMMENT ON COLUMN prediction.learning_lineage.validation_metrics IS 'Metrics at promotion: times_applied, times_helpful, success_rate';
COMMENT ON COLUMN prediction.learning_lineage.backtest_result IS 'Backtest pass/fail and improvement score';
COMMENT ON COLUMN prediction.learning_lineage.promoted_by IS 'User who approved the promotion (human review required)';
COMMENT ON COLUMN prediction.learning_lineage.notes IS 'Reviewer notes explaining the promotion decision';

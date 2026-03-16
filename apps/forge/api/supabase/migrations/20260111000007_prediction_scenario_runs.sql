-- =============================================================================
-- CREATE PREDICTION.SCENARIO_RUNS TABLE
-- =============================================================================
-- Tracks execution of test scenarios
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- PRD Section: 12.2 Scenario Runs Table
-- =============================================================================

CREATE TABLE prediction.scenario_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization scope (uses slug as PK, not UUID)
  organization_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,

  -- Link to scenario
  scenario_id UUID NOT NULL REFERENCES prediction.test_scenarios(id) ON DELETE CASCADE,

  -- Execution status
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Who triggered the run
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Version tracking (INV-10: Scenario runs MUST record full version info)
  version_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: { "code_version": "abc123", "model_versions": { "signal_detector": "v1.2" } }

  -- Outcome comparison
  outcome_expected JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Copied from scenario at run time
  outcome_actual JSONB DEFAULT NULL,  -- Actual signals/predictors/predictions generated
  outcome_match BOOLEAN DEFAULT NULL,  -- Whether actual matched expected

  -- Error handling
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_scenario_runs_status CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  CONSTRAINT chk_scenario_runs_completed CHECK (
    (status IN ('completed', 'failed') AND completed_at IS NOT NULL) OR
    (status NOT IN ('completed', 'failed'))
  )
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_scenario_runs_org ON prediction.scenario_runs(organization_slug);
CREATE INDEX idx_scenario_runs_scenario ON prediction.scenario_runs(scenario_id);
CREATE INDEX idx_scenario_runs_status ON prediction.scenario_runs(status);
CREATE INDEX idx_scenario_runs_triggered_by ON prediction.scenario_runs(triggered_by) WHERE triggered_by IS NOT NULL;
CREATE INDEX idx_scenario_runs_created_at ON prediction.scenario_runs(created_at DESC);
CREATE INDEX idx_scenario_runs_outcome_match ON prediction.scenario_runs(outcome_match) WHERE outcome_match IS NOT NULL;

-- =============================================================================
-- ADD FK CONSTRAINTS TO OTHER TABLES
-- =============================================================================
-- Now that scenario_runs exists, add FK constraints to signals, predictors, predictions

ALTER TABLE prediction.signals
  ADD CONSTRAINT fk_signals_scenario_run
  FOREIGN KEY (scenario_run_id) REFERENCES prediction.scenario_runs(id) ON DELETE SET NULL;

ALTER TABLE prediction.predictors
  ADD CONSTRAINT fk_predictors_scenario_run
  FOREIGN KEY (scenario_run_id) REFERENCES prediction.scenario_runs(id) ON DELETE SET NULL;

ALTER TABLE prediction.predictions
  ADD CONSTRAINT fk_predictions_scenario_run
  FOREIGN KEY (scenario_run_id) REFERENCES prediction.scenario_runs(id) ON DELETE SET NULL;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.scenario_runs IS 'Execution records for test scenarios';
COMMENT ON COLUMN prediction.scenario_runs.status IS 'Execution status: pending, running, completed, failed';
COMMENT ON COLUMN prediction.scenario_runs.version_info IS 'Code and model versions used during this run (INV-10)';
COMMENT ON COLUMN prediction.scenario_runs.outcome_expected IS 'Expected outcome copied from scenario at run time';
COMMENT ON COLUMN prediction.scenario_runs.outcome_actual IS 'Actual signals/predictors/predictions generated';
COMMENT ON COLUMN prediction.scenario_runs.outcome_match IS 'Whether actual matched expected outcome';

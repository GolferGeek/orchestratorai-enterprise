-- =============================================================================
-- ADD TEST DATA TRACKING TO PREDICTIONS TABLE
-- =============================================================================
-- Adds is_test flag and scenario_run_id to predictions table
-- Purpose: Support test data generation and scenario-based testing
-- - is_test: Marks predictions as test data (excluded from production analytics)
-- - scenario_run_id: Links predictions to scenario test runs (nullable FK added later)
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- =============================================================================

-- =============================================================================
-- ADD IS_TEST COLUMN
-- =============================================================================
-- Flag to identify test predictions for isolation from production data

ALTER TABLE prediction.predictions
  ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN prediction.predictions.is_test IS
  'Flag indicating this is test data, excluded from production analytics';

-- =============================================================================
-- ADD SCENARIO_RUN_ID COLUMN
-- =============================================================================
-- Links predictions to test scenario runs (nullable, FK will be added later)

ALTER TABLE prediction.predictions
  ADD COLUMN scenario_run_id UUID;

COMMENT ON COLUMN prediction.predictions.scenario_run_id IS
  'Links to test scenario run (prediction.scenario_runs), nullable until FK added';

-- =============================================================================
-- ADD INDEXES
-- =============================================================================
-- Index for filtering test vs production predictions

CREATE INDEX idx_prediction_predictions_is_test
  ON prediction.predictions(is_test);

-- Composite index for scenario run queries
CREATE INDEX idx_prediction_predictions_scenario_run
  ON prediction.predictions(scenario_run_id)
  WHERE scenario_run_id IS NOT NULL;

-- Composite index for production predictions (most common query)
CREATE INDEX idx_prediction_predictions_production_active
  ON prediction.predictions(target_id, status, expires_at)
  WHERE is_test = false AND status = 'active';

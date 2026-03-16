-- =====================================================================================
-- PREDICTION SYSTEM - ADD TEST DATA SUPPORT TO PREDICTORS
-- =====================================================================================
-- Description: Adds is_test flag and scenario_run_id to predictors table for test-based learning
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- Dependencies: prediction.predictors table
-- =====================================================================================

-- =====================================================================================
-- ADD COLUMNS TO PREDICTORS TABLE
-- =====================================================================================
-- Purpose: Support test data injection and scenario-based testing for learning loop
-- is_test: Flag to distinguish test/synthetic data from production data
-- scenario_run_id: Links predictors to specific test scenario runs (FK added later)
-- =====================================================================================

-- Add is_test column
ALTER TABLE prediction.predictors
  ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_run_id column (nullable, FK to be added when scenario_runs table is created)
ALTER TABLE prediction.predictors
  ADD COLUMN scenario_run_id UUID;

-- =====================================================================================
-- INDEXES
-- =====================================================================================
-- Purpose: Optimize queries filtering by test data and scenario runs
-- =====================================================================================

-- Index for filtering test vs production data
CREATE INDEX idx_prediction_predictors_is_test
  ON prediction.predictors(is_test);

-- Index for scenario-based queries
CREATE INDEX idx_prediction_predictors_scenario_run
  ON prediction.predictors(scenario_run_id)
  WHERE scenario_run_id IS NOT NULL;

-- Composite index for test data within scenarios
CREATE INDEX idx_prediction_predictors_scenario_test
  ON prediction.predictors(scenario_run_id, is_test)
  WHERE scenario_run_id IS NOT NULL;

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

COMMENT ON COLUMN prediction.predictors.is_test IS 'Flag to distinguish test/synthetic data from production data';
COMMENT ON COLUMN prediction.predictors.scenario_run_id IS 'Links to specific test scenario run (FK to prediction.scenario_runs, added later)';

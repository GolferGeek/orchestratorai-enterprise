-- =====================================================================================
-- PREDICTION SYSTEM - TEST DATA FRAMEWORK: ADD IS_TEST TO SIGNALS
-- =====================================================================================
-- Description: Adds is_test and scenario_run_id columns to prediction.signals table
--              to support test data injection and scenario testing framework
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- Dependencies: prediction.signals table
-- =====================================================================================

-- =====================================================================================
-- ADD COLUMNS TO SIGNALS TABLE
-- =====================================================================================

-- Add is_test column: identifies test/synthetic signals vs production signals
ALTER TABLE prediction.signals
  ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_run_id column: links test signals to specific test scenario runs
-- Nullable for now - will add FK constraint when prediction.scenario_runs table exists
ALTER TABLE prediction.signals
  ADD COLUMN scenario_run_id UUID;

-- =====================================================================================
-- INDEXES
-- =====================================================================================

-- Index for filtering test vs production signals
CREATE INDEX idx_prediction_signals_is_test
  ON prediction.signals(is_test);

-- Index for querying signals by scenario run (partial index for test signals only)
CREATE INDEX idx_prediction_signals_scenario_run
  ON prediction.signals(scenario_run_id)
  WHERE scenario_run_id IS NOT NULL;

-- Composite index for test signal queries (target + test status)
CREATE INDEX idx_prediction_signals_test_target
  ON prediction.signals(target_id, is_test, detected_at DESC)
  WHERE is_test = true;

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

COMMENT ON COLUMN prediction.signals.is_test IS 'True for test/synthetic signals, false for production signals';
COMMENT ON COLUMN prediction.signals.scenario_run_id IS 'Links test signals to specific scenario runs (FK to prediction.scenario_runs - will be added when that table exists)';

-- =============================================================================
-- ADD IS_TEST COLUMN TO REMAINING PREDICTION TABLES
-- =============================================================================
-- Adds is_test flag to: evaluations, learnings, learning_queue,
-- missed_opportunities, target_snapshots
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- =============================================================================

-- =============================================================================
-- EVALUATIONS TABLE
-- =============================================================================

ALTER TABLE prediction.evaluations
  ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_prediction_evaluations_is_test
  ON prediction.evaluations(is_test);

COMMENT ON COLUMN prediction.evaluations.is_test IS
  'Flag indicating whether this evaluation is from test data';

-- =============================================================================
-- LEARNINGS TABLE
-- =============================================================================

ALTER TABLE prediction.learnings
  ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_prediction_learnings_is_test
  ON prediction.learnings(is_test);

COMMENT ON COLUMN prediction.learnings.is_test IS
  'Flag indicating whether this learning originated from test data (requires promotion to become production)';

-- =============================================================================
-- LEARNING_QUEUE TABLE
-- =============================================================================

ALTER TABLE prediction.learning_queue
  ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_prediction_learning_queue_is_test
  ON prediction.learning_queue(is_test);

COMMENT ON COLUMN prediction.learning_queue.is_test IS
  'Flag indicating whether this learning suggestion is from test data';

-- =============================================================================
-- MISSED_OPPORTUNITIES TABLE
-- =============================================================================

ALTER TABLE prediction.missed_opportunities
  ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_prediction_missed_opportunities_is_test
  ON prediction.missed_opportunities(is_test);

COMMENT ON COLUMN prediction.missed_opportunities.is_test IS
  'Flag indicating whether this missed opportunity is from test scenario';

-- =============================================================================
-- TARGET_SNAPSHOTS TABLE
-- =============================================================================

ALTER TABLE prediction.target_snapshots
  ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_prediction_target_snapshots_is_test
  ON prediction.target_snapshots(is_test);

COMMENT ON COLUMN prediction.target_snapshots.is_test IS
  'Flag indicating whether this snapshot is from test data';

-- =============================================================================
-- PRODUCTION-SAFE PARTIAL INDEXES (EXCLUDE is_test=true)
-- =============================================================================
-- Optimizes production queries by creating indexes that exclude test data
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- PRD Section: 13.3 Index Optimization
-- =============================================================================

-- =============================================================================
-- SIGNALS PRODUCTION INDEX
-- =============================================================================
-- Optimizes queries filtering for production signals (is_test=false)

CREATE INDEX idx_signals_production
  ON prediction.signals(target_id, detected_at DESC)
  WHERE is_test = false;

CREATE INDEX idx_signals_production_source
  ON prediction.signals(source_id, detected_at DESC)
  WHERE is_test = false;

-- =============================================================================
-- PREDICTORS PRODUCTION INDEX
-- =============================================================================
-- Optimizes queries filtering for production predictors (is_test=false)

CREATE INDEX idx_predictors_production
  ON prediction.predictors(target_id, created_at DESC)
  WHERE is_test = false;

CREATE INDEX idx_predictors_production_signal
  ON prediction.predictors(signal_id, created_at DESC)
  WHERE is_test = false;

-- =============================================================================
-- PREDICTIONS PRODUCTION INDEX
-- =============================================================================
-- Optimizes queries filtering for production predictions (is_test=false)

CREATE INDEX idx_predictions_production
  ON prediction.predictions(target_id, created_at DESC)
  WHERE is_test = false;

CREATE INDEX idx_predictions_production_active
  ON prediction.predictions(target_id, expires_at)
  WHERE is_test = false AND status = 'active';

-- =============================================================================
-- EVALUATIONS PRODUCTION INDEX
-- =============================================================================
-- Optimizes queries for production evaluations (is_test=false)

CREATE INDEX idx_evaluations_production
  ON prediction.evaluations(prediction_id, created_at DESC)
  WHERE is_test = false;

-- =============================================================================
-- LEARNINGS PRODUCTION INDEX
-- =============================================================================
-- Optimizes queries for production learnings (is_test=false)

CREATE INDEX idx_learnings_production
  ON prediction.learnings(scope_level, status, created_at DESC)
  WHERE is_test = false;

CREATE INDEX idx_learnings_production_active
  ON prediction.learnings(scope_level, domain, universe_id)
  WHERE is_test = false AND status = 'active';

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON INDEX prediction.idx_signals_production IS 'Production signals only (excludes test data)';
COMMENT ON INDEX prediction.idx_predictors_production IS 'Production predictors only (excludes test data)';
COMMENT ON INDEX prediction.idx_predictions_production IS 'Production predictions only (excludes test data)';
COMMENT ON INDEX prediction.idx_evaluations_production IS 'Production evaluations only (excludes test data)';
COMMENT ON INDEX prediction.idx_learnings_production IS 'Production learnings only (excludes test data)';

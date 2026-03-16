-- =============================================================================
-- PREDICTIONS AND SNAPSHOTS TABLES
-- =============================================================================
-- Predictions: Final predictions generated from predictors
-- Snapshots: Full state capture for explainability
-- Phase 1, Step 1-3
-- =============================================================================

-- =============================================================================
-- PREDICTIONS TABLE
-- =============================================================================

CREATE TABLE prediction.predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target
  target_id UUID NOT NULL REFERENCES prediction.targets(id) ON DELETE CASCADE,

  -- ExecutionContext correlation
  task_id UUID,  -- From ExecutionContext for observability

  -- Prediction content
  direction TEXT NOT NULL,  -- 'up', 'down', 'flat' (outcome vocabulary)
  confidence NUMERIC(3,2) NOT NULL,  -- 0.00-1.00
  magnitude TEXT,  -- 'small', 'medium', 'large' for price moves
  reasoning TEXT NOT NULL,

  -- Timeframe
  timeframe_hours INTEGER NOT NULL,  -- Prediction horizon
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Price context (for stocks/crypto)
  entry_price NUMERIC(20,8),
  target_price NUMERIC(20,8),
  stop_loss NUMERIC(20,8),

  -- Ensemble results
  analyst_ensemble JSONB NOT NULL,  -- All analyst assessments
  llm_ensemble JSONB NOT NULL,  -- All LLM tier results

  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'resolved', 'expired', 'cancelled'

  -- Outcome (set when resolved)
  outcome_value NUMERIC(20,8),  -- Actual price/value at resolution
  outcome_captured_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (confidence >= 0.00 AND confidence <= 1.00),
  CHECK (status IN ('active', 'resolved', 'expired', 'cancelled')),
  CHECK (magnitude IS NULL OR magnitude IN ('small', 'medium', 'large'))
);

-- =============================================================================
-- PREDICTIONS INDEXES
-- =============================================================================

CREATE INDEX idx_prediction_predictions_target ON prediction.predictions(target_id);
CREATE INDEX idx_prediction_predictions_task ON prediction.predictions(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_prediction_predictions_status ON prediction.predictions(status);
CREATE INDEX idx_prediction_predictions_direction ON prediction.predictions(direction);
CREATE INDEX idx_prediction_predictions_predicted_at ON prediction.predictions(predicted_at DESC);
CREATE INDEX idx_prediction_predictions_expires_at ON prediction.predictions(expires_at);
CREATE INDEX idx_prediction_predictions_created_at ON prediction.predictions(created_at DESC);

-- Index for active predictions
CREATE INDEX idx_prediction_predictions_active ON prediction.predictions(target_id, status, expires_at)
  WHERE status = 'active';

-- GIN indexes for JSONB queries
CREATE INDEX idx_prediction_predictions_analyst_ensemble ON prediction.predictions USING GIN(analyst_ensemble);
CREATE INDEX idx_prediction_predictions_llm_ensemble ON prediction.predictions USING GIN(llm_ensemble);

-- =============================================================================
-- PREDICTIONS UPDATED_AT TRIGGER
-- =============================================================================

CREATE TRIGGER set_prediction_predictions_updated_at
  BEFORE UPDATE ON prediction.predictions
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- =============================================================================
-- PREDICTION DIRECTION VALIDATION TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION prediction.enforce_prediction_direction()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT prediction.validate_prediction_direction(NEW.direction, NEW.target_id) THEN
    RAISE EXCEPTION 'Invalid prediction direction "%" for target domain', NEW.direction;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_prediction_direction
  BEFORE INSERT OR UPDATE ON prediction.predictions
  FOR EACH ROW
  EXECUTE FUNCTION prediction.enforce_prediction_direction();

-- =============================================================================
-- PREDICTION STATUS TRANSITION VALIDATION
-- =============================================================================

CREATE OR REPLACE FUNCTION prediction.validate_prediction_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate if status is changing
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Valid transitions
  IF OLD.status = 'active' AND NEW.status IN ('resolved', 'expired', 'cancelled') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid prediction status transition from "%" to "%"', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prediction_status_transition
  BEFORE UPDATE ON prediction.predictions
  FOR EACH ROW
  EXECUTE FUNCTION prediction.validate_prediction_status_transition();

-- =============================================================================
-- ADD FK FROM PREDICTORS TO PREDICTIONS
-- =============================================================================

ALTER TABLE prediction.predictors
  ADD CONSTRAINT fk_predictors_consumed_prediction
  FOREIGN KEY (consumed_by_prediction_id) REFERENCES prediction.predictions(id) ON DELETE SET NULL;

-- =============================================================================
-- SNAPSHOTS TABLE
-- =============================================================================

CREATE TABLE prediction.snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent prediction
  prediction_id UUID NOT NULL REFERENCES prediction.predictions(id) ON DELETE CASCADE,

  -- Full state capture for explainability
  predictors JSONB NOT NULL,  -- All predictors that contributed
  rejected_signals JSONB DEFAULT '[]'::jsonb,  -- Signals considered but rejected (and why)
  analyst_predictions JSONB NOT NULL,  -- Each analyst's individual assessment
  llm_ensemble JSONB NOT NULL,  -- Each LLM tier's assessment
  learnings_applied JSONB DEFAULT '[]'::jsonb,  -- Learnings that were applied
  threshold_evaluation JSONB NOT NULL,  -- Threshold evaluation details

  -- Timeline
  timeline JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Complete timeline of events

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- SNAPSHOTS INDEXES
-- =============================================================================

CREATE INDEX idx_prediction_snapshots_prediction ON prediction.snapshots(prediction_id);
CREATE INDEX idx_prediction_snapshots_created_at ON prediction.snapshots(created_at DESC);

-- GIN indexes for JSONB queries
CREATE INDEX idx_prediction_snapshots_predictors ON prediction.snapshots USING GIN(predictors);
CREATE INDEX idx_prediction_snapshots_analyst ON prediction.snapshots USING GIN(analyst_predictions);
CREATE INDEX idx_prediction_snapshots_llm ON prediction.snapshots USING GIN(llm_ensemble);
CREATE INDEX idx_prediction_snapshots_learnings ON prediction.snapshots USING GIN(learnings_applied);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.predictions IS 'Final predictions generated from predictor ensemble';
COMMENT ON COLUMN prediction.predictions.task_id IS 'ExecutionContext task ID for observability';
COMMENT ON COLUMN prediction.predictions.direction IS 'Outcome: up, down, flat (stocks/crypto) or yes, no, uncertain (elections)';
COMMENT ON COLUMN prediction.predictions.analyst_ensemble IS 'All analyst assessments';
COMMENT ON COLUMN prediction.predictions.llm_ensemble IS 'All LLM tier results';
COMMENT ON COLUMN prediction.predictions.status IS 'Lifecycle: active, resolved, expired, cancelled';

COMMENT ON TABLE prediction.snapshots IS 'Full state capture for prediction explainability';
COMMENT ON COLUMN prediction.snapshots.predictors IS 'All predictors that contributed to this prediction';
COMMENT ON COLUMN prediction.snapshots.rejected_signals IS 'Signals considered but rejected (with reasons)';
COMMENT ON COLUMN prediction.snapshots.analyst_predictions IS 'Each analyst individual assessment';
COMMENT ON COLUMN prediction.snapshots.llm_ensemble IS 'Each LLM tier assessment';
COMMENT ON COLUMN prediction.snapshots.learnings_applied IS 'Learnings that influenced this prediction';
COMMENT ON COLUMN prediction.snapshots.threshold_evaluation IS 'Details of threshold evaluation';
COMMENT ON COLUMN prediction.snapshots.timeline IS 'Complete timeline of prediction generation';

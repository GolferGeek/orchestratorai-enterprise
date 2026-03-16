-- =============================================================================
-- PREDICTION SIGNALS AND PREDICTORS TABLES
-- =============================================================================
-- Signals: Raw signals from sources before evaluation
-- Predictors: Evaluated signals that may contribute to predictions
-- Phase 1, Step 1-2
-- =============================================================================

-- =============================================================================
-- SIGNALS TABLE
-- =============================================================================

CREATE TABLE prediction.signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target and source
  target_id UUID NOT NULL REFERENCES prediction.targets(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES prediction.sources(id) ON DELETE CASCADE,

  -- Signal content
  content TEXT NOT NULL,
  direction TEXT NOT NULL,  -- 'bullish', 'bearish', 'neutral' (sentiment vocabulary)

  -- Signal metadata
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Processing state
  disposition TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'predictor_created', 'rejected', 'review_pending', 'expired'
  urgency TEXT,  -- 'urgent' (>=0.90), 'notable' (>=0.70), 'routine' (<0.70), set after evaluation

  -- Race condition handling
  processing_worker UUID,  -- Worker ID claiming this signal
  processing_started_at TIMESTAMPTZ,

  -- Evaluation results (set after analyst evaluation)
  evaluation_result JSONB,  -- { "confidence": 0.85, "analyst_slug": "...", "reasoning": "..." }

  -- Review queue (for HITL)
  review_queue_id UUID,  -- FK to review_queue (added later)

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expired_at TIMESTAMPTZ,

  -- Constraints
  CHECK (disposition IN ('pending', 'processing', 'predictor_created', 'rejected', 'review_pending', 'expired')),
  CHECK (urgency IS NULL OR urgency IN ('urgent', 'notable', 'routine'))
);

-- =============================================================================
-- SIGNALS INDEXES
-- =============================================================================

CREATE INDEX idx_prediction_signals_target ON prediction.signals(target_id);
CREATE INDEX idx_prediction_signals_source ON prediction.signals(source_id);
CREATE INDEX idx_prediction_signals_disposition ON prediction.signals(disposition);
CREATE INDEX idx_prediction_signals_urgency ON prediction.signals(urgency) WHERE urgency IS NOT NULL;
CREATE INDEX idx_prediction_signals_detected_at ON prediction.signals(detected_at DESC);
CREATE INDEX idx_prediction_signals_direction ON prediction.signals(direction);

-- Index for batch processing (claim pending signals)
CREATE INDEX idx_prediction_signals_pending ON prediction.signals(target_id, disposition, detected_at)
  WHERE disposition = 'pending';

-- Index for worker processing
CREATE INDEX idx_prediction_signals_worker ON prediction.signals(processing_worker)
  WHERE processing_worker IS NOT NULL;

-- GIN indexes for JSONB queries
CREATE INDEX idx_prediction_signals_metadata ON prediction.signals USING GIN(metadata);
CREATE INDEX idx_prediction_signals_evaluation ON prediction.signals USING GIN(evaluation_result) WHERE evaluation_result IS NOT NULL;

-- =============================================================================
-- SIGNALS UPDATED_AT TRIGGER
-- =============================================================================

CREATE TRIGGER set_prediction_signals_updated_at
  BEFORE UPDATE ON prediction.signals
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- =============================================================================
-- PREDICTORS TABLE
-- =============================================================================

CREATE TABLE prediction.predictors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source signal and target
  signal_id UUID NOT NULL REFERENCES prediction.signals(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES prediction.targets(id) ON DELETE CASCADE,

  -- Predictor content
  direction TEXT NOT NULL,  -- 'bullish', 'bearish', 'neutral' (sentiment vocabulary)
  strength INTEGER NOT NULL,  -- 1-10
  confidence NUMERIC(3,2) NOT NULL,  -- 0.00-1.00
  reasoning TEXT NOT NULL,

  -- Analyst assessment
  analyst_slug TEXT NOT NULL,  -- Which analyst evaluated this
  analyst_assessment JSONB NOT NULL,  -- Full assessment details

  -- LLM metadata
  llm_usage_id UUID,  -- FK to public.llm_usage for cost tracking

  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'consumed', 'expired', 'invalidated'
  consumed_at TIMESTAMPTZ,  -- When used in a prediction
  consumed_by_prediction_id UUID,  -- FK to predictions (added later)

  -- TTL
  expires_at TIMESTAMPTZ NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (strength >= 1 AND strength <= 10),
  CHECK (confidence >= 0.00 AND confidence <= 1.00),
  CHECK (status IN ('active', 'consumed', 'expired', 'invalidated')),
  CHECK (
    (status != 'consumed') OR
    (consumed_at IS NOT NULL AND consumed_by_prediction_id IS NOT NULL)
  )
);

-- =============================================================================
-- PREDICTORS INDEXES
-- =============================================================================

CREATE INDEX idx_prediction_predictors_signal ON prediction.predictors(signal_id);
CREATE INDEX idx_prediction_predictors_target ON prediction.predictors(target_id);
CREATE INDEX idx_prediction_predictors_direction ON prediction.predictors(direction);
CREATE INDEX idx_prediction_predictors_status ON prediction.predictors(status);
CREATE INDEX idx_prediction_predictors_analyst ON prediction.predictors(analyst_slug);
CREATE INDEX idx_prediction_predictors_llm_usage ON prediction.predictors(llm_usage_id) WHERE llm_usage_id IS NOT NULL;
CREATE INDEX idx_prediction_predictors_created_at ON prediction.predictors(created_at DESC);
CREATE INDEX idx_prediction_predictors_expires_at ON prediction.predictors(expires_at);

-- Index for active predictors lookup
CREATE INDEX idx_prediction_predictors_active ON prediction.predictors(target_id, status, expires_at)
  WHERE status = 'active';

-- GIN index for JSONB queries
CREATE INDEX idx_prediction_predictors_assessment ON prediction.predictors USING GIN(analyst_assessment);

-- =============================================================================
-- PREDICTORS UPDATED_AT TRIGGER
-- =============================================================================

CREATE TRIGGER set_prediction_predictors_updated_at
  BEFORE UPDATE ON prediction.predictors
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.signals IS 'Raw signals from sources awaiting evaluation';
COMMENT ON COLUMN prediction.signals.direction IS 'Sentiment: bullish, bearish, neutral';
COMMENT ON COLUMN prediction.signals.disposition IS 'Processing state';
COMMENT ON COLUMN prediction.signals.urgency IS 'Urgency level after evaluation';
COMMENT ON COLUMN prediction.signals.processing_worker IS 'Worker ID for race condition handling';
COMMENT ON COLUMN prediction.signals.evaluation_result IS 'Analyst evaluation results';

COMMENT ON TABLE prediction.predictors IS 'Evaluated signals that may contribute to predictions';
COMMENT ON COLUMN prediction.predictors.direction IS 'Sentiment: bullish, bearish, neutral';
COMMENT ON COLUMN prediction.predictors.strength IS 'Strength 1-10';
COMMENT ON COLUMN prediction.predictors.analyst_assessment IS 'Full analyst evaluation details';
COMMENT ON COLUMN prediction.predictors.llm_usage_id IS 'FK to public.llm_usage for cost tracking';
COMMENT ON COLUMN prediction.predictors.status IS 'Lifecycle: active, consumed, expired, invalidated';

-- =============================================================================
-- EVALUATIONS AND MISSED OPPORTUNITIES TABLES
-- =============================================================================
-- Evaluations: Prediction outcome analysis
-- Missed Opportunities: Significant moves without predictions
-- Target Snapshots: Price history for miss detection
-- Tool Requests: Source wishlist from analysis
-- Phase 1, Step 1-4
-- =============================================================================

-- =============================================================================
-- EVALUATIONS TABLE
-- =============================================================================

CREATE TABLE prediction.evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent prediction
  prediction_id UUID NOT NULL REFERENCES prediction.predictions(id) ON DELETE CASCADE,

  -- Direction accuracy
  direction_correct BOOLEAN NOT NULL,
  direction_score NUMERIC(3,2) NOT NULL,  -- 0.00-1.00

  -- Magnitude accuracy (for stocks/crypto)
  magnitude_accuracy NUMERIC(3,2),  -- 0.00-1.00, NULL if not applicable
  actual_magnitude TEXT,  -- 'small', 'medium', 'large'

  -- Timing accuracy
  timing_score NUMERIC(3,2),  -- 0.00-1.00 based on how close to timeframe

  -- Per-analyst scores
  analyst_scores JSONB NOT NULL,  -- { "analyst-slug": { "direction_correct": true, "score": 0.85 } }

  -- Per-LLM tier scores
  llm_tier_scores JSONB NOT NULL,  -- { "gold": 0.9, "silver": 0.85, "bronze": 0.7 }

  -- Overall score
  overall_score NUMERIC(3,2) NOT NULL,  -- Weighted composite

  -- Analysis
  analysis TEXT,  -- AI-generated analysis of the prediction outcome

  -- Generated learnings
  suggested_learnings JSONB DEFAULT '[]'::jsonb,  -- AI-suggested learnings from this evaluation

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(prediction_id)
);

-- =============================================================================
-- EVALUATIONS INDEXES
-- =============================================================================

CREATE INDEX idx_prediction_evaluations_prediction ON prediction.evaluations(prediction_id);
CREATE INDEX idx_prediction_evaluations_direction_correct ON prediction.evaluations(direction_correct);
CREATE INDEX idx_prediction_evaluations_overall_score ON prediction.evaluations(overall_score DESC);
CREATE INDEX idx_prediction_evaluations_created_at ON prediction.evaluations(created_at DESC);

-- GIN indexes for JSONB queries
CREATE INDEX idx_prediction_evaluations_analyst ON prediction.evaluations USING GIN(analyst_scores);
CREATE INDEX idx_prediction_evaluations_llm ON prediction.evaluations USING GIN(llm_tier_scores);
CREATE INDEX idx_prediction_evaluations_learnings ON prediction.evaluations USING GIN(suggested_learnings);

-- =============================================================================
-- EVALUATIONS UPDATED_AT TRIGGER
-- =============================================================================

CREATE TRIGGER set_prediction_evaluations_updated_at
  BEFORE UPDATE ON prediction.evaluations
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- =============================================================================
-- TARGET SNAPSHOTS TABLE (Price History)
-- =============================================================================

CREATE TABLE prediction.target_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target
  target_id UUID NOT NULL REFERENCES prediction.targets(id) ON DELETE CASCADE,

  -- Snapshot data
  value NUMERIC(20,8) NOT NULL,  -- Price or probability
  captured_at TIMESTAMPTZ NOT NULL,

  -- Additional context
  metadata JSONB DEFAULT '{}'::jsonb,  -- Volume, market cap, etc.

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TARGET SNAPSHOTS INDEXES
-- =============================================================================

CREATE INDEX idx_prediction_target_snapshots_target ON prediction.target_snapshots(target_id);
CREATE INDEX idx_prediction_target_snapshots_captured ON prediction.target_snapshots(captured_at DESC);
CREATE INDEX idx_prediction_target_snapshots_target_time ON prediction.target_snapshots(target_id, captured_at DESC);

-- =============================================================================
-- MISSED OPPORTUNITIES TABLE
-- =============================================================================

CREATE TABLE prediction.missed_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target
  target_id UUID NOT NULL REFERENCES prediction.targets(id) ON DELETE CASCADE,

  -- Move details
  move_type TEXT NOT NULL,  -- 'significant_up', 'significant_down', 'breakout', 'breakdown'
  move_start_at TIMESTAMPTZ NOT NULL,
  move_end_at TIMESTAMPTZ NOT NULL,
  start_value NUMERIC(20,8) NOT NULL,
  end_value NUMERIC(20,8) NOT NULL,
  percent_change NUMERIC(10,4) NOT NULL,

  -- Detection
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detection_method TEXT NOT NULL,  -- 'threshold', 'pattern', 'manual'

  -- Analysis (AI-generated)
  discovered_drivers JSONB DEFAULT '[]'::jsonb,  -- What caused this move
  signals_we_had JSONB DEFAULT '[]'::jsonb,  -- Signals we had but didn't act on
  signals_we_missed JSONB DEFAULT '[]'::jsonb,  -- Signals from sources we don't have
  source_gaps JSONB DEFAULT '[]'::jsonb,  -- Missing data sources
  suggested_learnings JSONB DEFAULT '[]'::jsonb,  -- AI-suggested learnings

  -- Analysis status
  analysis_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'analyzing', 'complete', 'failed'
  analysis_error TEXT,

  -- LLM usage for analysis
  llm_usage_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (move_type IN ('significant_up', 'significant_down', 'breakout', 'breakdown')),
  CHECK (analysis_status IN ('pending', 'analyzing', 'complete', 'failed'))
);

-- =============================================================================
-- MISSED OPPORTUNITIES INDEXES
-- =============================================================================

CREATE INDEX idx_prediction_missed_target ON prediction.missed_opportunities(target_id);
CREATE INDEX idx_prediction_missed_type ON prediction.missed_opportunities(move_type);
CREATE INDEX idx_prediction_missed_detected ON prediction.missed_opportunities(detected_at DESC);
CREATE INDEX idx_prediction_missed_percent ON prediction.missed_opportunities(percent_change DESC);
CREATE INDEX idx_prediction_missed_analysis_status ON prediction.missed_opportunities(analysis_status);
CREATE INDEX idx_prediction_missed_created_at ON prediction.missed_opportunities(created_at DESC);

-- GIN indexes for JSONB queries
CREATE INDEX idx_prediction_missed_drivers ON prediction.missed_opportunities USING GIN(discovered_drivers);
CREATE INDEX idx_prediction_missed_signals ON prediction.missed_opportunities USING GIN(signals_we_had);
CREATE INDEX idx_prediction_missed_gaps ON prediction.missed_opportunities USING GIN(source_gaps);

-- =============================================================================
-- MISSED OPPORTUNITIES UPDATED_AT TRIGGER
-- =============================================================================

CREATE TRIGGER set_prediction_missed_updated_at
  BEFORE UPDATE ON prediction.missed_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- =============================================================================
-- TOOL REQUESTS TABLE (Source Wishlist)
-- =============================================================================

CREATE TABLE prediction.tool_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  universe_id UUID NOT NULL REFERENCES prediction.universes(id) ON DELETE CASCADE,

  -- Request details
  tool_type TEXT NOT NULL,  -- 'source', 'integration', 'analyst', 'other'
  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- For source requests
  source_type TEXT,  -- 'web', 'rss', 'twitter_search', 'api'
  suggested_config JSONB,  -- Suggested configuration

  -- Source (if from missed opportunity analysis)
  source_missed_opportunity_id UUID REFERENCES prediction.missed_opportunities(id) ON DELETE SET NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'wishlist',  -- 'wishlist', 'planned', 'in_progress', 'done', 'rejected'

  -- Notes
  user_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (tool_type IN ('source', 'integration', 'analyst', 'other')),
  CHECK (status IN ('wishlist', 'planned', 'in_progress', 'done', 'rejected'))
);

-- =============================================================================
-- TOOL REQUESTS INDEXES
-- =============================================================================

CREATE INDEX idx_prediction_tool_requests_universe ON prediction.tool_requests(universe_id);
CREATE INDEX idx_prediction_tool_requests_type ON prediction.tool_requests(tool_type);
CREATE INDEX idx_prediction_tool_requests_status ON prediction.tool_requests(status);
CREATE INDEX idx_prediction_tool_requests_source_miss ON prediction.tool_requests(source_missed_opportunity_id)
  WHERE source_missed_opportunity_id IS NOT NULL;
CREATE INDEX idx_prediction_tool_requests_created_at ON prediction.tool_requests(created_at DESC);

-- =============================================================================
-- TOOL REQUESTS UPDATED_AT TRIGGER
-- =============================================================================

CREATE TRIGGER set_prediction_tool_requests_updated_at
  BEFORE UPDATE ON prediction.tool_requests
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.evaluations IS 'Prediction outcome evaluations';
COMMENT ON COLUMN prediction.evaluations.direction_correct IS 'Whether direction prediction was correct';
COMMENT ON COLUMN prediction.evaluations.analyst_scores IS 'Per-analyst accuracy scores';
COMMENT ON COLUMN prediction.evaluations.llm_tier_scores IS 'Per-LLM tier accuracy scores';
COMMENT ON COLUMN prediction.evaluations.suggested_learnings IS 'AI-suggested learnings from this evaluation';

COMMENT ON TABLE prediction.target_snapshots IS 'Price/value history for targets';
COMMENT ON COLUMN prediction.target_snapshots.value IS 'Price or probability value';

COMMENT ON TABLE prediction.missed_opportunities IS 'Significant moves without predictions';
COMMENT ON COLUMN prediction.missed_opportunities.move_type IS 'Type of price/value movement';
COMMENT ON COLUMN prediction.missed_opportunities.discovered_drivers IS 'What caused this move (AI analysis)';
COMMENT ON COLUMN prediction.missed_opportunities.source_gaps IS 'Missing data sources identified';

COMMENT ON TABLE prediction.tool_requests IS 'Source/tool wishlist from analysis';
COMMENT ON COLUMN prediction.tool_requests.tool_type IS 'Type: source, integration, analyst, other';
COMMENT ON COLUMN prediction.tool_requests.status IS 'Status: wishlist, planned, in_progress, done, rejected';

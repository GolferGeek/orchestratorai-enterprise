-- =============================================================================
-- PREDICTIONS RECOMMENDATIONS AND OUTCOMES TABLES
-- =============================================================================
-- Recommendation storage and outcome tracking for learning loop
-- Created: 2026-01-08
-- =============================================================================

-- =============================================================================
-- RECOMMENDATIONS TABLE
-- =============================================================================
-- Final recommendations produced by the prediction engine
-- =============================================================================

CREATE TABLE predictions.recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_agent_id UUID NOT NULL REFERENCES predictions.prediction_agents(id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES predictions.runs(id) ON DELETE CASCADE,
    instrument TEXT NOT NULL,

    -- Recommendation details
    action TEXT NOT NULL,  -- 'buy', 'sell', 'hold', 'accumulate', 'reduce', 'bet_yes', 'bet_no', 'wait'
    confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.50,  -- 0.00 to 1.00
    rationale TEXT NOT NULL,

    -- Sizing (risk-adjusted)
    sizing JSONB DEFAULT NULL,
    -- Example: { "size": 5, "unit": "percent", "riskAdjustedSize": 3, "maxLoss": 500 }

    -- Timing
    timing_window JSONB DEFAULT NULL,
    -- Example: { "validFrom": "2026-01-08T10:00:00Z", "validUntil": "2026-01-08T16:00:00Z" }

    entry_style TEXT,  -- 'market', 'limit', 'stop', 'scaled'
    target_price NUMERIC(20, 8),

    -- Evidence (specialist analyses that support this)
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'active', 'executed', 'expired', 'cancelled'
    activated_at TIMESTAMPTZ DEFAULT NULL,
    executed_at TIMESTAMPTZ DEFAULT NULL,
    expired_at TIMESTAMPTZ DEFAULT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key to evaluator_challenges now that recommendations exists
ALTER TABLE predictions.evaluator_challenges
    ADD CONSTRAINT fk_challenge_recommendation
    FOREIGN KEY (recommendation_id)
    REFERENCES predictions.recommendations(id)
    ON DELETE CASCADE;

-- Indexes for common queries
CREATE INDEX idx_predictions_recommendations_agent ON predictions.recommendations(prediction_agent_id);
CREATE INDEX idx_predictions_recommendations_run ON predictions.recommendations(run_id);
CREATE INDEX idx_predictions_recommendations_instrument ON predictions.recommendations(instrument);
CREATE INDEX idx_predictions_recommendations_action ON predictions.recommendations(action);
CREATE INDEX idx_predictions_recommendations_confidence ON predictions.recommendations(confidence DESC);
CREATE INDEX idx_predictions_recommendations_status ON predictions.recommendations(status);
CREATE INDEX idx_predictions_recommendations_created_at ON predictions.recommendations(created_at DESC);

COMMENT ON TABLE predictions.recommendations IS 'Final recommendations produced by prediction engine';
COMMENT ON COLUMN predictions.recommendations.action IS 'Recommended action: buy, sell, hold, etc.';
COMMENT ON COLUMN predictions.recommendations.sizing IS 'JSON: position sizing with risk adjustment';
COMMENT ON COLUMN predictions.recommendations.evidence IS 'JSON array of specialist evidence supporting this recommendation';
COMMENT ON COLUMN predictions.recommendations.status IS 'Recommendation lifecycle status';

-- =============================================================================
-- OUTCOMES TABLE
-- =============================================================================
-- Actual outcomes for evaluating recommendation accuracy
-- =============================================================================

CREATE TABLE predictions.outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES predictions.recommendations(id) ON DELETE CASCADE,
    instrument TEXT NOT NULL,

    -- Outcome details
    outcome TEXT NOT NULL,  -- 'correct', 'incorrect', 'partial', 'inconclusive'
    actual_return_percent NUMERIC(10, 4),  -- Actual % return if executed
    benchmark_return_percent NUMERIC(10, 4),  -- Buy-and-hold return for comparison

    -- Price tracking
    entry_price NUMERIC(20, 8),
    exit_price NUMERIC(20, 8),
    entry_timestamp TIMESTAMPTZ,
    exit_timestamp TIMESTAMPTZ,

    -- Evaluation metadata
    evaluation_method TEXT NOT NULL DEFAULT 'auto',  -- 'auto', 'manual', 'market_close'
    evaluation_notes TEXT,

    -- For prediction markets
    resolution_value TEXT,  -- 'yes', 'no' for Polymarket
    resolution_timestamp TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_predictions_outcomes_recommendation ON predictions.outcomes(recommendation_id);
CREATE INDEX idx_predictions_outcomes_instrument ON predictions.outcomes(instrument);
CREATE INDEX idx_predictions_outcomes_outcome ON predictions.outcomes(outcome);
CREATE INDEX idx_predictions_outcomes_return ON predictions.outcomes(actual_return_percent DESC);
CREATE INDEX idx_predictions_outcomes_created_at ON predictions.outcomes(created_at DESC);

COMMENT ON TABLE predictions.outcomes IS 'Actual outcomes for evaluating recommendation accuracy';
COMMENT ON COLUMN predictions.outcomes.outcome IS 'Outcome classification: correct, incorrect, partial, inconclusive';
COMMENT ON COLUMN predictions.outcomes.actual_return_percent IS 'Actual percentage return if recommendation was followed';
COMMENT ON COLUMN predictions.outcomes.evaluation_method IS 'How outcome was determined: auto, manual, market_close';

-- =============================================================================
-- RECOMMENDATION EXECUTIONS TABLE
-- =============================================================================
-- Track simulated or real execution of recommendations
-- =============================================================================

CREATE TABLE predictions.recommendation_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES predictions.recommendations(id) ON DELETE CASCADE,
    instrument TEXT NOT NULL,

    -- Execution details
    execution_type TEXT NOT NULL DEFAULT 'simulated',  -- 'simulated', 'paper', 'real'
    executed_action TEXT NOT NULL,  -- 'buy', 'sell', etc.
    executed_price NUMERIC(20, 8) NOT NULL,
    executed_quantity NUMERIC(20, 8),
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Fees/slippage
    fees NUMERIC(20, 8) DEFAULT 0,
    slippage_percent NUMERIC(10, 4) DEFAULT 0,

    -- Reference to external system
    external_order_id TEXT,
    external_system TEXT,  -- 'alpaca', 'interactive_brokers', 'paper_trading'

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_predictions_executions_recommendation ON predictions.recommendation_executions(recommendation_id);
CREATE INDEX idx_predictions_executions_instrument ON predictions.recommendation_executions(instrument);
CREATE INDEX idx_predictions_executions_type ON predictions.recommendation_executions(execution_type);
CREATE INDEX idx_predictions_executions_executed_at ON predictions.recommendation_executions(executed_at DESC);
CREATE INDEX idx_predictions_executions_created_at ON predictions.recommendation_executions(created_at DESC);

COMMENT ON TABLE predictions.recommendation_executions IS 'Execution records for recommendations (simulated or real)';
COMMENT ON COLUMN predictions.recommendation_executions.execution_type IS 'Execution type: simulated, paper, real';
COMMENT ON COLUMN predictions.recommendation_executions.external_order_id IS 'Order ID in external trading system';

-- =============================================================================
-- UPDATE TRIGGER FOR RECOMMENDATIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION predictions.update_recommendation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER predictions_recommendations_updated_at
    BEFORE UPDATE ON predictions.recommendations
    FOR EACH ROW
    EXECUTE FUNCTION predictions.update_recommendation_timestamp();

-- =============================================================================
-- UPDATE TRIGGER FOR OUTCOMES
-- =============================================================================

CREATE OR REPLACE FUNCTION predictions.update_outcome_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER predictions_outcomes_updated_at
    BEFORE UPDATE ON predictions.outcomes
    FOR EACH ROW
    EXECUTE FUNCTION predictions.update_outcome_timestamp();

-- =============================================================================
-- HELPER VIEWS
-- =============================================================================

-- View: Recent recommendations with outcomes
CREATE OR REPLACE VIEW predictions.recommendations_with_outcomes AS
SELECT
    r.id AS recommendation_id,
    r.prediction_agent_id,
    pa.runner_type,
    pa.org_slug,
    r.instrument,
    r.action,
    r.confidence,
    r.rationale,
    r.status AS recommendation_status,
    r.created_at AS recommendation_created_at,
    o.id AS outcome_id,
    o.outcome,
    o.actual_return_percent,
    o.benchmark_return_percent,
    o.evaluation_method,
    o.created_at AS outcome_created_at
FROM predictions.recommendations r
JOIN predictions.prediction_agents pa ON r.prediction_agent_id = pa.id
LEFT JOIN predictions.outcomes o ON r.id = o.recommendation_id
ORDER BY r.created_at DESC;

COMMENT ON VIEW predictions.recommendations_with_outcomes IS 'Recommendations with their outcome evaluations';

-- View: Agent performance summary
CREATE OR REPLACE VIEW predictions.agent_performance_summary AS
SELECT
    pa.id AS prediction_agent_id,
    pa.org_slug,
    pa.runner_type,
    pa.instruments,
    COUNT(DISTINCT r.id) AS total_recommendations,
    COUNT(DISTINCT o.id) AS total_outcomes,
    COUNT(DISTINCT CASE WHEN o.outcome = 'correct' THEN o.id END) AS correct_count,
    COUNT(DISTINCT CASE WHEN o.outcome = 'incorrect' THEN o.id END) AS incorrect_count,
    ROUND(
        COUNT(DISTINCT CASE WHEN o.outcome = 'correct' THEN o.id END)::NUMERIC /
        NULLIF(COUNT(DISTINCT o.id), 0)::NUMERIC * 100,
        2
    ) AS accuracy_percent,
    ROUND(AVG(o.actual_return_percent), 4) AS avg_return_percent,
    ROUND(AVG(r.confidence), 4) AS avg_confidence,
    MAX(r.created_at) AS last_recommendation_at
FROM predictions.prediction_agents pa
LEFT JOIN predictions.recommendations r ON pa.id = r.prediction_agent_id
LEFT JOIN predictions.outcomes o ON r.id = o.recommendation_id
GROUP BY pa.id, pa.org_slug, pa.runner_type, pa.instruments;

COMMENT ON VIEW predictions.agent_performance_summary IS 'Summary of prediction agent performance metrics';

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function: Get recent recommendations for an agent
CREATE OR REPLACE FUNCTION predictions.get_recent_recommendations(
    p_prediction_agent_id UUID,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    instrument TEXT,
    action TEXT,
    confidence NUMERIC,
    status TEXT,
    outcome TEXT,
    actual_return_percent NUMERIC,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.instrument,
        r.action,
        r.confidence,
        r.status,
        o.outcome,
        o.actual_return_percent,
        r.created_at
    FROM predictions.recommendations r
    LEFT JOIN predictions.outcomes o ON r.id = o.recommendation_id
    WHERE r.prediction_agent_id = p_prediction_agent_id
    ORDER BY r.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION predictions.get_recent_recommendations(UUID, INTEGER) IS 'Get recent recommendations for a prediction agent';

-- Function: Calculate agent accuracy for an instrument
CREATE OR REPLACE FUNCTION predictions.get_instrument_accuracy(
    p_prediction_agent_id UUID,
    p_instrument TEXT
)
RETURNS TABLE (
    total_recommendations INTEGER,
    total_outcomes INTEGER,
    correct_count INTEGER,
    accuracy_percent NUMERIC,
    avg_return_percent NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT r.id)::INTEGER AS total_recommendations,
        COUNT(DISTINCT o.id)::INTEGER AS total_outcomes,
        COUNT(DISTINCT CASE WHEN o.outcome = 'correct' THEN o.id END)::INTEGER AS correct_count,
        ROUND(
            COUNT(DISTINCT CASE WHEN o.outcome = 'correct' THEN o.id END)::NUMERIC /
            NULLIF(COUNT(DISTINCT o.id), 0)::NUMERIC * 100,
            2
        ) AS accuracy_percent,
        ROUND(AVG(o.actual_return_percent), 4) AS avg_return_percent
    FROM predictions.recommendations r
    LEFT JOIN predictions.outcomes o ON r.id = o.recommendation_id
    WHERE r.prediction_agent_id = p_prediction_agent_id
      AND r.instrument = p_instrument;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION predictions.get_instrument_accuracy(UUID, TEXT) IS 'Calculate prediction accuracy for a specific instrument';

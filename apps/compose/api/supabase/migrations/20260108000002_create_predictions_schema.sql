-- =============================================================================
-- PREDICTIONS SCHEMA
-- =============================================================================
-- Generic prediction engine schema for multi-domain predictions:
-- - Stocks, Crypto, Polymarket, Elections (future)
-- - Claims-based data model
-- - Source attribution for all data
-- - Learning loop integration
-- Created: 2026-01-08
-- =============================================================================

-- Create predictions schema
CREATE SCHEMA IF NOT EXISTS predictions;
COMMENT ON SCHEMA predictions IS 'Generic prediction engine: claims-based data model with source attribution';

-- Grant usage on schema
GRANT USAGE ON SCHEMA predictions TO postgres, anon, authenticated, service_role;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA predictions GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA predictions GRANT ALL ON SEQUENCES TO service_role;

-- =============================================================================
-- PREDICTION AGENTS TABLE
-- =============================================================================
-- Prediction agent configuration (extends public.agents with runner metadata)
-- Each prediction agent is linked to a public.agents entry with runner config
-- =============================================================================

CREATE TABLE predictions.prediction_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_slug TEXT NOT NULL REFERENCES public.agents(slug) ON DELETE CASCADE,
    org_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,

    -- Runner configuration
    runner_type TEXT NOT NULL,  -- 'stock-predictor', 'crypto-predictor', 'market-predictor'
    instruments TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    risk_profile TEXT NOT NULL DEFAULT 'moderate',
    poll_interval_ms INTEGER NOT NULL DEFAULT 60000,

    -- Pre-filter thresholds
    pre_filter_thresholds JSONB NOT NULL DEFAULT '{
        "minPriceChangePercent": 2,
        "minSentimentShift": 0.2,
        "minSignificanceScore": 0.3
    }'::jsonb,

    -- Model configuration per stage
    model_config JSONB DEFAULT NULL,

    -- Learning configuration
    learning_config JSONB DEFAULT '{
        "autoPostmortem": true,
        "detectMissedOpportunities": true,
        "contextLookbackHours": 24,
        "maxPostmortemsInContext": 10,
        "maxSpecialistStats": 5
    }'::jsonb,

    -- Tool overrides
    tool_overrides JSONB DEFAULT '{}'::jsonb,

    -- Lifecycle state
    lifecycle_state TEXT NOT NULL DEFAULT 'stopped',  -- 'stopped', 'starting', 'running', 'paused', 'stopping', 'error'
    last_poll_at TIMESTAMPTZ DEFAULT NULL,
    next_poll_at TIMESTAMPTZ DEFAULT NULL,
    error_message TEXT DEFAULT NULL,

    -- Auto-start on module init
    auto_start BOOLEAN DEFAULT false,

    -- Stats since last start
    stats JSONB DEFAULT '{
        "pollCount": 0,
        "recommendationCount": 0,
        "errorCount": 0,
        "avgPollDurationMs": 0
    }'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint
    UNIQUE(agent_slug)
);

-- Indexes for common queries
CREATE INDEX idx_predictions_agents_org ON predictions.prediction_agents(org_slug);
CREATE INDEX idx_predictions_agents_runner ON predictions.prediction_agents(runner_type);
CREATE INDEX idx_predictions_agents_state ON predictions.prediction_agents(lifecycle_state);
CREATE INDEX idx_predictions_agents_auto_start ON predictions.prediction_agents(auto_start) WHERE auto_start = true;
CREATE INDEX idx_predictions_agents_created_at ON predictions.prediction_agents(created_at DESC);

COMMENT ON TABLE predictions.prediction_agents IS 'Prediction agent configuration extending public.agents';
COMMENT ON COLUMN predictions.prediction_agents.runner_type IS 'Runner implementation: stock-predictor, crypto-predictor, market-predictor';
COMMENT ON COLUMN predictions.prediction_agents.instruments IS 'Array of instruments to track (e.g., AAPL, BTC-USD)';
COMMENT ON COLUMN predictions.prediction_agents.risk_profile IS 'Risk profile for recommendation sizing';
COMMENT ON COLUMN predictions.prediction_agents.model_config IS 'Per-stage LLM model configuration (admin only)';
COMMENT ON COLUMN predictions.prediction_agents.lifecycle_state IS 'Current agent lifecycle state';

-- =============================================================================
-- DATAPOINTS TABLE
-- =============================================================================
-- Complete datapoints from poll cycles
-- =============================================================================

CREATE TABLE predictions.datapoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_agent_id UUID NOT NULL REFERENCES predictions.prediction_agents(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Sources and claims (JSONB for flexibility)
    sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    all_claims JSONB NOT NULL DEFAULT '[]'::jsonb,
    instruments TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    -- Poll metadata
    metadata JSONB NOT NULL DEFAULT '{
        "durationMs": 0,
        "toolsSucceeded": 0,
        "toolsFailed": 0,
        "toolStatus": {},
        "errors": []
    }'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_predictions_datapoints_agent ON predictions.datapoints(prediction_agent_id);
CREATE INDEX idx_predictions_datapoints_timestamp ON predictions.datapoints(timestamp DESC);
CREATE INDEX idx_predictions_datapoints_agent_ts ON predictions.datapoints(prediction_agent_id, timestamp DESC);
CREATE INDEX idx_predictions_datapoints_instruments ON predictions.datapoints USING GIN(instruments);
CREATE INDEX idx_predictions_datapoints_created_at ON predictions.datapoints(created_at DESC);

COMMENT ON TABLE predictions.datapoints IS 'Complete datapoints from poll cycles';
COMMENT ON COLUMN predictions.datapoints.sources IS 'JSON array of Source objects with tool attribution';
COMMENT ON COLUMN predictions.datapoints.all_claims IS 'JSON array of all Claim objects from this poll';
COMMENT ON COLUMN predictions.datapoints.metadata IS 'Poll cycle metadata (duration, tool status)';

-- =============================================================================
-- RUNS TABLE
-- =============================================================================
-- Prediction run records (one per poll cycle execution)
-- =============================================================================

CREATE TABLE predictions.runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_agent_id UUID NOT NULL REFERENCES predictions.prediction_agents(id) ON DELETE CASCADE,
    datapoint_id UUID REFERENCES predictions.datapoints(id) ON DELETE SET NULL,

    -- Execution status
    status TEXT NOT NULL DEFAULT 'running',  -- 'running', 'completed', 'failed', 'partial'
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ DEFAULT NULL,

    -- Metrics
    metrics JSONB DEFAULT '{
        "totalDurationMs": 0,
        "stageDurations": {},
        "claimsProcessed": 0,
        "bundlesProceeded": 0,
        "recommendationsGenerated": 0
    }'::jsonb,

    -- Error info
    error_message TEXT DEFAULT NULL,

    -- Checkpointer thread_id for resumability
    thread_id TEXT DEFAULT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_predictions_runs_agent ON predictions.runs(prediction_agent_id);
CREATE INDEX idx_predictions_runs_status ON predictions.runs(status);
CREATE INDEX idx_predictions_runs_started_at ON predictions.runs(started_at DESC);
CREATE INDEX idx_predictions_runs_datapoint ON predictions.runs(datapoint_id);
CREATE INDEX idx_predictions_runs_thread ON predictions.runs(thread_id);
CREATE INDEX idx_predictions_runs_created_at ON predictions.runs(created_at DESC);

COMMENT ON TABLE predictions.runs IS 'Prediction run records for each poll cycle execution';
COMMENT ON COLUMN predictions.runs.status IS 'Run status: running, completed, failed, partial';
COMMENT ON COLUMN predictions.runs.thread_id IS 'LangGraph checkpointer thread ID for resumability';

-- =============================================================================
-- TRIAGE RESULTS TABLE
-- =============================================================================
-- Triage decisions for each instrument bundle
-- =============================================================================

CREATE TABLE predictions.triage_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES predictions.runs(id) ON DELETE CASCADE,
    datapoint_id UUID NOT NULL REFERENCES predictions.datapoints(id) ON DELETE CASCADE,
    instrument TEXT NOT NULL,

    -- Triage decision
    proceed BOOLEAN NOT NULL DEFAULT false,
    urgency TEXT NOT NULL DEFAULT 'low',  -- 'low', 'medium', 'high', 'critical'
    specialist_teams TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    rationale TEXT,

    -- Voting (for LLM-based triage)
    votes JSONB DEFAULT '[]'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_predictions_triage_run ON predictions.triage_results(run_id);
CREATE INDEX idx_predictions_triage_datapoint ON predictions.triage_results(datapoint_id);
CREATE INDEX idx_predictions_triage_instrument ON predictions.triage_results(instrument);
CREATE INDEX idx_predictions_triage_proceed ON predictions.triage_results(proceed) WHERE proceed = true;
CREATE INDEX idx_predictions_triage_urgency ON predictions.triage_results(urgency);
CREATE INDEX idx_predictions_triage_created_at ON predictions.triage_results(created_at DESC);

COMMENT ON TABLE predictions.triage_results IS 'Triage decisions determining which bundles proceed to specialists';
COMMENT ON COLUMN predictions.triage_results.proceed IS 'Whether this bundle proceeds to specialist analysis';
COMMENT ON COLUMN predictions.triage_results.urgency IS 'Urgency level: low, medium, high, critical';
COMMENT ON COLUMN predictions.triage_results.votes IS 'JSON array of triage agent votes (for LLM-based triage)';

-- =============================================================================
-- SPECIALIST ANALYSES TABLE
-- =============================================================================
-- Specialist analysis results
-- =============================================================================

CREATE TABLE predictions.specialist_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES predictions.runs(id) ON DELETE CASCADE,
    datapoint_id UUID NOT NULL REFERENCES predictions.datapoints(id) ON DELETE CASCADE,
    instrument TEXT NOT NULL,

    -- Specialist info
    specialist TEXT NOT NULL,  -- 'technical-analyst', 'sentiment-analyst', etc.

    -- Analysis result
    conclusion TEXT NOT NULL,  -- 'bullish', 'bearish', 'neutral', 'uncertain'
    confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.50,  -- 0.00 to 1.00
    analysis TEXT NOT NULL,

    -- Supporting data
    key_claims JSONB NOT NULL DEFAULT '[]'::jsonb,
    suggested_action TEXT,  -- 'buy', 'sell', 'hold', etc.
    risk_factors TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- LLM info
    model_used TEXT,
    tokens_used INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_predictions_specialists_run ON predictions.specialist_analyses(run_id);
CREATE INDEX idx_predictions_specialists_datapoint ON predictions.specialist_analyses(datapoint_id);
CREATE INDEX idx_predictions_specialists_instrument ON predictions.specialist_analyses(instrument);
CREATE INDEX idx_predictions_specialists_specialist ON predictions.specialist_analyses(specialist);
CREATE INDEX idx_predictions_specialists_conclusion ON predictions.specialist_analyses(conclusion);
CREATE INDEX idx_predictions_specialists_confidence ON predictions.specialist_analyses(confidence DESC);
CREATE INDEX idx_predictions_specialists_created_at ON predictions.specialist_analyses(created_at DESC);

COMMENT ON TABLE predictions.specialist_analyses IS 'Specialist analysis results from domain experts';
COMMENT ON COLUMN predictions.specialist_analyses.specialist IS 'Specialist type: technical-analyst, sentiment-analyst, etc.';
COMMENT ON COLUMN predictions.specialist_analyses.conclusion IS 'Analysis conclusion: bullish, bearish, neutral, uncertain';
COMMENT ON COLUMN predictions.specialist_analyses.key_claims IS 'JSON array of claims that drove this analysis';

-- =============================================================================
-- EVALUATOR CHALLENGES TABLE
-- =============================================================================
-- Red-team evaluator challenge results
-- =============================================================================

CREATE TABLE predictions.evaluator_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES predictions.runs(id) ON DELETE CASCADE,
    recommendation_id UUID,  -- References recommendations.id (forward ref, added later)

    -- Evaluator info
    evaluator TEXT NOT NULL,  -- 'contrarian', 'risk-assessor', etc.
    challenge_type TEXT NOT NULL,  -- 'contrarian', 'risk_assessment', 'historical_pattern', 'correlation', 'timing'

    -- Challenge result
    passed BOOLEAN NOT NULL DEFAULT true,
    challenge TEXT NOT NULL,
    confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.50,
    suggested_modification TEXT,

    -- LLM info
    model_used TEXT,
    tokens_used INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_predictions_challenges_run ON predictions.evaluator_challenges(run_id);
CREATE INDEX idx_predictions_challenges_recommendation ON predictions.evaluator_challenges(recommendation_id);
CREATE INDEX idx_predictions_challenges_evaluator ON predictions.evaluator_challenges(evaluator);
CREATE INDEX idx_predictions_challenges_type ON predictions.evaluator_challenges(challenge_type);
CREATE INDEX idx_predictions_challenges_passed ON predictions.evaluator_challenges(passed);
CREATE INDEX idx_predictions_challenges_created_at ON predictions.evaluator_challenges(created_at DESC);

COMMENT ON TABLE predictions.evaluator_challenges IS 'Red-team evaluator challenges to recommendations';
COMMENT ON COLUMN predictions.evaluator_challenges.evaluator IS 'Evaluator type: contrarian, risk-assessor, etc.';
COMMENT ON COLUMN predictions.evaluator_challenges.passed IS 'Whether the recommendation passed this challenge';
COMMENT ON COLUMN predictions.evaluator_challenges.suggested_modification IS 'Suggested changes if challenge failed';

-- =============================================================================
-- UPDATE TRIGGER FOR PREDICTION_AGENTS
-- =============================================================================

CREATE OR REPLACE FUNCTION predictions.update_prediction_agent_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER predictions_agents_updated_at
    BEFORE UPDATE ON predictions.prediction_agents
    FOR EACH ROW
    EXECUTE FUNCTION predictions.update_prediction_agent_timestamp();

-- =============================================================================
-- HELPER FUNCTION: Get active prediction agents for auto-start
-- =============================================================================

CREATE OR REPLACE FUNCTION predictions.get_autostart_agents()
RETURNS TABLE (
    prediction_agent_id UUID,
    agent_slug TEXT,
    org_slug TEXT,
    runner_type TEXT,
    instruments TEXT[],
    poll_interval_ms INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pa.id AS prediction_agent_id,
        pa.agent_slug,
        pa.org_slug,
        pa.runner_type,
        pa.instruments,
        pa.poll_interval_ms
    FROM predictions.prediction_agents pa
    WHERE pa.auto_start = true
      AND pa.lifecycle_state = 'stopped';
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION predictions.get_autostart_agents() IS 'Get prediction agents configured for auto-start';

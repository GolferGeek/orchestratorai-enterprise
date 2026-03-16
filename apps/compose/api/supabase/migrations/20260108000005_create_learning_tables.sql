-- =============================================================================
-- PREDICTIONS LEARNING LOOP TABLES
-- =============================================================================
-- Learning loop integration tables for continuous improvement:
-- - Postmortems: Analysis of prediction outcomes
-- - Missed Opportunities: Tracking what we should have predicted
-- - User Insights: Human feedback and corrections
-- Created: 2026-01-08
-- =============================================================================

-- =============================================================================
-- POSTMORTEMS TABLE
-- =============================================================================
-- Analysis of recommendation outcomes - what worked, what didn't, why
-- =============================================================================

CREATE TABLE predictions.postmortems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_agent_id UUID NOT NULL REFERENCES predictions.prediction_agents(id) ON DELETE CASCADE,
    recommendation_id UUID NOT NULL REFERENCES predictions.recommendations(id) ON DELETE CASCADE,
    outcome_id UUID NOT NULL REFERENCES predictions.outcomes(id) ON DELETE CASCADE,
    instrument TEXT NOT NULL,

    -- Postmortem analysis
    analysis_type TEXT NOT NULL DEFAULT 'auto',  -- 'auto', 'manual', 'llm_assisted'

    -- What went right/wrong
    what_worked TEXT[],  -- Array of factors that worked
    what_failed TEXT[],  -- Array of factors that failed
    root_cause TEXT,     -- Primary root cause of outcome

    -- Specialist performance analysis
    specialist_performance JSONB DEFAULT '{}'::jsonb,
    -- Example: { "technical-analyst": { "conclusion": "bullish", "wasCorrect": false, "confidenceWasCalibrated": false } }

    -- Key learnings
    key_learnings TEXT[],  -- Extracted lessons

    -- Context that was missing
    missing_context TEXT[],  -- What information would have helped

    -- Suggested improvements
    suggested_improvements JSONB DEFAULT '[]'::jsonb,
    -- Example: [{ "area": "pre-filter", "suggestion": "Lower threshold for earnings events" }]

    -- Confidence calibration
    predicted_confidence NUMERIC(3, 2),  -- What we predicted
    actual_accuracy NUMERIC(3, 2),        -- What actually happened (1.0 for correct, 0.0 for incorrect)
    calibration_error NUMERIC(3, 2),      -- |predicted - actual|

    -- Has this been applied to context?
    applied_to_context BOOLEAN DEFAULT false,
    applied_at TIMESTAMPTZ DEFAULT NULL,

    -- LLM analysis metadata
    model_used TEXT,
    tokens_used INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_predictions_postmortems_agent ON predictions.postmortems(prediction_agent_id);
CREATE INDEX idx_predictions_postmortems_recommendation ON predictions.postmortems(recommendation_id);
CREATE INDEX idx_predictions_postmortems_outcome ON predictions.postmortems(outcome_id);
CREATE INDEX idx_predictions_postmortems_instrument ON predictions.postmortems(instrument);
CREATE INDEX idx_predictions_postmortems_analysis_type ON predictions.postmortems(analysis_type);
CREATE INDEX idx_predictions_postmortems_applied ON predictions.postmortems(applied_to_context);
CREATE INDEX idx_predictions_postmortems_created_at ON predictions.postmortems(created_at DESC);

COMMENT ON TABLE predictions.postmortems IS 'Post-outcome analysis for learning loop';
COMMENT ON COLUMN predictions.postmortems.what_worked IS 'Array of factors that contributed to correct prediction';
COMMENT ON COLUMN predictions.postmortems.what_failed IS 'Array of factors that led to incorrect prediction';
COMMENT ON COLUMN predictions.postmortems.specialist_performance IS 'JSON analysis of each specialist performance';
COMMENT ON COLUMN predictions.postmortems.applied_to_context IS 'Whether learnings have been applied to agent context';

-- =============================================================================
-- MISSED OPPORTUNITIES TABLE
-- =============================================================================
-- Tracking significant moves we didn't predict or act on
-- =============================================================================

CREATE TABLE predictions.missed_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_agent_id UUID NOT NULL REFERENCES predictions.prediction_agents(id) ON DELETE CASCADE,
    instrument TEXT NOT NULL,

    -- What was missed
    missed_type TEXT NOT NULL,  -- 'price_move', 'news_event', 'earnings_surprise', 'market_shift'
    description TEXT NOT NULL,

    -- The actual move
    move_start_timestamp TIMESTAMPTZ NOT NULL,
    move_end_timestamp TIMESTAMPTZ,
    start_price NUMERIC(20, 8),
    end_price NUMERIC(20, 8),
    move_percent NUMERIC(10, 4),

    -- Why we missed it
    detection_failure_reason TEXT NOT NULL,  -- 'below_threshold', 'no_data', 'filtered_out', 'specialist_disagreement', 'evaluator_rejected'

    -- What signals we DID have (if any)
    available_signals JSONB DEFAULT '[]'::jsonb,
    -- Example: [{ "source": "yahoo-finance", "signal": "unusual_volume", "value": 2.5 }]

    -- Why those signals weren't enough
    signal_analysis TEXT,

    -- What would have helped
    what_would_have_helped TEXT[],

    -- Pre-filter analysis
    pre_filter_result JSONB DEFAULT NULL,
    -- Example: { "priceChange": 1.5, "threshold": 2.0, "wouldHavePassed": false }

    -- Suggested threshold adjustments
    suggested_threshold_changes JSONB DEFAULT '{}'::jsonb,
    -- Example: { "minPriceChangePercent": 1.5, "reason": "Would have caught this move" }

    -- Has this been applied to context?
    applied_to_context BOOLEAN DEFAULT false,
    applied_at TIMESTAMPTZ DEFAULT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_predictions_missed_agent ON predictions.missed_opportunities(prediction_agent_id);
CREATE INDEX idx_predictions_missed_instrument ON predictions.missed_opportunities(instrument);
CREATE INDEX idx_predictions_missed_type ON predictions.missed_opportunities(missed_type);
CREATE INDEX idx_predictions_missed_reason ON predictions.missed_opportunities(detection_failure_reason);
CREATE INDEX idx_predictions_missed_move_percent ON predictions.missed_opportunities(move_percent DESC);
CREATE INDEX idx_predictions_missed_applied ON predictions.missed_opportunities(applied_to_context);
CREATE INDEX idx_predictions_missed_created_at ON predictions.missed_opportunities(created_at DESC);

COMMENT ON TABLE predictions.missed_opportunities IS 'Tracking significant moves we failed to predict';
COMMENT ON COLUMN predictions.missed_opportunities.missed_type IS 'Type of opportunity missed: price_move, news_event, etc.';
COMMENT ON COLUMN predictions.missed_opportunities.detection_failure_reason IS 'Why we failed to detect: below_threshold, no_data, etc.';
COMMENT ON COLUMN predictions.missed_opportunities.suggested_threshold_changes IS 'JSON: suggested pre-filter threshold adjustments';

-- =============================================================================
-- USER INSIGHTS TABLE
-- =============================================================================
-- Human feedback and corrections from learning conversations
-- =============================================================================

CREATE TABLE predictions.user_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_agent_id UUID NOT NULL REFERENCES predictions.prediction_agents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,  -- Who provided the insight

    -- Insight details
    insight_type TEXT NOT NULL,  -- 'correction', 'domain_knowledge', 'threshold_suggestion', 'specialist_feedback', 'general'
    instrument TEXT,  -- Optional: specific to an instrument

    -- The insight itself
    insight_text TEXT NOT NULL,

    -- Structured insight (for programmatic use)
    structured_insight JSONB DEFAULT NULL,
    -- Example for correction: { "recommendationId": "...", "correctAction": "hold", "reason": "Dividend was already priced in" }
    -- Example for threshold: { "threshold": "minPriceChangePercent", "suggestedValue": 1.5, "reason": "Tech stocks move faster" }

    -- Context when insight was provided
    context JSONB DEFAULT '{}'::jsonb,
    -- Example: { "conversationId": "...", "referredRecommendation": "...", "referredOutcome": "..." }

    -- Validation
    validated BOOLEAN DEFAULT false,  -- Has this been validated by admin?
    validated_by UUID DEFAULT NULL,
    validated_at TIMESTAMPTZ DEFAULT NULL,

    -- Application status
    applied_to_context BOOLEAN DEFAULT false,
    applied_at TIMESTAMPTZ DEFAULT NULL,
    applied_context_section TEXT,  -- Which section of context it was applied to

    -- Effectiveness tracking
    effectiveness_score NUMERIC(3, 2) DEFAULT NULL,  -- 0-1 score of how effective this insight was
    effectiveness_notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_predictions_insights_agent ON predictions.user_insights(prediction_agent_id);
CREATE INDEX idx_predictions_insights_user ON predictions.user_insights(user_id);
CREATE INDEX idx_predictions_insights_type ON predictions.user_insights(insight_type);
CREATE INDEX idx_predictions_insights_instrument ON predictions.user_insights(instrument);
CREATE INDEX idx_predictions_insights_validated ON predictions.user_insights(validated);
CREATE INDEX idx_predictions_insights_applied ON predictions.user_insights(applied_to_context);
CREATE INDEX idx_predictions_insights_created_at ON predictions.user_insights(created_at DESC);

COMMENT ON TABLE predictions.user_insights IS 'Human feedback and corrections from learning conversations';
COMMENT ON COLUMN predictions.user_insights.insight_type IS 'Type: correction, domain_knowledge, threshold_suggestion, specialist_feedback, general';
COMMENT ON COLUMN predictions.user_insights.structured_insight IS 'JSON: structured version of insight for programmatic use';
COMMENT ON COLUMN predictions.user_insights.effectiveness_score IS 'Score 0-1 measuring how effective this insight was';

-- =============================================================================
-- LEARNING CONVERSATIONS TABLE
-- =============================================================================
-- Track learning loop conversation sessions
-- =============================================================================

CREATE TABLE predictions.learning_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_agent_id UUID NOT NULL REFERENCES predictions.prediction_agents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,

    -- Conversation status
    status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'completed', 'abandoned'

    -- Focus of conversation
    focus_type TEXT NOT NULL DEFAULT 'general',  -- 'postmortem', 'missed_opportunity', 'performance_review', 'threshold_tuning', 'general'
    focus_reference_id UUID,  -- Optional: ID of postmortem/missed_opportunity being discussed
    focus_instrument TEXT,    -- Optional: specific instrument being discussed

    -- Conversation messages stored as JSONB
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Example: [{ "role": "user", "content": "...", "timestamp": "..." }, { "role": "assistant", "content": "...", "timestamp": "..." }]

    -- Insights extracted from this conversation
    extracted_insights UUID[] DEFAULT ARRAY[]::UUID[],  -- References to user_insights created

    -- Context updates applied during this conversation
    context_updates_applied JSONB DEFAULT '[]'::jsonb,
    -- Example: [{ "section": "learned_patterns", "update": "...", "appliedAt": "..." }]

    -- LangGraph state
    thread_id TEXT,  -- LangGraph thread ID for resumability

    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_predictions_conversations_agent ON predictions.learning_conversations(prediction_agent_id);
CREATE INDEX idx_predictions_conversations_user ON predictions.learning_conversations(user_id);
CREATE INDEX idx_predictions_conversations_status ON predictions.learning_conversations(status);
CREATE INDEX idx_predictions_conversations_focus ON predictions.learning_conversations(focus_type);
CREATE INDEX idx_predictions_conversations_thread ON predictions.learning_conversations(thread_id);
CREATE INDEX idx_predictions_conversations_created_at ON predictions.learning_conversations(created_at DESC);

COMMENT ON TABLE predictions.learning_conversations IS 'Learning loop conversation sessions';
COMMENT ON COLUMN predictions.learning_conversations.focus_type IS 'Focus: postmortem, missed_opportunity, performance_review, threshold_tuning, general';
COMMENT ON COLUMN predictions.learning_conversations.messages IS 'JSON array of conversation messages';
COMMENT ON COLUMN predictions.learning_conversations.thread_id IS 'LangGraph thread ID for conversation resumability';

-- =============================================================================
-- SPECIALIST ACCURACY TRACKING TABLE
-- =============================================================================
-- Track accuracy of each specialist over time for calibration
-- =============================================================================

CREATE TABLE predictions.specialist_accuracy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_agent_id UUID NOT NULL REFERENCES predictions.prediction_agents(id) ON DELETE CASCADE,
    specialist TEXT NOT NULL,  -- 'technical-analyst', 'sentiment-analyst', etc.
    instrument TEXT,           -- Optional: per-instrument accuracy

    -- Time window for this record
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,

    -- Accuracy metrics
    total_analyses INTEGER NOT NULL DEFAULT 0,
    correct_conclusions INTEGER NOT NULL DEFAULT 0,
    accuracy_percent NUMERIC(5, 2),

    -- Confidence calibration
    avg_confidence NUMERIC(3, 2),
    confidence_when_correct NUMERIC(3, 2),
    confidence_when_incorrect NUMERIC(3, 2),

    -- Breakdown by conclusion type
    bullish_count INTEGER DEFAULT 0,
    bullish_correct INTEGER DEFAULT 0,
    bearish_count INTEGER DEFAULT 0,
    bearish_correct INTEGER DEFAULT 0,
    neutral_count INTEGER DEFAULT 0,
    neutral_correct INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_predictions_accuracy_agent ON predictions.specialist_accuracy(prediction_agent_id);
CREATE INDEX idx_predictions_accuracy_specialist ON predictions.specialist_accuracy(specialist);
CREATE INDEX idx_predictions_accuracy_instrument ON predictions.specialist_accuracy(instrument);
CREATE INDEX idx_predictions_accuracy_period ON predictions.specialist_accuracy(period_start, period_end);
CREATE UNIQUE INDEX idx_predictions_accuracy_unique ON predictions.specialist_accuracy(prediction_agent_id, specialist, instrument, period_start, period_end);
CREATE INDEX idx_predictions_accuracy_created_at ON predictions.specialist_accuracy(created_at DESC);

COMMENT ON TABLE predictions.specialist_accuracy IS 'Specialist accuracy tracking over time';
COMMENT ON COLUMN predictions.specialist_accuracy.specialist IS 'Specialist type: technical-analyst, sentiment-analyst, etc.';
COMMENT ON COLUMN predictions.specialist_accuracy.accuracy_percent IS 'Percentage of correct conclusions';
COMMENT ON COLUMN predictions.specialist_accuracy.confidence_when_correct IS 'Average confidence when specialist was correct';

-- =============================================================================
-- UPDATE TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION predictions.update_postmortem_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER predictions_postmortems_updated_at
    BEFORE UPDATE ON predictions.postmortems
    FOR EACH ROW
    EXECUTE FUNCTION predictions.update_postmortem_timestamp();

CREATE OR REPLACE FUNCTION predictions.update_missed_opportunity_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER predictions_missed_updated_at
    BEFORE UPDATE ON predictions.missed_opportunities
    FOR EACH ROW
    EXECUTE FUNCTION predictions.update_missed_opportunity_timestamp();

CREATE OR REPLACE FUNCTION predictions.update_user_insight_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER predictions_insights_updated_at
    BEFORE UPDATE ON predictions.user_insights
    FOR EACH ROW
    EXECUTE FUNCTION predictions.update_user_insight_timestamp();

CREATE OR REPLACE FUNCTION predictions.update_specialist_accuracy_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER predictions_accuracy_updated_at
    BEFORE UPDATE ON predictions.specialist_accuracy
    FOR EACH ROW
    EXECUTE FUNCTION predictions.update_specialist_accuracy_timestamp();

-- =============================================================================
-- PREDICTIONS SCHEMA INDEXES AND RLS POLICIES
-- =============================================================================
-- Additional performance indexes and Row Level Security policies
-- for the predictions schema.
--
-- SECURITY MODEL:
-- - All tables are service_role only (API server access)
-- - No direct client access to prediction data
-- - Access is mediated through API endpoints with proper auth
--
-- Created: 2026-01-08
-- =============================================================================

-- =============================================================================
-- ADDITIONAL PERFORMANCE INDEXES
-- =============================================================================

-- Composite indexes for common query patterns

-- Datapoints: Get recent datapoints for an instrument across agents
-- Note: Cannot use partial index with NOW() as it's not IMMUTABLE
-- Using regular GIN index on instruments with btree index on created_at for time filtering
CREATE INDEX IF NOT EXISTS idx_predictions_datapoints_instruments
    ON predictions.datapoints USING GIN(instruments);

CREATE INDEX IF NOT EXISTS idx_predictions_datapoints_created_at
    ON predictions.datapoints(created_at DESC);

-- Runs: Get recent completed runs for an agent
CREATE INDEX IF NOT EXISTS idx_predictions_runs_agent_status_completed
    ON predictions.runs(prediction_agent_id, completed_at DESC)
    WHERE status = 'completed';

-- Runs: Get recent failed runs for monitoring
CREATE INDEX IF NOT EXISTS idx_predictions_runs_failed_recent
    ON predictions.runs(created_at DESC)
    WHERE status = 'failed';

-- Triage: Get high-urgency triage results
CREATE INDEX IF NOT EXISTS idx_predictions_triage_high_urgency
    ON predictions.triage_results(created_at DESC)
    WHERE proceed = true AND urgency IN ('high', 'critical');

-- Specialist analyses: Get bullish/bearish by instrument
CREATE INDEX IF NOT EXISTS idx_predictions_specialists_instrument_conclusion
    ON predictions.specialist_analyses(instrument, conclusion, created_at DESC);

-- Recommendations: Get active recommendations by agent
CREATE INDEX IF NOT EXISTS idx_predictions_recommendations_agent_active
    ON predictions.recommendations(prediction_agent_id, created_at DESC)
    WHERE status IN ('pending', 'active');

-- Recommendations: Get high-confidence recommendations
CREATE INDEX IF NOT EXISTS idx_predictions_recommendations_high_confidence
    ON predictions.recommendations(created_at DESC)
    WHERE confidence >= 0.8;

-- Outcomes: Get recent correct/incorrect for accuracy tracking
CREATE INDEX IF NOT EXISTS idx_predictions_outcomes_agent_recent
    ON predictions.outcomes(recommendation_id, created_at DESC);

-- Postmortems: Get unapplied learnings
CREATE INDEX IF NOT EXISTS idx_predictions_postmortems_unapplied
    ON predictions.postmortems(prediction_agent_id, created_at DESC)
    WHERE applied_to_context = false;

-- Missed opportunities: Get unapplied by type
CREATE INDEX IF NOT EXISTS idx_predictions_missed_unapplied_type
    ON predictions.missed_opportunities(prediction_agent_id, missed_type, created_at DESC)
    WHERE applied_to_context = false;

-- User insights: Get validated unapplied insights
CREATE INDEX IF NOT EXISTS idx_predictions_insights_validated_unapplied
    ON predictions.user_insights(prediction_agent_id, created_at DESC)
    WHERE validated = true AND applied_to_context = false;

-- Learning conversations: Active conversations by user
CREATE INDEX IF NOT EXISTS idx_predictions_conversations_user_active
    ON predictions.learning_conversations(user_id, last_message_at DESC)
    WHERE status = 'active';

-- Specialist accuracy: Recent accuracy by specialist
CREATE INDEX IF NOT EXISTS idx_predictions_accuracy_specialist_recent
    ON predictions.specialist_accuracy(specialist, period_end DESC);

-- =============================================================================
-- JSONB INDEXES FOR COMMON QUERIES
-- =============================================================================

-- Index for querying claims by type in datapoints
CREATE INDEX IF NOT EXISTS idx_predictions_datapoints_claims_type
    ON predictions.datapoints USING GIN((all_claims));

-- Index for querying specialist performance in postmortems
CREATE INDEX IF NOT EXISTS idx_predictions_postmortems_specialist_perf
    ON predictions.postmortems USING GIN((specialist_performance));

-- Index for querying available signals in missed opportunities
CREATE INDEX IF NOT EXISTS idx_predictions_missed_signals
    ON predictions.missed_opportunities USING GIN((available_signals));

-- Index for querying structured insights
CREATE INDEX IF NOT EXISTS idx_predictions_insights_structured
    ON predictions.user_insights USING GIN((structured_insight));

-- Index for tool status in datapoints
CREATE INDEX IF NOT EXISTS idx_predictions_datapoints_tool_status
    ON predictions.datapoints USING GIN((metadata -> 'toolStatus'));

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================
--
-- All prediction tables use service_role only access pattern:
-- - No direct client access (anon, authenticated)
-- - API server uses service_role key
-- - Authorization checked at API endpoint level
--
-- This is appropriate because:
-- 1. Prediction data contains financial analysis (sensitive)
-- 2. Cross-org queries needed for system-wide analytics
-- 3. Complex authorization rules handled in application layer
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE predictions.prediction_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions.datapoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions.triage_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions.specialist_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions.evaluator_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions.recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions.outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions.recommendation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions.postmortems ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions.missed_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions.user_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions.learning_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions.specialist_accuracy ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SERVICE_ROLE POLICIES (Full Access)
-- =============================================================================
-- Service role gets full CRUD access to all tables

CREATE POLICY "Service role has full access to prediction_agents"
    ON predictions.prediction_agents
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to datapoints"
    ON predictions.datapoints
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to runs"
    ON predictions.runs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to triage_results"
    ON predictions.triage_results
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to specialist_analyses"
    ON predictions.specialist_analyses
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to evaluator_challenges"
    ON predictions.evaluator_challenges
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to recommendations"
    ON predictions.recommendations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to outcomes"
    ON predictions.outcomes
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to recommendation_executions"
    ON predictions.recommendation_executions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to postmortems"
    ON predictions.postmortems
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to missed_opportunities"
    ON predictions.missed_opportunities
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to user_insights"
    ON predictions.user_insights
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to learning_conversations"
    ON predictions.learning_conversations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to specialist_accuracy"
    ON predictions.specialist_accuracy
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- ANON AND AUTHENTICATED POLICIES (No Access)
-- =============================================================================
-- Explicitly deny access to anon and authenticated roles
-- (RLS blocks access by default when enabled with no policies, but being explicit)

-- Note: We don't create any policies for anon or authenticated roles
-- This means they have NO access to these tables (default deny with RLS enabled)

-- =============================================================================
-- HELPER FUNCTIONS FOR RLS
-- =============================================================================

-- Function to check if user has access to a prediction agent
-- This is used in the API layer, not in RLS (for reference/future use)
CREATE OR REPLACE FUNCTION predictions.user_has_agent_access(
    p_user_id UUID,
    p_prediction_agent_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_org_slug TEXT;
    v_has_access BOOLEAN;
BEGIN
    -- Get the org_slug for this prediction agent
    SELECT org_slug INTO v_org_slug
    FROM predictions.prediction_agents
    WHERE id = p_prediction_agent_id;

    IF v_org_slug IS NULL THEN
        RETURN false;
    END IF;

    -- Check if user is a member of this organization
    SELECT EXISTS(
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = p_user_id
          AND om.org_slug = v_org_slug
    ) INTO v_has_access;

    RETURN v_has_access;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION predictions.user_has_agent_access(UUID, UUID)
    IS 'Check if a user has access to a prediction agent (for API-level authorization)';

-- Function to get all prediction agents accessible by a user
CREATE OR REPLACE FUNCTION predictions.get_user_accessible_agents(p_user_id UUID)
RETURNS TABLE (
    prediction_agent_id UUID,
    agent_slug TEXT,
    org_slug TEXT,
    runner_type TEXT,
    lifecycle_state TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pa.id AS prediction_agent_id,
        pa.agent_slug,
        pa.org_slug,
        pa.runner_type,
        pa.lifecycle_state
    FROM predictions.prediction_agents pa
    JOIN public.organization_members om ON pa.org_slug = om.org_slug
    WHERE om.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION predictions.get_user_accessible_agents(UUID)
    IS 'Get all prediction agents accessible by a user';

-- =============================================================================
-- GRANTS FOR FUNCTIONS
-- =============================================================================

-- Grant execute to service_role only
GRANT EXECUTE ON FUNCTION predictions.user_has_agent_access(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION predictions.get_user_accessible_agents(UUID) TO service_role;

-- Revoke from public (default)
REVOKE EXECUTE ON FUNCTION predictions.user_has_agent_access(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION predictions.get_user_accessible_agents(UUID) FROM PUBLIC;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON INDEX predictions.idx_predictions_datapoints_instruments IS 'GIN index for datapoints by instrument';
COMMENT ON INDEX predictions.idx_predictions_datapoints_created_at IS 'Index for recent datapoints by time';
COMMENT ON INDEX predictions.idx_predictions_runs_agent_status_completed IS 'Partial index for completed runs by agent';
COMMENT ON INDEX predictions.idx_predictions_recommendations_agent_active IS 'Partial index for active recommendations';

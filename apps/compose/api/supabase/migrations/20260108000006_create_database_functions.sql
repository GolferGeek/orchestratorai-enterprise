-- =============================================================================
-- PREDICTIONS LEARNING LOOP DATABASE FUNCTIONS
-- =============================================================================
-- Functions for querying learning data:
-- - get_specialist_accuracy: Specialist performance over time
-- - get_postmortems_with_instrument: Postmortems for a specific instrument
-- - get_learning_context: Consolidated learning context for LLM
-- Created: 2026-01-08
-- =============================================================================

-- =============================================================================
-- FUNCTION: Get Specialist Accuracy
-- =============================================================================
-- Returns accuracy metrics for a specialist, optionally filtered by instrument
-- =============================================================================

CREATE OR REPLACE FUNCTION predictions.get_specialist_accuracy(
    p_prediction_agent_id UUID,
    p_specialist TEXT,
    p_instrument TEXT DEFAULT NULL,
    p_lookback_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    specialist TEXT,
    instrument TEXT,
    total_analyses INTEGER,
    correct_conclusions INTEGER,
    accuracy_percent NUMERIC,
    avg_confidence NUMERIC,
    confidence_when_correct NUMERIC,
    confidence_when_incorrect NUMERIC,
    bullish_accuracy NUMERIC,
    bearish_accuracy NUMERIC,
    neutral_accuracy NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH specialist_analyses AS (
        -- Get all specialist analyses in the lookback period
        SELECT
            sa.specialist,
            sa.instrument,
            sa.conclusion,
            sa.confidence,
            r.id AS recommendation_id,
            o.outcome
        FROM predictions.specialist_analyses sa
        JOIN predictions.runs ru ON sa.run_id = ru.id
        JOIN predictions.recommendations r ON r.run_id = ru.id AND r.instrument = sa.instrument
        LEFT JOIN predictions.outcomes o ON r.id = o.recommendation_id
        WHERE sa.run_id IN (
            SELECT id FROM predictions.runs
            WHERE prediction_agent_id = p_prediction_agent_id
            AND started_at >= NOW() - (p_lookback_days || ' days')::INTERVAL
        )
        AND sa.specialist = p_specialist
        AND (p_instrument IS NULL OR sa.instrument = p_instrument)
    ),
    aggregated AS (
        SELECT
            spa.specialist,
            COALESCE(spa.instrument, 'all') AS instrument,
            COUNT(*)::INTEGER AS total_analyses,
            COUNT(*) FILTER (WHERE
                (spa.conclusion IN ('bullish') AND spa.outcome = 'correct') OR
                (spa.conclusion IN ('bearish') AND spa.outcome = 'correct') OR
                (spa.conclusion IN ('neutral') AND spa.outcome IN ('correct', 'partial'))
            )::INTEGER AS correct_conclusions,
            ROUND(
                COUNT(*) FILTER (WHERE spa.outcome = 'correct')::NUMERIC /
                NULLIF(COUNT(*) FILTER (WHERE spa.outcome IS NOT NULL), 0)::NUMERIC * 100,
                2
            ) AS accuracy_percent,
            ROUND(AVG(spa.confidence), 4) AS avg_confidence,
            ROUND(AVG(spa.confidence) FILTER (WHERE spa.outcome = 'correct'), 4) AS confidence_when_correct,
            ROUND(AVG(spa.confidence) FILTER (WHERE spa.outcome = 'incorrect'), 4) AS confidence_when_incorrect,
            -- Bullish accuracy
            ROUND(
                COUNT(*) FILTER (WHERE spa.conclusion = 'bullish' AND spa.outcome = 'correct')::NUMERIC /
                NULLIF(COUNT(*) FILTER (WHERE spa.conclusion = 'bullish' AND spa.outcome IS NOT NULL), 0)::NUMERIC * 100,
                2
            ) AS bullish_accuracy,
            -- Bearish accuracy
            ROUND(
                COUNT(*) FILTER (WHERE spa.conclusion = 'bearish' AND spa.outcome = 'correct')::NUMERIC /
                NULLIF(COUNT(*) FILTER (WHERE spa.conclusion = 'bearish' AND spa.outcome IS NOT NULL), 0)::NUMERIC * 100,
                2
            ) AS bearish_accuracy,
            -- Neutral accuracy
            ROUND(
                COUNT(*) FILTER (WHERE spa.conclusion = 'neutral' AND spa.outcome IN ('correct', 'partial'))::NUMERIC /
                NULLIF(COUNT(*) FILTER (WHERE spa.conclusion = 'neutral' AND spa.outcome IS NOT NULL), 0)::NUMERIC * 100,
                2
            ) AS neutral_accuracy
        FROM specialist_analyses spa
        GROUP BY spa.specialist, spa.instrument
    )
    SELECT * FROM aggregated;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION predictions.get_specialist_accuracy(UUID, TEXT, TEXT, INTEGER)
IS 'Get specialist accuracy metrics for a prediction agent, optionally filtered by instrument';

-- =============================================================================
-- FUNCTION: Get Postmortems with Instrument
-- =============================================================================
-- Returns postmortems for an instrument, optionally filtered by outcome type
-- =============================================================================

CREATE OR REPLACE FUNCTION predictions.get_postmortems_with_instrument(
    p_prediction_agent_id UUID,
    p_instrument TEXT,
    p_outcome TEXT DEFAULT NULL,  -- 'correct', 'incorrect', NULL for all
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    postmortem_id UUID,
    recommendation_id UUID,
    instrument TEXT,
    action TEXT,
    confidence NUMERIC,
    outcome TEXT,
    actual_return_percent NUMERIC,
    what_worked TEXT[],
    what_failed TEXT[],
    root_cause TEXT,
    key_learnings TEXT[],
    missing_context TEXT[],
    applied_to_context BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pm.id AS postmortem_id,
        pm.recommendation_id,
        pm.instrument,
        r.action,
        r.confidence,
        o.outcome,
        o.actual_return_percent,
        pm.what_worked,
        pm.what_failed,
        pm.root_cause,
        pm.key_learnings,
        pm.missing_context,
        pm.applied_to_context,
        pm.created_at
    FROM predictions.postmortems pm
    JOIN predictions.recommendations r ON pm.recommendation_id = r.id
    JOIN predictions.outcomes o ON pm.outcome_id = o.id
    WHERE pm.prediction_agent_id = p_prediction_agent_id
      AND pm.instrument = p_instrument
      AND (p_outcome IS NULL OR o.outcome = p_outcome)
    ORDER BY pm.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION predictions.get_postmortems_with_instrument(UUID, TEXT, TEXT, INTEGER)
IS 'Get postmortems for a specific instrument, optionally filtered by outcome type';

-- =============================================================================
-- FUNCTION: Get Missed Opportunities
-- =============================================================================
-- Returns missed opportunities for an agent/instrument
-- =============================================================================

CREATE OR REPLACE FUNCTION predictions.get_missed_opportunities(
    p_prediction_agent_id UUID,
    p_instrument TEXT DEFAULT NULL,
    p_min_move_percent NUMERIC DEFAULT 5.0,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    missed_id UUID,
    instrument TEXT,
    missed_type TEXT,
    description TEXT,
    move_percent NUMERIC,
    detection_failure_reason TEXT,
    what_would_have_helped TEXT[],
    suggested_threshold_changes JSONB,
    applied_to_context BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mo.id AS missed_id,
        mo.instrument,
        mo.missed_type,
        mo.description,
        mo.move_percent,
        mo.detection_failure_reason,
        mo.what_would_have_helped,
        mo.suggested_threshold_changes,
        mo.applied_to_context,
        mo.created_at
    FROM predictions.missed_opportunities mo
    WHERE mo.prediction_agent_id = p_prediction_agent_id
      AND (p_instrument IS NULL OR mo.instrument = p_instrument)
      AND ABS(mo.move_percent) >= p_min_move_percent
    ORDER BY ABS(mo.move_percent) DESC, mo.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION predictions.get_missed_opportunities(UUID, TEXT, NUMERIC, INTEGER)
IS 'Get missed opportunities for a prediction agent, filtered by minimum move percent';

-- =============================================================================
-- FUNCTION: Get User Insights
-- =============================================================================
-- Returns validated user insights for context building
-- =============================================================================

CREATE OR REPLACE FUNCTION predictions.get_user_insights(
    p_prediction_agent_id UUID,
    p_instrument TEXT DEFAULT NULL,
    p_validated_only BOOLEAN DEFAULT true,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    insight_id UUID,
    insight_type TEXT,
    instrument TEXT,
    insight_text TEXT,
    structured_insight JSONB,
    effectiveness_score NUMERIC,
    applied_to_context BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ui.id AS insight_id,
        ui.insight_type,
        ui.instrument,
        ui.insight_text,
        ui.structured_insight,
        ui.effectiveness_score,
        ui.applied_to_context,
        ui.created_at
    FROM predictions.user_insights ui
    WHERE ui.prediction_agent_id = p_prediction_agent_id
      AND (p_instrument IS NULL OR ui.instrument = p_instrument)
      AND (NOT p_validated_only OR ui.validated = true)
    ORDER BY
        ui.effectiveness_score DESC NULLS LAST,
        ui.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION predictions.get_user_insights(UUID, TEXT, BOOLEAN, INTEGER)
IS 'Get user insights for a prediction agent, ordered by effectiveness';

-- =============================================================================
-- FUNCTION: Build Learning Context
-- =============================================================================
-- Builds a consolidated learning context for LLM prompts
-- Returns JSON with postmortems, missed opportunities, specialist stats, user insights
-- =============================================================================

CREATE OR REPLACE FUNCTION predictions.build_learning_context(
    p_prediction_agent_id UUID,
    p_instrument TEXT DEFAULT NULL,
    p_max_postmortems INTEGER DEFAULT 5,
    p_max_missed INTEGER DEFAULT 3,
    p_max_insights INTEGER DEFAULT 5,
    p_lookback_days INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_postmortems JSONB;
    v_missed JSONB;
    v_insights JSONB;
    v_specialist_stats JSONB;
BEGIN
    -- Get recent postmortems (prioritize incorrect outcomes for learning)
    SELECT COALESCE(jsonb_agg(pm_row), '[]'::jsonb)
    INTO v_postmortems
    FROM (
        SELECT jsonb_build_object(
            'instrument', pm.instrument,
            'action', r.action,
            'outcome', o.outcome,
            'returnPercent', o.actual_return_percent,
            'whatWorked', pm.what_worked,
            'whatFailed', pm.what_failed,
            'rootCause', pm.root_cause,
            'keyLearnings', pm.key_learnings,
            'missingContext', pm.missing_context,
            'createdAt', pm.created_at
        ) AS pm_row
        FROM predictions.postmortems pm
        JOIN predictions.recommendations r ON pm.recommendation_id = r.id
        JOIN predictions.outcomes o ON pm.outcome_id = o.id
        WHERE pm.prediction_agent_id = p_prediction_agent_id
          AND (p_instrument IS NULL OR pm.instrument = p_instrument)
          AND pm.created_at >= NOW() - (p_lookback_days || ' days')::INTERVAL
        ORDER BY
            CASE WHEN o.outcome = 'incorrect' THEN 0 ELSE 1 END,  -- Prioritize failures
            pm.created_at DESC
        LIMIT p_max_postmortems
    ) sub;

    -- Get missed opportunities
    SELECT COALESCE(jsonb_agg(mo_row), '[]'::jsonb)
    INTO v_missed
    FROM (
        SELECT jsonb_build_object(
            'instrument', mo.instrument,
            'type', mo.missed_type,
            'description', mo.description,
            'movePercent', mo.move_percent,
            'failureReason', mo.detection_failure_reason,
            'whatWouldHaveHelped', mo.what_would_have_helped,
            'suggestedThresholds', mo.suggested_threshold_changes,
            'createdAt', mo.created_at
        ) AS mo_row
        FROM predictions.missed_opportunities mo
        WHERE mo.prediction_agent_id = p_prediction_agent_id
          AND (p_instrument IS NULL OR mo.instrument = p_instrument)
          AND mo.created_at >= NOW() - (p_lookback_days || ' days')::INTERVAL
        ORDER BY ABS(mo.move_percent) DESC
        LIMIT p_max_missed
    ) sub;

    -- Get validated user insights
    SELECT COALESCE(jsonb_agg(ui_row), '[]'::jsonb)
    INTO v_insights
    FROM (
        SELECT jsonb_build_object(
            'type', ui.insight_type,
            'instrument', ui.instrument,
            'insight', ui.insight_text,
            'structured', ui.structured_insight,
            'effectivenessScore', ui.effectiveness_score,
            'createdAt', ui.created_at
        ) AS ui_row
        FROM predictions.user_insights ui
        WHERE ui.prediction_agent_id = p_prediction_agent_id
          AND (p_instrument IS NULL OR ui.instrument = p_instrument)
          AND ui.validated = true
        ORDER BY ui.effectiveness_score DESC NULLS LAST, ui.created_at DESC
        LIMIT p_max_insights
    ) sub;

    -- Get specialist accuracy stats
    SELECT COALESCE(jsonb_agg(sa_row), '[]'::jsonb)
    INTO v_specialist_stats
    FROM (
        SELECT jsonb_build_object(
            'specialist', sa.specialist,
            'instrument', sa.instrument,
            'accuracyPercent', sa.accuracy_percent,
            'avgConfidence', sa.avg_confidence,
            'totalAnalyses', sa.total_analyses,
            'confidenceWhenCorrect', sa.confidence_when_correct,
            'confidenceWhenIncorrect', sa.confidence_when_incorrect
        ) AS sa_row
        FROM predictions.specialist_accuracy sa
        WHERE sa.prediction_agent_id = p_prediction_agent_id
          AND (p_instrument IS NULL OR sa.instrument = p_instrument OR sa.instrument IS NULL)
          AND sa.period_end >= NOW() - (p_lookback_days || ' days')::INTERVAL
        ORDER BY sa.total_analyses DESC
        LIMIT 10
    ) sub;

    -- Build final result
    v_result := jsonb_build_object(
        'agentId', p_prediction_agent_id,
        'instrument', p_instrument,
        'lookbackDays', p_lookback_days,
        'generatedAt', NOW(),
        'postmortems', v_postmortems,
        'missedOpportunities', v_missed,
        'userInsights', v_insights,
        'specialistStats', v_specialist_stats
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION predictions.build_learning_context(UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER)
IS 'Build consolidated learning context for LLM prompts with postmortems, missed opportunities, insights, and specialist stats';

-- =============================================================================
-- FUNCTION: Get Agent Learning Summary
-- =============================================================================
-- Returns a high-level summary of agent learning state
-- =============================================================================

CREATE OR REPLACE FUNCTION predictions.get_agent_learning_summary(
    p_prediction_agent_id UUID
)
RETURNS TABLE (
    total_recommendations INTEGER,
    total_outcomes INTEGER,
    overall_accuracy_percent NUMERIC,
    total_postmortems INTEGER,
    unapplied_postmortems INTEGER,
    total_missed_opportunities INTEGER,
    unapplied_missed_opportunities INTEGER,
    total_user_insights INTEGER,
    validated_insights INTEGER,
    unapplied_insights INTEGER,
    active_conversations INTEGER,
    last_learning_update TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        -- Recommendation stats
        (SELECT COUNT(*)::INTEGER FROM predictions.recommendations WHERE prediction_agent_id = p_prediction_agent_id),
        (SELECT COUNT(*)::INTEGER FROM predictions.outcomes o
         JOIN predictions.recommendations r ON o.recommendation_id = r.id
         WHERE r.prediction_agent_id = p_prediction_agent_id),
        (SELECT ROUND(
            COUNT(*) FILTER (WHERE o.outcome = 'correct')::NUMERIC /
            NULLIF(COUNT(*), 0)::NUMERIC * 100, 2
        ) FROM predictions.outcomes o
         JOIN predictions.recommendations r ON o.recommendation_id = r.id
         WHERE r.prediction_agent_id = p_prediction_agent_id),
        -- Postmortem stats
        (SELECT COUNT(*)::INTEGER FROM predictions.postmortems WHERE prediction_agent_id = p_prediction_agent_id),
        (SELECT COUNT(*)::INTEGER FROM predictions.postmortems WHERE prediction_agent_id = p_prediction_agent_id AND NOT applied_to_context),
        -- Missed opportunity stats
        (SELECT COUNT(*)::INTEGER FROM predictions.missed_opportunities WHERE prediction_agent_id = p_prediction_agent_id),
        (SELECT COUNT(*)::INTEGER FROM predictions.missed_opportunities WHERE prediction_agent_id = p_prediction_agent_id AND NOT applied_to_context),
        -- User insight stats
        (SELECT COUNT(*)::INTEGER FROM predictions.user_insights WHERE prediction_agent_id = p_prediction_agent_id),
        (SELECT COUNT(*)::INTEGER FROM predictions.user_insights WHERE prediction_agent_id = p_prediction_agent_id AND validated),
        (SELECT COUNT(*)::INTEGER FROM predictions.user_insights WHERE prediction_agent_id = p_prediction_agent_id AND validated AND NOT applied_to_context),
        -- Active conversations
        (SELECT COUNT(*)::INTEGER FROM predictions.learning_conversations WHERE prediction_agent_id = p_prediction_agent_id AND status = 'active'),
        -- Last learning update
        (SELECT GREATEST(
            (SELECT MAX(applied_at) FROM predictions.postmortems WHERE prediction_agent_id = p_prediction_agent_id),
            (SELECT MAX(applied_at) FROM predictions.missed_opportunities WHERE prediction_agent_id = p_prediction_agent_id),
            (SELECT MAX(applied_at) FROM predictions.user_insights WHERE prediction_agent_id = p_prediction_agent_id)
        ));
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION predictions.get_agent_learning_summary(UUID)
IS 'Get high-level summary of agent learning state';

-- =============================================================================
-- FUNCTION: Update Specialist Accuracy
-- =============================================================================
-- Recalculates and updates specialist accuracy for a period
-- =============================================================================

CREATE OR REPLACE FUNCTION predictions.update_specialist_accuracy(
    p_prediction_agent_id UUID,
    p_period_days INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
    v_period_start TIMESTAMPTZ;
    v_period_end TIMESTAMPTZ;
    v_rows_updated INTEGER := 0;
BEGIN
    v_period_end := NOW();
    v_period_start := NOW() - (p_period_days || ' days')::INTERVAL;

    -- Delete existing records for this period
    DELETE FROM predictions.specialist_accuracy
    WHERE prediction_agent_id = p_prediction_agent_id
      AND period_start = v_period_start
      AND period_end = v_period_end;

    -- Insert fresh accuracy data
    INSERT INTO predictions.specialist_accuracy (
        prediction_agent_id,
        specialist,
        instrument,
        period_start,
        period_end,
        total_analyses,
        correct_conclusions,
        accuracy_percent,
        avg_confidence,
        confidence_when_correct,
        confidence_when_incorrect,
        bullish_count,
        bullish_correct,
        bearish_count,
        bearish_correct,
        neutral_count,
        neutral_correct
    )
    SELECT
        p_prediction_agent_id,
        sa.specialist,
        sa.instrument,
        v_period_start,
        v_period_end,
        COUNT(*)::INTEGER,
        COUNT(*) FILTER (WHERE o.outcome = 'correct')::INTEGER,
        ROUND(
            COUNT(*) FILTER (WHERE o.outcome = 'correct')::NUMERIC /
            NULLIF(COUNT(*) FILTER (WHERE o.outcome IS NOT NULL), 0)::NUMERIC * 100,
            2
        ),
        ROUND(AVG(sa.confidence), 4),
        ROUND(AVG(sa.confidence) FILTER (WHERE o.outcome = 'correct'), 4),
        ROUND(AVG(sa.confidence) FILTER (WHERE o.outcome = 'incorrect'), 4),
        COUNT(*) FILTER (WHERE sa.conclusion = 'bullish')::INTEGER,
        COUNT(*) FILTER (WHERE sa.conclusion = 'bullish' AND o.outcome = 'correct')::INTEGER,
        COUNT(*) FILTER (WHERE sa.conclusion = 'bearish')::INTEGER,
        COUNT(*) FILTER (WHERE sa.conclusion = 'bearish' AND o.outcome = 'correct')::INTEGER,
        COUNT(*) FILTER (WHERE sa.conclusion = 'neutral')::INTEGER,
        COUNT(*) FILTER (WHERE sa.conclusion = 'neutral' AND o.outcome IN ('correct', 'partial'))::INTEGER
    FROM predictions.specialist_analyses sa
    JOIN predictions.runs ru ON sa.run_id = ru.id
    JOIN predictions.recommendations r ON r.run_id = ru.id AND r.instrument = sa.instrument
    LEFT JOIN predictions.outcomes o ON r.id = o.recommendation_id
    WHERE ru.prediction_agent_id = p_prediction_agent_id
      AND ru.started_at >= v_period_start
      AND ru.started_at <= v_period_end
    GROUP BY sa.specialist, sa.instrument;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    RETURN v_rows_updated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION predictions.update_specialist_accuracy(UUID, INTEGER)
IS 'Recalculate and update specialist accuracy metrics for a prediction agent';

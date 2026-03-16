-- =============================================================================
-- CREATE ANALYTICS VIEWS FOR TEST-BASED LEARNING LOOP
-- =============================================================================
-- Phase 6: Analytics & Insights
-- Test-Based Learning Loop - Analytics Database Infrastructure
-- PRD Section: 14, 16 - Phase 6
-- =============================================================================

-- =============================================================================
-- VIEW 1: V_ANALYTICS_ACCURACY_COMPARISON
-- =============================================================================
-- Purpose: Compare prediction accuracy between test and production systems
-- Enables: Side-by-side accuracy tracking, confidence analysis
-- =============================================================================

CREATE OR REPLACE VIEW prediction.v_analytics_accuracy_comparison AS
WITH daily_predictions AS (
  SELECT
    DATE_TRUNC('day', p.predicted_at)::DATE as period_date,
    p.is_test,
    p.id as prediction_id,
    p.confidence,
    e.direction_correct,
    e.overall_score,
    p.status
  FROM prediction.predictions p
  LEFT JOIN prediction.evaluations e ON e.prediction_id = p.id
  WHERE p.predicted_at IS NOT NULL
),
aggregated_stats AS (
  SELECT
    period_date,
    is_test,
    COUNT(*) as total_predictions,
    COUNT(*) FILTER (WHERE status = 'resolved') as resolved_predictions,
    COUNT(*) FILTER (WHERE direction_correct = true) as correct_predictions,
    AVG(confidence) as avg_confidence,
    AVG(overall_score) as avg_overall_score
  FROM daily_predictions
  GROUP BY period_date, is_test
)
SELECT
  period_date,
  is_test,
  total_predictions,
  resolved_predictions,
  correct_predictions,
  -- Safe division for accuracy percentage
  CASE
    WHEN resolved_predictions > 0
    THEN ROUND((correct_predictions::NUMERIC / NULLIF(resolved_predictions, 0)) * 100, 2)
    ELSE NULL
  END as accuracy_pct,
  ROUND(avg_confidence::NUMERIC, 4) as avg_confidence,
  ROUND(avg_overall_score::NUMERIC, 4) as avg_overall_score
FROM aggregated_stats
ORDER BY period_date DESC, is_test;

COMMENT ON VIEW prediction.v_analytics_accuracy_comparison IS
'Compare prediction accuracy between test and production systems on a daily basis. Tracks total predictions, resolved predictions, correct predictions, accuracy percentage, average confidence, and overall score.';

-- =============================================================================
-- VIEW 2: V_ANALYTICS_LEARNING_VELOCITY
-- =============================================================================
-- Purpose: Track learning creation and promotion rates over time
-- Enables: Learning pipeline health monitoring, promotion tracking
-- =============================================================================

CREATE OR REPLACE VIEW prediction.v_analytics_learning_velocity AS
WITH daily_learnings AS (
  SELECT
    DATE_TRUNC('day', l.created_at)::DATE as period_date,
    l.is_test,
    l.id as learning_id
  FROM prediction.learnings l
  WHERE l.created_at IS NOT NULL
),
daily_promotions AS (
  SELECT
    DATE_TRUNC('day', ll.promoted_at)::DATE as period_date,
    ll.id as promotion_id,
    ll.test_learning_id,
    ll.promoted_at,
    tl.created_at as test_learning_created_at
  FROM prediction.learning_lineage ll
  INNER JOIN prediction.learnings tl ON ll.test_learning_id = tl.id
  WHERE ll.promoted_at IS NOT NULL
),
learning_counts AS (
  SELECT
    period_date,
    COUNT(*) FILTER (WHERE is_test = true) as test_learnings_created,
    COUNT(*) FILTER (WHERE is_test = false) as production_learnings_created
  FROM daily_learnings
  GROUP BY period_date
),
promotion_counts AS (
  SELECT
    period_date,
    COUNT(*) as learnings_promoted,
    AVG(EXTRACT(EPOCH FROM (promoted_at - test_learning_created_at)) / 86400) as avg_days_to_promotion
  FROM daily_promotions
  GROUP BY period_date
)
SELECT
  COALESCE(lc.period_date, pc.period_date) as period_date,
  COALESCE(lc.test_learnings_created, 0) as test_learnings_created,
  COALESCE(lc.production_learnings_created, 0) as production_learnings_created,
  COALESCE(pc.learnings_promoted, 0) as learnings_promoted,
  ROUND(pc.avg_days_to_promotion::NUMERIC, 2) as avg_days_to_promotion
FROM learning_counts lc
FULL OUTER JOIN promotion_counts pc ON lc.period_date = pc.period_date
ORDER BY period_date DESC;

COMMENT ON VIEW prediction.v_analytics_learning_velocity IS
'Track learning creation and promotion rates over time. Shows daily counts of test learnings created, production learnings created, learnings promoted, and average time from test learning creation to promotion.';

-- =============================================================================
-- VIEW 3: V_ANALYTICS_SCENARIO_EFFECTIVENESS
-- =============================================================================
-- Purpose: Measure how effective different scenario types are
-- Enables: Scenario quality assessment, learning generation tracking
-- =============================================================================

CREATE OR REPLACE VIEW prediction.v_analytics_scenario_effectiveness AS
WITH scenario_runs_summary AS (
  SELECT
    ts.scenario_type,
    sr.id as run_id,
    sr.outcome_match,
    sr.started_at,
    sr.completed_at,
    -- Calculate run duration in minutes
    CASE
      WHEN sr.completed_at IS NOT NULL AND sr.started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (sr.completed_at - sr.started_at)) / 60
      ELSE NULL
    END as run_duration_minutes
  FROM prediction.test_scenarios ts
  INNER JOIN prediction.scenario_runs sr ON ts.id = sr.scenario_id
  WHERE sr.status IN ('completed', 'failed')
),
scenario_learnings AS (
  SELECT
    ts.scenario_type,
    COUNT(l.id) as learnings_count
  FROM prediction.test_scenarios ts
  LEFT JOIN prediction.learnings l ON ts.id = l.test_scenario_id
  GROUP BY ts.scenario_type
)
SELECT
  srs.scenario_type,
  COUNT(DISTINCT ts.id) as total_scenarios,
  COUNT(srs.run_id) as total_runs,
  COUNT(*) FILTER (WHERE srs.outcome_match = true) as successful_runs,
  -- Safe division for success rate
  CASE
    WHEN COUNT(srs.run_id) > 0
    THEN ROUND((COUNT(*) FILTER (WHERE srs.outcome_match = true)::NUMERIC / NULLIF(COUNT(srs.run_id), 0)) * 100, 2)
    ELSE NULL
  END as success_rate_pct,
  COALESCE(sl.learnings_count, 0) as learnings_generated,
  ROUND(AVG(srs.run_duration_minutes)::NUMERIC, 2) as avg_run_duration_minutes
FROM prediction.test_scenarios ts
LEFT JOIN scenario_runs_summary srs ON ts.scenario_type = srs.scenario_type
LEFT JOIN scenario_learnings sl ON ts.scenario_type = sl.scenario_type
GROUP BY srs.scenario_type, sl.learnings_count
ORDER BY total_runs DESC, success_rate_pct DESC;

COMMENT ON VIEW prediction.v_analytics_scenario_effectiveness IS
'Measure effectiveness of different scenario types. Shows total scenarios, total runs, successful runs, success rate, learnings generated, and average run duration for each scenario type.';

-- =============================================================================
-- VIEW 4: V_ANALYTICS_PROMOTION_FUNNEL
-- =============================================================================
-- Purpose: Show the promotion pipeline stages
-- Enables: Funnel analysis, bottleneck identification
-- =============================================================================

CREATE OR REPLACE VIEW prediction.v_analytics_promotion_funnel AS
WITH test_learnings_created AS (
  SELECT COUNT(*) as count
  FROM prediction.learnings
  WHERE is_test = true
),
validated_learnings AS (
  -- Learnings that have been applied at least once in test scenarios
  SELECT COUNT(DISTINCT l.id) as count
  FROM prediction.learnings l
  WHERE l.is_test = true
    AND l.times_applied > 0
),
backtested_learnings AS (
  -- Learnings that appear in lineage (have backtest results)
  SELECT COUNT(DISTINCT ll.test_learning_id) as count
  FROM prediction.learning_lineage ll
  WHERE ll.backtest_result IS NOT NULL
),
promoted_learnings AS (
  -- Learnings that have been promoted to production
  SELECT COUNT(*) as count
  FROM prediction.learning_lineage
),
total_base AS (
  SELECT count FROM test_learnings_created
),
funnel_data AS (
  SELECT 'test_created' as stage, tc.count, 1 as sort_order
  FROM test_learnings_created tc

  UNION ALL

  SELECT 'validated' as stage, vl.count, 2 as sort_order
  FROM validated_learnings vl

  UNION ALL

  SELECT 'backtested' as stage, bl.count, 3 as sort_order
  FROM backtested_learnings bl

  UNION ALL

  SELECT 'promoted' as stage, pl.count, 4 as sort_order
  FROM promoted_learnings pl
)
SELECT
  fd.stage,
  fd.count,
  -- Safe division for percentage calculation
  CASE
    WHEN tb.count > 0
    THEN ROUND((fd.count::NUMERIC / NULLIF(tb.count, 0)) * 100, 2)
    ELSE 0
  END as pct_of_total
FROM funnel_data fd
CROSS JOIN total_base tb
ORDER BY fd.sort_order;

COMMENT ON VIEW prediction.v_analytics_promotion_funnel IS
'Show the promotion pipeline stages from test learning creation to production promotion. Tracks count and percentage at each stage: test_created, validated (applied at least once), backtested (has backtest results), and promoted to production.';

-- =============================================================================
-- RECOMMENDED INDEXES FOR BASE TABLES
-- =============================================================================
-- These indexes improve query performance for the analytics views.
-- Note: Most of these indexes already exist based on the schema review.
-- This section documents the key indexes that make the views performant.
--
-- Existing indexes that support analytics:
-- - idx_prediction_predictions_predicted_at (predictions.predicted_at)
-- - idx_prediction_predictions_is_test (predictions.is_test)
-- - idx_prediction_evaluations_direction_correct (evaluations.direction_correct)
-- - idx_learnings_created (learnings.created_at)
-- - idx_prediction_learnings_is_test (learnings.is_test)
-- - idx_learning_lineage_promoted_at (learning_lineage.promoted_at)
-- - idx_scenario_runs_outcome_match (scenario_runs.outcome_match)
-- - idx_test_scenarios_type (test_scenarios.scenario_type)
--
-- Additional recommended indexes (if performance issues arise):
-- CREATE INDEX IF NOT EXISTS idx_predictions_predicted_at_date
--   ON prediction.predictions (DATE_TRUNC('day', predicted_at));
-- CREATE INDEX IF NOT EXISTS idx_learnings_created_at_date
--   ON prediction.learnings (DATE_TRUNC('day', created_at));
-- CREATE INDEX IF NOT EXISTS idx_learning_lineage_promoted_at_date
--   ON prediction.learning_lineage (DATE_TRUNC('day', promoted_at));
-- =============================================================================

-- =============================================================================
-- USAGE EXAMPLES
-- =============================================================================
--
-- 1. Compare test vs production accuracy:
-- SELECT * FROM prediction.v_analytics_accuracy_comparison
-- WHERE period_date >= CURRENT_DATE - INTERVAL '30 days'
-- ORDER BY period_date DESC, is_test;
--
-- 2. Track learning velocity:
-- SELECT * FROM prediction.v_analytics_learning_velocity
-- WHERE period_date >= CURRENT_DATE - INTERVAL '30 days'
-- ORDER BY period_date DESC;
--
-- 3. Analyze scenario effectiveness:
-- SELECT * FROM prediction.v_analytics_scenario_effectiveness
-- ORDER BY success_rate_pct DESC;
--
-- 4. Monitor promotion funnel:
-- SELECT * FROM prediction.v_analytics_promotion_funnel;
--
-- =============================================================================

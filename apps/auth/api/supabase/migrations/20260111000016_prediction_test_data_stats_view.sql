-- =============================================================================
-- CREATE V_TEST_DATA_STATS MONITORING VIEW
-- =============================================================================
-- Dashboard view for monitoring test data accumulation
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- PRD Section: 13.4 Storage Monitoring
-- =============================================================================

CREATE OR REPLACE VIEW prediction.v_test_data_stats AS
WITH scenario_stats AS (
  SELECT
    COUNT(*) as total_scenarios,
    COUNT(*) FILTER (WHERE status = 'draft') as draft_scenarios,
    COUNT(*) FILTER (WHERE status = 'ready') as ready_scenarios,
    COUNT(*) FILTER (WHERE status = 'archived') as archived_scenarios
  FROM prediction.test_scenarios
),
article_stats AS (
  SELECT
    COUNT(*) as total_articles,
    COUNT(*) FILTER (WHERE processed = true) as processed_articles,
    COUNT(*) FILTER (WHERE processed = false) as unprocessed_articles
  FROM prediction.test_articles
),
price_stats AS (
  SELECT
    COUNT(*) as total_price_records,
    COUNT(DISTINCT symbol) as distinct_symbols
  FROM prediction.test_price_data
),
run_stats AS (
  SELECT
    COUNT(*) as total_runs,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_runs,
    COUNT(*) FILTER (WHERE status = 'running') as running_runs,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_runs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_runs,
    COUNT(*) FILTER (WHERE outcome_match = true) as successful_runs,
    COUNT(*) FILTER (WHERE outcome_match = false) as failed_outcome_runs
  FROM prediction.scenario_runs
),
signal_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE is_test = true) as test_signals,
    COUNT(*) FILTER (WHERE is_test = false) as production_signals
  FROM prediction.signals
),
predictor_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE is_test = true) as test_predictors,
    COUNT(*) FILTER (WHERE is_test = false) as production_predictors
  FROM prediction.predictors
),
prediction_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE is_test = true) as test_predictions,
    COUNT(*) FILTER (WHERE is_test = false) as production_predictions
  FROM prediction.predictions
),
learning_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE is_test = true) as test_learnings,
    COUNT(*) FILTER (WHERE is_test = false) as production_learnings,
    COUNT(*) as total_learnings
  FROM prediction.learnings
),
lineage_stats AS (
  SELECT
    COUNT(*) as total_promotions
  FROM prediction.learning_lineage
),
mirror_stats AS (
  SELECT
    COUNT(*) as total_mirrors
  FROM prediction.test_target_mirrors
)
SELECT
  -- Scenario stats
  s.total_scenarios,
  s.draft_scenarios,
  s.ready_scenarios,
  s.archived_scenarios,

  -- Article stats
  a.total_articles,
  a.processed_articles,
  a.unprocessed_articles,

  -- Price data stats
  p.total_price_records,
  p.distinct_symbols as price_symbols,

  -- Run stats
  r.total_runs,
  r.pending_runs,
  r.running_runs,
  r.completed_runs,
  r.failed_runs,
  r.successful_runs,
  r.failed_outcome_runs,

  -- Signal breakdown
  sig.test_signals,
  sig.production_signals,

  -- Predictor breakdown
  pred.test_predictors,
  pred.production_predictors,

  -- Prediction breakdown
  prd.test_predictions,
  prd.production_predictions,

  -- Learning breakdown
  l.test_learnings,
  l.production_learnings,
  l.total_learnings,

  -- Promotion stats
  lin.total_promotions,

  -- Mirror stats
  m.total_mirrors,

  -- Calculated metrics
  CASE WHEN r.total_runs > 0
    THEN ROUND((r.successful_runs::DECIMAL / r.total_runs) * 100, 2)
    ELSE 0
  END as run_success_rate_pct,

  CASE WHEN l.test_learnings > 0
    THEN ROUND((lin.total_promotions::DECIMAL / l.test_learnings) * 100, 2)
    ELSE 0
  END as promotion_rate_pct,

  NOW() as stats_generated_at

FROM scenario_stats s
CROSS JOIN article_stats a
CROSS JOIN price_stats p
CROSS JOIN run_stats r
CROSS JOIN signal_stats sig
CROSS JOIN predictor_stats pred
CROSS JOIN prediction_stats prd
CROSS JOIN learning_stats l
CROSS JOIN lineage_stats lin
CROSS JOIN mirror_stats m;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON VIEW prediction.v_test_data_stats IS 'Dashboard view for monitoring test data accumulation and statistics';

-- =============================================================================
-- USAGE
-- =============================================================================
-- SELECT * FROM prediction.v_test_data_stats;

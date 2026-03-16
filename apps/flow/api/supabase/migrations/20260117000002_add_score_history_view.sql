-- =============================================================================
-- ADD SCORE HISTORY VIEW AND INDEX
-- =============================================================================
-- Feature 1: Score History Chart
-- Creates index and view for efficient time-series score queries
-- =============================================================================

-- Create composite index for time-series queries on composite_scores
CREATE INDEX IF NOT EXISTS idx_composite_scores_subject_time
ON risk.composite_scores(subject_id, created_at DESC);

-- Create index for scope-level history queries
CREATE INDEX IF NOT EXISTS idx_composite_scores_scope_time
ON risk.composite_scores(subject_id, status, created_at DESC);

-- =============================================================================
-- SCORE HISTORY VIEW
-- =============================================================================
-- Provides score history with change calculation using window functions

CREATE OR REPLACE VIEW risk.score_history AS
SELECT
  cs.id,
  cs.subject_id,
  cs.overall_score,
  cs.dimension_scores,
  cs.confidence,
  cs.debate_id,
  cs.debate_adjustment,
  cs.pre_debate_score,
  cs.status,
  cs.created_at,
  cs.is_test,
  -- Calculate previous score using LAG window function
  LAG(cs.overall_score) OVER (
    PARTITION BY cs.subject_id
    ORDER BY cs.created_at
  ) AS previous_score,
  -- Calculate score change from previous assessment
  cs.overall_score - COALESCE(
    LAG(cs.overall_score) OVER (
      PARTITION BY cs.subject_id
      ORDER BY cs.created_at
    ), cs.overall_score
  ) AS score_change,
  -- Calculate percentage change
  CASE
    WHEN LAG(cs.overall_score) OVER (PARTITION BY cs.subject_id ORDER BY cs.created_at) > 0
    THEN ROUND(
      ((cs.overall_score - LAG(cs.overall_score) OVER (PARTITION BY cs.subject_id ORDER BY cs.created_at))::DECIMAL /
       LAG(cs.overall_score) OVER (PARTITION BY cs.subject_id ORDER BY cs.created_at)) * 100, 2
    )
    ELSE 0
  END AS score_change_percent,
  -- Row number for pagination
  ROW_NUMBER() OVER (
    PARTITION BY cs.subject_id
    ORDER BY cs.created_at DESC
  ) AS history_rank
FROM risk.composite_scores cs
ORDER BY cs.subject_id, cs.created_at DESC;

COMMENT ON VIEW risk.score_history IS 'Score history with change calculations for trend analysis';

-- =============================================================================
-- SCORE TRENDS VIEW
-- =============================================================================
-- Aggregated trend metrics for subjects

CREATE OR REPLACE VIEW risk.score_trends AS
SELECT
  subject_id,
  -- Latest score
  (SELECT overall_score FROM risk.composite_scores cs2
   WHERE cs2.subject_id = cs.subject_id AND cs2.is_test = false
   ORDER BY cs2.created_at DESC LIMIT 1) AS current_score,
  -- 7-day change
  (SELECT overall_score FROM risk.composite_scores cs2
   WHERE cs2.subject_id = cs.subject_id AND cs2.is_test = false
   ORDER BY cs2.created_at DESC LIMIT 1) -
  COALESCE(
    (SELECT overall_score FROM risk.composite_scores cs2
     WHERE cs2.subject_id = cs.subject_id AND cs2.is_test = false
       AND cs2.created_at < NOW() - INTERVAL '7 days'
     ORDER BY cs2.created_at DESC LIMIT 1),
    (SELECT overall_score FROM risk.composite_scores cs2
     WHERE cs2.subject_id = cs.subject_id AND cs2.is_test = false
     ORDER BY cs2.created_at ASC LIMIT 1)
  ) AS change_7d,
  -- 30-day change
  (SELECT overall_score FROM risk.composite_scores cs2
   WHERE cs2.subject_id = cs.subject_id AND cs2.is_test = false
   ORDER BY cs2.created_at DESC LIMIT 1) -
  COALESCE(
    (SELECT overall_score FROM risk.composite_scores cs2
     WHERE cs2.subject_id = cs.subject_id AND cs2.is_test = false
       AND cs2.created_at < NOW() - INTERVAL '30 days'
     ORDER BY cs2.created_at DESC LIMIT 1),
    (SELECT overall_score FROM risk.composite_scores cs2
     WHERE cs2.subject_id = cs.subject_id AND cs2.is_test = false
     ORDER BY cs2.created_at ASC LIMIT 1)
  ) AS change_30d,
  -- Statistics
  COUNT(*) AS total_assessments,
  AVG(overall_score) AS avg_score,
  MAX(overall_score) AS max_score,
  MIN(overall_score) AS min_score,
  STDDEV(overall_score) AS score_stddev,
  MIN(created_at) AS first_assessment,
  MAX(created_at) AS latest_assessment
FROM risk.composite_scores cs
WHERE cs.is_test = false
GROUP BY cs.subject_id;

COMMENT ON VIEW risk.score_trends IS 'Aggregated score trends and statistics per subject';

-- =============================================================================
-- HELPER FUNCTION: Get Score History
-- =============================================================================

CREATE OR REPLACE FUNCTION risk.get_score_history(
  p_subject_id UUID,
  p_days INTEGER DEFAULT 30,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  id UUID,
  overall_score INTEGER,
  dimension_scores JSONB,
  confidence NUMERIC,
  previous_score INTEGER,
  score_change INTEGER,
  score_change_percent NUMERIC,
  debate_adjustment INTEGER,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sh.id,
    sh.overall_score,
    sh.dimension_scores,
    sh.confidence,
    sh.previous_score,
    sh.score_change,
    sh.score_change_percent,
    sh.debate_adjustment,
    sh.created_at
  FROM risk.score_history sh
  WHERE sh.subject_id = p_subject_id
    AND sh.is_test = false
    AND sh.created_at >= NOW() - (p_days || ' days')::INTERVAL
  ORDER BY sh.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION risk.get_score_history IS 'Get score history for a subject with configurable date range';

-- =============================================================================
-- HELPER FUNCTION: Get Scope Score History
-- =============================================================================

CREATE OR REPLACE FUNCTION risk.get_scope_score_history(
  p_scope_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE(
  subject_id UUID,
  subject_name TEXT,
  subject_identifier TEXT,
  scores JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS subject_id,
    s.name AS subject_name,
    s.identifier AS subject_identifier,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'score', sh.overall_score,
          'confidence', sh.confidence,
          'change', sh.score_change,
          'created_at', sh.created_at
        ) ORDER BY sh.created_at DESC
      )
      FROM risk.score_history sh
      WHERE sh.subject_id = s.id
        AND sh.is_test = false
        AND sh.created_at >= NOW() - (p_days || ' days')::INTERVAL
    ) AS scores
  FROM risk.subjects s
  WHERE s.scope_id = p_scope_id
    AND s.is_active = true
    AND s.is_test = false;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION risk.get_scope_score_history IS 'Get score history for all subjects in a scope';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Score History Migration Complete';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - Index: idx_composite_scores_subject_time';
  RAISE NOTICE '  - Index: idx_composite_scores_scope_time';
  RAISE NOTICE '  - View: risk.score_history';
  RAISE NOTICE '  - View: risk.score_trends';
  RAISE NOTICE '  - Function: risk.get_score_history()';
  RAISE NOTICE '  - Function: risk.get_scope_score_history()';
  RAISE NOTICE '================================================';
END $$;

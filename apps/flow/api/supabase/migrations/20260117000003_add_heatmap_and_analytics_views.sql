-- =============================================================================
-- ADD HEATMAP AND ANALYTICS VIEWS
-- =============================================================================
-- Feature 4: Risk Heatmap
-- Feature 6: Portfolio Aggregate View
-- Feature 7: Correlation Matrix Support
-- Creates views for heatmap data, portfolio aggregation, and correlation analysis
-- =============================================================================

-- =============================================================================
-- HEATMAP VIEW
-- =============================================================================
-- Visual matrix showing risk levels across all subjects and dimensions

CREATE OR REPLACE VIEW risk.heatmap_data AS
SELECT
  s.id AS subject_id,
  s.name AS subject_name,
  s.identifier AS subject_identifier,
  s.subject_type,
  d.id AS dimension_id,
  d.slug AS dimension_slug,
  d.display_name AS dimension_name,
  d.icon AS dimension_icon,
  d.color AS dimension_color,
  d.weight AS dimension_weight,
  d.display_order,
  a.id AS assessment_id,
  a.score,
  a.confidence,
  a.created_at AS assessment_date,
  -- Risk level classification
  CASE
    WHEN a.score >= 70 THEN 'critical'
    WHEN a.score >= 50 THEN 'high'
    WHEN a.score >= 30 THEN 'medium'
    ELSE 'low'
  END AS risk_level,
  -- Color coding for heatmap
  CASE
    WHEN a.score >= 70 THEN '#DC2626'  -- red-600
    WHEN a.score >= 50 THEN '#F97316'  -- orange-500
    WHEN a.score >= 30 THEN '#EAB308'  -- yellow-500
    ELSE '#22C55E'  -- green-500
  END AS risk_color,
  sc.id AS scope_id,
  sc.name AS scope_name
FROM risk.subjects s
CROSS JOIN risk.dimensions d
LEFT JOIN LATERAL (
  SELECT a.*
  FROM risk.assessments a
  WHERE a.subject_id = s.id
    AND a.dimension_id = d.id
    AND a.is_test = false
  ORDER BY a.created_at DESC
  LIMIT 1
) a ON true
JOIN risk.scopes sc ON sc.id = s.scope_id
WHERE s.scope_id = d.scope_id
  AND s.is_active = true
  AND s.is_test = false
  AND d.is_active = true
  AND d.is_test = false
ORDER BY s.name, d.display_order;

COMMENT ON VIEW risk.heatmap_data IS 'Heatmap data showing risk levels across all subjects and dimensions';

-- =============================================================================
-- PORTFOLIO AGGREGATE VIEW
-- =============================================================================
-- Total portfolio risk with statistics

CREATE OR REPLACE VIEW risk.portfolio_aggregate AS
SELECT
  sc.id AS scope_id,
  sc.name AS scope_name,
  sc.domain,
  COUNT(DISTINCT cs.subject_id) AS subject_count,
  -- Score statistics
  ROUND(AVG(cs.overall_score), 2) AS avg_score,
  MAX(cs.overall_score) AS max_score,
  MIN(cs.overall_score) AS min_score,
  ROUND(STDDEV(cs.overall_score)::NUMERIC, 2) AS score_stddev,
  -- Confidence statistics
  ROUND(AVG(cs.confidence)::NUMERIC, 3) AS avg_confidence,
  -- Risk distribution counts
  COUNT(*) FILTER (WHERE cs.overall_score >= 70) AS critical_count,
  COUNT(*) FILTER (WHERE cs.overall_score >= 50 AND cs.overall_score < 70) AS high_count,
  COUNT(*) FILTER (WHERE cs.overall_score >= 30 AND cs.overall_score < 50) AS medium_count,
  COUNT(*) FILTER (WHERE cs.overall_score < 30) AS low_count,
  -- Timestamps
  MAX(cs.created_at) AS latest_assessment,
  MIN(cs.created_at) AS oldest_assessment
FROM risk.scopes sc
LEFT JOIN risk.subjects s ON s.scope_id = sc.id AND s.is_active = true AND s.is_test = false
LEFT JOIN LATERAL (
  SELECT cs.*
  FROM risk.composite_scores cs
  WHERE cs.subject_id = s.id
    AND cs.status = 'active'
    AND cs.is_test = false
  ORDER BY cs.created_at DESC
  LIMIT 1
) cs ON true
WHERE sc.is_active = true
  AND sc.is_test = false
GROUP BY sc.id, sc.name, sc.domain;

COMMENT ON VIEW risk.portfolio_aggregate IS 'Aggregated portfolio-level risk statistics per scope';

-- =============================================================================
-- DIMENSION CONTRIBUTION VIEW
-- =============================================================================
-- Shows how much each dimension contributes to overall portfolio risk

CREATE OR REPLACE VIEW risk.dimension_contribution AS
SELECT
  d.scope_id,
  d.id AS dimension_id,
  d.slug AS dimension_slug,
  d.display_name AS dimension_name,
  d.icon AS dimension_icon,
  d.color AS dimension_color,
  d.weight,
  COUNT(a.id) AS assessment_count,
  ROUND(AVG(a.score), 2) AS avg_score,
  ROUND(AVG(a.confidence)::NUMERIC, 3) AS avg_confidence,
  MAX(a.score) AS max_score,
  MIN(a.score) AS min_score,
  -- Weighted contribution to overall risk
  ROUND((AVG(a.score) * d.weight)::NUMERIC, 2) AS weighted_contribution
FROM risk.dimensions d
LEFT JOIN risk.assessments a ON a.dimension_id = d.id AND a.is_test = false
WHERE d.is_active = true
  AND d.is_test = false
GROUP BY d.scope_id, d.id, d.slug, d.display_name, d.icon, d.color, d.weight
ORDER BY d.display_order;

COMMENT ON VIEW risk.dimension_contribution IS 'Contribution of each dimension to overall portfolio risk';

-- =============================================================================
-- RISK DISTRIBUTION VIEW
-- =============================================================================
-- Shows distribution of risk levels across subjects

CREATE OR REPLACE VIEW risk.risk_distribution AS
SELECT
  sc.id AS scope_id,
  sc.name AS scope_name,
  'critical' AS risk_level,
  '#DC2626' AS color,
  COUNT(*) FILTER (WHERE cs.overall_score >= 70) AS count,
  ROUND(
    COUNT(*) FILTER (WHERE cs.overall_score >= 70)::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS percentage
FROM risk.scopes sc
LEFT JOIN risk.subjects s ON s.scope_id = sc.id AND s.is_active = true AND s.is_test = false
LEFT JOIN LATERAL (
  SELECT cs.*
  FROM risk.composite_scores cs
  WHERE cs.subject_id = s.id
    AND cs.status = 'active'
    AND cs.is_test = false
  ORDER BY cs.created_at DESC
  LIMIT 1
) cs ON true
WHERE sc.is_active = true AND sc.is_test = false
GROUP BY sc.id, sc.name

UNION ALL

SELECT
  sc.id AS scope_id,
  sc.name AS scope_name,
  'high' AS risk_level,
  '#F97316' AS color,
  COUNT(*) FILTER (WHERE cs.overall_score >= 50 AND cs.overall_score < 70) AS count,
  ROUND(
    COUNT(*) FILTER (WHERE cs.overall_score >= 50 AND cs.overall_score < 70)::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS percentage
FROM risk.scopes sc
LEFT JOIN risk.subjects s ON s.scope_id = sc.id AND s.is_active = true AND s.is_test = false
LEFT JOIN LATERAL (
  SELECT cs.*
  FROM risk.composite_scores cs
  WHERE cs.subject_id = s.id
    AND cs.status = 'active'
    AND cs.is_test = false
  ORDER BY cs.created_at DESC
  LIMIT 1
) cs ON true
WHERE sc.is_active = true AND sc.is_test = false
GROUP BY sc.id, sc.name

UNION ALL

SELECT
  sc.id AS scope_id,
  sc.name AS scope_name,
  'medium' AS risk_level,
  '#EAB308' AS color,
  COUNT(*) FILTER (WHERE cs.overall_score >= 30 AND cs.overall_score < 50) AS count,
  ROUND(
    COUNT(*) FILTER (WHERE cs.overall_score >= 30 AND cs.overall_score < 50)::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS percentage
FROM risk.scopes sc
LEFT JOIN risk.subjects s ON s.scope_id = sc.id AND s.is_active = true AND s.is_test = false
LEFT JOIN LATERAL (
  SELECT cs.*
  FROM risk.composite_scores cs
  WHERE cs.subject_id = s.id
    AND cs.status = 'active'
    AND cs.is_test = false
  ORDER BY cs.created_at DESC
  LIMIT 1
) cs ON true
WHERE sc.is_active = true AND sc.is_test = false
GROUP BY sc.id, sc.name

UNION ALL

SELECT
  sc.id AS scope_id,
  sc.name AS scope_name,
  'low' AS risk_level,
  '#22C55E' AS color,
  COUNT(*) FILTER (WHERE cs.overall_score < 30) AS count,
  ROUND(
    COUNT(*) FILTER (WHERE cs.overall_score < 30)::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS percentage
FROM risk.scopes sc
LEFT JOIN risk.subjects s ON s.scope_id = sc.id AND s.is_active = true AND s.is_test = false
LEFT JOIN LATERAL (
  SELECT cs.*
  FROM risk.composite_scores cs
  WHERE cs.subject_id = s.id
    AND cs.status = 'active'
    AND cs.is_test = false
  ORDER BY cs.created_at DESC
  LIMIT 1
) cs ON true
WHERE sc.is_active = true AND sc.is_test = false
GROUP BY sc.id, sc.name
ORDER BY scope_id, risk_level;

COMMENT ON VIEW risk.risk_distribution IS 'Distribution of risk levels across subjects in each scope';

-- =============================================================================
-- CORRELATION CALCULATION FUNCTION
-- =============================================================================
-- Calculate correlations between risk dimensions

CREATE OR REPLACE FUNCTION risk.calculate_correlations(p_scope_id UUID)
RETURNS TABLE(
  dimension1_id UUID,
  dimension1_slug TEXT,
  dimension1_name TEXT,
  dimension2_id UUID,
  dimension2_slug TEXT,
  dimension2_name TEXT,
  correlation NUMERIC,
  sample_size INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH dimension_scores AS (
    SELECT
      a.subject_id,
      d.id AS dimension_id,
      d.slug AS dimension_slug,
      d.display_name AS dimension_name,
      a.score
    FROM risk.assessments a
    JOIN risk.dimensions d ON d.id = a.dimension_id
    WHERE d.scope_id = p_scope_id
      AND d.is_active = true
      AND d.is_test = false
      AND a.is_test = false
      -- Get latest assessment per subject-dimension
      AND a.id = (
        SELECT a2.id FROM risk.assessments a2
        WHERE a2.subject_id = a.subject_id
          AND a2.dimension_id = a.dimension_id
          AND a2.is_test = false
        ORDER BY a2.created_at DESC
        LIMIT 1
      )
  )
  SELECT
    ds1.dimension_id AS dimension1_id,
    ds1.dimension_slug AS dimension1_slug,
    ds1.dimension_name AS dimension1_name,
    ds2.dimension_id AS dimension2_id,
    ds2.dimension_slug AS dimension2_slug,
    ds2.dimension_name AS dimension2_name,
    ROUND(CORR(ds1.score, ds2.score)::NUMERIC, 3) AS correlation,
    COUNT(*)::INTEGER AS sample_size
  FROM dimension_scores ds1
  JOIN dimension_scores ds2 ON ds1.subject_id = ds2.subject_id
  WHERE ds1.dimension_slug < ds2.dimension_slug  -- Only upper triangle to avoid duplicates
  GROUP BY ds1.dimension_id, ds1.dimension_slug, ds1.dimension_name,
           ds2.dimension_id, ds2.dimension_slug, ds2.dimension_name
  HAVING COUNT(*) >= 3  -- Minimum sample size for meaningful correlation
  ORDER BY ABS(CORR(ds1.score, ds2.score)) DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION risk.calculate_correlations IS 'Calculate correlation matrix between dimension scores';

-- =============================================================================
-- HEATMAP DATA FUNCTION
-- =============================================================================
-- Get heatmap data for a specific scope with optional filters

CREATE OR REPLACE FUNCTION risk.get_heatmap_data(
  p_scope_id UUID,
  p_risk_level TEXT DEFAULT NULL
)
RETURNS TABLE(
  subject_id UUID,
  subject_name TEXT,
  subject_identifier TEXT,
  subject_type TEXT,
  dimensions JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS subject_id,
    s.name AS subject_name,
    s.identifier AS subject_identifier,
    s.subject_type,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'dimensionId', hd.dimension_id,
          'dimensionSlug', hd.dimension_slug,
          'dimensionName', hd.dimension_name,
          'icon', hd.dimension_icon,
          'color', hd.dimension_color,
          'score', hd.score,
          'confidence', hd.confidence,
          'riskLevel', hd.risk_level,
          'riskColor', hd.risk_color
        ) ORDER BY hd.display_order
      )
      FROM risk.heatmap_data hd
      WHERE hd.subject_id = s.id
        AND (p_risk_level IS NULL OR hd.risk_level = p_risk_level)
    ) AS dimensions
  FROM risk.subjects s
  WHERE s.scope_id = p_scope_id
    AND s.is_active = true
    AND s.is_test = false
  ORDER BY s.name;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION risk.get_heatmap_data IS 'Get structured heatmap data for a scope';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Heatmap and Analytics Migration Complete';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - View: risk.heatmap_data';
  RAISE NOTICE '  - View: risk.portfolio_aggregate';
  RAISE NOTICE '  - View: risk.dimension_contribution';
  RAISE NOTICE '  - View: risk.risk_distribution';
  RAISE NOTICE '  - Function: risk.calculate_correlations()';
  RAISE NOTICE '  - Function: risk.get_heatmap_data()';
  RAISE NOTICE '================================================';
END $$;

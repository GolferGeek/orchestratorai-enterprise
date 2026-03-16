-- =============================================================================
-- ADD SUBJECT-SPECIFIC ARTICLE QUERY FUNCTIONS
-- =============================================================================
-- Adds functions to query articles relevant to specific subjects (e.g., AAPL).
-- This enables dimension analysis to pull articles mentioning a specific subject.
-- =============================================================================

-- Function: Get articles for a specific subject AND dimension
-- This is the key function for subject-aware dimension analysis
CREATE OR REPLACE FUNCTION risk.get_articles_for_subject_dimension(
  p_scope_id UUID,
  p_subject_identifier TEXT,
  p_dimension_slug TEXT,
  p_since TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours',
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  article_id UUID,
  source_id UUID,
  title TEXT,
  content TEXT,
  url TEXT,
  published_at TIMESTAMPTZ,
  confidence NUMERIC,
  sentiment NUMERIC,
  sentiment_label TEXT,
  risk_indicators JSONB,
  subject_identifiers TEXT[],
  classified_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS article_id,
    a.source_id,
    a.title,
    a.content,
    a.url,
    a.published_at,
    c.confidence,
    c.sentiment,
    c.sentiment_label,
    c.risk_indicators,
    c.subject_identifiers,
    c.created_at AS classified_at
  FROM crawler.articles a
  JOIN risk.article_classifications c ON c.article_id = a.id
  WHERE c.scope_id = p_scope_id
    AND p_dimension_slug = ANY(c.dimension_slugs)
    AND (
      -- Match subject identifier (case-insensitive)
      p_subject_identifier = ANY(c.subject_identifiers)
      OR UPPER(p_subject_identifier) = ANY(SELECT UPPER(unnest(c.subject_identifiers)))
    )
    AND c.status = 'classified'
    AND c.created_at >= p_since
  ORDER BY a.published_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Get all articles mentioning a specific subject (across all dimensions)
CREATE OR REPLACE FUNCTION risk.get_articles_for_subject(
  p_scope_id UUID,
  p_subject_identifier TEXT,
  p_since TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours',
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  article_id UUID,
  source_id UUID,
  title TEXT,
  content TEXT,
  url TEXT,
  published_at TIMESTAMPTZ,
  dimension_slugs TEXT[],
  confidence NUMERIC,
  sentiment NUMERIC,
  sentiment_label TEXT,
  risk_indicators JSONB,
  subject_identifiers TEXT[],
  classified_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS article_id,
    a.source_id,
    a.title,
    a.content,
    a.url,
    a.published_at,
    c.dimension_slugs,
    c.confidence,
    c.sentiment,
    c.sentiment_label,
    c.risk_indicators,
    c.subject_identifiers,
    c.created_at AS classified_at
  FROM crawler.articles a
  JOIN risk.article_classifications c ON c.article_id = a.id
  WHERE c.scope_id = p_scope_id
    AND (
      p_subject_identifier = ANY(c.subject_identifiers)
      OR UPPER(p_subject_identifier) = ANY(SELECT UPPER(unnest(c.subject_identifiers)))
    )
    AND c.status = 'classified'
    AND c.created_at >= p_since
  ORDER BY a.published_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Get subject coverage summary (which subjects have classified articles)
CREATE OR REPLACE FUNCTION risk.get_subject_coverage(
  p_scope_id UUID,
  p_since TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days'
)
RETURNS TABLE (
  subject_identifier TEXT,
  article_count BIGINT,
  avg_sentiment NUMERIC,
  dimension_coverage TEXT[],
  latest_article TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH subject_articles AS (
    SELECT
      unnest(c.subject_identifiers) AS subject,
      c.article_id,
      c.sentiment,
      c.dimension_slugs,
      c.created_at
    FROM risk.article_classifications c
    WHERE c.scope_id = p_scope_id
      AND c.status = 'classified'
      AND c.created_at >= p_since
      AND array_length(c.subject_identifiers, 1) > 0
  )
  SELECT
    sa.subject AS subject_identifier,
    COUNT(DISTINCT sa.article_id) AS article_count,
    ROUND(AVG(sa.sentiment), 3) AS avg_sentiment,
    ARRAY_AGG(DISTINCT unnest_dim ORDER BY unnest_dim) AS dimension_coverage,
    MAX(sa.created_at) AS latest_article
  FROM subject_articles sa,
       LATERAL unnest(sa.dimension_slugs) AS unnest_dim
  GROUP BY sa.subject
  ORDER BY COUNT(DISTINCT sa.article_id) DESC;
END;
$$ LANGUAGE plpgsql;

-- View: Articles by subject (flattened for easy querying)
CREATE OR REPLACE VIEW risk.classified_articles_by_subject AS
SELECT
  c.id AS classification_id,
  c.scope_id,
  a.id AS article_id,
  a.source_id,
  a.title,
  a.url,
  a.published_at,
  unnest(c.subject_identifiers) AS subject_identifier,
  c.dimension_slugs,
  c.confidence,
  c.sentiment,
  c.sentiment_label,
  c.risk_indicators,
  c.created_at AS classified_at
FROM crawler.articles a
JOIN risk.article_classifications c ON c.article_id = a.id
WHERE c.status = 'classified'
  AND array_length(c.subject_identifiers, 1) > 0;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Subject-Specific Article Functions Added';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'New Functions:';
  RAISE NOTICE '  - risk.get_articles_for_subject_dimension(scope_id, subject, dimension)';
  RAISE NOTICE '  - risk.get_articles_for_subject(scope_id, subject)';
  RAISE NOTICE '  - risk.get_subject_coverage(scope_id)';
  RAISE NOTICE 'New Views:';
  RAISE NOTICE '  - risk.classified_articles_by_subject';
  RAISE NOTICE '================================================';
END $$;

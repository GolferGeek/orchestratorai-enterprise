-- =============================================================================
-- CREATE ARTICLE CLASSIFICATIONS TABLE (RISK SCHEMA)
-- =============================================================================
-- Stores LLM-based dimension classifications for crawler articles.
-- This enables efficient routing: classify once with cheap LLM, then only
-- run full analysis on relevant dimensions.
--
-- Lives in risk schema because classification is risk-domain-specific.
-- =============================================================================

-- Article classifications table (risk-specific view of crawler articles)
CREATE TABLE IF NOT EXISTS risk.article_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES risk.scopes(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES crawler.articles(id) ON DELETE CASCADE,

  -- Classification results
  dimension_slugs TEXT[] NOT NULL DEFAULT '{}',  -- Array of dimension slugs: ['regulatory', 'geopolitical']
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),

  -- Subject relevance (which subjects this article might affect)
  subject_identifiers TEXT[] DEFAULT '{}',  -- ['AAPL', 'MSFT'] or patterns

  -- Sentiment for quick filtering
  sentiment NUMERIC(3,2) CHECK (sentiment >= -1 AND sentiment <= 1),  -- -1 to 1
  sentiment_label TEXT CHECK (sentiment_label IN ('very_negative', 'negative', 'neutral', 'positive', 'very_positive')),

  -- Risk indicators detected
  risk_indicators JSONB DEFAULT '[]'::JSONB,  -- [{"type": "regulatory", "keywords": ["SEC", "investigation"]}]

  -- LLM metadata
  llm_provider TEXT,
  llm_model TEXT,
  classification_prompt_version INTEGER DEFAULT 1,

  -- Processing status
  status TEXT DEFAULT 'classified' CHECK (status IN ('classified', 'failed', 'needs_reclassification')),
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one classification per article per scope
  UNIQUE(scope_id, article_id)
);

-- Indexes for efficient queries
CREATE INDEX idx_risk_article_class_scope ON risk.article_classifications(scope_id);
CREATE INDEX idx_risk_article_class_article ON risk.article_classifications(article_id);
CREATE INDEX idx_risk_article_class_dimensions ON risk.article_classifications USING GIN(dimension_slugs);
CREATE INDEX idx_risk_article_class_subjects ON risk.article_classifications USING GIN(subject_identifiers);
CREATE INDEX idx_risk_article_class_sentiment ON risk.article_classifications(sentiment_label);
CREATE INDEX idx_risk_article_class_created ON risk.article_classifications(created_at DESC);
CREATE INDEX idx_risk_article_class_status ON risk.article_classifications(status) WHERE status = 'classified';

-- View: Unclassified articles for a scope (for cron job)
-- Note: Must filter by scope_id when querying
CREATE OR REPLACE VIEW risk.unclassified_articles AS
SELECT
  a.*,
  ss.scope_id
FROM crawler.articles a
JOIN risk.source_subscriptions ss ON ss.source_id = a.source_id
LEFT JOIN risk.article_classifications c ON c.article_id = a.id AND c.scope_id = ss.scope_id
WHERE c.id IS NULL
  AND a.is_duplicate = false
  AND ss.is_active = true
ORDER BY a.published_at DESC NULLS LAST, a.first_seen_at DESC;

-- View: Classified articles by dimension (for risk analysis)
CREATE OR REPLACE VIEW risk.classified_articles_by_dimension AS
SELECT
  c.id AS classification_id,
  c.scope_id,
  a.id AS article_id,
  a.source_id,
  a.title,
  a.content,
  a.url,
  a.published_at,
  unnest(c.dimension_slugs) AS dimension_slug,
  c.confidence,
  c.sentiment,
  c.sentiment_label,
  c.risk_indicators,
  c.subject_identifiers,
  c.created_at AS classified_at
FROM crawler.articles a
JOIN risk.article_classifications c ON c.article_id = a.id
WHERE c.status = 'classified';

-- Function: Get unclassified articles for a scope
CREATE OR REPLACE FUNCTION risk.get_unclassified_articles(
  p_scope_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  article_id UUID,
  source_id UUID,
  title TEXT,
  content TEXT,
  url TEXT,
  published_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ
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
    a.first_seen_at
  FROM crawler.articles a
  JOIN risk.source_subscriptions ss ON ss.source_id = a.source_id
  LEFT JOIN risk.article_classifications c ON c.article_id = a.id AND c.scope_id = p_scope_id
  WHERE c.id IS NULL
    AND ss.scope_id = p_scope_id
    AND ss.is_active = true
    AND a.is_duplicate = false
  ORDER BY a.published_at DESC NULLS LAST, a.first_seen_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Get articles for a specific dimension since a timestamp
CREATE OR REPLACE FUNCTION risk.get_articles_for_dimension(
  p_scope_id UUID,
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
    AND c.status = 'classified'
    AND c.created_at >= p_since
  ORDER BY a.published_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Get classification stats for a scope
CREATE OR REPLACE FUNCTION risk.get_classification_stats(p_scope_id UUID)
RETURNS TABLE (
  total_articles BIGINT,
  classified_articles BIGINT,
  unclassified_articles BIGINT,
  classification_rate NUMERIC,
  avg_dimensions_per_article NUMERIC,
  sentiment_distribution JSONB,
  top_dimensions JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH scope_articles AS (
    SELECT DISTINCT a.id
    FROM crawler.articles a
    JOIN risk.source_subscriptions ss ON ss.source_id = a.source_id
    WHERE ss.scope_id = p_scope_id
      AND ss.is_active = true
      AND a.is_duplicate = false
  ),
  stats AS (
    SELECT
      COUNT(DISTINCT sa.id) AS total,
      COUNT(DISTINCT c.article_id) AS classified
    FROM scope_articles sa
    LEFT JOIN risk.article_classifications c ON c.article_id = sa.id AND c.scope_id = p_scope_id
  ),
  sentiment_stats AS (
    SELECT jsonb_object_agg(sentiment_label, cnt) AS dist
    FROM (
      SELECT sentiment_label, COUNT(*) AS cnt
      FROM risk.article_classifications
      WHERE scope_id = p_scope_id AND sentiment_label IS NOT NULL
      GROUP BY sentiment_label
    ) s
  ),
  dimension_stats AS (
    SELECT jsonb_agg(jsonb_build_object('dimension', dim, 'count', cnt) ORDER BY cnt DESC) AS dims
    FROM (
      SELECT unnest(dimension_slugs) AS dim, COUNT(*) AS cnt
      FROM risk.article_classifications
      WHERE scope_id = p_scope_id
      GROUP BY unnest(dimension_slugs)
      ORDER BY cnt DESC
      LIMIT 10
    ) d
  )
  SELECT
    s.total,
    s.classified,
    s.total - s.classified,
    CASE WHEN s.total > 0 THEN ROUND(s.classified::NUMERIC / s.total * 100, 2) ELSE 0 END,
    (SELECT ROUND(AVG(array_length(dimension_slugs, 1)), 2) FROM risk.article_classifications WHERE scope_id = p_scope_id),
    COALESCE(ss.dist, '{}'::JSONB),
    COALESCE(ds.dims, '[]'::JSONB)
  FROM stats s
  CROSS JOIN sentiment_stats ss
  CROSS JOIN dimension_stats ds;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Risk Article Classifications Schema Created';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Table: risk.article_classifications';
  RAISE NOTICE 'Views:';
  RAISE NOTICE '  - risk.unclassified_articles';
  RAISE NOTICE '  - risk.classified_articles_by_dimension';
  RAISE NOTICE 'Functions:';
  RAISE NOTICE '  - risk.get_unclassified_articles(scope_id)';
  RAISE NOTICE '  - risk.get_articles_for_dimension(scope_id, dimension_slug)';
  RAISE NOTICE '  - risk.get_classification_stats(scope_id)';
  RAISE NOTICE '================================================';
END $$;

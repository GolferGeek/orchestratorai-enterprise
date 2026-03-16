-- =============================================================================
-- OPTIMIZE CRAWLER STATS
-- =============================================================================
-- Add RPC function to fetch aggregated stats for multiple sources in a single query
-- Reduces N+1 query issues on the admin dashboard
-- =============================================================================

-- Function to get crawl stats for all sources in an organization
-- Returns one row per source with aggregated stats
CREATE OR REPLACE FUNCTION crawler.get_crawl_stats_by_source(
  p_organization_slug TEXT,
  p_days INTEGER DEFAULT 7
) RETURNS TABLE (
  source_id UUID,
  total_crawls INTEGER,
  successful_crawls INTEGER,
  total_articles_found INTEGER,
  total_articles_new INTEGER,
  total_duplicates INTEGER,
  avg_duration_ms DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.source_id,
    COUNT(*)::INTEGER as total_crawls,
    COUNT(*) FILTER (WHERE sc.status = 'success')::INTEGER as successful_crawls,
    COALESCE(SUM(sc.articles_found) FILTER (WHERE sc.status = 'success'), 0)::INTEGER as total_articles_found,
    COALESCE(SUM(sc.articles_new) FILTER (WHERE sc.status = 'success'), 0)::INTEGER as total_articles_new,
    COALESCE(SUM(
      sc.duplicates_exact + 
      sc.duplicates_cross_source + 
      sc.duplicates_fuzzy_title + 
      sc.duplicates_phrase_overlap
    ) FILTER (WHERE sc.status = 'success'), 0)::INTEGER as total_duplicates,
    COALESCE(AVG(sc.crawl_duration_ms) FILTER (WHERE sc.status = 'success'), 0)::DOUBLE PRECISION as avg_duration_ms
  FROM crawler.source_crawls sc
  JOIN crawler.sources s ON sc.source_id = s.id
  WHERE s.organization_slug = p_organization_slug
    AND sc.started_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY sc.source_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION crawler.get_crawl_stats_by_source(TEXT, INTEGER) IS
  'Get aggregated crawl stats for all sources in an organization (bulk optimization)';

-- Function to get article counts for all sources in an organization
-- avoiding the N+1 count(*) queries
CREATE OR REPLACE FUNCTION crawler.get_source_article_counts(
  p_organization_slug TEXT
) RETURNS TABLE (
  source_id UUID,
  article_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.source_id,
    COUNT(*)::INTEGER as article_count
  FROM crawler.articles a
  WHERE a.organization_slug = p_organization_slug
  GROUP BY a.source_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION crawler.get_source_article_counts(TEXT) IS
  'Get article counts for all sources in an organization (bulk optimization)';

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION crawler.get_crawl_stats_by_source(TEXT, INTEGER) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION crawler.get_source_article_counts(TEXT) TO postgres, anon, authenticated, service_role;

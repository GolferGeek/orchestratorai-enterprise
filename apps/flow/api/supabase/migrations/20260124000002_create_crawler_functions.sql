-- =============================================================================
-- CRAWLER DEDUPLICATION FUNCTIONS
-- =============================================================================
-- 4-layer deduplication system for articles
-- Layer 1: Exact hash match (same source)
-- Layer 2: Cross-source hash check
-- Layer 3: Fuzzy title matching (Jaccard similarity > 0.85)
-- Layer 4: Key phrase overlap (> 70%)
-- =============================================================================

-- =============================================================================
-- LAYER 2: CROSS-SOURCE HASH CHECK
-- =============================================================================
-- Check if content hash exists across ANY source for the organization

CREATE OR REPLACE FUNCTION crawler.check_content_hash_exists(
  p_organization_slug TEXT,
  p_content_hash TEXT,
  p_exclude_source_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM crawler.articles a
    WHERE a.organization_slug = p_organization_slug
    AND a.content_hash = p_content_hash
    AND (p_exclude_source_id IS NULL OR a.source_id != p_exclude_source_id)
  );
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION crawler.check_content_hash_exists(TEXT, TEXT, UUID) IS
  'Layer 2 dedup: Check if content hash exists in any source for the org';

-- =============================================================================
-- LAYER 3: FIND SIMILAR ARTICLES BY TITLE
-- =============================================================================
-- Returns candidate articles for Jaccard similarity comparison
-- Actual similarity is computed in application code

CREATE OR REPLACE FUNCTION crawler.find_recent_article_fingerprints(
  p_organization_slug TEXT,
  p_hours_back INTEGER DEFAULT 72,
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
  article_id UUID,
  source_id UUID,
  title_normalized TEXT,
  key_phrases TEXT[],
  fingerprint_hash TEXT,
  first_seen_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.source_id,
    a.title_normalized,
    a.key_phrases,
    a.fingerprint_hash,
    a.first_seen_at
  FROM crawler.articles a
  WHERE a.organization_slug = p_organization_slug
    AND a.first_seen_at > NOW() - (p_hours_back || ' hours')::INTERVAL
    AND a.title_normalized IS NOT NULL
  ORDER BY a.first_seen_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION crawler.find_recent_article_fingerprints(TEXT, INTEGER, INTEGER) IS
  'Get recent article fingerprints for fuzzy matching (Layer 3 & 4)';

-- =============================================================================
-- LAYER 4: FIND ARTICLES BY KEY PHRASE OVERLAP
-- =============================================================================
-- Returns articles that share any key phrases with the input
-- Application code calculates actual overlap percentage

CREATE OR REPLACE FUNCTION crawler.find_articles_by_phrase_overlap(
  p_organization_slug TEXT,
  p_key_phrases TEXT[],
  p_hours_back INTEGER DEFAULT 72,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  article_id UUID,
  source_id UUID,
  title_normalized TEXT,
  key_phrases TEXT[],
  overlap_count INTEGER,
  first_seen_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.source_id,
    a.title_normalized,
    a.key_phrases,
    (SELECT COUNT(*)::INTEGER FROM unnest(a.key_phrases) kp WHERE kp = ANY(p_key_phrases)) as overlap_count,
    a.first_seen_at
  FROM crawler.articles a
  WHERE a.organization_slug = p_organization_slug
    AND a.first_seen_at > NOW() - (p_hours_back || ' hours')::INTERVAL
    AND a.key_phrases && p_key_phrases  -- Array overlap operator (fast with GIN index)
  ORDER BY overlap_count DESC, a.first_seen_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION crawler.find_articles_by_phrase_overlap(TEXT, TEXT[], INTEGER, INTEGER) IS
  'Find articles with overlapping key phrases (Layer 4 candidate generation)';

-- =============================================================================
-- FIND OR CREATE SOURCE
-- =============================================================================
-- Core function for source deduplication - returns existing or creates new

CREATE OR REPLACE FUNCTION crawler.find_or_create_source(
  p_organization_slug TEXT,
  p_url TEXT,
  p_name TEXT,
  p_source_type TEXT DEFAULT 'web',
  p_description TEXT DEFAULT NULL,
  p_crawl_config JSONB DEFAULT '{}'::jsonb,
  p_auth_config JSONB DEFAULT NULL,
  p_crawl_frequency_minutes INTEGER DEFAULT 15
) RETURNS UUID AS $$
DECLARE
  v_source_id UUID;
BEGIN
  -- Try to find existing source
  SELECT id INTO v_source_id
  FROM crawler.sources
  WHERE organization_slug = p_organization_slug
    AND url = p_url;

  -- If found, return existing
  IF v_source_id IS NOT NULL THEN
    RETURN v_source_id;
  END IF;

  -- Create new source
  INSERT INTO crawler.sources (
    organization_slug,
    url,
    name,
    source_type,
    description,
    crawl_config,
    auth_config,
    crawl_frequency_minutes
  ) VALUES (
    p_organization_slug,
    p_url,
    p_name,
    p_source_type,
    p_description,
    COALESCE(p_crawl_config, '{}'::jsonb),
    p_auth_config,
    p_crawl_frequency_minutes
  )
  RETURNING id INTO v_source_id;

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION crawler.find_or_create_source(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, INTEGER) IS
  'Find existing source by URL or create new one - prevents duplicate sources';

-- =============================================================================
-- GET SOURCES DUE FOR CRAWL
-- =============================================================================
-- Returns sources that need to be crawled based on frequency

CREATE OR REPLACE FUNCTION crawler.get_sources_due_for_crawl(
  p_frequency_minutes INTEGER DEFAULT NULL
) RETURNS TABLE (
  source_id UUID,
  organization_slug TEXT,
  name TEXT,
  source_type TEXT,
  url TEXT,
  crawl_config JSONB,
  auth_config JSONB,
  crawl_frequency_minutes INTEGER,
  last_crawl_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.organization_slug,
    s.name,
    s.source_type,
    s.url,
    s.crawl_config,
    s.auth_config,
    s.crawl_frequency_minutes,
    s.last_crawl_at
  FROM crawler.sources s
  WHERE s.is_active = true
    AND s.is_test = false
    AND (p_frequency_minutes IS NULL OR s.crawl_frequency_minutes = p_frequency_minutes)
    AND (
      s.last_crawl_at IS NULL
      OR s.last_crawl_at < NOW() - (s.crawl_frequency_minutes || ' minutes')::INTERVAL
    )
  ORDER BY s.last_crawl_at NULLS FIRST
  LIMIT 100;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION crawler.get_sources_due_for_crawl(INTEGER) IS
  'Get sources that are due for crawling based on their frequency';

-- =============================================================================
-- UTILITY: CALCULATE TOTAL DUPLICATES
-- =============================================================================

CREATE OR REPLACE FUNCTION crawler.calculate_total_duplicates(
  p_exact INTEGER,
  p_cross_source INTEGER,
  p_fuzzy_title INTEGER,
  p_phrase_overlap INTEGER
) RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(p_exact, 0) +
         COALESCE(p_cross_source, 0) +
         COALESCE(p_fuzzy_title, 0) +
         COALESCE(p_phrase_overlap, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION crawler.calculate_total_duplicates(INTEGER, INTEGER, INTEGER, INTEGER) IS
  'Calculate total duplicates across all dedup layers';

-- =============================================================================
-- VIEW: CRAWL DEDUPLICATION STATS
-- =============================================================================

CREATE OR REPLACE VIEW crawler.crawl_dedup_stats AS
SELECT
  sc.id as crawl_id,
  sc.source_id,
  s.name as source_name,
  s.organization_slug,
  sc.started_at,
  sc.completed_at,
  sc.status,
  sc.articles_found,
  sc.articles_new,
  sc.duplicates_exact,
  sc.duplicates_cross_source,
  sc.duplicates_fuzzy_title,
  sc.duplicates_phrase_overlap,
  crawler.calculate_total_duplicates(
    sc.duplicates_exact,
    sc.duplicates_cross_source,
    sc.duplicates_fuzzy_title,
    sc.duplicates_phrase_overlap
  ) as duplicates_total,
  CASE
    WHEN sc.articles_found > 0 THEN
      ROUND(
        100.0 * crawler.calculate_total_duplicates(
          sc.duplicates_exact,
          sc.duplicates_cross_source,
          sc.duplicates_fuzzy_title,
          sc.duplicates_phrase_overlap
        ) / sc.articles_found,
        1
      )
    ELSE 0
  END as dedup_rate_percent,
  sc.crawl_duration_ms
FROM crawler.source_crawls sc
JOIN crawler.sources s ON sc.source_id = s.id;

COMMENT ON VIEW crawler.crawl_dedup_stats IS
  'Crawl statistics with deduplication breakdown by layer';

-- =============================================================================
-- VIEW: SOURCE STATS
-- =============================================================================

CREATE OR REPLACE VIEW crawler.source_stats AS
SELECT
  s.id as source_id,
  s.organization_slug,
  s.name,
  s.source_type,
  s.url,
  s.is_active,
  s.crawl_frequency_minutes,
  s.last_crawl_at,
  s.last_crawl_status,
  s.consecutive_errors,
  (SELECT COUNT(*) FROM crawler.articles a WHERE a.source_id = s.id) as article_count,
  (SELECT COUNT(*) FROM crawler.source_crawls sc WHERE sc.source_id = s.id) as crawl_count,
  (SELECT COUNT(*) FROM crawler.source_crawls sc WHERE sc.source_id = s.id AND sc.status = 'success') as successful_crawl_count
FROM crawler.sources s;

COMMENT ON VIEW crawler.source_stats IS
  'Source statistics including article and crawl counts';

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE crawler.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawler.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawler.source_crawls ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawler.agent_article_outputs ENABLE ROW LEVEL SECURITY;

-- Sources policies
CREATE POLICY crawler_sources_read ON crawler.sources
  FOR SELECT
  USING (organization_slug = current_setting('app.current_org', true));

CREATE POLICY crawler_sources_insert ON crawler.sources
  FOR INSERT
  WITH CHECK (organization_slug = current_setting('app.current_org', true));

CREATE POLICY crawler_sources_update ON crawler.sources
  FOR UPDATE
  USING (organization_slug = current_setting('app.current_org', true));

CREATE POLICY crawler_sources_delete ON crawler.sources
  FOR DELETE
  USING (organization_slug = current_setting('app.current_org', true));

CREATE POLICY crawler_sources_service_all ON crawler.sources
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Articles policies
CREATE POLICY crawler_articles_read ON crawler.articles
  FOR SELECT
  USING (organization_slug = current_setting('app.current_org', true));

CREATE POLICY crawler_articles_insert ON crawler.articles
  FOR INSERT
  WITH CHECK (organization_slug = current_setting('app.current_org', true));

CREATE POLICY crawler_articles_service_all ON crawler.articles
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Source crawls policies (through source)
CREATE POLICY crawler_source_crawls_read ON crawler.source_crawls
  FOR SELECT
  USING (
    source_id IN (
      SELECT id FROM crawler.sources
      WHERE organization_slug = current_setting('app.current_org', true)
    )
  );

CREATE POLICY crawler_source_crawls_insert ON crawler.source_crawls
  FOR INSERT
  WITH CHECK (
    source_id IN (
      SELECT id FROM crawler.sources
      WHERE organization_slug = current_setting('app.current_org', true)
    )
  );

CREATE POLICY crawler_source_crawls_service_all ON crawler.source_crawls
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Agent article outputs policies (through article)
CREATE POLICY crawler_agent_outputs_read ON crawler.agent_article_outputs
  FOR SELECT
  USING (
    article_id IN (
      SELECT id FROM crawler.articles
      WHERE organization_slug = current_setting('app.current_org', true)
    )
  );

CREATE POLICY crawler_agent_outputs_insert ON crawler.agent_article_outputs
  FOR INSERT
  WITH CHECK (
    article_id IN (
      SELECT id FROM crawler.articles
      WHERE organization_slug = current_setting('app.current_org', true)
    )
  );

CREATE POLICY crawler_agent_outputs_service_all ON crawler.agent_article_outputs
  TO service_role
  USING (true)
  WITH CHECK (true);

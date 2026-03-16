-- =============================================================================
-- MIGRATE PREDICTION SOURCES TO CRAWLER SCHEMA
-- =============================================================================
-- Migrates existing prediction.sources to crawler.sources
-- Creates prediction.source_subscriptions for target-scoped sources
-- Migrates prediction.source_seen_items to crawler.articles
--
-- NOTE: This migration is SAFE - all INSERT statements use ON CONFLICT DO NOTHING
-- so it can be run multiple times without duplicating data.
-- =============================================================================

-- =============================================================================
-- STEP 1: MIGRATE SOURCES
-- =============================================================================

INSERT INTO crawler.sources (
  id,
  organization_slug,
  name,
  description,
  source_type,
  url,
  crawl_config,
  auth_config,
  crawl_frequency_minutes,
  is_active,
  is_test,
  last_crawl_at,
  last_crawl_status,
  last_error,
  consecutive_errors,
  created_at,
  updated_at
)
SELECT
  ps.id,
  COALESCE(
    (SELECT u.organization_slug FROM prediction.universes u WHERE u.id = ps.universe_id),
    'finance'
  ) as organization_slug,
  ps.name,
  ps.description,
  ps.source_type,
  ps.url,
  ps.crawl_config,
  ps.auth_config,
  ps.crawl_frequency_minutes,
  ps.is_active,
  COALESCE(ps.is_test, false) as is_test,
  ps.last_crawl_at,
  ps.last_crawl_status,
  ps.last_error,
  ps.consecutive_errors,
  ps.created_at,
  ps.updated_at
FROM prediction.sources ps
ON CONFLICT (organization_slug, url) DO NOTHING;

-- =============================================================================
-- STEP 2: CREATE SUBSCRIPTIONS FOR TARGET-SCOPED SOURCES
-- =============================================================================

INSERT INTO prediction.source_subscriptions (
  source_id,
  target_id,
  universe_id,
  filter_config,
  last_processed_at,
  is_active,
  created_at,
  updated_at
)
SELECT
  ps.id as source_id,
  ps.target_id,
  t.universe_id,
  '{
    "keywords_include": [],
    "keywords_exclude": [],
    "min_relevance_score": 0.5
  }'::jsonb as filter_config,
  COALESCE(ps.last_crawl_at, NOW()) as last_processed_at,
  ps.is_active,
  ps.created_at,
  ps.updated_at
FROM prediction.sources ps
JOIN prediction.targets t ON ps.target_id = t.id
WHERE ps.target_id IS NOT NULL
ON CONFLICT (source_id, target_id) DO NOTHING;

-- For universe-scoped sources, create subscriptions for all targets in the universe
INSERT INTO prediction.source_subscriptions (
  source_id,
  target_id,
  universe_id,
  filter_config,
  last_processed_at,
  is_active,
  created_at,
  updated_at
)
SELECT
  ps.id as source_id,
  t.id as target_id,
  ps.universe_id,
  '{
    "keywords_include": [],
    "keywords_exclude": [],
    "min_relevance_score": 0.5
  }'::jsonb as filter_config,
  COALESCE(ps.last_crawl_at, NOW()) as last_processed_at,
  ps.is_active,
  ps.created_at,
  ps.updated_at
FROM prediction.sources ps
JOIN prediction.targets t ON t.universe_id = ps.universe_id
WHERE ps.scope_level = 'universe'
  AND ps.target_id IS NULL
  AND ps.universe_id IS NOT NULL
ON CONFLICT (source_id, target_id) DO NOTHING;

-- =============================================================================
-- STEP 3: MIGRATE SOURCE_SEEN_ITEMS TO ARTICLES
-- =============================================================================

INSERT INTO crawler.articles (
  id,
  organization_slug,
  source_id,
  url,
  title,
  content,
  content_hash,
  title_normalized,
  key_phrases,
  fingerprint_hash,
  is_test,
  first_seen_at,
  metadata
)
SELECT
  ssi.id,
  COALESCE(
    (SELECT u.organization_slug
     FROM prediction.sources ps
     JOIN prediction.universes u ON ps.universe_id = u.id
     WHERE ps.id = ssi.source_id),
    'finance'
  ) as organization_slug,
  ssi.source_id,
  COALESCE(ssi.original_url, '') as url,
  '' as title,
  '' as content,
  ssi.content_hash,
  ssi.title_normalized,
  ssi.key_phrases,
  ssi.fingerprint_hash,
  false as is_test,
  ssi.first_seen_at,
  COALESCE(ssi.metadata, '{}'::jsonb) as metadata
FROM prediction.source_seen_items ssi
WHERE ssi.content_hash IS NOT NULL
  AND EXISTS (SELECT 1 FROM crawler.sources cs WHERE cs.id = ssi.source_id)
ON CONFLICT (organization_slug, content_hash) DO NOTHING;

-- =============================================================================
-- STEP 4: MIGRATE SOURCE_CRAWLS
-- =============================================================================

INSERT INTO crawler.source_crawls (
  id,
  source_id,
  started_at,
  completed_at,
  crawl_duration_ms,
  status,
  articles_found,
  articles_new,
  duplicates_exact,
  duplicates_cross_source,
  duplicates_fuzzy_title,
  duplicates_phrase_overlap,
  error_message,
  metadata
)
SELECT
  sc.id,
  sc.source_id,
  sc.started_at,
  sc.completed_at,
  sc.crawl_duration_ms,
  sc.status,
  sc.items_found as articles_found,
  sc.items_new as articles_new,
  COALESCE(sc.duplicates_exact, 0),
  COALESCE(sc.duplicates_cross_source, 0),
  COALESCE(sc.duplicates_fuzzy_title, 0),
  COALESCE(sc.duplicates_phrase_overlap, 0),
  sc.error_message,
  COALESCE(sc.metadata, '{}'::jsonb)
FROM prediction.source_crawls sc
WHERE EXISTS (SELECT 1 FROM crawler.sources cs WHERE cs.id = sc.source_id)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- STEP 5: CREATE AGENT_ARTICLE_OUTPUTS FOR EXISTING SIGNALS
-- =============================================================================

INSERT INTO crawler.agent_article_outputs (
  article_id,
  agent_type,
  output_type,
  output_id,
  processed_at
)
SELECT
  ssi.id as article_id,
  'prediction' as agent_type,
  'signal' as output_type,
  ssi.signal_id as output_id,
  ssi.first_seen_at as processed_at
FROM prediction.source_seen_items ssi
WHERE ssi.signal_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM crawler.articles ca WHERE ca.id = ssi.id)
ON CONFLICT (article_id, agent_type) DO NOTHING;

-- =============================================================================
-- STEP 6: UPDATE ARTICLES WITH FINGERPRINT DATA (if available)
-- =============================================================================

UPDATE crawler.articles a
SET
  title_normalized = COALESCE(a.title_normalized, sf.title_normalized),
  key_phrases = COALESCE(a.key_phrases, sf.key_phrases),
  fingerprint_hash = COALESCE(a.fingerprint_hash, sf.fingerprint_hash)
FROM prediction.signal_fingerprints sf
JOIN prediction.source_seen_items ssi ON ssi.signal_id = sf.signal_id
WHERE a.id = ssi.id
  AND (a.title_normalized IS NULL OR a.key_phrases IS NULL);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  v_sources_count INTEGER;
  v_articles_count INTEGER;
  v_subscriptions_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_sources_count FROM crawler.sources;
  SELECT COUNT(*) INTO v_articles_count FROM crawler.articles;
  SELECT COUNT(*) INTO v_subscriptions_count FROM prediction.source_subscriptions;

  RAISE NOTICE '================================================';
  RAISE NOTICE 'Migration complete';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'crawler.sources: % rows', v_sources_count;
  RAISE NOTICE 'crawler.articles: % rows', v_articles_count;
  RAISE NOTICE 'prediction.source_subscriptions: % rows', v_subscriptions_count;
  RAISE NOTICE '================================================';
END $$;

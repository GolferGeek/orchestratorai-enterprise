-- =============================================================================
-- MIGRATE RISK DATA_SOURCES TO CRAWLER SCHEMA
-- =============================================================================
-- Migrates existing risk.data_sources to crawler.sources
-- Creates risk.source_subscriptions for scope-linked sources
-- Only migrates web/rss sources - API/webhook remain in risk.data_sources
-- =============================================================================

-- =============================================================================
-- STEP 1: MIGRATE WEB/RSS SOURCES
-- =============================================================================

INSERT INTO crawler.sources (
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
  (SELECT organization_slug FROM risk.scopes WHERE id = ds.scope_id) as organization_slug,
  ds.name,
  ds.description,
  CASE
    WHEN ds.source_type = 'firecrawl' THEN 'web'
    ELSE ds.source_type
  END as source_type,
  COALESCE(ds.config->>'url', ds.config->>'feed_url', '') as url,
  jsonb_build_object(
    'selector', ds.config->>'selector',
    'wait_for_element', ds.config->>'wait_for',
    'extract_rules', COALESCE(ds.config->'extract_rules', '{}'::jsonb),
    'filters', '{}'::jsonb
  ) as crawl_config,
  CASE
    WHEN ds.config ? 'auth' THEN ds.config->'auth'
    ELSE NULL
  END as auth_config,
  CASE ds.schedule
    WHEN 'realtime' THEN 5
    WHEN 'hourly' THEN 60
    WHEN 'daily' THEN 60  -- Will run less frequently via schedule
    WHEN 'weekly' THEN 60
    ELSE 15
  END as crawl_frequency_minutes,
  ds.status = 'active' as is_active,
  false as is_test,
  ds.last_fetch_at as last_crawl_at,
  ds.last_fetch_status as last_crawl_status,
  ds.error_message as last_error,
  ds.error_count as consecutive_errors,
  ds.created_at,
  ds.updated_at
FROM risk.data_sources ds
WHERE ds.source_type IN ('firecrawl', 'rss')
  AND ds.config ? 'url' OR ds.config ? 'feed_url'
ON CONFLICT (organization_slug, url) DO NOTHING;

-- =============================================================================
-- STEP 2: CREATE SUBSCRIPTIONS FOR MIGRATED SOURCES
-- =============================================================================

INSERT INTO risk.source_subscriptions (
  source_id,
  scope_id,
  dimension_mapping,
  subject_filter,
  last_processed_at,
  auto_reanalyze,
  reanalyze_threshold,
  is_active,
  created_at,
  updated_at
)
SELECT
  cs.id as source_id,
  ds.scope_id,
  ds.dimension_mapping,
  ds.subject_filter,
  COALESCE(ds.last_fetch_at, NOW()) as last_processed_at,
  COALESCE(ds.auto_reanalyze, true),
  COALESCE(ds.reanalyze_threshold, 0.10),
  ds.status = 'active' as is_active,
  ds.created_at,
  ds.updated_at
FROM risk.data_sources ds
JOIN crawler.sources cs ON cs.url = COALESCE(ds.config->>'url', ds.config->>'feed_url', '')
  AND cs.organization_slug = (SELECT organization_slug FROM risk.scopes WHERE id = ds.scope_id)
WHERE ds.source_type IN ('firecrawl', 'rss')
ON CONFLICT (source_id, scope_id) DO NOTHING;

-- =============================================================================
-- STEP 3: MIGRATE FETCH HISTORY TO SOURCE_CRAWLS (for migrated sources)
-- =============================================================================

INSERT INTO crawler.source_crawls (
  source_id,
  started_at,
  completed_at,
  crawl_duration_ms,
  status,
  articles_found,
  articles_new,
  error_message,
  metadata
)
SELECT
  cs.id as source_id,
  dfh.fetched_at as started_at,
  dfh.fetched_at + (dfh.fetch_duration_ms || ' milliseconds')::INTERVAL as completed_at,
  dfh.fetch_duration_ms as crawl_duration_ms,
  CASE dfh.status
    WHEN 'success' THEN 'success'
    WHEN 'failed' THEN 'error'
    WHEN 'timeout' THEN 'timeout'
    ELSE 'error'
  END as status,
  1 as articles_found,  -- Risk fetches single items typically
  CASE WHEN dfh.status = 'success' THEN 1 ELSE 0 END as articles_new,
  dfh.error_message,
  jsonb_build_object(
    'dimensions_updated', dfh.dimensions_updated,
    'subjects_affected', dfh.subjects_affected,
    'reanalysis_triggered', dfh.reanalysis_triggered
  ) as metadata
FROM risk.data_source_fetch_history dfh
JOIN risk.data_sources ds ON dfh.data_source_id = ds.id
JOIN crawler.sources cs ON cs.url = COALESCE(ds.config->>'url', ds.config->>'feed_url', '')
  AND cs.organization_slug = (SELECT organization_slug FROM risk.scopes WHERE id = ds.scope_id)
WHERE ds.source_type IN ('firecrawl', 'rss')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- STEP 4: MARK MIGRATED SOURCES IN RISK SCHEMA (optional soft-delete)
-- =============================================================================
-- Add a flag to track which data_sources have been migrated
-- This allows the old tables to remain for reference

DO $$
BEGIN
  -- Add migrated_to_crawler column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'risk'
      AND table_name = 'data_sources'
      AND column_name = 'migrated_to_crawler'
  ) THEN
    ALTER TABLE risk.data_sources ADD COLUMN migrated_to_crawler BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Mark web/rss sources as migrated
UPDATE risk.data_sources ds
SET migrated_to_crawler = true
WHERE ds.source_type IN ('firecrawl', 'rss')
  AND EXISTS (
    SELECT 1 FROM crawler.sources cs
    WHERE cs.url = COALESCE(ds.config->>'url', ds.config->>'feed_url', '')
  );

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON COLUMN risk.data_sources.migrated_to_crawler IS 'True if this source has been migrated to crawler schema';

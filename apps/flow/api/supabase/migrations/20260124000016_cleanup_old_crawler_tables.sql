-- =============================================================================
-- CLEANUP OLD CRAWLER TABLES
-- =============================================================================
-- Drops old crawler tables from prediction and risk schemas after data migration
-- Run AFTER verifying data was successfully migrated to crawler schema
--
-- IMPORTANT: This migration should only run after confirming:
-- 1. All data from prediction.sources is in crawler.sources
-- 2. All data from prediction.source_seen_items is in crawler.articles
-- 3. All subscriptions are created in prediction.source_subscriptions
-- 4. All subscriptions are created in risk.source_subscriptions
-- =============================================================================

-- =============================================================================
-- STEP 1: DROP PREDICTION CRAWLER TABLES
-- =============================================================================
-- Order matters: drop dependent tables first

-- Drop views that depend on old tables
DROP VIEW IF EXISTS prediction.crawl_dedup_stats CASCADE;

-- Drop old functions
DROP FUNCTION IF EXISTS prediction.check_content_hash_for_target(TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS prediction.find_recent_signal_fingerprints(UUID, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS prediction.find_signals_by_phrase_overlap(UUID, TEXT[], INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS prediction.calculate_total_duplicates(INTEGER, INTEGER, INTEGER, INTEGER) CASCADE;

-- Drop signal fingerprints (now using crawler.articles fingerprint columns)
DROP TABLE IF EXISTS prediction.signal_fingerprints CASCADE;

-- Drop source_seen_items (now crawler.articles)
DROP TABLE IF EXISTS prediction.source_seen_items CASCADE;

-- Drop source_crawls (now crawler.source_crawls)
DROP TABLE IF EXISTS prediction.source_crawls CASCADE;

-- Drop sources (now crawler.sources)
DROP TABLE IF EXISTS prediction.sources CASCADE;

-- =============================================================================
-- STEP 2: CLEANUP RISK DATA_SOURCES (mark as deprecated, don't delete)
-- =============================================================================
-- Risk data_sources table still handles API/webhook sources
-- Only web/rss sources were migrated
-- Keep the table but add comment

COMMENT ON TABLE risk.data_sources IS
  'PARTIALLY DEPRECATED: Web/RSS sources migrated to crawler.sources.
   API/webhook sources remain here. Check migrated_to_crawler column.';

-- =============================================================================
-- STEP 3: VERIFY MIGRATION
-- =============================================================================

DO $$
DECLARE
  crawler_source_count INTEGER;
  crawler_article_count INTEGER;
  pred_sub_count INTEGER;
  risk_sub_count INTEGER;
BEGIN
  -- Count records in new tables
  SELECT COUNT(*) INTO crawler_source_count FROM crawler.sources;
  SELECT COUNT(*) INTO crawler_article_count FROM crawler.articles;
  SELECT COUNT(*) INTO pred_sub_count FROM prediction.source_subscriptions;
  SELECT COUNT(*) INTO risk_sub_count FROM risk.source_subscriptions;

  -- Log migration status
  RAISE NOTICE 'Migration Summary:';
  RAISE NOTICE '  crawler.sources: % records', crawler_source_count;
  RAISE NOTICE '  crawler.articles: % records', crawler_article_count;
  RAISE NOTICE '  prediction.source_subscriptions: % records', pred_sub_count;
  RAISE NOTICE '  risk.source_subscriptions: % records', risk_sub_count;

  -- Verify we have data
  IF crawler_source_count = 0 THEN
    RAISE WARNING 'No sources migrated to crawler schema - this may be expected for new deployments';
  END IF;
END $$;

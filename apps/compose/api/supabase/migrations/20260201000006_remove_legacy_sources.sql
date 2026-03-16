-- ============================================================================
-- Migration: Remove Legacy prediction.sources Table
-- ============================================================================
-- The prediction module now uses crawler.sources directly via source_subscriptions.
-- The prediction.sources table was a legacy duplicate that is no longer used.
--
-- Tables to DROP:
--   - prediction.sources (legacy, not used)
--   - prediction.source_seen_items (legacy dedup tracking, not used)
--
-- Tables to KEEP:
--   - prediction.source_subscriptions (actively used, links to crawler.sources)
-- ============================================================================

-- Drop source_seen_items first (no dependencies)
DROP TABLE IF EXISTS prediction.source_seen_items CASCADE;

-- Drop sources table
DROP TABLE IF EXISTS prediction.sources CASCADE;

-- Log the cleanup
DO $$
BEGIN
  RAISE NOTICE 'Removed legacy prediction.sources and prediction.source_seen_items tables';
  RAISE NOTICE 'prediction.source_subscriptions retained (links to crawler.sources)';
END $$;

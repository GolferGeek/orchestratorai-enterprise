-- =====================================================================================
-- FIX SOURCE_CRAWLS AND SOURCE_SEEN_ITEMS SCHEMA
-- =====================================================================================
-- Description: Fixes column naming and adds missing columns to match code interfaces
-- =====================================================================================

-- =============================================================================
-- source_crawls fixes
-- =============================================================================

-- Rename duration_ms to crawl_duration_ms to match code interface
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'prediction'
    AND table_name = 'source_crawls'
    AND column_name = 'duration_ms'
  ) THEN
    ALTER TABLE prediction.source_crawls RENAME COLUMN duration_ms TO crawl_duration_ms;
    RAISE NOTICE 'Renamed duration_ms to crawl_duration_ms';
  ELSE
    RAISE NOTICE 'Column duration_ms does not exist or already renamed';
  END IF;
END $$;

-- Add missing columns to source_crawls
ALTER TABLE prediction.source_crawls
  ADD COLUMN IF NOT EXISTS duplicates_skipped INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Fix status check constraint - allow 'error' as well as 'failed'
ALTER TABLE prediction.source_crawls DROP CONSTRAINT IF EXISTS source_crawls_status_check;
ALTER TABLE prediction.source_crawls ADD CONSTRAINT source_crawls_status_check
  CHECK (status = ANY (ARRAY['running'::text, 'success'::text, 'failed'::text, 'error'::text, 'partial'::text]));

-- Recreate index with correct column name
DROP INDEX IF EXISTS prediction.idx_source_crawls_performance;
CREATE INDEX IF NOT EXISTS idx_source_crawls_performance
  ON prediction.source_crawls (source_id, crawl_duration_ms)
  WHERE crawl_duration_ms IS NOT NULL;

-- =============================================================================
-- source_seen_items fixes
-- =============================================================================

-- Add metadata column to source_seen_items
ALTER TABLE prediction.source_seen_items
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add original_url column for tracking source URLs
ALTER TABLE prediction.source_seen_items
  ADD COLUMN IF NOT EXISTS original_url TEXT;

-- =============================================================================
-- Verification
-- =============================================================================
DO $$
DECLARE
  v_crawls_cols INTEGER;
  v_seen_cols INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_crawls_cols
  FROM information_schema.columns
  WHERE table_schema = 'prediction'
  AND table_name = 'source_crawls';

  SELECT COUNT(*) INTO v_seen_cols
  FROM information_schema.columns
  WHERE table_schema = 'prediction'
  AND table_name = 'source_seen_items';

  RAISE NOTICE 'source_crawls: % columns, source_seen_items: % columns', v_crawls_cols, v_seen_cols;
END $$;

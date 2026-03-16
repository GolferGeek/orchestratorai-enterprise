-- =============================================================================
-- FIX PREDICTION SOURCES COLUMNS
-- =============================================================================
-- Aligns database schema with the source.interface.ts interface
-- Sprint 5 fix: column naming mismatches were causing runtime errors
-- =============================================================================

-- Rename last_crawled_at to last_crawl_at (interface uses last_crawl_at)
ALTER TABLE prediction.sources
  RENAME COLUMN last_crawled_at TO last_crawl_at;

-- Rename consecutive_failures to consecutive_errors (interface uses consecutive_errors)
ALTER TABLE prediction.sources
  RENAME COLUMN consecutive_failures TO consecutive_errors;

-- Add missing columns
ALTER TABLE prediction.sources
  ADD COLUMN IF NOT EXISTS crawl_frequency_minutes INTEGER NOT NULL DEFAULT 15;

ALTER TABLE prediction.sources
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE prediction.sources
  ADD COLUMN IF NOT EXISTS last_crawl_status TEXT;

-- Add constraint for crawl frequency (valid values: 5, 10, 15, 30, 60)
ALTER TABLE prediction.sources
  ADD CONSTRAINT check_crawl_frequency
  CHECK (crawl_frequency_minutes IN (5, 10, 15, 30, 60));

-- Add constraint for last_crawl_status
ALTER TABLE prediction.sources
  ADD CONSTRAINT check_last_crawl_status
  CHECK (last_crawl_status IS NULL OR last_crawl_status IN ('success', 'error'));

-- Update indexes to use new column names
DROP INDEX IF EXISTS prediction.idx_prediction_sources_last_crawled;
CREATE INDEX IF NOT EXISTS idx_prediction_sources_last_crawl ON prediction.sources(last_crawl_at DESC);

DROP INDEX IF EXISTS prediction.idx_prediction_sources_failures;
CREATE INDEX IF NOT EXISTS idx_prediction_sources_errors ON prediction.sources(consecutive_errors) WHERE consecutive_errors > 0;

-- Add index for crawl frequency (for frequency-based cron queries)
CREATE INDEX IF NOT EXISTS idx_prediction_sources_frequency ON prediction.sources(crawl_frequency_minutes, is_active) WHERE is_active = true;

-- Add index for test sources
CREATE INDEX IF NOT EXISTS idx_prediction_sources_is_test ON prediction.sources(is_test) WHERE is_test = true;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON COLUMN prediction.sources.crawl_frequency_minutes IS 'Crawl frequency in minutes: 5, 10, 15, 30, or 60';
COMMENT ON COLUMN prediction.sources.is_test IS 'Test source flag - all signals from this source marked as test data';
COMMENT ON COLUMN prediction.sources.last_crawl_status IS 'Status of last crawl: success or error';
COMMENT ON COLUMN prediction.sources.consecutive_errors IS 'Count of consecutive crawl errors (resets on success)';

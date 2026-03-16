-- =============================================================================
-- ADD CRAWL_FREQUENCY_MINUTES COLUMN TO SOURCES TABLE
-- =============================================================================
-- The TypeScript interface expects crawl_frequency_minutes as a separate column
-- but the original migration stored it inside crawl_config.frequency.
-- This migration adds the dedicated column for consistency.
-- Sprint 0: Agent Hardening Foundation - Database Schema Fix
-- =============================================================================

-- Add the crawl_frequency_minutes column with default 15
ALTER TABLE prediction.sources
ADD COLUMN IF NOT EXISTS crawl_frequency_minutes INTEGER NOT NULL DEFAULT 15;

-- Add check constraint for valid frequency values (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_crawl_frequency_minutes'
    AND conrelid = 'prediction.sources'::regclass
  ) THEN
    ALTER TABLE prediction.sources
    ADD CONSTRAINT chk_crawl_frequency_minutes
    CHECK (crawl_frequency_minutes IN (5, 10, 15, 30, 60));
  END IF;
END $$;

-- Backfill from crawl_config.frequency if it exists
UPDATE prediction.sources
SET crawl_frequency_minutes = (crawl_config->>'frequency')::INTEGER
WHERE crawl_config->>'frequency' IS NOT NULL
  AND (crawl_config->>'frequency')::INTEGER IN (5, 10, 15, 30, 60);

-- Create index for queries that filter by frequency
CREATE INDEX IF NOT EXISTS idx_prediction_sources_crawl_frequency
ON prediction.sources(crawl_frequency_minutes);

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON COLUMN prediction.sources.crawl_frequency_minutes IS 'Crawl frequency in minutes: 5, 10, 15, 30, or 60';

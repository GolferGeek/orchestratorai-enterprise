-- Migration: Add source_seen_items table for content deduplication
-- This table tracks processed content to prevent duplicate signal creation

-- Create the source_seen_items table
CREATE TABLE IF NOT EXISTS prediction.source_seen_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  content_hash TEXT NOT NULL,
  original_url TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  signal_id UUID,
  metadata JSONB DEFAULT '{}',
  title_normalized TEXT,
  key_phrases TEXT[],
  fingerprint_hash TEXT,

  -- Constraints
  UNIQUE(source_id, content_hash)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_source_seen_items_source_id ON prediction.source_seen_items(source_id);
CREATE INDEX IF NOT EXISTS idx_source_seen_items_content_hash ON prediction.source_seen_items(content_hash);
CREATE INDEX IF NOT EXISTS idx_source_seen_items_last_seen ON prediction.source_seen_items(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_seen_items_fingerprint ON prediction.source_seen_items(fingerprint_hash) WHERE fingerprint_hash IS NOT NULL;

-- Grant permissions
GRANT ALL ON prediction.source_seen_items TO postgres;
GRANT ALL ON prediction.source_seen_items TO service_role;
GRANT SELECT ON prediction.source_seen_items TO authenticated;

-- Add comments
COMMENT ON TABLE prediction.source_seen_items IS 'Tracks processed content for deduplication across crawls';
COMMENT ON COLUMN prediction.source_seen_items.content_hash IS 'Hash of content for exact-match deduplication';
COMMENT ON COLUMN prediction.source_seen_items.fingerprint_hash IS 'Semantic fingerprint for fuzzy deduplication';
COMMENT ON COLUMN prediction.source_seen_items.title_normalized IS 'Normalized title for fuzzy title matching';
COMMENT ON COLUMN prediction.source_seen_items.key_phrases IS 'Extracted key phrases for phrase overlap deduplication';

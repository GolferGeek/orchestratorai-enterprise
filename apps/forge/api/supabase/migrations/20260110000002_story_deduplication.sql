-- =====================================================================================
-- PREDICTION SYSTEM - STORY DEDUPLICATION
-- =====================================================================================
-- Description: Enhanced deduplication with fuzzy matching and cross-source detection
-- Dependencies: prediction schema, sources, signals, source_seen_items
-- Phase: 2 (Story Deduplication from financial-asset-predictor PRD)
-- =====================================================================================

-- =====================================================================================
-- LAYER 2: CROSS-SOURCE HASH CHECK FUNCTION
-- =====================================================================================
-- Purpose: Check if content hash exists across ANY source for a given target
-- =====================================================================================

CREATE OR REPLACE FUNCTION prediction.check_content_hash_for_target(
  p_content_hash TEXT,
  p_target_id UUID
) RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM prediction.source_seen_items ssi
    JOIN prediction.sources s ON ssi.source_id = s.id
    WHERE ssi.content_hash = p_content_hash
    AND s.target_id = p_target_id
  );
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION prediction.check_content_hash_for_target(TEXT, UUID) IS
  'Layer 2 dedup: Check if content hash exists across any source for a target';

-- =====================================================================================
-- ENHANCED SOURCE_SEEN_ITEMS COLUMNS
-- =====================================================================================
-- Purpose: Add columns for Layer 3 (fuzzy title) and Layer 4 (key phrase) matching
-- =====================================================================================

-- Add new columns for fuzzy matching
ALTER TABLE prediction.source_seen_items
  ADD COLUMN IF NOT EXISTS title_normalized TEXT,
  ADD COLUMN IF NOT EXISTS key_phrases TEXT[],
  ADD COLUMN IF NOT EXISTS fingerprint_hash TEXT;

-- Index for fuzzy title lookups
CREATE INDEX IF NOT EXISTS idx_source_seen_items_title_normalized
  ON prediction.source_seen_items(title_normalized)
  WHERE title_normalized IS NOT NULL;

-- Index for fingerprint hash lookups
CREATE INDEX IF NOT EXISTS idx_source_seen_items_fingerprint_hash
  ON prediction.source_seen_items(fingerprint_hash)
  WHERE fingerprint_hash IS NOT NULL;

-- GIN index for key phrases array search
CREATE INDEX IF NOT EXISTS idx_source_seen_items_key_phrases
  ON prediction.source_seen_items USING gin(key_phrases)
  WHERE key_phrases IS NOT NULL;

COMMENT ON COLUMN prediction.source_seen_items.title_normalized IS 'Normalized title for fuzzy matching (Layer 3)';
COMMENT ON COLUMN prediction.source_seen_items.key_phrases IS 'Extracted key phrases for overlap matching (Layer 4)';
COMMENT ON COLUMN prediction.source_seen_items.fingerprint_hash IS 'Hash of key phrases for quick lookup';

-- =====================================================================================
-- SIGNAL FINGERPRINTS TABLE
-- =====================================================================================
-- Purpose: Store fingerprints for signals to enable fuzzy duplicate detection
-- =====================================================================================

CREATE TABLE IF NOT EXISTS prediction.signal_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  signal_id UUID NOT NULL REFERENCES prediction.signals(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES prediction.targets(id) ON DELETE CASCADE,

  -- Fingerprint data for matching
  title_normalized TEXT NOT NULL,
  key_phrases TEXT[] NOT NULL,
  fingerprint_hash TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE (signal_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_signal_fingerprints_target
  ON prediction.signal_fingerprints(target_id);
CREATE INDEX IF NOT EXISTS idx_signal_fingerprints_hash
  ON prediction.signal_fingerprints(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_signal_fingerprints_title
  ON prediction.signal_fingerprints(title_normalized);
CREATE INDEX IF NOT EXISTS idx_signal_fingerprints_key_phrases
  ON prediction.signal_fingerprints USING gin(key_phrases);
CREATE INDEX IF NOT EXISTS idx_signal_fingerprints_created
  ON prediction.signal_fingerprints(created_at DESC);

COMMENT ON TABLE prediction.signal_fingerprints IS 'Signal fingerprints for fuzzy duplicate detection';
COMMENT ON COLUMN prediction.signal_fingerprints.signal_id IS 'Reference to the signal';
COMMENT ON COLUMN prediction.signal_fingerprints.target_id IS 'Target for scoped fuzzy matching';
COMMENT ON COLUMN prediction.signal_fingerprints.title_normalized IS 'Normalized title for Jaccard similarity (Layer 3)';
COMMENT ON COLUMN prediction.signal_fingerprints.key_phrases IS 'Extracted key phrases for overlap matching (Layer 4)';
COMMENT ON COLUMN prediction.signal_fingerprints.fingerprint_hash IS 'Hash of concatenated key phrases for quick lookup';

-- =====================================================================================
-- ENHANCED SOURCE_CRAWLS DEDUPLICATION METRICS
-- =====================================================================================
-- Purpose: Track deduplication statistics per crawl by layer
-- =====================================================================================

ALTER TABLE prediction.source_crawls
  ADD COLUMN IF NOT EXISTS duplicates_exact INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicates_cross_source INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicates_fuzzy_title INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicates_phrase_overlap INTEGER DEFAULT 0;

-- Add check constraints for non-negative values
ALTER TABLE prediction.source_crawls
  DROP CONSTRAINT IF EXISTS source_crawls_duplicates_exact_check;
ALTER TABLE prediction.source_crawls
  ADD CONSTRAINT source_crawls_duplicates_exact_check CHECK (duplicates_exact >= 0);

ALTER TABLE prediction.source_crawls
  DROP CONSTRAINT IF EXISTS source_crawls_duplicates_cross_source_check;
ALTER TABLE prediction.source_crawls
  ADD CONSTRAINT source_crawls_duplicates_cross_source_check CHECK (duplicates_cross_source >= 0);

ALTER TABLE prediction.source_crawls
  DROP CONSTRAINT IF EXISTS source_crawls_duplicates_fuzzy_title_check;
ALTER TABLE prediction.source_crawls
  ADD CONSTRAINT source_crawls_duplicates_fuzzy_title_check CHECK (duplicates_fuzzy_title >= 0);

ALTER TABLE prediction.source_crawls
  DROP CONSTRAINT IF EXISTS source_crawls_duplicates_phrase_overlap_check;
ALTER TABLE prediction.source_crawls
  ADD CONSTRAINT source_crawls_duplicates_phrase_overlap_check CHECK (duplicates_phrase_overlap >= 0);

COMMENT ON COLUMN prediction.source_crawls.duplicates_exact IS 'Layer 1: Exact hash matches (same source)';
COMMENT ON COLUMN prediction.source_crawls.duplicates_cross_source IS 'Layer 2: Same content from different source';
COMMENT ON COLUMN prediction.source_crawls.duplicates_fuzzy_title IS 'Layer 3: Similar title (Jaccard > 0.85)';
COMMENT ON COLUMN prediction.source_crawls.duplicates_phrase_overlap IS 'Layer 4: Key phrase overlap > 70%';

-- =====================================================================================
-- LAYER 3: FIND SIMILAR SIGNALS BY TITLE (Jaccard Similarity)
-- =====================================================================================
-- Note: Complex similarity is computed in application code. This function provides
-- candidate signals for efficient filtering.
-- =====================================================================================

CREATE OR REPLACE FUNCTION prediction.find_recent_signal_fingerprints(
  p_target_id UUID,
  p_hours_back INTEGER DEFAULT 72,
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
  signal_id UUID,
  title_normalized TEXT,
  key_phrases TEXT[],
  fingerprint_hash TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sf.signal_id,
    sf.title_normalized,
    sf.key_phrases,
    sf.fingerprint_hash,
    sf.created_at
  FROM prediction.signal_fingerprints sf
  WHERE sf.target_id = p_target_id
    AND sf.created_at > NOW() - (p_hours_back || ' hours')::INTERVAL
  ORDER BY sf.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION prediction.find_recent_signal_fingerprints(UUID, INTEGER, INTEGER) IS
  'Get recent signal fingerprints for a target (used for Layer 3 & 4 fuzzy matching)';

-- =====================================================================================
-- LAYER 4: FIND SIGNALS BY KEY PHRASE OVERLAP
-- =====================================================================================
-- Returns signals that share any key phrases with the input
-- Application code then calculates actual overlap percentage
-- =====================================================================================

CREATE OR REPLACE FUNCTION prediction.find_signals_by_phrase_overlap(
  p_target_id UUID,
  p_key_phrases TEXT[],
  p_hours_back INTEGER DEFAULT 72,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  signal_id UUID,
  title_normalized TEXT,
  key_phrases TEXT[],
  overlap_count INTEGER,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sf.signal_id,
    sf.title_normalized,
    sf.key_phrases,
    (SELECT COUNT(*)::INTEGER FROM unnest(sf.key_phrases) kp WHERE kp = ANY(p_key_phrases)) as overlap_count,
    sf.created_at
  FROM prediction.signal_fingerprints sf
  WHERE sf.target_id = p_target_id
    AND sf.created_at > NOW() - (p_hours_back || ' hours')::INTERVAL
    AND sf.key_phrases && p_key_phrases  -- Array overlap operator (fast with GIN index)
  ORDER BY overlap_count DESC, sf.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION prediction.find_signals_by_phrase_overlap(UUID, TEXT[], INTEGER, INTEGER) IS
  'Find signals with overlapping key phrases (Layer 4 candidate generation)';

-- =====================================================================================
-- CRAWL CONFIG DEFAULTS FOR NEW SOURCES
-- =====================================================================================
-- Update source defaults to include deduplication config
-- =====================================================================================

-- Add default crawl config that includes dedup settings
COMMENT ON COLUMN prediction.sources.crawl_config IS
  'Crawl configuration including dedup settings: { fuzzy_dedup_enabled, title_similarity_threshold, phrase_overlap_threshold, cross_source_dedup }';

-- =====================================================================================
-- UTILITY: CALCULATE TOTAL DUPLICATES
-- =====================================================================================

CREATE OR REPLACE FUNCTION prediction.calculate_total_duplicates(
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

COMMENT ON FUNCTION prediction.calculate_total_duplicates(INTEGER, INTEGER, INTEGER, INTEGER) IS
  'Calculate total duplicates across all dedup layers';

-- =====================================================================================
-- VIEW: CRAWL DEDUPLICATION STATS
-- =====================================================================================

CREATE OR REPLACE VIEW prediction.crawl_dedup_stats AS
SELECT
  sc.id as crawl_id,
  sc.source_id,
  s.name as source_name,
  sc.started_at,
  sc.status,
  sc.items_found,
  sc.items_new,
  sc.signals_created,
  sc.duplicates_exact,
  sc.duplicates_cross_source,
  sc.duplicates_fuzzy_title,
  sc.duplicates_phrase_overlap,
  prediction.calculate_total_duplicates(
    sc.duplicates_exact,
    sc.duplicates_cross_source,
    sc.duplicates_fuzzy_title,
    sc.duplicates_phrase_overlap
  ) as duplicates_total,
  CASE
    WHEN sc.items_found > 0 THEN
      ROUND(
        100.0 * prediction.calculate_total_duplicates(
          sc.duplicates_exact,
          sc.duplicates_cross_source,
          sc.duplicates_fuzzy_title,
          sc.duplicates_phrase_overlap
        ) / sc.items_found,
        1
      )
    ELSE 0
  END as dedup_rate_percent
FROM prediction.source_crawls sc
JOIN prediction.sources s ON sc.source_id = s.id;

COMMENT ON VIEW prediction.crawl_dedup_stats IS
  'Crawl statistics with deduplication breakdown by layer';

-- =====================================================================================
-- RLS POLICIES
-- =====================================================================================
-- signal_fingerprints inherits tenant isolation through target_id → targets → universe_id
-- =====================================================================================

ALTER TABLE prediction.signal_fingerprints ENABLE ROW LEVEL SECURITY;

-- Read policy: Users can read fingerprints for signals in their org's universes
CREATE POLICY signal_fingerprints_read_policy ON prediction.signal_fingerprints
  FOR SELECT
  USING (
    target_id IN (
      SELECT t.id FROM prediction.targets t
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE u.organization_slug = current_setting('app.current_org', true)
    )
  );

-- Insert policy: Users can insert fingerprints for their org's targets
CREATE POLICY signal_fingerprints_insert_policy ON prediction.signal_fingerprints
  FOR INSERT
  WITH CHECK (
    target_id IN (
      SELECT t.id FROM prediction.targets t
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE u.organization_slug = current_setting('app.current_org', true)
    )
  );

-- Delete policy: Users can delete fingerprints for their org's targets
CREATE POLICY signal_fingerprints_delete_policy ON prediction.signal_fingerprints
  FOR DELETE
  USING (
    target_id IN (
      SELECT t.id FROM prediction.targets t
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE u.organization_slug = current_setting('app.current_org', true)
    )
  );

-- Service role bypass
CREATE POLICY signal_fingerprints_service_all ON prediction.signal_fingerprints
  TO service_role
  USING (true)
  WITH CHECK (true);

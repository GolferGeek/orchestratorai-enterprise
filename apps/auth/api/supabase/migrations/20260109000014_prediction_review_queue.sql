-- =====================================================================================
-- PREDICTION SYSTEM - PHASE 2: REVIEW QUEUE AND SOURCE TRACKING
-- =====================================================================================
-- Description: Creates review queue for HITL and source crawl tracking
-- Dependencies: prediction schema, signals, predictors, sources
-- =====================================================================================

-- =====================================================================================
-- REVIEW QUEUE TABLE
-- =====================================================================================
-- Purpose: HITL review for signals with moderate confidence
-- =====================================================================================

CREATE TABLE prediction.review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Signal reference
  signal_id UUID NOT NULL REFERENCES prediction.signals(id) ON DELETE CASCADE,

  -- AI assessment that triggered the review
  original_direction TEXT NOT NULL,
  original_confidence NUMERIC(3,2) NOT NULL,
  original_reasoning TEXT NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected', 'modified'

  -- Human response
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id UUID,

  -- Response details
  response_direction TEXT,  -- Override direction if modified
  response_strength INTEGER,  -- Override strength if modified (1-10)
  response_notes TEXT,
  create_learning BOOLEAN DEFAULT false,  -- Whether to create a learning from this

  -- Created predictor (if approved)
  predictor_id UUID REFERENCES prediction.predictors(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (status IN ('pending', 'approved', 'rejected', 'modified')),
  CHECK (original_confidence >= 0.00 AND original_confidence <= 1.00),
  CHECK (response_strength IS NULL OR (response_strength >= 1 AND response_strength <= 10)),
  UNIQUE (signal_id)
);

-- Indexes
CREATE INDEX idx_review_queue_status ON prediction.review_queue(status) WHERE status = 'pending';
CREATE INDEX idx_review_queue_signal ON prediction.review_queue(signal_id);
CREATE INDEX idx_review_queue_predictor ON prediction.review_queue(predictor_id) WHERE predictor_id IS NOT NULL;
CREATE INDEX idx_review_queue_reviewed ON prediction.review_queue(reviewed_at DESC) WHERE reviewed_at IS NOT NULL;
CREATE INDEX idx_review_queue_reviewer ON prediction.review_queue(reviewed_by_user_id) WHERE reviewed_by_user_id IS NOT NULL;
CREATE INDEX idx_review_queue_created ON prediction.review_queue(created_at DESC);
CREATE INDEX idx_review_queue_confidence ON prediction.review_queue(original_confidence);
CREATE INDEX idx_review_queue_learning ON prediction.review_queue(create_learning) WHERE create_learning = true;

-- Trigger
CREATE TRIGGER set_review_queue_updated_at
  BEFORE UPDATE ON prediction.review_queue
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- Comments
COMMENT ON TABLE prediction.review_queue IS 'HITL review queue for signals with moderate confidence';
COMMENT ON COLUMN prediction.review_queue.signal_id IS 'Signal requiring human review';
COMMENT ON COLUMN prediction.review_queue.original_direction IS 'AI-assessed direction';
COMMENT ON COLUMN prediction.review_queue.original_confidence IS 'AI confidence level (0.00-1.00)';
COMMENT ON COLUMN prediction.review_queue.original_reasoning IS 'AI reasoning for the assessment';
COMMENT ON COLUMN prediction.review_queue.status IS 'Review status: pending, approved, rejected, modified';
COMMENT ON COLUMN prediction.review_queue.response_direction IS 'Human-override direction (if modified)';
COMMENT ON COLUMN prediction.review_queue.response_strength IS 'Human-override strength 1-10 (if modified)';
COMMENT ON COLUMN prediction.review_queue.create_learning IS 'Whether to create a learning from this review';
COMMENT ON COLUMN prediction.review_queue.predictor_id IS 'Created predictor if approved';

-- =====================================================================================
-- SOURCE CRAWLS TABLE
-- =====================================================================================
-- Purpose: Track crawl history and performance for each source
-- =====================================================================================

CREATE TABLE prediction.source_crawls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  source_id UUID NOT NULL REFERENCES prediction.sources(id) ON DELETE CASCADE,

  -- Crawl details
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',  -- 'running', 'success', 'failed', 'partial'

  -- Results
  items_found INTEGER DEFAULT 0,
  items_new INTEGER DEFAULT 0,  -- After deduplication
  signals_created INTEGER DEFAULT 0,

  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Performance
  duration_ms INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (status IN ('running', 'success', 'failed', 'partial')),
  CHECK (items_found >= 0),
  CHECK (items_new >= 0),
  CHECK (signals_created >= 0),
  CHECK (retry_count >= 0),
  CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

-- Indexes
CREATE INDEX idx_source_crawls_source ON prediction.source_crawls(source_id);
CREATE INDEX idx_source_crawls_status ON prediction.source_crawls(status);
CREATE INDEX idx_source_crawls_started ON prediction.source_crawls(started_at DESC);
CREATE INDEX idx_source_crawls_completed ON prediction.source_crawls(completed_at DESC) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_source_crawls_source_status ON prediction.source_crawls(source_id, status, started_at DESC);
CREATE INDEX idx_source_crawls_performance ON prediction.source_crawls(source_id, duration_ms) WHERE duration_ms IS NOT NULL;

-- Comments
COMMENT ON TABLE prediction.source_crawls IS 'Track crawl history and performance for each source';
COMMENT ON COLUMN prediction.source_crawls.source_id IS 'Source being crawled';
COMMENT ON COLUMN prediction.source_crawls.started_at IS 'When the crawl started';
COMMENT ON COLUMN prediction.source_crawls.completed_at IS 'When the crawl completed (NULL if still running)';
COMMENT ON COLUMN prediction.source_crawls.status IS 'Crawl status: running, success, failed, partial';
COMMENT ON COLUMN prediction.source_crawls.items_found IS 'Total items found in this crawl';
COMMENT ON COLUMN prediction.source_crawls.items_new IS 'New items after deduplication';
COMMENT ON COLUMN prediction.source_crawls.signals_created IS 'Number of signals created from this crawl';
COMMENT ON COLUMN prediction.source_crawls.error_message IS 'Error message if failed';
COMMENT ON COLUMN prediction.source_crawls.retry_count IS 'Number of retry attempts';
COMMENT ON COLUMN prediction.source_crawls.duration_ms IS 'Crawl duration in milliseconds';

-- =====================================================================================
-- SOURCE SEEN ITEMS TABLE
-- =====================================================================================
-- Purpose: Deduplication tracking for source items
-- =====================================================================================

CREATE TABLE prediction.source_seen_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  source_id UUID NOT NULL REFERENCES prediction.sources(id) ON DELETE CASCADE,

  -- Content hash for deduplication
  content_hash TEXT NOT NULL,  -- SHA-256 of normalized content

  -- Original URL/ID from source
  source_item_id TEXT,

  -- Timestamps
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Signal reference (if created)
  signal_id UUID REFERENCES prediction.signals(id) ON DELETE SET NULL,

  -- Constraints
  UNIQUE (source_id, content_hash)
);

-- Indexes
CREATE INDEX idx_source_seen_items_source ON prediction.source_seen_items(source_id);
CREATE INDEX idx_source_seen_items_hash ON prediction.source_seen_items(source_id, content_hash);
CREATE INDEX idx_source_seen_items_signal ON prediction.source_seen_items(signal_id) WHERE signal_id IS NOT NULL;
CREATE INDEX idx_source_seen_items_first_seen ON prediction.source_seen_items(first_seen_at DESC);
CREATE INDEX idx_source_seen_items_last_seen ON prediction.source_seen_items(last_seen_at DESC);
CREATE INDEX idx_source_seen_items_source_item_id ON prediction.source_seen_items(source_id, source_item_id) WHERE source_item_id IS NOT NULL;

-- Comments
COMMENT ON TABLE prediction.source_seen_items IS 'Deduplication tracking for source items';
COMMENT ON COLUMN prediction.source_seen_items.source_id IS 'Source that provided this item';
COMMENT ON COLUMN prediction.source_seen_items.content_hash IS 'SHA-256 hash of normalized content for deduplication';
COMMENT ON COLUMN prediction.source_seen_items.source_item_id IS 'Original ID/URL from source';
COMMENT ON COLUMN prediction.source_seen_items.first_seen_at IS 'When this item was first seen';
COMMENT ON COLUMN prediction.source_seen_items.last_seen_at IS 'When this item was last seen (for tracking recurrence)';
COMMENT ON COLUMN prediction.source_seen_items.signal_id IS 'Signal created from this item (if any)';

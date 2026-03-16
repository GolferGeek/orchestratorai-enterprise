-- =============================================================================
-- ADD IS_TEST COLUMN TO PREDICTION.SOURCES
-- =============================================================================
-- Adds is_test flag to distinguish test data sources from production sources
-- Enables filtering and isolation of test data in prediction workflows
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- =============================================================================

-- Add is_test column with default false
ALTER TABLE prediction.sources
ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;

-- =============================================================================
-- INDEX
-- =============================================================================

-- Index for filtering test sources
CREATE INDEX idx_prediction_sources_is_test ON prediction.sources(is_test) WHERE is_test = true;

-- =============================================================================
-- COMMENT
-- =============================================================================

COMMENT ON COLUMN prediction.sources.is_test IS 'Flag indicating whether this source contains test data (true) or production data (false)';

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- After running, verify with:
-- SELECT id, name, is_test FROM prediction.sources LIMIT 10;

-- =============================================================================
-- ADD ANALYST_SLUG TO PREDICTIONS
-- =============================================================================
-- Purpose: Support per-analyst predictions
-- Each prediction can now be linked to a specific analyst, enabling:
--   1. Individual analyst predictions (not just aggregated)
--   2. Arbitrator predictions (synthesis of all analysts)
--   3. Per-analyst portfolio tracking
-- =============================================================================

-- Add analyst_slug column to predictions
ALTER TABLE prediction.predictions
  ADD COLUMN IF NOT EXISTS analyst_slug TEXT;

-- Add is_arbitrator flag to identify synthesized predictions
ALTER TABLE prediction.predictions
  ADD COLUMN IF NOT EXISTS is_arbitrator BOOLEAN DEFAULT FALSE;

-- Create index for analyst_slug queries
CREATE INDEX IF NOT EXISTS idx_predictions_analyst_slug
  ON prediction.predictions(analyst_slug)
  WHERE analyst_slug IS NOT NULL;

-- Create index for arbitrator predictions
CREATE INDEX IF NOT EXISTS idx_predictions_is_arbitrator
  ON prediction.predictions(target_id, is_arbitrator)
  WHERE is_arbitrator = TRUE;

-- Comments
COMMENT ON COLUMN prediction.predictions.analyst_slug IS 'Slug of the analyst who made this prediction (null for aggregated/legacy predictions)';
COMMENT ON COLUMN prediction.predictions.is_arbitrator IS 'True if this is a synthesized arbitrator prediction combining all analyst opinions';

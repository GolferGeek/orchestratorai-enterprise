-- =============================================================================
-- PREDICTION PIPELINE CONSOLIDATION
-- =============================================================================
-- Purpose: Enforce ONE active prediction per analyst per target
-- Changes:
--   1. Cancel duplicate active predictions (keep most recent per analyst+target)
--   2. Add unique partial index to prevent future duplicates
--   3. Add fork_type column to predictors for per-analyst/fork tracking
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: CANCEL DUPLICATE ACTIVE PREDICTIONS
-- =============================================================================
-- For each (target_id, analyst_slug) pair with multiple active predictions,
-- keep the MOST RECENT one and cancel the rest.

WITH ranked AS (
  SELECT id, target_id, analyst_slug,
    ROW_NUMBER() OVER (
      PARTITION BY target_id, analyst_slug
      ORDER BY created_at DESC
    ) AS rn
  FROM prediction.predictions
  WHERE status = 'active'
    AND analyst_slug IS NOT NULL
)
UPDATE prediction.predictions
SET status = 'cancelled',
    resolution_notes = 'Cancelled by consolidation migration: duplicate active prediction'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- =============================================================================
-- STEP 2: UNIQUE PARTIAL INDEX - ONE ACTIVE PREDICTION PER ANALYST PER TARGET
-- =============================================================================
-- This prevents any future duplicates at the database level.

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_analyst_prediction
  ON prediction.predictions(target_id, analyst_slug)
  WHERE status = 'active' AND analyst_slug IS NOT NULL;

-- =============================================================================
-- STEP 3: ADD FORK_TYPE COLUMN TO PREDICTORS
-- =============================================================================
-- Enables per-analyst/fork predictor storage.
-- Values: 'user', 'ai', 'arbitrator'

ALTER TABLE prediction.predictors
  ADD COLUMN IF NOT EXISTS fork_type TEXT DEFAULT NULL;

COMMENT ON COLUMN prediction.predictors.fork_type IS
  'Fork type for per-analyst predictors: user, ai, or arbitrator';

-- Add index for fork_type queries
CREATE INDEX IF NOT EXISTS idx_prediction_predictors_fork_type
  ON prediction.predictors(analyst_slug, fork_type)
  WHERE fork_type IS NOT NULL;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  v_duplicates INTEGER;
  v_active_predictions INTEGER;
  v_cancelled INTEGER;
BEGIN
  -- Check for any remaining duplicates
  SELECT COUNT(*) INTO v_duplicates
  FROM (
    SELECT target_id, analyst_slug, COUNT(*) as cnt
    FROM prediction.predictions
    WHERE status = 'active' AND analyst_slug IS NOT NULL
    GROUP BY target_id, analyst_slug
    HAVING COUNT(*) > 1
  ) dupes;

  -- Count active predictions
  SELECT COUNT(*) INTO v_active_predictions
  FROM prediction.predictions
  WHERE status = 'active';

  -- Count cancelled by this migration
  SELECT COUNT(*) INTO v_cancelled
  FROM prediction.predictions
  WHERE resolution_notes = 'Cancelled by consolidation migration: duplicate active prediction';

  RAISE NOTICE '=== PREDICTION PIPELINE CONSOLIDATION ===';
  RAISE NOTICE 'Duplicate pairs remaining: % (should be 0)', v_duplicates;
  RAISE NOTICE 'Active predictions: %', v_active_predictions;
  RAISE NOTICE 'Predictions cancelled by this migration: %', v_cancelled;
  RAISE NOTICE '=========================================';
END $$;

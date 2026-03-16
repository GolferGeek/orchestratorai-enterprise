-- Migration: Cleanup predictions from 16-per-target bug
-- Date: 2026-02-04
-- Purpose: Remove predictions created by the buggy code that generated 16 predictions per target
--          (5 analysts × 3 forks + 1 arbitrator = 16) instead of the correct 5 (1 per analyst)
--
-- The fix was deployed on 2026-02-03. This migration:
-- 1. Cancels all active predictions with analyst_slug set (per-analyst predictions from the bug)
-- 2. Resets predictors consumed by those predictions back to 'active' status

-- Step 1: Identify predictions to cancel (those from the buggy code)
-- These are predictions with analyst_slug set, created in the last 2 days
CREATE TEMP TABLE predictions_to_cancel AS
SELECT id, target_id
FROM prediction.predictions
WHERE analyst_slug IS NOT NULL
  AND status = 'active'
  AND created_at >= NOW() - INTERVAL '2 days';

-- Step 2: Reset predictors consumed by these predictions back to 'active'
UPDATE prediction.predictors
SET
  status = 'active',
  consumed_at = NULL,
  consumed_by_prediction_id = NULL
WHERE consumed_by_prediction_id IN (SELECT id FROM predictions_to_cancel)
  AND status = 'consumed';

-- Step 3: Cancel the buggy predictions (don't delete to preserve history)
UPDATE prediction.predictions
SET
  status = 'cancelled',
  resolution_notes = 'Cancelled by migration: created by 16-per-target bug before fix'
WHERE id IN (SELECT id FROM predictions_to_cancel);

-- Log the cleanup results
DO $$
DECLARE
  cancelled_count INTEGER;
  reset_predictor_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO cancelled_count
  FROM prediction.predictions
  WHERE status = 'cancelled'
    AND resolution_notes = 'Cancelled by migration: created by 16-per-target bug before fix';

  SELECT COUNT(*) INTO reset_predictor_count
  FROM prediction.predictors
  WHERE status = 'active'
    AND consumed_at IS NULL;

  RAISE NOTICE 'Cancelled % predictions from 16-per-target bug', cancelled_count;
  RAISE NOTICE 'Reset % predictors back to active status', reset_predictor_count;
END $$;

-- Cleanup temp table
DROP TABLE predictions_to_cancel;

-- Migration: Cleanup duplicate predictions
-- Date: 2026-01-14
-- Purpose: Remove duplicate active predictions per target, keeping only the most recent one
--
-- Background: The prediction generation service was creating new predictions without checking
-- if an active prediction already existed for the target. This fix was applied to the code,
-- and this migration cleans up any existing duplicates.

-- First, let's identify and delete duplicate active predictions
-- We keep the most recent prediction (by predicted_at) for each target

-- Create a CTE to identify predictions to keep (the most recent active one per target)
WITH latest_predictions AS (
  SELECT DISTINCT ON (target_id) id
  FROM prediction.predictions
  WHERE status = 'active'
  ORDER BY target_id, predicted_at DESC
),
-- Identify all active predictions that are NOT the latest (i.e., duplicates to remove)
duplicates_to_remove AS (
  SELECT p.id, p.target_id, p.predicted_at
  FROM prediction.predictions p
  WHERE p.status = 'active'
    AND p.id NOT IN (SELECT id FROM latest_predictions)
)
-- Cancel (not delete) the duplicate predictions so we preserve history
UPDATE prediction.predictions
SET
  status = 'cancelled',
  resolution_notes = 'Cancelled by migration: duplicate active prediction for same target'
WHERE id IN (SELECT id FROM duplicates_to_remove);

-- Log the cleanup results
DO $$
DECLARE
  cancelled_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO cancelled_count
  FROM prediction.predictions
  WHERE status = 'cancelled'
    AND resolution_notes = 'Cancelled by migration: duplicate active prediction for same target';

  IF cancelled_count > 0 THEN
    RAISE NOTICE 'Cancelled % duplicate active predictions', cancelled_count;
  ELSE
    RAISE NOTICE 'No duplicate active predictions found';
  END IF;
END $$;

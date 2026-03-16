-- =====================================================================================
-- RESET PREDICTIONS AND PREDICTORS
-- =====================================================================================
-- Description: Clears all non-test predictions and predictors so the pipeline
--              regenerates fresh data using the enriched analyst personas.
--              Signals are preserved — they will be reprocessed into new predictors.
-- Dependencies: 20260207000003_enrich_analyst_personas.sql
-- =====================================================================================

BEGIN;

-- =====================================================================================
-- STEP 1: CLEAR CHILD TABLES OF PREDICTIONS (in FK dependency order)
-- =====================================================================================
-- Many of these have ON DELETE CASCADE, but being explicit for clarity and safety.

-- Learning queue references evaluations
DELETE FROM prediction.learning_queue
WHERE source_evaluation_id IN (
  SELECT id FROM prediction.evaluations
  WHERE prediction_id IN (
    SELECT id FROM prediction.predictions WHERE is_test_data IS NOT TRUE
  )
);

-- Learnings reference evaluations (SET NULL FK, but clear the link)
UPDATE prediction.learnings
SET source_evaluation_id = NULL
WHERE source_evaluation_id IN (
  SELECT id FROM prediction.evaluations
  WHERE prediction_id IN (
    SELECT id FROM prediction.predictions WHERE is_test_data IS NOT TRUE
  )
);

-- Analyst positions reference predictions and analyst_assessments
DELETE FROM prediction.analyst_positions
WHERE prediction_id IN (
  SELECT id FROM prediction.predictions WHERE is_test_data IS NOT TRUE
);

-- User positions reference predictions
DELETE FROM prediction.user_positions
WHERE prediction_id IN (
  SELECT id FROM prediction.predictions WHERE is_test_data IS NOT TRUE
);

-- Evaluations reference predictions
DELETE FROM prediction.evaluations
WHERE prediction_id IN (
  SELECT id FROM prediction.predictions WHERE is_test_data IS NOT TRUE
);

-- Snapshots reference predictions
DELETE FROM prediction.snapshots
WHERE prediction_id IN (
  SELECT id FROM prediction.predictions WHERE is_test_data IS NOT TRUE
);

-- Analyst assessments reference both predictions and predictors
DELETE FROM prediction.analyst_assessments
WHERE prediction_id IN (
  SELECT id FROM prediction.predictions WHERE is_test_data IS NOT TRUE
);

DELETE FROM prediction.analyst_assessments
WHERE predictor_id IN (
  SELECT id FROM prediction.predictors WHERE is_test_data IS NOT TRUE
);

-- =====================================================================================
-- STEP 2: CLEAR CHILD TABLES OF PREDICTORS
-- =====================================================================================

-- Review queue references predictors
DELETE FROM prediction.review_queue
WHERE predictor_id IN (
  SELECT id FROM prediction.predictors WHERE is_test_data IS NOT TRUE
);

-- =====================================================================================
-- STEP 3: DELETE PREDICTORS AND PREDICTIONS
-- =====================================================================================

-- Delete predictors (signals will be reprocessed into new ones)
DELETE FROM prediction.predictors WHERE is_test_data IS NOT TRUE;

-- Delete predictions
DELETE FROM prediction.predictions WHERE is_test_data IS NOT TRUE;

COMMIT;

-- =====================================================================================
-- VERIFICATION
-- =====================================================================================

DO $$
DECLARE
  v_predictions INTEGER;
  v_predictors INTEGER;
  v_signals INTEGER;
  v_assessments INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_predictions FROM prediction.predictions WHERE is_test_data IS NOT TRUE;
  SELECT COUNT(*) INTO v_predictors FROM prediction.predictors WHERE is_test_data IS NOT TRUE;
  SELECT COUNT(*) INTO v_signals FROM prediction.signals;
  SELECT COUNT(*) INTO v_assessments FROM prediction.analyst_assessments;

  RAISE NOTICE '=== PREDICTION RESET COMPLETE ===';
  RAISE NOTICE 'Non-test predictions remaining: % (should be 0)', v_predictions;
  RAISE NOTICE 'Non-test predictors remaining: % (should be 0)', v_predictors;
  RAISE NOTICE 'Signals preserved: %', v_signals;
  RAISE NOTICE 'Analyst assessments remaining: % (may include test data)', v_assessments;
  RAISE NOTICE '=================================';
END $$;

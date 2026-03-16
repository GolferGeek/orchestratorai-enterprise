-- =============================================================================
-- REMOVE PREDICTOR SIGNAL_ID COLUMN
-- =============================================================================
-- The new article processing flow goes directly from Article → Predictor,
-- bypassing the legacy Signal step. Signal_id is no longer needed.
--
-- New Flow: Article → (ensemble evaluation) → Predictor → Prediction
-- Old Flow: Signal → Predictor → Prediction (deprecated)
-- =============================================================================

ALTER TABLE prediction.predictors DROP COLUMN IF EXISTS signal_id;

-- =============================================================================
-- FIX TRIGGER: enforce_predictor_is_test
-- =============================================================================
-- The old trigger referenced NEW.signal_id which no longer exists.
-- Updated to check the target's is_test_data flag instead.
-- =============================================================================

CREATE OR REPLACE FUNCTION prediction.enforce_predictor_is_test()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  target_is_test BOOLEAN;
BEGIN
  -- Check if the target is test data
  SELECT t.is_test_data INTO target_is_test
  FROM prediction.targets t
  WHERE t.id = NEW.target_id;

  -- If target is test, predictor must be test
  IF target_is_test = true AND NEW.is_test = false THEN
    RAISE EXCEPTION 'INV-03 Violation: Predictor must have is_test=true when target is test data. Target ID: %, Predictor is_test: %',
      NEW.target_id, NEW.is_test;
  END IF;

  RETURN NEW;
END;
$$;

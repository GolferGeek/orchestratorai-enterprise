-- =============================================================================
-- ENFORCEMENT TRIGGERS FOR IS_TEST PROPAGATION
-- =============================================================================
-- Ensures is_test flag propagates correctly through the prediction pipeline
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- PRD Section: 15.4 Enforcement Triggers
-- =============================================================================

-- =============================================================================
-- INV-02: Signals from is_test=true sources MUST have is_test=true
-- =============================================================================

CREATE OR REPLACE FUNCTION prediction.enforce_signal_is_test()
RETURNS TRIGGER AS $$
DECLARE
  source_is_test BOOLEAN;
BEGIN
  -- Check source's is_test status
  SELECT is_test INTO source_is_test
  FROM prediction.sources
  WHERE id = NEW.source_id;

  -- If source is test, signal must be test
  IF source_is_test = true AND NEW.is_test = false THEN
    RAISE EXCEPTION 'INV-02 Violation: Signal must have is_test=true when source has is_test=true. Source ID: %, Signal is_test: %',
      NEW.source_id, NEW.is_test;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_signal_is_test
  BEFORE INSERT OR UPDATE ON prediction.signals
  FOR EACH ROW
  EXECUTE FUNCTION prediction.enforce_signal_is_test();

-- =============================================================================
-- INV-03: Predictors from is_test=true signals MUST have is_test=true
-- =============================================================================

CREATE OR REPLACE FUNCTION prediction.enforce_predictor_is_test()
RETURNS TRIGGER AS $$
DECLARE
  has_test_signal BOOLEAN;
BEGIN
  -- Check if any contributing signal has is_test=true
  -- Assuming predictor has a signal_ids array or similar relationship
  -- This checks if the predictor's related signal is a test signal
  SELECT EXISTS(
    SELECT 1 FROM prediction.signals s
    WHERE s.id = NEW.signal_id AND s.is_test = true
  ) INTO has_test_signal;

  -- If any signal is test, predictor must be test
  IF has_test_signal = true AND NEW.is_test = false THEN
    RAISE EXCEPTION 'INV-03 Violation: Predictor must have is_test=true when derived from is_test=true signal. Signal ID: %, Predictor is_test: %',
      NEW.signal_id, NEW.is_test;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_predictor_is_test
  BEFORE INSERT OR UPDATE ON prediction.predictors
  FOR EACH ROW
  EXECUTE FUNCTION prediction.enforce_predictor_is_test();

-- =============================================================================
-- INV-04: is_test=true predictors can ONLY affect T_ prefixed targets
-- =============================================================================

CREATE OR REPLACE FUNCTION prediction.enforce_test_target_isolation()
RETURNS TRIGGER AS $$
DECLARE
  target_symbol TEXT;
BEGIN
  -- If predictor is test data, target must be T_ prefixed
  IF NEW.is_test = true THEN
    SELECT symbol INTO target_symbol
    FROM prediction.targets
    WHERE id = NEW.target_id;

    IF target_symbol IS NULL THEN
      RAISE EXCEPTION 'INV-04 Violation: Target not found for predictor. Target ID: %', NEW.target_id;
    END IF;

    IF target_symbol NOT LIKE 'T_%' THEN
      RAISE EXCEPTION 'INV-04 Violation: is_test=true predictor can only affect T_ prefixed targets. Target symbol: %. Expected: T_* prefix',
        target_symbol;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_test_target_isolation
  BEFORE INSERT OR UPDATE ON prediction.predictors
  FOR EACH ROW
  EXECUTE FUNCTION prediction.enforce_test_target_isolation();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON FUNCTION prediction.enforce_signal_is_test() IS 'INV-02: Signals from is_test=true sources MUST have is_test=true';
COMMENT ON FUNCTION prediction.enforce_predictor_is_test() IS 'INV-03: Predictors from is_test=true signals MUST have is_test=true';
COMMENT ON FUNCTION prediction.enforce_test_target_isolation() IS 'INV-04: is_test=true predictors can ONLY affect T_ prefixed targets';

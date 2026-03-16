-- =============================================================================
-- CREATE PREDICTION.TEST_TARGET_MIRRORS TABLE WITH AUTO-CREATION TRIGGER
-- =============================================================================
-- Maps real targets to their T_ prefixed test mirrors
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- PRD Section: 5.2 Mirror Mapping Table
-- INV-11: Every real target MUST have T_ test mirror auto-created
-- =============================================================================

CREATE TABLE prediction.test_target_mirrors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Real target (symbol NOT LIKE 'T_%')
  real_target_id UUID NOT NULL REFERENCES prediction.targets(id) ON DELETE CASCADE,

  -- Test mirror target (symbol LIKE 'T_%')
  test_target_id UUID NOT NULL REFERENCES prediction.targets(id) ON DELETE CASCADE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT uq_test_target_mirrors_real UNIQUE (real_target_id),
  CONSTRAINT uq_test_target_mirrors_test UNIQUE (test_target_id),
  CONSTRAINT chk_different_targets CHECK (real_target_id != test_target_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_test_target_mirrors_real ON prediction.test_target_mirrors(real_target_id);
CREATE INDEX idx_test_target_mirrors_test ON prediction.test_target_mirrors(test_target_id);

-- =============================================================================
-- AUTO-CREATION TRIGGER FUNCTION
-- =============================================================================
-- INV-11: Every real target MUST have T_ test mirror auto-created

CREATE OR REPLACE FUNCTION prediction.auto_create_test_mirror()
RETURNS TRIGGER AS $$
DECLARE
  test_symbol TEXT;
  test_target_id UUID;
  mirror_exists BOOLEAN;
BEGIN
  -- Only create mirrors for non-test targets (symbols NOT starting with T_)
  IF NEW.symbol NOT LIKE 'T_%' THEN
    -- Check if mirror already exists
    SELECT EXISTS(
      SELECT 1 FROM prediction.test_target_mirrors
      WHERE real_target_id = NEW.id
    ) INTO mirror_exists;

    IF NOT mirror_exists THEN
      -- Generate test symbol
      test_symbol := 'T_' || NEW.symbol;

      -- Check if test target already exists (might have been created manually)
      SELECT id INTO test_target_id
      FROM prediction.targets
      WHERE symbol = test_symbol AND universe_id = NEW.universe_id;

      -- Create test target if it doesn't exist
      IF test_target_id IS NULL THEN
        INSERT INTO prediction.targets (
          universe_id,
          symbol,
          name,
          description,
          target_type,
          is_active,
          metadata
        ) VALUES (
          NEW.universe_id,
          test_symbol,
          'TEST: ' || NEW.name,
          'Test mirror of ' || NEW.symbol || '. ' || COALESCE(NEW.description, ''),
          NEW.target_type,
          NEW.is_active,
          jsonb_build_object(
            'is_test_mirror', true,
            'real_target_id', NEW.id,
            'real_symbol', NEW.symbol
          )
        )
        RETURNING id INTO test_target_id;
      END IF;

      -- Create the mirror mapping
      INSERT INTO prediction.test_target_mirrors (real_target_id, test_target_id)
      VALUES (NEW.id, test_target_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGER
-- =============================================================================

CREATE TRIGGER trg_auto_create_test_mirror
  AFTER INSERT ON prediction.targets
  FOR EACH ROW
  EXECUTE FUNCTION prediction.auto_create_test_mirror();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.test_target_mirrors IS 'Maps real targets to their T_ prefixed test mirrors (INV-11)';
COMMENT ON COLUMN prediction.test_target_mirrors.real_target_id IS 'Reference to the real (production) target';
COMMENT ON COLUMN prediction.test_target_mirrors.test_target_id IS 'Reference to the T_ prefixed test mirror target';
COMMENT ON FUNCTION prediction.auto_create_test_mirror() IS 'Auto-creates T_ mirror for each new real target (INV-11)';

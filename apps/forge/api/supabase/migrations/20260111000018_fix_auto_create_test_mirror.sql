-- =============================================================================
-- FIX AUTO_CREATE_TEST_MIRROR TRIGGER FUNCTION
-- =============================================================================
-- The original function referenced 'description' column which doesn't exist
-- in prediction.targets table. This migration fixes the function to use
-- the actual column structure.
-- =============================================================================

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
          target_type,
          context,
          is_active,
          metadata
        ) VALUES (
          NEW.universe_id,
          test_symbol,
          'TEST: ' || COALESCE(NEW.name, NEW.symbol),
          NEW.target_type,
          'Test mirror of ' || NEW.symbol || '. ' || COALESCE(NEW.context, ''),
          COALESCE(NEW.is_active, true),
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

-- Comment
COMMENT ON FUNCTION prediction.auto_create_test_mirror() IS 'Auto-creates T_ mirror for each new real target (INV-11). Fixed to use context instead of description column.';

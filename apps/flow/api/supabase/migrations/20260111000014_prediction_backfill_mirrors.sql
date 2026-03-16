-- =============================================================================
-- BACKFILL T_ MIRRORS FOR EXISTING TARGETS
-- =============================================================================
-- Creates T_ test mirrors for all existing real targets
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- INV-11: Every real target MUST have T_ test mirror auto-created
-- =============================================================================

DO $$
DECLARE
  target_rec RECORD;
  test_symbol TEXT;
  test_target_id UUID;
  mirror_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting backfill of T_ mirrors for existing targets...';

  -- Loop through all targets that don't start with T_ and don't have a mirror yet
  FOR target_rec IN
    SELECT t.*
    FROM prediction.targets t
    WHERE t.symbol NOT LIKE 'T_%'
      AND NOT EXISTS (
        SELECT 1 FROM prediction.test_target_mirrors m
        WHERE m.real_target_id = t.id
      )
  LOOP
    -- Generate test symbol
    test_symbol := 'T_' || target_rec.symbol;

    -- Check if test target already exists
    SELECT id INTO test_target_id
    FROM prediction.targets
    WHERE symbol = test_symbol AND universe_id = target_rec.universe_id;

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
        target_rec.universe_id,
        test_symbol,
        'TEST: ' || target_rec.name,
        'Test mirror of ' || target_rec.symbol || '. ' || COALESCE(target_rec.description, ''),
        target_rec.target_type,
        target_rec.is_active,
        jsonb_build_object(
          'is_test_mirror', true,
          'real_target_id', target_rec.id,
          'real_symbol', target_rec.symbol,
          'backfilled_at', NOW()
        )
      )
      RETURNING id INTO test_target_id;

      RAISE NOTICE 'Created test target: % (mirror of %)', test_symbol, target_rec.symbol;
    ELSE
      RAISE NOTICE 'Test target already exists: % (mirror of %)', test_symbol, target_rec.symbol;
    END IF;

    -- Create the mirror mapping
    INSERT INTO prediction.test_target_mirrors (real_target_id, test_target_id)
    VALUES (target_rec.id, test_target_id)
    ON CONFLICT (real_target_id) DO NOTHING;

    mirror_count := mirror_count + 1;
  END LOOP;

  RAISE NOTICE 'Backfill complete. Created/verified % mirrors.', mirror_count;
END;
$$;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- After running, verify with:
-- SELECT
--   t.symbol as real_symbol,
--   t2.symbol as test_symbol,
--   m.created_at
-- FROM prediction.test_target_mirrors m
-- JOIN prediction.targets t ON t.id = m.real_target_id
-- JOIN prediction.targets t2 ON t2.id = m.test_target_id
-- ORDER BY m.created_at DESC
-- LIMIT 20;

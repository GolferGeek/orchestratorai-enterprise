-- ============================================================================
-- Migration: Fix Duplicate Analysts
-- ============================================================================
-- Problem: The unique constraint on prediction.analysts uses
--   (slug, scope_level, domain, universe_id, target_id)
-- but PostgreSQL UNIQUE constraints don't treat NULLs as equal,
-- so ON CONFLICT never matched for runner-level analysts with
-- NULL domain/universe_id/target_id, causing duplicates.
--
-- Fix:
-- 1. Delete all duplicate analyst rows (keep newest per slug+scope+domain)
-- 2. Replace the unique constraint with a unique INDEX using COALESCE
--    so NULLs are treated as equal for conflict detection
-- ============================================================================

-- STEP 1: Delete older duplicates across ALL analyst types at runner scope
-- Keep only the row with MAX created_at for each (slug, scope_level, domain) group
DELETE FROM prediction.analysts
WHERE id NOT IN (
  SELECT DISTINCT ON (slug, scope_level, COALESCE(domain, ''), COALESCE(universe_id::text, ''), COALESCE(target_id::text, '')) id
  FROM prediction.analysts
  ORDER BY slug, scope_level, COALESCE(domain, ''), COALESCE(universe_id::text, ''), COALESCE(target_id::text, ''), created_at DESC
);

-- STEP 2: Drop the old unique constraint that doesn't handle NULLs
ALTER TABLE prediction.analysts
DROP CONSTRAINT IF EXISTS analysts_slug_scope_level_domain_universe_id_target_id_key;

-- STEP 3: Create a unique INDEX with COALESCE so NULLs are treated as equal
-- This ensures ON CONFLICT works correctly for future inserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_analysts_unique_slug_scope
ON prediction.analysts (
  slug,
  scope_level,
  COALESCE(domain, ''),
  COALESCE(universe_id::text, ''),
  COALESCE(target_id::text, '')
);

-- STEP 4: Verify no duplicates remain
DO $$
DECLARE
  v_dupes INTEGER;
  v_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dupes
  FROM (
    SELECT slug, scope_level, COALESCE(domain, ''), COALESCE(universe_id::text, ''), COALESCE(target_id::text, '')
    FROM prediction.analysts
    GROUP BY slug, scope_level, COALESCE(domain, ''), COALESCE(universe_id::text, ''), COALESCE(target_id::text, '')
    HAVING COUNT(*) > 1
  ) sub;

  SELECT COUNT(*) INTO v_total FROM prediction.analysts WHERE is_enabled = true;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'Still have % duplicate analyst groups!', v_dupes;
  END IF;

  RAISE NOTICE 'Duplicate analysts cleaned up. % enabled analysts remaining.', v_total;
END $$;

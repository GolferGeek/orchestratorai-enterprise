-- =============================================================================
-- ADD COMPARISONS TABLE
-- =============================================================================
-- Feature 2: Subject Comparison View
-- Stores saved subject comparison sets
-- =============================================================================

-- Create comparisons table for saved comparison sets
CREATE TABLE IF NOT EXISTS risk.comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES risk.scopes(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  subject_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_risk_comparisons_scope ON risk.comparisons(scope_id);
CREATE INDEX IF NOT EXISTS idx_risk_comparisons_created ON risk.comparisons(created_at DESC);

-- Add comments
COMMENT ON TABLE risk.comparisons IS 'Saved subject comparison sets for quick access';
COMMENT ON COLUMN risk.comparisons.name IS 'User-defined name for the comparison set';
COMMENT ON COLUMN risk.comparisons.subject_ids IS 'Array of subject UUIDs to compare';

-- Grant permissions
GRANT ALL ON risk.comparisons TO service_role;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Comparisons Table Migration Complete';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Created: risk.comparisons table';
  RAISE NOTICE '================================================';
END $$;

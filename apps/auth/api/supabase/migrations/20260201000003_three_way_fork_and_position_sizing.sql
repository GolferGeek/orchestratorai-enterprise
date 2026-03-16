-- Migration: Three-way fork system and configurable position sizing
-- Date: 2026-02-01
-- Description:
--   1. Rename 'agent' fork to 'ai' for clarity
--   2. Add 'arbitrator' as third fork type
--   3. Create configurable position sizing thresholds table

-- ============================================================================
-- STEP 1: Drop old CHECK constraints FIRST (before updating data)
-- ============================================================================

-- Drop old constraints so we can update data
ALTER TABLE prediction.analyst_portfolios
DROP CONSTRAINT IF EXISTS analyst_portfolios_fork_type_check;

ALTER TABLE prediction.analyst_context_versions
DROP CONSTRAINT IF EXISTS analyst_context_versions_fork_type_check;

-- ============================================================================
-- STEP 2: Update fork_type from 'agent' to 'ai' in existing records
-- ============================================================================

-- Update analyst_portfolios
UPDATE prediction.analyst_portfolios
SET fork_type = 'ai'
WHERE fork_type = 'agent';

-- Update analyst_context_versions
UPDATE prediction.analyst_context_versions
SET fork_type = 'ai'
WHERE fork_type = 'agent';

-- ============================================================================
-- STEP 3: Add new CHECK constraints with updated values
-- ============================================================================

ALTER TABLE prediction.analyst_portfolios
ADD CONSTRAINT analyst_portfolios_fork_type_check
CHECK (fork_type IN ('user', 'ai', 'arbitrator'));

ALTER TABLE prediction.analyst_context_versions
ADD CONSTRAINT analyst_context_versions_fork_type_check
CHECK (fork_type IN ('user', 'ai', 'arbitrator'));

-- ============================================================================
-- STEP 4: Create position sizing configuration table
-- ============================================================================

CREATE TABLE IF NOT EXISTS prediction.position_sizing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug TEXT NOT NULL DEFAULT '*',  -- '*' means global default

  -- Confidence tier boundaries
  tier_name TEXT NOT NULL,  -- e.g., 'low', 'medium', 'high'
  min_confidence NUMERIC(4,2) NOT NULL,  -- e.g., 0.60
  max_confidence NUMERIC(4,2) NOT NULL,  -- e.g., 0.70

  -- Position size as percentage of portfolio
  position_percent NUMERIC(4,2) NOT NULL,  -- e.g., 0.05 (5%)

  -- Metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure tiers don't overlap within same org
  CONSTRAINT position_sizing_config_tier_unique
    UNIQUE (org_slug, tier_name)
);

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_position_sizing_config_org
ON prediction.position_sizing_config(org_slug, is_active);

-- ============================================================================
-- STEP 5: Insert default position sizing tiers
-- ============================================================================

INSERT INTO prediction.position_sizing_config
  (org_slug, tier_name, min_confidence, max_confidence, position_percent)
VALUES
  ('*', 'low',    0.60, 0.70, 0.05),   -- 60-70% confidence → 5% position
  ('*', 'medium', 0.70, 0.80, 0.10),   -- 70-80% confidence → 10% position
  ('*', 'high',   0.80, 1.00, 0.15)    -- 80%+ confidence → 15% position
ON CONFLICT (org_slug, tier_name) DO NOTHING;

-- ============================================================================
-- STEP 6: Add fork_type column to analyst_positions for denormalization
-- ============================================================================

-- Add fork_type directly to positions for easier querying
ALTER TABLE prediction.analyst_positions
ADD COLUMN IF NOT EXISTS fork_type TEXT;

-- Backfill from portfolio relationship
UPDATE prediction.analyst_positions ap
SET fork_type = p.fork_type
FROM prediction.analyst_portfolios p
WHERE ap.portfolio_id = p.id
AND ap.fork_type IS NULL;

-- Set default for new records
ALTER TABLE prediction.analyst_positions
ALTER COLUMN fork_type SET DEFAULT 'user';

-- Add check constraint
ALTER TABLE prediction.analyst_positions
ADD CONSTRAINT analyst_positions_fork_type_check
CHECK (fork_type IN ('user', 'ai', 'arbitrator'));

-- ============================================================================
-- STEP 7: Add context_mode to predictions table
-- ============================================================================

-- Track which context mode produced each prediction
ALTER TABLE prediction.predictions
ADD COLUMN IF NOT EXISTS context_mode TEXT DEFAULT 'combined';

-- Add check constraint
ALTER TABLE prediction.predictions
ADD CONSTRAINT predictions_context_mode_check
CHECK (context_mode IN ('user', 'ai', 'arbitrator', 'combined'));

-- Comment for clarity
COMMENT ON COLUMN prediction.predictions.context_mode IS
'Which context produced this prediction: user (user section only), ai (ai section only), arbitrator (combined with arbitration), combined (legacy)';

COMMENT ON TABLE prediction.position_sizing_config IS
'Configurable position sizing tiers based on confidence levels. Default tiers: low (60-70%→5%), medium (70-80%→10%), high (80%+→15%)';

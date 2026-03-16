-- =============================================================================
-- ADD MISSING COLUMNS TO TARGET_SNAPSHOTS TABLE
-- =============================================================================
-- The target_snapshots table is missing value_type and source columns that
-- are expected by the repository code.

-- Add value_type column with default 'price'
ALTER TABLE prediction.target_snapshots
ADD COLUMN IF NOT EXISTS value_type TEXT NOT NULL DEFAULT 'price';

-- Add source column with default 'other'
ALTER TABLE prediction.target_snapshots
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'other';

-- Add check constraint for valid value_type values (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_target_snapshots_value_type'
  ) THEN
    ALTER TABLE prediction.target_snapshots
    ADD CONSTRAINT chk_target_snapshots_value_type
    CHECK (value_type IN ('price', 'probability', 'index', 'other'));
  END IF;
END $$;

-- Add check constraint for valid source values (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_target_snapshots_source'
  ) THEN
    ALTER TABLE prediction.target_snapshots
    ADD CONSTRAINT chk_target_snapshots_source
    CHECK (source IN ('polygon', 'coingecko', 'polymarket', 'manual', 'other'));
  END IF;
END $$;

-- Comment the columns
COMMENT ON COLUMN prediction.target_snapshots.value_type IS 'Type of value: price, probability, index, or other';
COMMENT ON COLUMN prediction.target_snapshots.source IS 'Data source: polygon, coingecko, polymarket, manual, or other';

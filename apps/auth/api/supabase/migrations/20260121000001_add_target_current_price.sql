-- Migration: Add current_price to targets table
-- Purpose: Cache the latest price on the target for quick access
-- This avoids querying target_snapshots every time we need the current price

-- Add current_price and price_updated_at columns to targets
ALTER TABLE prediction.targets
ADD COLUMN IF NOT EXISTS current_price NUMERIC,
ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ;

-- Add index for queries that filter by price_updated_at (e.g., stale price detection)
CREATE INDEX IF NOT EXISTS idx_targets_price_updated_at
ON prediction.targets(price_updated_at)
WHERE price_updated_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN prediction.targets.current_price IS 'Cached current price, updated when snapshots are captured';
COMMENT ON COLUMN prediction.targets.price_updated_at IS 'Timestamp when current_price was last updated';

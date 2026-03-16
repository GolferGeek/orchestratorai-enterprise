-- Add coinmarketcap as a valid target snapshot source.
ALTER TABLE prediction.target_snapshots
DROP CONSTRAINT IF EXISTS chk_target_snapshots_source;

ALTER TABLE prediction.target_snapshots
ADD CONSTRAINT chk_target_snapshots_source
CHECK (
  source IN (
    'polygon',
    'coingecko',
    'coinmarketcap',
    'polymarket',
    'manual',
    'other'
  )
);

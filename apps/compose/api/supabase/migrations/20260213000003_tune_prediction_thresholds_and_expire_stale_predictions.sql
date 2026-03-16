-- Long-term prediction pipeline reliability fixes:
-- 1) Tune balanced strategy direction-consensus threshold to match live predictor dynamics
-- 2) Expire stale active predictions that are already past expires_at

-- Keep balanced strategy strict enough for quality, but not so strict that
-- high-volume mixed predictor streams block all generation.
UPDATE prediction.strategies
SET thresholds = jsonb_set(
  COALESCE(thresholds, '{}'::jsonb),
  '{min_direction_consensus}',
  '0.5'::jsonb,
  true
)
WHERE slug = 'balanced';

-- Repair stale lifecycle state: any active prediction that is already past
-- expiration should be marked expired.
UPDATE prediction.predictions
SET status = 'expired'
WHERE status = 'active'
  AND expires_at < NOW();

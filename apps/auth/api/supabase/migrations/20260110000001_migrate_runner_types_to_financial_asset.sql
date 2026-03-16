-- Migration: Migrate runner types to financial-asset-predictor
-- This migration updates existing agents from deprecated runner types
-- to the new unified financial-asset-predictor type.

-- ============================================================================
-- STEP 1: Update agent metadata.runnerConfig.runner field
-- ============================================================================

-- Update agents with runner type 'stock-predictor' to 'financial-asset-predictor'
UPDATE public.agents
SET metadata = jsonb_set(
  metadata,
  '{runnerConfig,runner}',
  '"financial-asset-predictor"'
)
WHERE metadata->>'runnerConfig' IS NOT NULL
  AND metadata->'runnerConfig'->>'runner' = 'stock-predictor';

-- Update agents with runner type 'crypto-predictor' to 'financial-asset-predictor'
UPDATE public.agents
SET metadata = jsonb_set(
  metadata,
  '{runnerConfig,runner}',
  '"financial-asset-predictor"'
)
WHERE metadata->>'runnerConfig' IS NOT NULL
  AND metadata->'runnerConfig'->>'runner' = 'crypto-predictor';

-- ============================================================================
-- STEP 2: Add comment documenting the migration
-- ============================================================================
COMMENT ON TABLE public.agents IS 'Agent definitions. Runner types stock-predictor and crypto-predictor were deprecated in favor of financial-asset-predictor (migrated 2026-01-10).';

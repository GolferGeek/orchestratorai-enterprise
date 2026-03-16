-- =============================================================================
-- ADD MODEL DEPRECATION TRACKING FIELDS
-- =============================================================================
-- Adds fields to track model deprecation, validation status, and reasons
-- Used by the validate-models script to track model availability
-- =============================================================================

-- Add deprecation tracking fields to llm_models
ALTER TABLE public.llm_models
  ADD COLUMN IF NOT EXISTS deprecation_reason TEXT,
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ;

-- Add index for querying deprecated models
CREATE INDEX IF NOT EXISTS llm_models_deprecated_at_idx
  ON public.llm_models(deprecated_at)
  WHERE deprecated_at IS NOT NULL;

-- Add index for finding models needing validation
CREATE INDEX IF NOT EXISTS llm_models_last_validated_idx
  ON public.llm_models(last_validated_at);

-- Add comment explaining the fields
COMMENT ON COLUMN public.llm_models.deprecation_reason IS
  'Reason for model deprecation (e.g., "model not found", "API key invalid", "not downloaded locally")';
COMMENT ON COLUMN public.llm_models.deprecated_at IS
  'Timestamp when the model was deprecated/deactivated';
COMMENT ON COLUMN public.llm_models.last_validated_at IS
  'Timestamp of last successful validation check';

-- Success notification
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Model deprecation tracking fields added';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'New columns on public.llm_models:';
    RAISE NOTICE '  - deprecation_reason TEXT';
    RAISE NOTICE '  - deprecated_at TIMESTAMPTZ';
    RAISE NOTICE '  - last_validated_at TIMESTAMPTZ';
    RAISE NOTICE '================================================';
END $$;

-- =============================================================================
-- SIGNAL REMOVAL & PREDICTOR UNIFICATION MIGRATION
-- =============================================================================
-- Date: 2026-02-03
-- Purpose: Remove signals intermediate layer, predictors created directly from articles
--
-- Changes:
-- 1. Add article_id column to predictors table
-- 2. Make signal_id nullable (for backward compatibility)
-- 3. Add index on article_id for efficient lookups
-- 4. Update check constraint to require either signal_id OR article_id
--
-- NOTE: The signals table is NOT dropped in this migration to allow rollback.
-- A future migration will drop it after verification period.
-- =============================================================================

-- Step 1: Add article_id column to predictors
-- This allows predictors to be linked directly to crawler articles
ALTER TABLE prediction.predictors
ADD COLUMN IF NOT EXISTS article_id UUID;

-- Step 2: Add foreign key constraint to crawler.articles
-- (Only if crawler schema and articles table exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'crawler' AND table_name = 'articles'
  ) THEN
    -- Add FK constraint if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_predictors_article_id'
      AND table_schema = 'prediction'
    ) THEN
      ALTER TABLE prediction.predictors
      ADD CONSTRAINT fk_predictors_article_id
      FOREIGN KEY (article_id)
      REFERENCES crawler.articles(id)
      ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Step 3: Create index for efficient article lookups
CREATE INDEX IF NOT EXISTS idx_prediction_predictors_article_id
ON prediction.predictors(article_id)
WHERE article_id IS NOT NULL;

-- Step 4: Make signal_id nullable
-- This allows new predictors to be created without signals
ALTER TABLE prediction.predictors
ALTER COLUMN signal_id DROP NOT NULL;

-- Step 5: Drop the existing FK constraint if it exists, then recreate as nullable
-- (Handles the case where signal_id was previously NOT NULL with CASCADE)
DO $$
BEGIN
  -- First check if the FK exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'predictors_signal_id_fkey'
    AND table_schema = 'prediction'
  ) THEN
    ALTER TABLE prediction.predictors
    DROP CONSTRAINT predictors_signal_id_fkey;
  END IF;

  -- Re-add the FK as nullable (SET NULL on delete)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'prediction' AND table_name = 'signals'
  ) THEN
    ALTER TABLE prediction.predictors
    ADD CONSTRAINT predictors_signal_id_fkey
    FOREIGN KEY (signal_id)
    REFERENCES prediction.signals(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- Step 6: Add check constraint to ensure either signal_id or article_id is provided
-- (But not both required - legacy predictors may have signal_id, new ones have article_id)
-- Note: We don't require one OR the other since existing data may have neither during transition
-- ALTER TABLE prediction.predictors
-- ADD CONSTRAINT chk_predictors_source
-- CHECK (signal_id IS NOT NULL OR article_id IS NOT NULL);
-- Commented out for now to allow transition period

-- Step 7: Add comments for documentation
COMMENT ON COLUMN prediction.predictors.article_id IS 'Direct reference to crawler.articles - new flow creates predictors from articles without signals intermediate';
COMMENT ON COLUMN prediction.predictors.signal_id IS 'Legacy: Reference to prediction.signals - nullable after signal removal migration';

-- =============================================================================
-- MIGRATION VERIFICATION
-- =============================================================================

DO $$
DECLARE
  v_article_id_exists BOOLEAN;
  v_signal_id_nullable BOOLEAN;
BEGIN
  -- Check article_id column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'prediction'
    AND table_name = 'predictors'
    AND column_name = 'article_id'
  ) INTO v_article_id_exists;

  -- Check signal_id is nullable
  SELECT is_nullable = 'YES'
  FROM information_schema.columns
  WHERE table_schema = 'prediction'
  AND table_name = 'predictors'
  AND column_name = 'signal_id'
  INTO v_signal_id_nullable;

  IF v_article_id_exists AND v_signal_id_nullable THEN
    RAISE NOTICE 'Migration successful: article_id added, signal_id nullable';
  ELSE
    RAISE EXCEPTION 'Migration verification failed: article_id=%, signal_id_nullable=%',
      v_article_id_exists, v_signal_id_nullable;
  END IF;
END $$;

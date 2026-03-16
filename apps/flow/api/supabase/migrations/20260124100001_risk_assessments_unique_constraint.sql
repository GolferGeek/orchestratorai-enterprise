-- Migration: Add unique constraint on risk.assessments for subject_id + dimension_id
-- This ensures one assessment per subject-dimension pair, with UPSERT merge behavior

-- First, clean up any duplicate assessments (keep the best one per pair)
-- Priority: 1) Has reasoning, 2) Has llm_model='ai-research', 3) Most recent
DELETE FROM risk.assessments a
WHERE a.id NOT IN (
  SELECT DISTINCT ON (subject_id, dimension_id) id
  FROM risk.assessments
  ORDER BY subject_id, dimension_id,
    CASE WHEN reasoning IS NOT NULL AND reasoning != '' THEN 0 ELSE 1 END,
    CASE WHEN llm_model = 'ai-research' THEN 0 ELSE 1 END,
    created_at DESC
);

-- Add unique constraint to prevent future duplicates (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assessments_subject_dimension_unique'
  ) THEN
    ALTER TABLE risk.assessments
    ADD CONSTRAINT assessments_subject_dimension_unique
    UNIQUE (subject_id, dimension_id);
  END IF;
END $$;

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT assessments_subject_dimension_unique ON risk.assessments IS
'Ensures one assessment per subject-dimension pair. Use upsertWithMerge() to update existing assessments with merged evidence and reasoning.';

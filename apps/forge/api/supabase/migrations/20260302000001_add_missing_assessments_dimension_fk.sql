-- Add missing FK constraint on risk.assessments.dimension_id
-- The original migration (20260116000001) defined this constraint but it was lost.
-- PostgREST needs this FK to resolve embedded resource queries like
-- `dimensions:dimension_id(slug, name, ...)` used by assessment.repository.ts

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'risk.assessments'::regclass
      AND conname = 'assessments_dimension_id_fkey'
  ) THEN
    ALTER TABLE risk.assessments
      ADD CONSTRAINT assessments_dimension_id_fkey
      FOREIGN KEY (dimension_id) REFERENCES risk.dimensions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

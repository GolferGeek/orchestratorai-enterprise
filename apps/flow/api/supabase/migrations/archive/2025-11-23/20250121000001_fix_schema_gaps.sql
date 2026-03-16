-- Migration: Fix Schema Gaps
-- Description: Adds missing columns discovered during BUILD mode testing
-- Date: 2025-01-21 (timestamp reflects logical order, not actual date)

-- ============================================================================
-- 1. deliverable_versions: Add missing columns for version tracking
-- ============================================================================
ALTER TABLE deliverable_versions
ADD COLUMN IF NOT EXISTS is_current_version boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS created_by_type text DEFAULT 'user_request',
ADD COLUMN IF NOT EXISTS task_id uuid,
ADD COLUMN IF NOT EXISTS file_attachments jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN deliverable_versions.is_current_version IS 'Indicates if this is the active version of the deliverable';
COMMENT ON COLUMN deliverable_versions.created_by_type IS 'How the version was created: user_request, agent_generated, rerun, merge';
COMMENT ON COLUMN deliverable_versions.task_id IS 'Reference to the task that created this version';
COMMENT ON COLUMN deliverable_versions.file_attachments IS 'JSON object containing file attachment metadata';

-- ============================================================================
-- 2. pseudonym_dictionaries: Add columns for PII handling
-- ============================================================================
ALTER TABLE pseudonym_dictionaries
ADD COLUMN IF NOT EXISTS data_type text DEFAULT 'text',
ADD COLUMN IF NOT EXISTS category text DEFAULT 'general',
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS value text,
ADD COLUMN IF NOT EXISTS frequency_weight integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS organization_slug text,
ADD COLUMN IF NOT EXISTS agent_slug text;

COMMENT ON COLUMN pseudonym_dictionaries.data_type IS 'The data type of the original value (text, email, phone, etc.)';
COMMENT ON COLUMN pseudonym_dictionaries.category IS 'Category of the pseudonymized data (general, pii, sensitive, etc.)';
COMMENT ON COLUMN pseudonym_dictionaries.is_active IS 'Whether this dictionary entry is active';
COMMENT ON COLUMN pseudonym_dictionaries.value IS 'The dictionary value used for generating pseudonyms';
COMMENT ON COLUMN pseudonym_dictionaries.frequency_weight IS 'Weight for random selection (higher = more likely to be chosen)';

-- ============================================================================
-- 3. llm_models: Set is_local flag for Ollama models
-- ============================================================================
-- Update is_local flag based on model_tier = 'local' (Ollama models)
UPDATE llm_models
SET is_local = true
WHERE model_tier = 'local' AND is_local = false;

-- ============================================================================
-- 4. Notify PostgREST to reload schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Done
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Schema gaps fixed successfully:';
  RAISE NOTICE '  - deliverable_versions: added is_current_version, created_by_type, task_id, file_attachments';
  RAISE NOTICE '  - pseudonym_dictionaries: added data_type, category, is_active, value, frequency_weight';
  RAISE NOTICE '  - llm_models: updated is_local flag for local models';
  RAISE NOTICE '================================================';
END $$;

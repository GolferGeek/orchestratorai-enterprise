-- =============================================================================
-- MARKETING SWARM: USE PROVIDER/MODEL TEXT INSTEAD OF UUID REFERENCES
-- =============================================================================
-- This migration changes the outputs and evaluations tables to store
-- llm_provider and llm_model as TEXT columns instead of UUID foreign keys.
--
-- Rationale:
-- 1. Frontend passes provider/model names directly at runtime
-- 2. No need for pre-configured agent_llm_configs UUIDs
-- 3. Pricing is calculated dynamically by LLMPricingService
-- 4. Simplifies the data flow and reduces coupling
-- =============================================================================

-- =============================================================================
-- 1. UPDATE OUTPUTS TABLE
-- =============================================================================

-- Drop foreign key constraints first
ALTER TABLE marketing.outputs
DROP CONSTRAINT IF EXISTS outputs_writer_llm_config_id_fkey;

ALTER TABLE marketing.outputs
DROP CONSTRAINT IF EXISTS outputs_editor_llm_config_id_fkey;

-- Add new TEXT columns for provider/model
ALTER TABLE marketing.outputs
ADD COLUMN IF NOT EXISTS writer_llm_provider TEXT,
ADD COLUMN IF NOT EXISTS writer_llm_model TEXT,
ADD COLUMN IF NOT EXISTS editor_llm_provider TEXT,
ADD COLUMN IF NOT EXISTS editor_llm_model TEXT;

-- Migrate existing data from UUID references to provider/model text
-- (only if there's data to migrate)
UPDATE marketing.outputs o
SET
  writer_llm_provider = alc.llm_provider,
  writer_llm_model = alc.llm_model
FROM marketing.agent_llm_configs alc
WHERE o.writer_llm_config_id = alc.id
  AND o.writer_llm_provider IS NULL;

UPDATE marketing.outputs o
SET
  editor_llm_provider = alc.llm_provider,
  editor_llm_model = alc.llm_model
FROM marketing.agent_llm_configs alc
WHERE o.editor_llm_config_id = alc.id
  AND o.editor_llm_provider IS NULL;

-- Drop the old UUID columns
ALTER TABLE marketing.outputs
DROP COLUMN IF EXISTS writer_llm_config_id,
DROP COLUMN IF EXISTS editor_llm_config_id;

-- =============================================================================
-- 2. UPDATE EVALUATIONS TABLE
-- =============================================================================

-- Drop foreign key constraint first
ALTER TABLE marketing.evaluations
DROP CONSTRAINT IF EXISTS evaluations_evaluator_llm_config_id_fkey;

-- Add new TEXT columns for provider/model
ALTER TABLE marketing.evaluations
ADD COLUMN IF NOT EXISTS evaluator_llm_provider TEXT,
ADD COLUMN IF NOT EXISTS evaluator_llm_model TEXT;

-- Migrate existing data from UUID references to provider/model text
UPDATE marketing.evaluations e
SET
  evaluator_llm_provider = alc.llm_provider,
  evaluator_llm_model = alc.llm_model
FROM marketing.agent_llm_configs alc
WHERE e.evaluator_llm_config_id = alc.id
  AND e.evaluator_llm_provider IS NULL;

-- Drop the old UUID column
ALTER TABLE marketing.evaluations
DROP COLUMN IF EXISTS evaluator_llm_config_id;

-- =============================================================================
-- 3. UPDATE EXECUTION_QUEUE TABLE (if it has llm_config_id)
-- =============================================================================

-- Drop foreign key constraint first
ALTER TABLE marketing.execution_queue
DROP CONSTRAINT IF EXISTS execution_queue_llm_config_id_fkey;

-- Add new TEXT columns for provider/model
ALTER TABLE marketing.execution_queue
ADD COLUMN IF NOT EXISTS llm_provider TEXT,
ADD COLUMN IF NOT EXISTS llm_model TEXT;

-- Migrate existing data
UPDATE marketing.execution_queue eq
SET
  llm_provider = alc.llm_provider,
  llm_model = alc.llm_model
FROM marketing.agent_llm_configs alc
WHERE eq.llm_config_id = alc.id
  AND eq.llm_provider IS NULL;

-- Drop the old UUID column
ALTER TABLE marketing.execution_queue
DROP COLUMN IF EXISTS llm_config_id;

-- =============================================================================
-- 4. UPDATE HELPER FUNCTIONS
-- =============================================================================

-- Drop old functions first (they have different return types)
DROP FUNCTION IF EXISTS marketing.get_next_outputs(uuid,boolean,integer);
DROP FUNCTION IF EXISTS marketing.get_running_counts(uuid);

-- Update get_next_outputs function to use provider/model text
CREATE OR REPLACE FUNCTION marketing.get_next_outputs(
  p_task_id UUID,
  p_is_local BOOLEAN,
  p_max_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  output_id UUID,
  status TEXT,
  writer_agent_slug TEXT,
  writer_llm_provider TEXT,
  writer_llm_model TEXT,
  editor_agent_slug TEXT,
  editor_llm_provider TEXT,
  editor_llm_model TEXT,
  edit_cycle INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.status,
    o.writer_agent_slug,
    o.writer_llm_provider,
    o.writer_llm_model,
    o.editor_agent_slug,
    o.editor_llm_provider,
    o.editor_llm_model,
    o.edit_cycle
  FROM marketing.outputs o
  WHERE o.task_id = p_task_id
    AND o.status IN ('pending_write', 'pending_edit', 'pending_rewrite')
    -- Determine if local based on provider name
    AND (
      (p_is_local = true AND o.writer_llm_provider = 'ollama')
      OR
      (p_is_local = false AND o.writer_llm_provider != 'ollama')
    )
  ORDER BY o.created_at
  LIMIT p_max_count;
END;
$$ LANGUAGE plpgsql;

-- Update get_running_counts function to use provider text
CREATE OR REPLACE FUNCTION marketing.get_running_counts(p_task_id UUID)
RETURNS TABLE (
  is_local BOOLEAN,
  running_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (o.writer_llm_provider = 'ollama') as is_local,
    COUNT(*)::BIGINT as running_count
  FROM marketing.outputs o
  WHERE o.task_id = p_task_id
    AND o.status IN ('writing', 'editing', 'rewriting')
  GROUP BY (o.writer_llm_provider = 'ollama');
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 5. ADD COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON COLUMN marketing.outputs.writer_llm_provider IS 'LLM provider name (e.g., anthropic, openai, ollama)';
COMMENT ON COLUMN marketing.outputs.writer_llm_model IS 'LLM model name (e.g., claude-3-haiku-20240307)';
COMMENT ON COLUMN marketing.outputs.editor_llm_provider IS 'Editor LLM provider name';
COMMENT ON COLUMN marketing.outputs.editor_llm_model IS 'Editor LLM model name';

COMMENT ON COLUMN marketing.evaluations.evaluator_llm_provider IS 'Evaluator LLM provider name';
COMMENT ON COLUMN marketing.evaluations.evaluator_llm_model IS 'Evaluator LLM model name';

-- =============================================================================
-- SUCCESS NOTIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Marketing schema updated to use provider/model TEXT';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - outputs: writer_llm_provider, writer_llm_model (TEXT)';
  RAISE NOTICE '  - outputs: editor_llm_provider, editor_llm_model (TEXT)';
  RAISE NOTICE '  - evaluations: evaluator_llm_provider, evaluator_llm_model (TEXT)';
  RAISE NOTICE '  - execution_queue: llm_provider, llm_model (TEXT)';
  RAISE NOTICE '  - Removed UUID foreign key columns';
  RAISE NOTICE '  - Updated helper functions';
  RAISE NOTICE '================================================';
END $$;

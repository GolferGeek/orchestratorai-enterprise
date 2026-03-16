-- =============================================================================
-- MARKETING SWARM PHASE 2 UPDATES
-- =============================================================================
-- Database-driven execution with:
-- - Dual-track execution (local vs cloud LLMs)
-- - Refined document status flow
-- - Two-stage evaluation (initial scoring + final ranking)
-- - Task-level execution configuration
-- Created: 2025-12-14
-- =============================================================================

-- =============================================================================
-- 1. ADD is_local FLAG TO LLM CONFIGS
-- =============================================================================
-- Enables dual-track execution: local (Ollama) runs sequentially,
-- cloud (OpenAI, Anthropic, Google) runs in parallel

ALTER TABLE marketing.agent_llm_configs
ADD COLUMN IF NOT EXISTS is_local BOOLEAN DEFAULT false;

COMMENT ON COLUMN marketing.agent_llm_configs.is_local IS
  'True for local LLMs (Ollama) that must run sequentially due to GPU constraints';

-- =============================================================================
-- 2. UPDATE OUTPUTS TABLE FOR REFINED STATUS FLOW
-- =============================================================================
-- Status flow: pending_write → writing → pending_edit → editing →
--   ├── approved (editor says done)
--   └── pending_rewrite → rewriting → pending_edit (loop, max N cycles)

-- First, drop the existing status check constraint
ALTER TABLE marketing.outputs DROP CONSTRAINT IF EXISTS outputs_status_check;

-- Update existing status values to new format
UPDATE marketing.outputs SET status = 'pending_write' WHERE status = 'draft';
UPDATE marketing.outputs SET status = 'approved' WHERE status = 'final';

-- Add new status check constraint with all valid statuses
ALTER TABLE marketing.outputs ADD CONSTRAINT outputs_status_check
  CHECK (status IN (
    'pending_write', 'writing',
    'pending_edit', 'editing',
    'pending_rewrite', 'rewriting',
    'approved', 'failed'
  ));

-- Allow content to be NULL initially (will be populated when writing completes)
ALTER TABLE marketing.outputs ALTER COLUMN content DROP NOT NULL;

-- Add ranking columns for evaluation results
ALTER TABLE marketing.outputs
ADD COLUMN IF NOT EXISTS initial_avg_score DECIMAL(3,1),
ADD COLUMN IF NOT EXISTS initial_rank INTEGER,
ADD COLUMN IF NOT EXISTS is_finalist BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS final_total_score INTEGER,
ADD COLUMN IF NOT EXISTS final_rank INTEGER,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN marketing.outputs.initial_avg_score IS 'Average score from initial evaluation (1-10)';
COMMENT ON COLUMN marketing.outputs.initial_rank IS 'Rank after initial evaluation (1 = highest score)';
COMMENT ON COLUMN marketing.outputs.is_finalist IS 'True if selected for final ranking round';
COMMENT ON COLUMN marketing.outputs.final_total_score IS 'Sum of weighted scores from final ranking';
COMMENT ON COLUMN marketing.outputs.final_rank IS 'Final rank after weighted ranking (1 = winner)';

-- =============================================================================
-- 3. UPDATE EVALUATIONS TABLE FOR TWO-STAGE SUPPORT
-- =============================================================================
-- Stage 1 (initial): Every evaluator scores every document 1-10
-- Stage 2 (final): Top N documents get forced ranking 1-5 with weighted points

-- Add stage column
ALTER TABLE marketing.evaluations
ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'initial';

-- Add status column for tracking evaluation progress
ALTER TABLE marketing.evaluations
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Add final ranking columns
ALTER TABLE marketing.evaluations
ADD COLUMN IF NOT EXISTS rank INTEGER,
ADD COLUMN IF NOT EXISTS weighted_score INTEGER;

-- Add constraints
ALTER TABLE marketing.evaluations DROP CONSTRAINT IF EXISTS evaluations_stage_check;
ALTER TABLE marketing.evaluations ADD CONSTRAINT evaluations_stage_check
  CHECK (stage IN ('initial', 'final'));

ALTER TABLE marketing.evaluations DROP CONSTRAINT IF EXISTS evaluations_eval_status_check;
ALTER TABLE marketing.evaluations ADD CONSTRAINT evaluations_eval_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

ALTER TABLE marketing.evaluations DROP CONSTRAINT IF EXISTS evaluations_rank_check;
ALTER TABLE marketing.evaluations ADD CONSTRAINT evaluations_rank_check
  CHECK (rank IS NULL OR (rank >= 1 AND rank <= 5));

ALTER TABLE marketing.evaluations DROP CONSTRAINT IF EXISTS evaluations_weighted_score_check;
ALTER TABLE marketing.evaluations ADD CONSTRAINT evaluations_weighted_score_check
  CHECK (weighted_score IS NULL OR weighted_score IN (100, 60, 30, 10, 5, 0));

COMMENT ON COLUMN marketing.evaluations.stage IS 'initial = 1-10 scoring, final = forced 1-5 ranking';
COMMENT ON COLUMN marketing.evaluations.status IS 'pending, processing, completed, or failed';
COMMENT ON COLUMN marketing.evaluations.rank IS 'Final stage only: forced rank 1-5 (NULL for ranks 6-10)';
COMMENT ON COLUMN marketing.evaluations.weighted_score IS 'Final stage only: 100/60/30/10/5/0 based on rank';

-- =============================================================================
-- 4. ADD NEW INDEXES FOR EFFICIENT QUERIES
-- =============================================================================

-- Index for finding outputs by status (for dual-track execution)
DROP INDEX IF EXISTS marketing.idx_outputs_status;
CREATE INDEX idx_outputs_task_status ON marketing.outputs(task_id, status);

-- Index for finding finalists
CREATE INDEX IF NOT EXISTS idx_outputs_finalist
  ON marketing.outputs(task_id, is_finalist) WHERE is_finalist = true;

-- Index for evaluations by stage and status
CREATE INDEX IF NOT EXISTS idx_evaluations_stage_status
  ON marketing.evaluations(task_id, stage, status);

-- Index for finding pending evaluations
CREATE INDEX IF NOT EXISTS idx_evaluations_pending
  ON marketing.evaluations(task_id, stage, status) WHERE status = 'pending';

-- =============================================================================
-- 5. UPDATE HELPER FUNCTIONS
-- =============================================================================

-- Function to get next pending outputs for writing/editing (dual-track aware)
CREATE OR REPLACE FUNCTION marketing.get_next_outputs(
  p_task_id UUID,
  p_is_local BOOLEAN,
  p_max_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  output_id UUID,
  status TEXT,
  writer_agent_slug TEXT,
  writer_llm_config_id UUID,
  editor_agent_slug TEXT,
  editor_llm_config_id UUID,
  edit_cycle INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.status,
    o.writer_agent_slug,
    o.writer_llm_config_id,
    o.editor_agent_slug,
    o.editor_llm_config_id,
    o.edit_cycle
  FROM marketing.outputs o
  JOIN marketing.agent_llm_configs wc ON o.writer_llm_config_id = wc.id
  WHERE o.task_id = p_task_id
    AND o.status IN ('pending_write', 'pending_edit', 'pending_rewrite')
    AND wc.is_local = p_is_local
  ORDER BY o.created_at
  LIMIT p_max_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get count of currently running outputs by local/cloud
CREATE OR REPLACE FUNCTION marketing.get_running_counts(p_task_id UUID)
RETURNS TABLE (
  is_local BOOLEAN,
  running_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wc.is_local,
    COUNT(*)::BIGINT as running_count
  FROM marketing.outputs o
  JOIN marketing.agent_llm_configs wc ON o.writer_llm_config_id = wc.id
  WHERE o.task_id = p_task_id
    AND o.status IN ('writing', 'editing', 'rewriting')
  GROUP BY wc.is_local;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate and update rankings after initial evaluation
CREATE OR REPLACE FUNCTION marketing.calculate_initial_rankings(p_task_id UUID)
RETURNS void AS $$
BEGIN
  -- Calculate average scores and ranks
  WITH avg_scores AS (
    SELECT
      output_id,
      AVG(score)::DECIMAL(3,1) as avg_score,
      ROW_NUMBER() OVER (ORDER BY AVG(score) DESC) as rank
    FROM marketing.evaluations
    WHERE task_id = p_task_id
      AND stage = 'initial'
      AND status = 'completed'
    GROUP BY output_id
  )
  UPDATE marketing.outputs o
  SET
    initial_avg_score = a.avg_score,
    initial_rank = a.rank,
    updated_at = NOW()
  FROM avg_scores a
  WHERE o.id = a.output_id;
END;
$$ LANGUAGE plpgsql;

-- Function to select top N finalists
CREATE OR REPLACE FUNCTION marketing.select_finalists(p_task_id UUID, p_top_n INTEGER DEFAULT 10)
RETURNS INTEGER AS $$
DECLARE
  finalist_count INTEGER;
BEGIN
  -- Mark top N as finalists
  WITH ranked AS (
    SELECT id
    FROM marketing.outputs
    WHERE task_id = p_task_id
      AND initial_rank IS NOT NULL
    ORDER BY initial_rank
    LIMIT p_top_n
  )
  UPDATE marketing.outputs o
  SET is_finalist = true, updated_at = NOW()
  FROM ranked r
  WHERE o.id = r.id;

  GET DIAGNOSTICS finalist_count = ROW_COUNT;
  RETURN finalist_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate final rankings from weighted scores
CREATE OR REPLACE FUNCTION marketing.calculate_final_rankings(p_task_id UUID)
RETURNS void AS $$
BEGIN
  -- Sum weighted scores and calculate final ranks
  WITH total_scores AS (
    SELECT
      output_id,
      SUM(COALESCE(weighted_score, 0))::INTEGER as total_score,
      ROW_NUMBER() OVER (ORDER BY SUM(COALESCE(weighted_score, 0)) DESC) as rank
    FROM marketing.evaluations
    WHERE task_id = p_task_id
      AND stage = 'final'
      AND status = 'completed'
    GROUP BY output_id
  )
  UPDATE marketing.outputs o
  SET
    final_total_score = t.total_score,
    final_rank = t.rank,
    updated_at = NOW()
  FROM total_scores t
  WHERE o.id = t.output_id;
END;
$$ LANGUAGE plpgsql;

-- Function to convert rank to weighted score
CREATE OR REPLACE FUNCTION marketing.rank_to_weighted_score(p_rank INTEGER)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE p_rank
    WHEN 1 THEN 100
    WHEN 2 THEN 60
    WHEN 3 THEN 30
    WHEN 4 THEN 10
    WHEN 5 THEN 5
    ELSE 0
  END;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 6. ADD updated_at TRIGGER FOR OUTPUTS
-- =============================================================================

CREATE OR REPLACE FUNCTION marketing.update_outputs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS outputs_updated_at ON marketing.outputs;
CREATE TRIGGER outputs_updated_at
  BEFORE UPDATE ON marketing.outputs
  FOR EACH ROW
  EXECUTE FUNCTION marketing.update_outputs_updated_at();

-- =============================================================================
-- LOG SUCCESS
-- =============================================================================

-- =============================================================================
-- 7. GRANT PERMISSIONS FOR POSTGREST ACCESS
-- =============================================================================
-- PostgREST requires explicit grants for roles to access schemas

GRANT USAGE ON SCHEMA marketing TO anon;
GRANT USAGE ON SCHEMA marketing TO authenticated;
GRANT USAGE ON SCHEMA marketing TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA marketing TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA marketing TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA marketing TO service_role;

GRANT ALL ON ALL SEQUENCES IN SCHEMA marketing TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA marketing TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA marketing TO service_role;

-- Grant execute on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA marketing TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA marketing TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA marketing TO service_role;

-- =============================================================================
-- LOG SUCCESS
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Successfully applied Marketing Swarm Phase 2 updates:';
  RAISE NOTICE '  - Added is_local flag to agent_llm_configs';
  RAISE NOTICE '  - Updated outputs table with refined status flow and ranking columns';
  RAISE NOTICE '  - Updated evaluations table with two-stage support';
  RAISE NOTICE '  - Added helper functions for dual-track execution and rankings';
  RAISE NOTICE '  - Granted permissions for PostgREST access';
END $$;

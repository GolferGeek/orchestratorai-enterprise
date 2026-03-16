-- =============================================================================
-- MARKETING SWARM OUTPUT VERSIONS
-- =============================================================================
-- Tracks all versions of output content for edit history.
-- Each time an output is written or edited, a new version is created.
-- Enables viewing the full evolution of content from initial draft to final.
-- Created: 2025-12-15
-- =============================================================================

-- =============================================================================
-- 1. CREATE OUTPUT_VERSIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS marketing.output_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    output_id UUID NOT NULL REFERENCES marketing.outputs(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES marketing.swarm_tasks(task_id) ON DELETE CASCADE,

    -- Version info
    version_number INTEGER NOT NULL DEFAULT 1,  -- 1 = initial draft, 2+ = after edits

    -- Content at this version
    content TEXT NOT NULL,

    -- What triggered this version
    action_type TEXT NOT NULL CHECK (action_type IN ('write', 'rewrite')),

    -- Editor feedback that led to this version (null for initial write)
    editor_feedback TEXT,

    -- LLM metadata for this generation
    llm_metadata JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure unique version numbers per output
    UNIQUE(output_id, version_number)
);

COMMENT ON TABLE marketing.output_versions IS 'Stores all versions of output content for edit history tracking';
COMMENT ON COLUMN marketing.output_versions.version_number IS '1 = initial draft, 2+ = revisions after editor feedback';
COMMENT ON COLUMN marketing.output_versions.action_type IS 'write = initial creation, rewrite = revision after feedback';
COMMENT ON COLUMN marketing.output_versions.editor_feedback IS 'The editor feedback that triggered this rewrite (null for initial write)';

-- =============================================================================
-- 2. CREATE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_output_versions_output
    ON marketing.output_versions(output_id);

CREATE INDEX IF NOT EXISTS idx_output_versions_task
    ON marketing.output_versions(task_id);

CREATE INDEX IF NOT EXISTS idx_output_versions_output_version
    ON marketing.output_versions(output_id, version_number);

-- =============================================================================
-- 3. ADD RLS POLICIES
-- =============================================================================

ALTER TABLE marketing.output_versions ENABLE ROW LEVEL SECURITY;

-- Viewable if parent output is viewable
CREATE POLICY "output_versions_task_read" ON marketing.output_versions
    FOR SELECT USING (
        task_id IN (
            SELECT task_id FROM marketing.swarm_tasks
            WHERE organization_slug IN (
                SELECT organization_slug FROM public.rbac_user_org_roles
                WHERE user_id = auth.uid()
            )
        )
    );

-- Service role full access
CREATE POLICY "service_role_output_versions" ON marketing.output_versions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- 4. GRANT PERMISSIONS
-- =============================================================================

GRANT ALL ON marketing.output_versions TO anon;
GRANT ALL ON marketing.output_versions TO authenticated;
GRANT ALL ON marketing.output_versions TO service_role;

-- =============================================================================
-- 5. ADD topNForDeliverable TO ExecutionConfig
-- =============================================================================
-- Add comment documenting the expected config structure
COMMENT ON COLUMN marketing.swarm_tasks.config IS
  'Config structure: { writers: AgentSelection[], editors: AgentSelection[], evaluators: AgentSelection[], execution: { maxLocalConcurrent, maxCloudConcurrent, maxEditCycles, topNForFinalRanking, topNForDeliverable } }';

-- =============================================================================
-- LOG SUCCESS
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Successfully created marketing.output_versions table for edit history tracking';
    RAISE NOTICE '  - Stores all versions of output content';
    RAISE NOTICE '  - Tracks editor feedback that triggered rewrites';
    RAISE NOTICE '  - Enables full edit history visualization';
END $$;

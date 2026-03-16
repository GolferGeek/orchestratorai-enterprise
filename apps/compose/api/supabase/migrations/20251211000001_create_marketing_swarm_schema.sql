-- =============================================================================
-- MARKETING SWARM SCHEMA
-- =============================================================================
-- Multi-agent marketing content generation system with:
-- - Multiple writer agents with baked-in LLM configs generating drafts
-- - Multiple editor agents reviewing/refining (multiplicative: writers x editors)
-- - Iterative editing cycles (up to 5 rounds per pair)
-- - Evaluator agents scoring all outputs
-- - Full audit trail for all outputs, edit comments, and evaluations
-- Created: 2025-12-11
-- =============================================================================

-- Create marketing schema
CREATE SCHEMA IF NOT EXISTS marketing;

-- =============================================================================
-- CONTENT TYPES
-- =============================================================================
-- Defines the type of content to generate (blog post, social media, etc.)
-- Each content type has system context that guides the writers
-- =============================================================================

CREATE TABLE marketing.content_types (
    slug TEXT PRIMARY KEY,
    organization_slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    system_context TEXT NOT NULL,  -- Instructions for writers about this content type
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for organization lookups
CREATE INDEX idx_content_types_org ON marketing.content_types(organization_slug);

-- =============================================================================
-- AGENTS (Personality only - no LLM config here)
-- =============================================================================
-- Agents have personalities that define how they write/edit/evaluate
-- LLM configurations are separate (many-to-many relationship)
-- =============================================================================

CREATE TABLE marketing.agents (
    slug TEXT PRIMARY KEY,
    organization_slug TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('writer', 'editor', 'evaluator')),
    name TEXT NOT NULL,
    personality JSONB NOT NULL,  -- { system_context, style_guidelines, strengths[] }
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_agents_org ON marketing.agents(organization_slug);
CREATE INDEX idx_agents_role ON marketing.agents(role);
CREATE INDEX idx_agents_active ON marketing.agents(is_active) WHERE is_active = true;

-- =============================================================================
-- AGENT LLM CONFIGS (Many-to-many: agent x LLM)
-- =============================================================================
-- Each agent personality can be paired with multiple LLMs
-- Allows comparing how the same personality performs across different models
-- =============================================================================

CREATE TABLE marketing.agent_llm_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_slug TEXT NOT NULL REFERENCES marketing.agents(slug) ON DELETE CASCADE,
    llm_provider TEXT NOT NULL,
    llm_model TEXT NOT NULL,
    display_name TEXT,           -- Optional friendly name like "GPT-4o Fast"
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_slug, llm_provider, llm_model)
);

-- Index for agent lookups
CREATE INDEX idx_agent_llm_configs_agent ON marketing.agent_llm_configs(agent_slug);

-- =============================================================================
-- SWARM TASKS (Main execution record)
-- =============================================================================
-- Each swarm task represents one complete execution of the marketing swarm
-- Contains the prompt data (8 questions) and selected agent configurations
-- =============================================================================

CREATE TABLE marketing.swarm_tasks (
    task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_slug TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    conversation_id UUID,        -- Links to conversations table for UI integration
    content_type_slug TEXT REFERENCES marketing.content_types(slug),
    prompt_data JSONB NOT NULL,  -- The 8-question interview answers
    config JSONB NOT NULL,       -- Selected agent+LLM combinations per role
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    progress JSONB DEFAULT '{}', -- Current progress tracking
    error_message TEXT,          -- Error details if failed
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_swarm_tasks_org ON marketing.swarm_tasks(organization_slug);
CREATE INDEX idx_swarm_tasks_user ON marketing.swarm_tasks(user_id);
CREATE INDEX idx_swarm_tasks_status ON marketing.swarm_tasks(status);
CREATE INDEX idx_swarm_tasks_conversation ON marketing.swarm_tasks(conversation_id);

-- =============================================================================
-- OUTPUTS (All drafts and revisions)
-- =============================================================================
-- Stores every piece of content generated:
-- - Initial drafts from writers
-- - Revised drafts after editor feedback
-- - Tracks which agent+LLM combo was used for both writing and editing
-- =============================================================================

CREATE TABLE marketing.outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES marketing.swarm_tasks(task_id) ON DELETE CASCADE,

    -- Writer info
    writer_agent_slug TEXT REFERENCES marketing.agents(slug),
    writer_llm_config_id UUID REFERENCES marketing.agent_llm_configs(id),

    -- Editor info (null for initial drafts)
    editor_agent_slug TEXT REFERENCES marketing.agents(slug),
    editor_llm_config_id UUID REFERENCES marketing.agent_llm_configs(id),

    -- Content
    content TEXT NOT NULL,
    edit_cycle INTEGER DEFAULT 0,  -- 0 = initial draft, 1-5 = edit cycles
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'editing', 'approved', 'final')),

    -- Editor feedback (for edit cycles)
    editor_feedback TEXT,
    editor_approved BOOLEAN,

    -- LLM usage metadata
    llm_metadata JSONB,  -- { tokensUsed, latencyMs, promptTokens, completionTokens }

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_outputs_task ON marketing.outputs(task_id);
CREATE INDEX idx_outputs_writer ON marketing.outputs(writer_agent_slug);
CREATE INDEX idx_outputs_status ON marketing.outputs(status);

-- =============================================================================
-- EVALUATIONS (Scores from evaluator agents)
-- =============================================================================
-- Each evaluator scores each final output
-- Stores reasoning for transparency
-- =============================================================================

CREATE TABLE marketing.evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES marketing.swarm_tasks(task_id) ON DELETE CASCADE,
    output_id UUID NOT NULL REFERENCES marketing.outputs(id) ON DELETE CASCADE,

    -- Evaluator info
    evaluator_agent_slug TEXT REFERENCES marketing.agents(slug),
    evaluator_llm_config_id UUID REFERENCES marketing.agent_llm_configs(id),

    -- Evaluation results
    score INTEGER CHECK (score >= 1 AND score <= 10),
    reasoning TEXT,
    criteria_scores JSONB,  -- { creativity: 8, clarity: 9, relevance: 7, ... }

    -- LLM usage metadata
    llm_metadata JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_evaluations_task ON marketing.evaluations(task_id);
CREATE INDEX idx_evaluations_output ON marketing.evaluations(output_id);

-- =============================================================================
-- EXECUTION QUEUE (Step-by-step audit trail)
-- =============================================================================
-- All steps are planned upfront and tracked here
-- Enables reconnection (rebuild UI state from DB)
-- Rows are NEVER deleted, only status updated (permanent audit trail)
-- =============================================================================

CREATE TABLE marketing.execution_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES marketing.swarm_tasks(task_id) ON DELETE CASCADE,

    -- Step type and ordering
    step_type TEXT NOT NULL CHECK (step_type IN ('write', 'edit', 'evaluate')),
    sequence INTEGER NOT NULL,  -- Execution order

    -- Agent+LLM for this step
    agent_slug TEXT REFERENCES marketing.agents(slug),
    llm_config_id UUID REFERENCES marketing.agent_llm_configs(id),

    -- Dependencies and input
    depends_on UUID[],           -- Array of step IDs that must complete first
    input_output_id UUID,        -- For edit/evaluate: which output to work on

    -- Execution status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
    result_id UUID,              -- FK to outputs or evaluations after completion
    error_message TEXT,

    -- Provider info (for queue routing - Ollama vs cloud)
    provider TEXT NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Indexes for efficient queue processing
CREATE INDEX idx_execution_queue_task ON marketing.execution_queue(task_id);
CREATE INDEX idx_execution_queue_processing
    ON marketing.execution_queue(task_id, status, sequence);
CREATE INDEX idx_execution_queue_ollama
    ON marketing.execution_queue(provider, status, created_at)
    WHERE provider = 'ollama';
CREATE INDEX idx_execution_queue_pending
    ON marketing.execution_queue(task_id, status)
    WHERE status IN ('pending', 'processing');

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to get next pending step for a task
CREATE OR REPLACE FUNCTION marketing.get_next_pending_step(p_task_id UUID)
RETURNS TABLE (
    step_id UUID,
    step_type TEXT,
    sequence INTEGER,
    agent_slug TEXT,
    llm_config_id UUID,
    provider TEXT,
    input_output_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        eq.id,
        eq.step_type,
        eq.sequence,
        eq.agent_slug,
        eq.llm_config_id,
        eq.provider,
        eq.input_output_id
    FROM marketing.execution_queue eq
    WHERE eq.task_id = p_task_id
      AND eq.status = 'pending'
      AND NOT EXISTS (
          -- Check all dependencies are completed
          SELECT 1 FROM unnest(eq.depends_on) dep_id
          JOIN marketing.execution_queue dep ON dep.id = dep_id
          WHERE dep.status NOT IN ('completed', 'skipped')
      )
    ORDER BY eq.sequence
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get task progress summary
CREATE OR REPLACE FUNCTION marketing.get_task_progress(p_task_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total', COUNT(*),
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'processing', COUNT(*) FILTER (WHERE status = 'processing'),
        'completed', COUNT(*) FILTER (WHERE status = 'completed'),
        'failed', COUNT(*) FILTER (WHERE status = 'failed'),
        'skipped', COUNT(*) FILTER (WHERE status = 'skipped'),
        'percentage', ROUND(
            (COUNT(*) FILTER (WHERE status IN ('completed', 'skipped'))::NUMERIC /
             NULLIF(COUNT(*), 0)) * 100
        )
    ) INTO result
    FROM marketing.execution_queue
    WHERE task_id = p_task_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE marketing.content_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.agent_llm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.swarm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.execution_queue ENABLE ROW LEVEL SECURITY;

-- Content types: viewable by org members
CREATE POLICY "content_types_org_read" ON marketing.content_types
    FOR SELECT USING (
        organization_slug IN (
            SELECT organization_slug FROM public.rbac_user_org_roles
            WHERE user_id = auth.uid()
        )
    );

-- Agents: viewable by org members
CREATE POLICY "agents_org_read" ON marketing.agents
    FOR SELECT USING (
        organization_slug IN (
            SELECT organization_slug FROM public.rbac_user_org_roles
            WHERE user_id = auth.uid()
        )
    );

-- Agent LLM configs: viewable if parent agent is viewable
CREATE POLICY "agent_llm_configs_read" ON marketing.agent_llm_configs
    FOR SELECT USING (
        agent_slug IN (
            SELECT slug FROM marketing.agents
            WHERE organization_slug IN (
                SELECT organization_slug FROM public.rbac_user_org_roles
                WHERE user_id = auth.uid()
            )
        )
    );

-- Swarm tasks: viewable by org members, editable by owner
CREATE POLICY "swarm_tasks_org_read" ON marketing.swarm_tasks
    FOR SELECT USING (
        organization_slug IN (
            SELECT organization_slug FROM public.rbac_user_org_roles
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "swarm_tasks_owner_write" ON marketing.swarm_tasks
    FOR ALL USING (user_id = auth.uid());

-- Outputs: viewable if parent task is viewable
CREATE POLICY "outputs_task_read" ON marketing.outputs
    FOR SELECT USING (
        task_id IN (
            SELECT task_id FROM marketing.swarm_tasks
            WHERE organization_slug IN (
                SELECT organization_slug FROM public.rbac_user_org_roles
                WHERE user_id = auth.uid()
            )
        )
    );

-- Evaluations: viewable if parent task is viewable
CREATE POLICY "evaluations_task_read" ON marketing.evaluations
    FOR SELECT USING (
        task_id IN (
            SELECT task_id FROM marketing.swarm_tasks
            WHERE organization_slug IN (
                SELECT organization_slug FROM public.rbac_user_org_roles
                WHERE user_id = auth.uid()
            )
        )
    );

-- Execution queue: viewable if parent task is viewable
CREATE POLICY "execution_queue_task_read" ON marketing.execution_queue
    FOR SELECT USING (
        task_id IN (
            SELECT task_id FROM marketing.swarm_tasks
            WHERE organization_slug IN (
                SELECT organization_slug FROM public.rbac_user_org_roles
                WHERE user_id = auth.uid()
            )
        )
    );

-- =============================================================================
-- SERVICE ROLE BYPASS (for backend operations)
-- =============================================================================

-- Allow service role full access to all marketing tables
CREATE POLICY "service_role_content_types" ON marketing.content_types
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_agents" ON marketing.agents
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_agent_llm_configs" ON marketing.agent_llm_configs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_swarm_tasks" ON marketing.swarm_tasks
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_outputs" ON marketing.outputs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_evaluations" ON marketing.evaluations
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_execution_queue" ON marketing.execution_queue
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- LOG SUCCESS
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Successfully created marketing schema with tables: content_types, agents, agent_llm_configs, swarm_tasks, outputs, evaluations, execution_queue';
END $$;

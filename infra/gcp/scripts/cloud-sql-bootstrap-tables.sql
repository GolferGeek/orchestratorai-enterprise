-- =============================================================================
-- CLOUD SQL BOOTSTRAP: APPLICATION TABLES
-- =============================================================================
-- Creates ALL application tables for a fresh Cloud SQL deployment.
-- Adapted from Supabase migrations with Cloud SQL compatibility:
--   - auth.users FK → authz.users FK
--   - extensions.uuid_generate_v4() → gen_random_uuid()
--   - No RLS policies (not using PostgREST)
--
-- Prerequisites:
--   - Schemas already created (by cloud-sql-bootstrap.sh)
--   - authz tables already created (by cloud-sql-post-migrate.sql)
--   - organizations table already created (by Supabase migration dump)
--   - llm_providers/llm_models already created (by Supabase migration dump)
--
-- Usage (as orchestrator_app or postgres):
--   psql "host=<IP> dbname=orchestrator_ai user=orchestrator_app sslmode=require" \
--     -f cloud-sql-bootstrap-tables.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- PUBLIC SCHEMA - Core application tables
-- =============================================================================

-- Conversations
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES authz.users(id) ON DELETE CASCADE,
    agent_name VARCHAR(255),
    agent_type VARCHAR(100),
    started_at TIMESTAMPTZ,
    last_active_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    primary_work_product_type VARCHAR(100),
    primary_work_product_id UUID,
    organization_slug TEXT REFERENCES public.organizations(slug) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_agent_name_idx ON public.conversations(agent_name);
CREATE INDEX IF NOT EXISTS conversations_organization_slug_idx ON public.conversations(organization_slug);

-- Tasks
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES authz.users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    method VARCHAR(255),
    params JSONB DEFAULT '{}'::jsonb,
    prompt TEXT,
    response TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    error_code TEXT,
    error_message TEXT,
    error_data JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    timeout_seconds INTEGER DEFAULT 300,
    deliverable_type TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    llm_metadata JSONB DEFAULT '{}'::jsonb,
    response_metadata JSONB DEFAULT '{}'::jsonb,
    evaluation JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS tasks_conversation_id_idx ON public.tasks(conversation_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);

-- Task messages
CREATE TABLE IF NOT EXISTS public.task_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES authz.users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'info' NOT NULL,
    progress_percentage NUMERIC,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS task_messages_task_id_idx ON public.task_messages(task_id);

-- LLM usage
CREATE TABLE IF NOT EXISTS public.llm_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id TEXT NOT NULL,
    user_id UUID REFERENCES authz.users(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    provider_name TEXT REFERENCES public.llm_providers(name) ON DELETE SET NULL,
    model_name TEXT,
    route TEXT CHECK (route IS NULL OR route IN ('local', 'remote')),
    input_tokens INTEGER,
    output_tokens INTEGER,
    input_cost NUMERIC,
    output_cost NUMERIC,
    total_cost NUMERIC,
    duration_ms INTEGER,
    status TEXT DEFAULT 'completed',
    caller_type TEXT,
    agent_name TEXT,
    is_local BOOLEAN DEFAULT false,
    model_tier TEXT,
    fallback_used BOOLEAN DEFAULT false,
    routing_reason TEXT,
    complexity_level TEXT,
    complexity_score INTEGER,
    data_classification TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    data_sanitization_applied BOOLEAN DEFAULT false,
    sanitization_level TEXT DEFAULT 'none',
    pii_detected BOOLEAN DEFAULT false,
    pii_types JSONB DEFAULT '[]'::jsonb,
    pseudonyms_used INTEGER DEFAULT 0,
    pseudonym_types JSONB DEFAULT '[]'::jsonb,
    pseudonym_mappings JSONB DEFAULT '[]'::jsonb,
    redactions_applied INTEGER DEFAULT 0,
    redaction_types JSONB DEFAULT '[]'::jsonb,
    source_blinding_applied BOOLEAN DEFAULT false,
    headers_stripped BOOLEAN DEFAULT false,
    custom_user_agent_used BOOLEAN DEFAULT false,
    proxy_used BOOLEAN DEFAULT false,
    no_train_header_sent BOOLEAN DEFAULT false,
    no_retain_header_sent BOOLEAN DEFAULT false,
    sanitization_time_ms INTEGER DEFAULT 0,
    reversal_context_size INTEGER DEFAULT 0,
    policy_profile TEXT,
    sovereign_mode BOOLEAN DEFAULT false,
    compliance_flags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS llm_usage_user_id_idx ON public.llm_usage(user_id);
CREATE INDEX IF NOT EXISTS llm_usage_conversation_id_idx ON public.llm_usage(conversation_id);
CREATE INDEX IF NOT EXISTS llm_usage_provider_idx ON public.llm_usage(provider_name);
CREATE INDEX IF NOT EXISTS llm_usage_model_idx ON public.llm_usage(model_name);
CREATE INDEX IF NOT EXISTS llm_usage_started_at_idx ON public.llm_usage(started_at);

-- Human approvals
CREATE TABLE IF NOT EXISTS public.human_approvals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_slug TEXT REFERENCES public.organizations(slug) ON DELETE CASCADE,
    agent_slug TEXT NOT NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    task_id TEXT,
    orchestration_run_id UUID,
    orchestration_step_id UUID,
    mode TEXT NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL,
    approved_by TEXT,
    decision_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS human_approvals_organization_idx ON public.human_approvals(organization_slug);
CREATE INDEX IF NOT EXISTS human_approvals_status_idx ON public.human_approvals(status);

-- Deliverables
CREATE TABLE IF NOT EXISTS public.deliverables (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES authz.users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    agent_name TEXT,
    title TEXT NOT NULL,
    type VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS deliverables_user_id_idx ON public.deliverables(user_id);
CREATE INDEX IF NOT EXISTS deliverables_conversation_id_idx ON public.deliverables(conversation_id);

-- Deliverable versions
CREATE TABLE IF NOT EXISTS public.deliverable_versions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    deliverable_id UUID NOT NULL REFERENCES public.deliverables(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content TEXT,
    format TEXT DEFAULT 'markdown',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(deliverable_id, version_number)
);
CREATE INDEX IF NOT EXISTS deliverable_versions_deliverable_id_idx ON public.deliverable_versions(deliverable_id);

-- Plans
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES authz.users(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    agent_slug TEXT,
    namespace TEXT NOT NULL,
    organization_slug TEXT REFERENCES public.organizations(slug) ON DELETE SET NULL,
    title TEXT NOT NULL,
    summary TEXT,
    status TEXT DEFAULT 'draft',
    current_version_id UUID,
    plan_json JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_by UUID REFERENCES authz.users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES authz.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS plans_conversation_id_idx ON public.plans(conversation_id);
CREATE INDEX IF NOT EXISTS plans_user_id_idx ON public.plans(user_id);
CREATE INDEX IF NOT EXISTS plans_organization_idx ON public.plans(organization_slug);

-- Plan versions
CREATE TABLE IF NOT EXISTS public.plan_versions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    format TEXT DEFAULT 'markdown' NOT NULL CHECK (format IN ('markdown', 'json', 'text')),
    created_by_type TEXT NOT NULL CHECK (created_by_type IN ('agent', 'user')),
    created_by_id UUID REFERENCES authz.users(id) ON DELETE SET NULL,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_current_version BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(plan_id, version_number)
);
CREATE INDEX IF NOT EXISTS plan_versions_plan_id_idx ON public.plan_versions(plan_id);

-- Plan deliverables
CREATE TABLE IF NOT EXISTS public.plan_deliverables (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    deliverable_id UUID REFERENCES public.deliverables(id) ON DELETE SET NULL,
    label TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS plan_deliverables_plan_id_idx ON public.plan_deliverables(plan_id);

-- Assets
CREATE TABLE IF NOT EXISTS public.assets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES authz.users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS assets_user_id_idx ON public.assets(user_id);
CREATE INDEX IF NOT EXISTS assets_conversation_id_idx ON public.assets(conversation_id);

-- Organization credentials
CREATE TABLE IF NOT EXISTS public.organization_credentials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,
    credential_type TEXT NOT NULL,
    credential_key TEXT NOT NULL,
    credential_value TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_slug, credential_type, credential_key)
);
CREATE INDEX IF NOT EXISTS org_credentials_org_idx ON public.organization_credentials(organization_slug);

-- Pseudonym dictionaries
CREATE TABLE IF NOT EXISTS public.pseudonym_dictionaries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES authz.users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    original_value TEXT NOT NULL,
    pseudonym TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, conversation_id, entity_type, original_value)
);
CREATE INDEX IF NOT EXISTS pseudonym_dict_user_conv_idx ON public.pseudonym_dictionaries(user_id, conversation_id);

-- Redaction patterns
CREATE TABLE IF NOT EXISTS public.redaction_patterns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pattern_name TEXT NOT NULL UNIQUE,
    pattern_type TEXT NOT NULL,
    regex_pattern TEXT,
    replacement_text TEXT DEFAULT '[REDACTED]',
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS redaction_patterns_active_idx ON public.redaction_patterns(is_active);

-- CIDAFM commands
CREATE TABLE IF NOT EXISTS public.cidafm_commands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    command_name TEXT NOT NULL UNIQUE,
    description TEXT,
    prompt_template TEXT NOT NULL,
    example_usage TEXT,
    category TEXT,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cidafm_commands_category_idx ON public.cidafm_commands(category);
CREATE INDEX IF NOT EXISTS cidafm_commands_active_idx ON public.cidafm_commands(is_active);

-- User CIDAFM commands
CREATE TABLE IF NOT EXISTS public.user_cidafm_commands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES authz.users(id) ON DELETE CASCADE,
    command_id UUID NOT NULL REFERENCES public.cidafm_commands(id) ON DELETE CASCADE,
    custom_prompt TEXT,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, command_id)
);
CREATE INDEX IF NOT EXISTS user_cidafm_commands_user_idx ON public.user_cidafm_commands(user_id);

-- Channel users (messaging)
CREATE TABLE IF NOT EXISTS public.channel_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES authz.users(id) ON DELETE SET NULL,
    channel TEXT NOT NULL,
    channel_user_id TEXT NOT NULL,
    display_name TEXT,
    is_allowed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(channel, channel_user_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_users_channel ON public.channel_users(channel);

-- Channel message log
CREATE TABLE IF NOT EXISTS public.channel_message_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_user_id UUID REFERENCES public.channel_users(id),
    channel TEXT NOT NULL,
    direction TEXT NOT NULL,
    message_text TEXT,
    channel_message_id TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_msg_log_channel ON public.channel_message_log(channel);

-- Conversations with stats VIEW
DROP VIEW IF EXISTS public.conversations_with_stats;
CREATE VIEW public.conversations_with_stats AS
SELECT
    c.id, c.user_id, c.agent_name, c.agent_type, c.ended_at, c.started_at,
    c.last_active_at, c.metadata, c.created_at, c.updated_at, c.organization_slug,
    c.primary_work_product_type, c.primary_work_product_id,
    COALESCE(task_stats.task_count, 0) AS task_count,
    COALESCE(task_stats.completed_tasks, 0) AS completed_tasks,
    COALESCE(task_stats.failed_tasks, 0) AS failed_tasks,
    COALESCE(task_stats.active_tasks, 0) AS active_tasks
FROM public.conversations c
LEFT JOIN (
    SELECT t.conversation_id,
        COUNT(*) AS task_count,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) AS completed_tasks,
        COUNT(CASE WHEN t.status = 'failed' THEN 1 END) AS failed_tasks,
        COUNT(CASE WHEN t.status IN ('pending', 'running') THEN 1 END) AS active_tasks
    FROM public.tasks t GROUP BY t.conversation_id
) task_stats ON c.id = task_stats.conversation_id;

-- =============================================================================
-- MARKETING SCHEMA
-- =============================================================================

CREATE TABLE IF NOT EXISTS marketing.swarm_tasks (
    task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_slug TEXT NOT NULL,
    user_id UUID REFERENCES authz.users(id),
    conversation_id UUID,
    content_type_slug TEXT REFERENCES marketing.content_types(slug),
    prompt_data JSONB NOT NULL,
    config JSONB NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    progress JSONB DEFAULT '{}',
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_swarm_tasks_org ON marketing.swarm_tasks(organization_slug);

CREATE TABLE IF NOT EXISTS marketing.outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES marketing.swarm_tasks(task_id) ON DELETE CASCADE,
    writer_agent_slug TEXT REFERENCES marketing.agents(slug),
    writer_llm_config_id UUID REFERENCES marketing.agent_llm_configs(id),
    editor_agent_slug TEXT REFERENCES marketing.agents(slug),
    editor_llm_config_id UUID REFERENCES marketing.agent_llm_configs(id),
    content TEXT NOT NULL,
    edit_cycle INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'editing', 'approved', 'final')),
    editor_feedback TEXT,
    editor_approved BOOLEAN,
    llm_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outputs_task ON marketing.outputs(task_id);

CREATE TABLE IF NOT EXISTS marketing.evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES marketing.swarm_tasks(task_id) ON DELETE CASCADE,
    output_id UUID NOT NULL REFERENCES marketing.outputs(id) ON DELETE CASCADE,
    evaluator_agent_slug TEXT REFERENCES marketing.agents(slug),
    evaluator_llm_config_id UUID REFERENCES marketing.agent_llm_configs(id),
    score INTEGER CHECK (score >= 1 AND score <= 10),
    reasoning TEXT,
    criteria_scores JSONB,
    llm_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing.execution_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES marketing.swarm_tasks(task_id) ON DELETE CASCADE,
    step_type TEXT NOT NULL CHECK (step_type IN ('write', 'edit', 'evaluate')),
    sequence INTEGER NOT NULL,
    agent_slug TEXT REFERENCES marketing.agents(slug),
    llm_config_id UUID REFERENCES marketing.agent_llm_configs(id),
    depends_on UUID[],
    input_output_id UUID,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
    result_id UUID,
    error_message TEXT,
    provider TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS marketing.output_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    output_id UUID NOT NULL REFERENCES marketing.outputs(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES marketing.swarm_tasks(task_id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('write', 'rewrite')),
    editor_feedback TEXT,
    llm_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(output_id, version_number)
);

-- =============================================================================
-- ORCH_FLOW SCHEMA
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE orch_flow.task_status AS ENUM ('today', 'backlog', 'in_progress', 'done', 'blocked', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS orch_flow.profiles (
    id UUID PRIMARY KEY REFERENCES authz.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orch_flow.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_by_user_id UUID REFERENCES authz.users(id) ON DELETE SET NULL,
    is_public BOOLEAN NOT NULL DEFAULT true,
    join_passcode TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orch_flow.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES authz.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

CREATE TABLE IF NOT EXISTS orch_flow.timer_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
    end_time TIMESTAMPTZ,
    is_running BOOLEAN DEFAULT false,
    is_break BOOLEAN DEFAULT false,
    duration_seconds INTEGER DEFAULT 1500,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orch_flow.sprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orch_flow.shared_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    is_completed BOOLEAN DEFAULT false,
    assigned_to TEXT,
    user_id UUID REFERENCES authz.users(id) ON DELETE SET NULL,
    status orch_flow.task_status NOT NULL DEFAULT 'today',
    parent_task_id UUID REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE,
    pomodoro_count INTEGER DEFAULT 0,
    project_id UUID,
    sprint_id UUID REFERENCES orch_flow.sprints(id) ON DELETE SET NULL,
    due_date TIMESTAMPTZ,
    channel_id TEXT,
    source_channel_user_id TEXT,
    external_provider TEXT,
    external_task_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shared_tasks_team ON orch_flow.shared_tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_shared_tasks_status ON orch_flow.shared_tasks(status);

CREATE TABLE IF NOT EXISTS orch_flow.task_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES authz.users(id) ON DELETE CASCADE,
    guest_name TEXT,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT collaborator_identity CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS orch_flow.task_watchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES authz.users(id) ON DELETE CASCADE,
    guest_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT watcher_identity CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS orch_flow.task_update_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE,
    requested_by_user_id UUID REFERENCES authz.users(id) ON DELETE CASCADE,
    requested_by_guest TEXT,
    message TEXT,
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT requester_identity CHECK (requested_by_user_id IS NOT NULL OR requested_by_guest IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS orch_flow.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES authz.users(id) ON DELETE CASCADE,
    guest_name TEXT,
    type TEXT NOT NULL,
    task_id UUID REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT notification_recipient CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS orch_flow.team_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Note',
    content TEXT,
    is_pinned BOOLEAN DEFAULT false,
    created_by_user_id UUID REFERENCES authz.users(id) ON DELETE SET NULL,
    created_by_guest TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orch_flow.channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_by_user_id UUID REFERENCES authz.users(id) ON DELETE SET NULL,
    created_by_guest TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orch_flow.channel_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES orch_flow.channels(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    user_id UUID REFERENCES authz.users(id) ON DELETE SET NULL,
    guest_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orch_flow.team_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES orch_flow.team_files(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_folder BOOLEAN NOT NULL DEFAULT false,
    content TEXT,
    file_type TEXT NOT NULL DEFAULT 'markdown',
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_by_user_id UUID REFERENCES authz.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_team_files_team ON orch_flow.team_files(team_id);
CREATE INDEX IF NOT EXISTS idx_team_files_parent ON orch_flow.team_files(parent_id);

CREATE TABLE IF NOT EXISTS orch_flow.user_presence (
    user_id UUID PRIMARY KEY REFERENCES authz.users(id) ON DELETE CASCADE,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ENGINEERING SCHEMA
-- =============================================================================

CREATE TABLE IF NOT EXISTS engineering.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    constraints JSONB NOT NULL DEFAULT '{"units": "mm", "tolerance": 0.1, "material": "aluminum_6061"}'::jsonb,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES authz.users(id)
);

CREATE TABLE IF NOT EXISTS engineering.drawings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES engineering.projects(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.tasks(id),
    conversation_id UUID REFERENCES public.conversations(id),
    name TEXT NOT NULL,
    description TEXT,
    prompt TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    parent_drawing_id UUID REFERENCES engineering.drawings(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'validating', 'executing', 'exporting', 'completed', 'failed')),
    constraints_override JSONB DEFAULT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES authz.users(id)
);
CREATE INDEX IF NOT EXISTS idx_drawings_project ON engineering.drawings(project_id);

CREATE TABLE IF NOT EXISTS engineering.generated_code (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drawing_id UUID NOT NULL REFERENCES engineering.drawings(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    code_type TEXT NOT NULL DEFAULT 'opencascade-js' CHECK (code_type IN ('opencascade-js', 'cadquery')),
    llm_provider TEXT NOT NULL,
    llm_model TEXT NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    generation_time_ms INTEGER,
    is_valid BOOLEAN,
    validation_errors JSONB DEFAULT '[]',
    attempt_number INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering.cad_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drawing_id UUID NOT NULL REFERENCES engineering.drawings(id) ON DELETE CASCADE,
    generated_code_id UUID REFERENCES engineering.generated_code(id),
    format TEXT NOT NULL CHECK (format IN ('step', 'stl', 'gltf', 'dxf', 'thumbnail')),
    storage_path TEXT NOT NULL,
    file_size_bytes BIGINT,
    mesh_stats JSONB,
    export_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering.execution_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drawing_id UUID NOT NULL REFERENCES engineering.drawings(id) ON DELETE CASCADE,
    step_type TEXT NOT NULL CHECK (step_type IN ('prompt_received', 'constraints_applied', 'llm_started', 'llm_completed', 'code_validation', 'execution_started', 'execution_completed', 'export_started', 'export_completed', 'error')),
    message TEXT,
    details JSONB DEFAULT '{}',
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering.part_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    template_code TEXT NOT NULL,
    parameters_schema JSONB NOT NULL,
    default_parameters JSONB NOT NULL,
    thumbnail_path TEXT,
    preview_gltf_path TEXT,
    use_count INTEGER DEFAULT 0,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES authz.users(id)
);

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast')
      AND table_type = 'BASE TABLE';

    RAISE NOTICE '================================================';
    RAISE NOTICE 'Cloud SQL Bootstrap Tables Complete';
    RAISE NOTICE 'Total tables: %', v_count;
    RAISE NOTICE '================================================';
END $$;

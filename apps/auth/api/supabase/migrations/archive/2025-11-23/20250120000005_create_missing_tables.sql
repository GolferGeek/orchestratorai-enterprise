-- =============================================================================
-- MISSING TABLES FROM V1 SCHEMA
-- =============================================================================
-- Restore tables that were lost during migration to v2-start
-- =============================================================================

-- Conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Task messages table
CREATE TABLE IF NOT EXISTS public.task_messages (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'info' NOT NULL,
    progress_percentage NUMERIC,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_messages_task_id_idx ON public.task_messages(task_id);

-- LLM usage table
CREATE TABLE IF NOT EXISTS public.llm_usage (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    run_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
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

-- Human approvals table
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

-- Deliverables table
CREATE TABLE IF NOT EXISTS public.deliverables (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    agent_name TEXT,
    title TEXT NOT NULL,
    type VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS deliverables_user_id_idx ON public.deliverables(user_id);
CREATE INDEX IF NOT EXISTS deliverables_conversation_id_idx ON public.deliverables(conversation_id);

-- Deliverable versions table
CREATE TABLE IF NOT EXISTS public.deliverable_versions (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    deliverable_id UUID NOT NULL REFERENCES public.deliverables(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content TEXT,
    format TEXT DEFAULT 'markdown',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(deliverable_id, version_number)
);

CREATE INDEX IF NOT EXISTS deliverable_versions_deliverable_id_idx ON public.deliverable_versions(deliverable_id);

-- Plans table
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    agent_slug TEXT,
    namespace TEXT NOT NULL,
    organization_slug TEXT REFERENCES public.organizations(slug) ON DELETE SET NULL,
    title TEXT NOT NULL,
    summary TEXT,
    status TEXT DEFAULT 'draft',
    current_version_id UUID,
    plan_json JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plans_conversation_id_idx ON public.plans(conversation_id);
CREATE INDEX IF NOT EXISTS plans_user_id_idx ON public.plans(user_id);
CREATE INDEX IF NOT EXISTS plans_organization_idx ON public.plans(organization_slug);

-- Plan versions table
CREATE TABLE IF NOT EXISTS public.plan_versions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    format TEXT DEFAULT 'markdown' NOT NULL CHECK (format IN ('markdown', 'json', 'text')),
    created_by_type TEXT NOT NULL CHECK (created_by_type IN ('agent', 'user')),
    created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_current_version BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(plan_id, version_number)
);

CREATE INDEX IF NOT EXISTS plan_versions_plan_id_idx ON public.plan_versions(plan_id);

-- Plan deliverables table
CREATE TABLE IF NOT EXISTS public.plan_deliverables (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    deliverable_id UUID REFERENCES public.deliverables(id) ON DELETE SET NULL,
    label TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plan_deliverables_plan_id_idx ON public.plan_deliverables(plan_id);

-- Assets table
CREATE TABLE IF NOT EXISTS public.assets (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Organization credentials table
CREATE TABLE IF NOT EXISTS public.organization_credentials (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
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

-- System settings table
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Observability events table
CREATE TABLE IF NOT EXISTS public.observability_events (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    event_type TEXT NOT NULL,
    source_app TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    agent_name TEXT,
    event_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS observability_events_type_idx ON public.observability_events(event_type);
CREATE INDEX IF NOT EXISTS observability_events_source_idx ON public.observability_events(source_app);
CREATE INDEX IF NOT EXISTS observability_events_created_at_idx ON public.observability_events(created_at);

-- Pseudonym dictionaries table
CREATE TABLE IF NOT EXISTS public.pseudonym_dictionaries (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    original_value TEXT NOT NULL,
    pseudonym TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, conversation_id, entity_type, original_value)
);

CREATE INDEX IF NOT EXISTS pseudonym_dict_user_conv_idx ON public.pseudonym_dictionaries(user_id, conversation_id);

-- Redaction patterns table
CREATE TABLE IF NOT EXISTS public.redaction_patterns (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
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

-- CIDAFM commands table
CREATE TABLE IF NOT EXISTS public.cidafm_commands (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
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

-- User CIDAFM commands table
CREATE TABLE IF NOT EXISTS public.user_cidafm_commands (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Success notification
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Missing tables restored successfully';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  - conversations';
    RAISE NOTICE '  - tasks';
    RAISE NOTICE '  - task_messages';
    RAISE NOTICE '  - llm_usage';
    RAISE NOTICE '  - human_approvals';
    RAISE NOTICE '  - deliverables';
    RAISE NOTICE '  - deliverable_versions';
    RAISE NOTICE '  - plans';
    RAISE NOTICE '  - plan_versions';
    RAISE NOTICE '  - plan_deliverables';
    RAISE NOTICE '  - assets';
    RAISE NOTICE '  - organization_credentials';
    RAISE NOTICE '  - system_settings';
    RAISE NOTICE '  - observability_events';
    RAISE NOTICE '  - pseudonym_dictionaries';
    RAISE NOTICE '  - redaction_patterns';
    RAISE NOTICE '  - cidafm_commands';
    RAISE NOTICE '  - user_cidafm_commands';
    RAISE NOTICE '================================================';
END $$;

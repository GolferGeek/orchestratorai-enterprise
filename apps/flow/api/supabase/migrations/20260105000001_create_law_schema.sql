-- =============================================================================
-- LEGAL DEPARTMENT AI SCHEMA
-- =============================================================================
-- Multi-agent legal analysis system with:
-- - CLO orchestrator routing to specialist agents
-- - Document extraction with multimodal support (PDF, DOCX, vision, OCR)
-- - Original document storage in Supabase Storage
-- - Specialist outputs and risk analysis
-- - Firm-configurable playbooks
-- - Demo-grade history (NOT compliance-grade audit logging)
-- Created: 2026-01-05
-- =============================================================================

-- Create law schema
CREATE SCHEMA IF NOT EXISTS law;
COMMENT ON SCHEMA law IS 'Legal Department AI data: analysis tasks, document extractions, specialist outputs, playbooks';

-- Grant usage on schema
GRANT USAGE ON SCHEMA law TO postgres, anon, authenticated, service_role;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA law GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA law GRANT ALL ON SEQUENCES TO service_role;

-- =============================================================================
-- ANALYSIS TASKS
-- =============================================================================
-- Main execution record for each legal analysis request
-- Links to API's tasks/conversations but stores legal-specific state
-- =============================================================================

CREATE TABLE law.analysis_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Links to API's task/conversation system
    task_id UUID NOT NULL,              -- FK to API's tasks table
    conversation_id UUID NOT NULL,      -- FK to conversations
    organization_slug TEXT NOT NULL,
    user_id UUID,                       -- User who initiated

    -- Analysis metadata
    document_type TEXT,                 -- 'nda', 'msa', 'employment', 'lease', etc.
    user_request TEXT,                  -- Original user request text

    -- CLO routing decisions
    clo_routing JSONB,                  -- { selectedSpecialists: [], reasoning: "" }

    -- Status tracking
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending',           -- Awaiting processing
        'extracting',        -- Document extraction in progress
        'routing',           -- CLO determining specialists
        'analyzing',         -- Specialists working
        'synthesizing',      -- Combining specialist outputs
        'awaiting_approval', -- HITL checkpoint
        'completed',         -- Analysis complete
        'failed'             -- Error occurred
    )),

    -- Results
    risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    synthesized_report TEXT,            -- Final combined report

    -- HITL
    approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN (
        'pending', 'approved', 'rejected', 'changes_requested'
    )),
    approver_id UUID,                   -- Attorney who approved
    approval_notes TEXT,
    approved_at TIMESTAMPTZ,

    -- Error tracking
    error_message TEXT,

    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_analysis_tasks_org ON law.analysis_tasks(organization_slug);
CREATE INDEX idx_analysis_tasks_task ON law.analysis_tasks(task_id);
CREATE INDEX idx_analysis_tasks_conversation ON law.analysis_tasks(conversation_id);
CREATE INDEX idx_analysis_tasks_status ON law.analysis_tasks(status);
CREATE INDEX idx_analysis_tasks_user ON law.analysis_tasks(user_id);

COMMENT ON TABLE law.analysis_tasks IS 'Main execution record for legal analysis requests';
COMMENT ON COLUMN law.analysis_tasks.task_id IS 'Foreign key to public.tasks table';
COMMENT ON COLUMN law.analysis_tasks.conversation_id IS 'Foreign key to public.conversations table';
COMMENT ON COLUMN law.analysis_tasks.clo_routing IS 'JSON: CLO routing decisions including selected specialists and reasoning';

-- =============================================================================
-- DOCUMENT EXTRACTIONS
-- =============================================================================
-- Stores extracted text and metadata from uploaded documents
-- Original documents stored in Supabase Storage, referenced here
-- =============================================================================

CREATE TABLE law.document_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_task_id UUID NOT NULL REFERENCES law.analysis_tasks(id) ON DELETE CASCADE,

    -- Original file reference (Supabase Storage)
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,         -- Path in Supabase Storage bucket
    file_type TEXT NOT NULL CHECK (file_type IN (
        'pdf',           -- Native PDF with text layer
        'pdf_scanned',   -- PDF that's actually images (requires vision/OCR)
        'docx',          -- Microsoft Word
        'doc',           -- Legacy Word
        'image',         -- PNG, JPG, JPEG, TIFF
        'txt',           -- Plain text
        'md'             -- Markdown
    )),
    file_size_bytes INTEGER,
    mime_type TEXT,                     -- 'application/pdf', 'image/png', etc.

    -- Extraction results
    page_count INTEGER,
    extraction_method TEXT NOT NULL CHECK (extraction_method IN (
        'pdf_text',      -- Direct PDF text extraction
        'docx_parse',    -- DOCX XML parsing
        'vision_model',  -- LLaVA, Qwen-VL, etc.
        'ocr',           -- Tesseract fallback
        'direct_read'    -- Plain text files
    )),
    extracted_text TEXT NOT NULL,

    -- Quality metrics
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    extraction_warnings TEXT[],         -- Any issues during extraction

    -- Processing metadata
    metadata JSONB,                     -- Vision model used, processing time, etc.

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_document_extractions_task ON law.document_extractions(analysis_task_id);
CREATE INDEX idx_document_extractions_storage ON law.document_extractions(storage_path);
CREATE INDEX idx_document_extractions_type ON law.document_extractions(file_type);

COMMENT ON TABLE law.document_extractions IS 'Extracted text and metadata from uploaded documents';
COMMENT ON COLUMN law.document_extractions.storage_path IS 'Path in Supabase Storage legal-documents bucket';
COMMENT ON COLUMN law.document_extractions.extraction_method IS 'Method used for text extraction';

-- =============================================================================
-- SPECIALIST OUTPUTS
-- =============================================================================
-- One record per specialist agent invoked during analysis
-- Stores the specialist's findings, risks, and recommendations
-- =============================================================================

CREATE TABLE law.specialist_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_task_id UUID NOT NULL REFERENCES law.analysis_tasks(id) ON DELETE CASCADE,

    -- Specialist identification
    specialist_slug TEXT NOT NULL CHECK (specialist_slug IN (
        'contract',
        'compliance',
        'ip',
        'privacy',
        'employment',
        'corporate',
        'litigation',
        'real_estate'
    )),

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'skipped'
    )),

    -- Analysis output
    extracted_data JSONB,               -- Specialist-specific structured extraction
    risk_flags JSONB,                   -- Array of { level, description, recommendation }
    recommendations JSONB,              -- Array of action items
    summary TEXT,                       -- Plain text summary

    -- Quality
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),

    -- LLM usage
    llm_metadata JSONB,                 -- { provider, model, tokensUsed, latencyMs }

    -- Error tracking
    error_message TEXT,

    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_specialist_outputs_task ON law.specialist_outputs(analysis_task_id);
CREATE INDEX idx_specialist_outputs_specialist ON law.specialist_outputs(specialist_slug);
CREATE INDEX idx_specialist_outputs_status ON law.specialist_outputs(status);

COMMENT ON TABLE law.specialist_outputs IS 'Specialist agent findings, risks, and recommendations';
COMMENT ON COLUMN law.specialist_outputs.specialist_slug IS 'Specialist agent identifier';
COMMENT ON COLUMN law.specialist_outputs.extracted_data IS 'JSON: Specialist-specific structured extraction';

-- =============================================================================
-- PLAYBOOKS
-- =============================================================================
-- Firm-configurable rules for analysis
-- Define what's acceptable, what to flag, threshold values
-- =============================================================================

CREATE TABLE law.playbooks (
    slug TEXT PRIMARY KEY,
    organization_slug TEXT NOT NULL,

    -- Playbook metadata
    name TEXT NOT NULL,
    description TEXT,
    document_type TEXT NOT NULL,        -- 'nda', 'msa', 'employment', etc.
    specialist_slug TEXT NOT NULL,      -- Which specialist uses this playbook

    -- Rules
    rules JSONB NOT NULL,               -- Firm's acceptable terms, flags, thresholds
    /*
    Example rules for NDA:
    {
        "termLimits": {
            "maxYears": 5,
            "warningYears": 3
        },
        "jurisdictions": {
            "acceptable": ["Delaware", "New York", "California"],
            "requiresApproval": ["International"],
            "prohibited": []
        },
        "confidentialityPeriod": {
            "minYears": 2,
            "maxYears": 10
        },
        "requiredClauses": [
            "mutual_obligations",
            "return_of_materials",
            "no_reverse_engineering"
        ],
        "prohibitedClauses": [
            "unlimited_liability",
            "exclusive_jurisdiction_foreign"
        ]
    }
    */

    -- Status
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_playbooks_org ON law.playbooks(organization_slug);
CREATE INDEX idx_playbooks_doc_type ON law.playbooks(document_type);
CREATE INDEX idx_playbooks_specialist ON law.playbooks(specialist_slug);
CREATE INDEX idx_playbooks_active ON law.playbooks(is_active) WHERE is_active = true;

COMMENT ON TABLE law.playbooks IS 'Firm-configurable rules for legal analysis';
COMMENT ON COLUMN law.playbooks.rules IS 'JSON: Firm rules including acceptable terms, flags, thresholds';

-- =============================================================================
-- EXECUTION STEPS
-- =============================================================================
-- Track step-by-step execution for reconnection capability
-- Useful for long-running analyses or debugging
-- =============================================================================

CREATE TABLE law.execution_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_task_id UUID NOT NULL REFERENCES law.analysis_tasks(id) ON DELETE CASCADE,

    -- Step identification
    step_type TEXT NOT NULL CHECK (step_type IN (
        'document_upload',
        'document_extraction',
        'clo_routing',
        'specialist_analysis',
        'synthesis',
        'hitl_checkpoint',
        'report_generation'
    )),
    step_name TEXT NOT NULL,            -- Human-readable description
    sequence INTEGER NOT NULL,          -- Execution order

    -- Dependencies
    depends_on UUID[],                  -- Array of step IDs that must complete first

    -- Execution
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'skipped'
    )),
    input_data JSONB,
    output_data JSONB,
    error_message TEXT,

    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_execution_steps_task ON law.execution_steps(analysis_task_id);
CREATE INDEX idx_execution_steps_status ON law.execution_steps(status);
CREATE INDEX idx_execution_steps_sequence ON law.execution_steps(analysis_task_id, sequence);

COMMENT ON TABLE law.execution_steps IS 'Step-by-step execution audit trail for legal analysis';
COMMENT ON COLUMN law.execution_steps.step_type IS 'Type of execution step for progress tracking';

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================

-- Analysis tasks updated_at trigger
CREATE TRIGGER set_law_analysis_tasks_updated_at
    BEFORE UPDATE ON law.analysis_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Playbooks updated_at trigger
CREATE TRIGGER set_law_playbooks_updated_at
    BEFORE UPDATE ON law.playbooks
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to get analysis progress
CREATE OR REPLACE FUNCTION law.get_analysis_progress(p_analysis_task_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    specialist_progress JSONB;
BEGIN
    -- Get specialist progress
    SELECT jsonb_agg(
        jsonb_build_object(
            'specialist', specialist_slug,
            'status', status,
            'hasOutput', extracted_data IS NOT NULL
        )
    ) INTO specialist_progress
    FROM law.specialist_outputs
    WHERE analysis_task_id = p_analysis_task_id;

    -- Build full progress object
    SELECT jsonb_build_object(
        'status', at.status,
        'riskLevel', at.risk_level,
        'specialists', COALESCE(specialist_progress, '[]'::jsonb),
        'hasReport', at.synthesized_report IS NOT NULL,
        'approvalStatus', at.approval_status
    ) INTO result
    FROM law.analysis_tasks at
    WHERE at.id = p_analysis_task_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION law.get_analysis_progress IS 'Returns progress summary for an analysis task';

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE law.analysis_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE law.document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE law.specialist_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE law.playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE law.execution_steps ENABLE ROW LEVEL SECURITY;

-- Analysis tasks: viewable by org members
CREATE POLICY "analysis_tasks_org_read" ON law.analysis_tasks
    FOR SELECT USING (
        organization_slug IN (
            SELECT organization_slug FROM public.rbac_user_org_roles
            WHERE user_id = auth.uid()
        )
    );

-- Analysis tasks: insertable by org members
CREATE POLICY "analysis_tasks_org_insert" ON law.analysis_tasks
    FOR INSERT WITH CHECK (
        organization_slug IN (
            SELECT organization_slug FROM public.rbac_user_org_roles
            WHERE user_id = auth.uid()
        )
    );

-- Analysis tasks: updatable by owner or org admin
CREATE POLICY "analysis_tasks_update" ON law.analysis_tasks
    FOR UPDATE USING (
        user_id = auth.uid() OR
        organization_slug IN (
            SELECT r.organization_slug FROM public.rbac_user_org_roles r
            JOIN public.rbac_roles roles ON r.role_id = roles.id
            WHERE r.user_id = auth.uid() AND roles.name IN ('admin', 'owner')
        )
    );

-- Document extractions: viewable if parent task is viewable
CREATE POLICY "document_extractions_read" ON law.document_extractions
    FOR SELECT USING (
        analysis_task_id IN (
            SELECT id FROM law.analysis_tasks
            WHERE organization_slug IN (
                SELECT organization_slug FROM public.rbac_user_org_roles
                WHERE user_id = auth.uid()
            )
        )
    );

-- Specialist outputs: viewable if parent task is viewable
CREATE POLICY "specialist_outputs_read" ON law.specialist_outputs
    FOR SELECT USING (
        analysis_task_id IN (
            SELECT id FROM law.analysis_tasks
            WHERE organization_slug IN (
                SELECT organization_slug FROM public.rbac_user_org_roles
                WHERE user_id = auth.uid()
            )
        )
    );

-- Playbooks: viewable by org members
CREATE POLICY "playbooks_org_read" ON law.playbooks
    FOR SELECT USING (
        organization_slug IN (
            SELECT organization_slug FROM public.rbac_user_org_roles
            WHERE user_id = auth.uid()
        )
    );

-- Playbooks: manageable by org admins
CREATE POLICY "playbooks_org_admin" ON law.playbooks
    FOR ALL USING (
        organization_slug IN (
            SELECT r.organization_slug FROM public.rbac_user_org_roles r
            JOIN public.rbac_roles roles ON r.role_id = roles.id
            WHERE r.user_id = auth.uid() AND roles.name IN ('admin', 'owner')
        )
    );

-- Execution steps: viewable if parent task is viewable
CREATE POLICY "execution_steps_read" ON law.execution_steps
    FOR SELECT USING (
        analysis_task_id IN (
            SELECT id FROM law.analysis_tasks
            WHERE organization_slug IN (
                SELECT organization_slug FROM public.rbac_user_org_roles
                WHERE user_id = auth.uid()
            )
        )
    );

-- =============================================================================
-- SERVICE ROLE BYPASS (for backend operations)
-- =============================================================================

-- Allow service role full access to all law tables
CREATE POLICY "service_role_analysis_tasks" ON law.analysis_tasks
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_document_extractions" ON law.document_extractions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_specialist_outputs" ON law.specialist_outputs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_playbooks" ON law.playbooks
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_execution_steps" ON law.execution_steps
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- LOG SUCCESS
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Law schema created successfully';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  - law.analysis_tasks (legal analysis execution records)';
    RAISE NOTICE '  - law.document_extractions (extracted document content)';
    RAISE NOTICE '  - law.specialist_outputs (specialist agent findings)';
    RAISE NOTICE '  - law.playbooks (firm-configurable rules)';
    RAISE NOTICE '  - law.execution_steps (execution audit trail)';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Functions created:';
    RAISE NOTICE '  - law.get_analysis_progress()';
    RAISE NOTICE '================================================';
END $$;

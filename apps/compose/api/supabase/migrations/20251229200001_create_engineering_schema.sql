-- =============================================================================
-- ENGINEERING CAD SCHEMA
-- =============================================================================
-- Parametric 3D CAD model generation system with:
-- - Project containers for related CAD work
-- - Drawings with version tracking
-- - LLM-generated OpenCASCADE.js code
-- - Exported CAD outputs (STEP, STL, GLTF)
-- - Full execution audit trail
-- - Reusable part library
-- Created: 2025-12-29
-- =============================================================================

-- Create engineering schema
CREATE SCHEMA IF NOT EXISTS engineering;
COMMENT ON SCHEMA engineering IS 'Engineering CAD agent data: projects, drawings, generated code, CAD outputs';

-- Grant usage on schema
GRANT USAGE ON SCHEMA engineering TO postgres, anon, authenticated, service_role;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA engineering GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA engineering GRANT ALL ON SEQUENCES TO service_role;

-- =============================================================================
-- PROJECTS TABLE
-- =============================================================================
-- Container for related CAD work, holds project-wide constraints
-- =============================================================================

CREATE TABLE engineering.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,

    -- Project-wide constraints applied to all drawings
    constraints JSONB NOT NULL DEFAULT '{
        "units": "mm",
        "material": "Aluminum 6061",
        "manufacturing_method": "CNC",
        "tolerance_class": "standard",
        "wall_thickness_min": 2.0
    }'::jsonb,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes for common queries
CREATE INDEX idx_engineering_projects_org ON engineering.projects(org_slug);
CREATE INDEX idx_engineering_projects_created_by ON engineering.projects(created_by);
CREATE INDEX idx_engineering_projects_created_at ON engineering.projects(created_at DESC);

COMMENT ON TABLE engineering.projects IS 'Container for related CAD work with project-wide constraints';
COMMENT ON COLUMN engineering.projects.constraints IS 'JSON: units, material, manufacturing_method, tolerance_class, wall_thickness_min';

-- =============================================================================
-- DRAWINGS TABLE
-- =============================================================================
-- Individual CAD instances with versioning and conversation tracking
-- =============================================================================

CREATE TABLE engineering.drawings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES engineering.projects(id) ON DELETE CASCADE,

    -- Task and conversation integration
    task_id UUID REFERENCES public.tasks(id),
    conversation_id UUID REFERENCES public.conversations(id),

    -- Drawing metadata
    name TEXT NOT NULL,
    description TEXT,
    prompt TEXT NOT NULL,  -- Natural language description of what to create

    -- Version tracking
    version INTEGER NOT NULL DEFAULT 1,
    parent_drawing_id UUID REFERENCES engineering.drawings(id),  -- For version history

    -- Status tracking
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending',        -- Waiting to start
        'generating',     -- LLM generating code
        'validating',     -- Validating code
        'executing',      -- Running OpenCASCADE.js
        'exporting',      -- Generating output files
        'completed',      -- Successfully completed
        'failed'          -- Error occurred
    )),

    -- Override project constraints for this drawing
    constraints_override JSONB DEFAULT NULL,

    -- Error handling
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes for common queries
CREATE INDEX idx_engineering_drawings_project ON engineering.drawings(project_id);
CREATE INDEX idx_engineering_drawings_task ON engineering.drawings(task_id);
CREATE INDEX idx_engineering_drawings_conversation ON engineering.drawings(conversation_id);
CREATE INDEX idx_engineering_drawings_status ON engineering.drawings(status);
CREATE INDEX idx_engineering_drawings_parent ON engineering.drawings(parent_drawing_id);
CREATE INDEX idx_engineering_drawings_created_at ON engineering.drawings(created_at DESC);

COMMENT ON TABLE engineering.drawings IS 'Individual CAD instances with version tracking';
COMMENT ON COLUMN engineering.drawings.prompt IS 'Natural language description of the CAD model to generate';
COMMENT ON COLUMN engineering.drawings.version IS 'Version number for tracking iterations';
COMMENT ON COLUMN engineering.drawings.constraints_override IS 'Per-drawing constraint overrides (merged with project constraints)';

-- =============================================================================
-- GENERATED CODE TABLE
-- =============================================================================
-- LLM-generated OpenCASCADE.js scripts
-- =============================================================================

CREATE TABLE engineering.generated_code (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drawing_id UUID NOT NULL REFERENCES engineering.drawings(id) ON DELETE CASCADE,

    -- Code content
    code TEXT NOT NULL,
    code_type TEXT NOT NULL DEFAULT 'opencascade-js' CHECK (code_type IN (
        'opencascade-js',   -- OpenCASCADE.js code
        'cadquery'          -- CadQuery Python (future)
    )),

    -- Generation metadata
    llm_provider TEXT NOT NULL,
    llm_model TEXT NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    generation_time_ms INTEGER,

    -- Validation status
    is_valid BOOLEAN,
    validation_errors JSONB DEFAULT '[]'::jsonb,

    -- For regeneration tracking
    attempt_number INTEGER NOT NULL DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_engineering_generated_code_drawing ON engineering.generated_code(drawing_id);
CREATE INDEX idx_engineering_generated_code_valid ON engineering.generated_code(is_valid);
CREATE INDEX idx_engineering_generated_code_attempt ON engineering.generated_code(drawing_id, attempt_number);

COMMENT ON TABLE engineering.generated_code IS 'LLM-generated CAD scripts with validation tracking';
COMMENT ON COLUMN engineering.generated_code.attempt_number IS 'Attempt number for retry scenarios';
COMMENT ON COLUMN engineering.generated_code.validation_errors IS 'JSON array of validation error messages';

-- =============================================================================
-- CAD OUTPUTS TABLE
-- =============================================================================
-- Exported geometry files (STEP, STL, GLTF, thumbnails)
-- =============================================================================

CREATE TABLE engineering.cad_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drawing_id UUID NOT NULL REFERENCES engineering.drawings(id) ON DELETE CASCADE,
    generated_code_id UUID REFERENCES engineering.generated_code(id),

    -- File information
    format TEXT NOT NULL CHECK (format IN ('step', 'stl', 'gltf', 'dxf', 'thumbnail')),
    storage_path TEXT NOT NULL,  -- Path in Supabase storage
    file_size_bytes BIGINT,

    -- GLTF-specific metadata (for 3D viewer)
    mesh_stats JSONB,  -- { vertices, faces, boundingBox }

    -- Generation metadata
    export_time_ms INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_engineering_cad_outputs_drawing ON engineering.cad_outputs(drawing_id);
CREATE INDEX idx_engineering_cad_outputs_format ON engineering.cad_outputs(format);
CREATE INDEX idx_engineering_cad_outputs_code ON engineering.cad_outputs(generated_code_id);

COMMENT ON TABLE engineering.cad_outputs IS 'Exported CAD files stored in Supabase storage';
COMMENT ON COLUMN engineering.cad_outputs.storage_path IS 'Path in engineering storage bucket';
COMMENT ON COLUMN engineering.cad_outputs.mesh_stats IS 'JSON: vertices, faces, boundingBox for GLTF files';

-- =============================================================================
-- EXECUTION LOG TABLE
-- =============================================================================
-- Step-by-step audit trail for CAD generation
-- =============================================================================

CREATE TABLE engineering.execution_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drawing_id UUID NOT NULL REFERENCES engineering.drawings(id) ON DELETE CASCADE,

    -- Step information
    step_type TEXT NOT NULL CHECK (step_type IN (
        'prompt_received',
        'constraints_applied',
        'llm_started',
        'llm_completed',
        'code_validation',
        'execution_started',
        'execution_completed',
        'execution_failed',
        'export_started',
        'export_completed',
        'error'
    )),

    -- Step details
    message TEXT,
    details JSONB DEFAULT '{}'::jsonb,

    -- Duration tracking
    duration_ms INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_engineering_execution_log_drawing ON engineering.execution_log(drawing_id);
CREATE INDEX idx_engineering_execution_log_type ON engineering.execution_log(step_type);
CREATE INDEX idx_engineering_execution_log_created ON engineering.execution_log(drawing_id, created_at);

COMMENT ON TABLE engineering.execution_log IS 'Step-by-step audit trail for CAD generation';
COMMENT ON COLUMN engineering.execution_log.step_type IS 'Type of execution step for progress tracking';

-- =============================================================================
-- PART LIBRARY TABLE
-- =============================================================================
-- Reusable component templates
-- =============================================================================

CREATE TABLE engineering.part_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,

    -- Part metadata
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,  -- e.g., 'fasteners', 'brackets', 'enclosures'
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Template code (OpenCASCADE.js)
    template_code TEXT NOT NULL,

    -- Parameters schema (what can be customized)
    parameters_schema JSONB NOT NULL,  -- JSON Schema for parameters
    default_parameters JSONB NOT NULL,

    -- Preview
    thumbnail_path TEXT,
    preview_gltf_path TEXT,

    -- Usage tracking
    use_count INTEGER DEFAULT 0,

    -- Visibility
    is_public BOOLEAN DEFAULT false,  -- Available to all orgs

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes for common queries
CREATE INDEX idx_engineering_part_library_org ON engineering.part_library(org_slug);
CREATE INDEX idx_engineering_part_library_category ON engineering.part_library(category);
CREATE INDEX idx_engineering_part_library_tags ON engineering.part_library USING GIN(tags);
CREATE INDEX idx_engineering_part_library_public ON engineering.part_library(is_public) WHERE is_public = true;

COMMENT ON TABLE engineering.part_library IS 'Reusable CAD component templates';
COMMENT ON COLUMN engineering.part_library.parameters_schema IS 'JSON Schema defining customizable parameters';
COMMENT ON COLUMN engineering.part_library.template_code IS 'OpenCASCADE.js code template with parameter placeholders';

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================

-- Projects updated_at trigger
CREATE TRIGGER set_engineering_projects_updated_at
    BEFORE UPDATE ON engineering.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Drawings updated_at trigger
CREATE TRIGGER set_engineering_drawings_updated_at
    BEFORE UPDATE ON engineering.drawings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Part library updated_at trigger
CREATE TRIGGER set_engineering_part_library_updated_at
    BEFORE UPDATE ON engineering.part_library
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE engineering.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering.drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering.generated_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering.cad_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering.execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering.part_library ENABLE ROW LEVEL SECURITY;

-- Projects: viewable by org members
CREATE POLICY "projects_org_read" ON engineering.projects
    FOR SELECT USING (
        org_slug IN (
            SELECT o.slug FROM public.organizations o
            JOIN public.rbac_user_org_roles r ON r.organization_slug = o.slug
            WHERE r.user_id = auth.uid()
        )
    );

-- Drawings: viewable if parent project is viewable
CREATE POLICY "drawings_project_read" ON engineering.drawings
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM engineering.projects
            WHERE org_slug IN (
                SELECT o.slug FROM public.organizations o
                JOIN public.rbac_user_org_roles r ON r.organization_slug = o.slug
                WHERE r.user_id = auth.uid()
            )
        )
    );

-- Generated code: viewable if parent drawing is viewable
CREATE POLICY "generated_code_drawing_read" ON engineering.generated_code
    FOR SELECT USING (
        drawing_id IN (
            SELECT d.id FROM engineering.drawings d
            JOIN engineering.projects p ON p.id = d.project_id
            WHERE p.org_slug IN (
                SELECT o.slug FROM public.organizations o
                JOIN public.rbac_user_org_roles r ON r.organization_slug = o.slug
                WHERE r.user_id = auth.uid()
            )
        )
    );

-- CAD outputs: viewable if parent drawing is viewable
CREATE POLICY "cad_outputs_drawing_read" ON engineering.cad_outputs
    FOR SELECT USING (
        drawing_id IN (
            SELECT d.id FROM engineering.drawings d
            JOIN engineering.projects p ON p.id = d.project_id
            WHERE p.org_slug IN (
                SELECT o.slug FROM public.organizations o
                JOIN public.rbac_user_org_roles r ON r.organization_slug = o.slug
                WHERE r.user_id = auth.uid()
            )
        )
    );

-- Execution log: viewable if parent drawing is viewable
CREATE POLICY "execution_log_drawing_read" ON engineering.execution_log
    FOR SELECT USING (
        drawing_id IN (
            SELECT d.id FROM engineering.drawings d
            JOIN engineering.projects p ON p.id = d.project_id
            WHERE p.org_slug IN (
                SELECT o.slug FROM public.organizations o
                JOIN public.rbac_user_org_roles r ON r.organization_slug = o.slug
                WHERE r.user_id = auth.uid()
            )
        )
    );

-- Part library: viewable by org members or if public
CREATE POLICY "part_library_read" ON engineering.part_library
    FOR SELECT USING (
        is_public = true
        OR org_slug IN (
            SELECT o.slug FROM public.organizations o
            JOIN public.rbac_user_org_roles r ON r.organization_slug = o.slug
            WHERE r.user_id = auth.uid()
        )
    );

-- =============================================================================
-- SERVICE ROLE BYPASS
-- =============================================================================

CREATE POLICY "service_role_projects" ON engineering.projects
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_drawings" ON engineering.drawings
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_generated_code" ON engineering.generated_code
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_cad_outputs" ON engineering.cad_outputs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_execution_log" ON engineering.execution_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_part_library" ON engineering.part_library
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to get effective constraints for a drawing (project constraints + overrides)
CREATE OR REPLACE FUNCTION engineering.get_effective_constraints(p_drawing_id UUID)
RETURNS JSONB AS $$
DECLARE
    project_constraints JSONB;
    drawing_overrides JSONB;
BEGIN
    SELECT p.constraints, d.constraints_override
    INTO project_constraints, drawing_overrides
    FROM engineering.drawings d
    JOIN engineering.projects p ON p.id = d.project_id
    WHERE d.id = p_drawing_id;

    -- Merge: drawing overrides take precedence
    IF drawing_overrides IS NULL THEN
        RETURN project_constraints;
    ELSE
        RETURN project_constraints || drawing_overrides;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get drawing progress
CREATE OR REPLACE FUNCTION engineering.get_drawing_progress(p_drawing_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'drawing_id', p_drawing_id,
        'status', d.status,
        'steps', (
            SELECT jsonb_agg(jsonb_build_object(
                'step_type', el.step_type,
                'message', el.message,
                'duration_ms', el.duration_ms,
                'created_at', el.created_at
            ) ORDER BY el.created_at)
            FROM engineering.execution_log el
            WHERE el.drawing_id = p_drawing_id
        ),
        'outputs', (
            SELECT jsonb_agg(jsonb_build_object(
                'format', co.format,
                'storage_path', co.storage_path,
                'file_size_bytes', co.file_size_bytes
            ))
            FROM engineering.cad_outputs co
            WHERE co.drawing_id = p_drawing_id
        )
    )
    INTO result
    FROM engineering.drawings d
    WHERE d.id = p_drawing_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- LOG SUCCESS
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Engineering schema created successfully';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  - engineering.projects (CAD project containers)';
    RAISE NOTICE '  - engineering.drawings (individual CAD instances)';
    RAISE NOTICE '  - engineering.generated_code (LLM-generated scripts)';
    RAISE NOTICE '  - engineering.cad_outputs (exported files)';
    RAISE NOTICE '  - engineering.execution_log (audit trail)';
    RAISE NOTICE '  - engineering.part_library (reusable templates)';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Functions created:';
    RAISE NOTICE '  - engineering.get_effective_constraints()';
    RAISE NOTICE '  - engineering.get_drawing_progress()';
    RAISE NOTICE '================================================';
END $$;

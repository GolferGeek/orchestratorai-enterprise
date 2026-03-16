-- =============================================================================
-- AGENT IDEAS LEADS SCHEMA
-- =============================================================================
-- Stores lead submissions from the "Agent Ideas" landing page feature.
-- When users enter their industry and select agent recommendations they want
-- built for them, their submission is stored here for follow-up.
-- Created: 2026-01-27
-- =============================================================================

-- Create leads schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS leads;

-- =============================================================================
-- AGENT IDEA SUBMISSIONS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS leads.agent_idea_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Contact Information (email required, others optional)
    email TEXT NOT NULL,
    name TEXT,
    company TEXT,
    phone TEXT,

    -- Industry Data
    industry_input TEXT NOT NULL,           -- Raw user input (what they typed)
    normalized_industry TEXT,               -- AI-normalized industry name
    industry_description TEXT,              -- AI-generated description

    -- Selected Agents (what the user wants built)
    -- Format: [{ name, tagline, category, description, wow_factor, time_saved, use_case_example }]
    selected_agents JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- All Recommendations (for analytics - what was shown to them)
    all_recommendations JSONB,

    -- Processing Metadata
    is_fallback BOOLEAN DEFAULT false,      -- Was this from fallback recommendations?
    processing_time_ms INTEGER,             -- How long did the LLM take?

    -- Lead Status Tracking
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
        'new',          -- Just submitted
        'contacted',    -- We reached out
        'qualified',    -- They're a real lead
        'converted',    -- They became a customer
        'closed'        -- Not interested / closed
    )),
    notes TEXT,                             -- Internal notes about this lead

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    contacted_at TIMESTAMPTZ               -- When we first contacted them
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Primary lookups
CREATE INDEX IF NOT EXISTS idx_agent_idea_submissions_email
    ON leads.agent_idea_submissions(email);
CREATE INDEX IF NOT EXISTS idx_agent_idea_submissions_status
    ON leads.agent_idea_submissions(status);
CREATE INDEX IF NOT EXISTS idx_agent_idea_submissions_created
    ON leads.agent_idea_submissions(created_at DESC);

-- Analytics queries
CREATE INDEX IF NOT EXISTS idx_agent_idea_submissions_industry
    ON leads.agent_idea_submissions(normalized_industry);
CREATE INDEX IF NOT EXISTS idx_agent_idea_submissions_selected_agents
    ON leads.agent_idea_submissions USING GIN(selected_agents);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE leads.agent_idea_submissions ENABLE ROW LEVEL SECURITY;

-- Grant schema access to service_role
GRANT USAGE ON SCHEMA leads TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA leads TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA leads TO service_role;

-- Service role has full access (for API operations)
CREATE POLICY "service_role_full_access_agent_ideas"
    ON leads.agent_idea_submissions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

-- Create trigger function if it doesn't exist (may already exist from other migrations)
CREATE OR REPLACE FUNCTION leads.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
CREATE TRIGGER set_agent_idea_submissions_updated_at
    BEFORE UPDATE ON leads.agent_idea_submissions
    FOR EACH ROW
    EXECUTE FUNCTION leads.set_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON SCHEMA leads IS 'Lead management tables for marketing and sales';
COMMENT ON TABLE leads.agent_idea_submissions IS 'Stores submissions from Agent Ideas landing page feature';
COMMENT ON COLUMN leads.agent_idea_submissions.email IS 'Contact email (required)';
COMMENT ON COLUMN leads.agent_idea_submissions.industry_input IS 'Raw industry text entered by user';
COMMENT ON COLUMN leads.agent_idea_submissions.normalized_industry IS 'AI-normalized industry name';
COMMENT ON COLUMN leads.agent_idea_submissions.selected_agents IS 'JSONB array of agents the user wants built';
COMMENT ON COLUMN leads.agent_idea_submissions.is_fallback IS 'True if LLM failed and fallback recommendations were shown';
COMMENT ON COLUMN leads.agent_idea_submissions.status IS 'Lead status: new, contacted, qualified, converted, closed';

-- =============================================================================
-- SUCCESS NOTIFICATION
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Agent Ideas Leads Migration Complete';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Created: leads schema';
    RAISE NOTICE 'Created: leads.agent_idea_submissions table';
    RAISE NOTICE 'Created: Indexes for lookups and analytics';
    RAISE NOTICE 'Created: RLS policies for service role access';
    RAISE NOTICE '================================================';
END $$;

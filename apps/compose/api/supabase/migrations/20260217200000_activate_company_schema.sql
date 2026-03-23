-- =============================================================================
-- ACTIVATE COMPANY SCHEMA
-- =============================================================================
-- Revives the company schema from archive and adds discovery/outreach tables
-- for the Lead Discovery pipeline. The company is a first-class entity that
-- can be referenced by prediction, risk, and future features.
-- Created: 2026-02-17
-- =============================================================================

-- Create the company schema
CREATE SCHEMA IF NOT EXISTS company;
COMMENT ON SCHEMA company IS 'Company master data, discovery signals, and outreach tracking';

-- Grant access (same pattern as orch_flow — anon + authenticated required for PostgREST)
GRANT USAGE ON SCHEMA company TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA company TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA company TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA company GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA company GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- =============================================================================
-- COMPANIES TABLE (master record)
-- =============================================================================

CREATE TABLE IF NOT EXISTS company.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    website TEXT,
    industry TEXT,
    size TEXT CHECK (size IN ('startup', 'small', 'medium', 'large', 'enterprise')),
    employee_count_range TEXT,              -- '50-100', '100-200', '200-500'
    location TEXT,
    founded_date DATE,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_name ON company.companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_industry ON company.companies(industry);
CREATE INDEX IF NOT EXISTS idx_companies_size ON company.companies(size);

COMMENT ON TABLE company.companies IS 'Company master data - reusable across all features';
COMMENT ON COLUMN company.companies.size IS 'Company size category: startup, small, medium, large, enterprise';
COMMENT ON COLUMN company.companies.metadata IS 'Flexible JSON for additional company data';

-- =============================================================================
-- DISCOVERY SIGNALS TABLE (AI interest indicators)
-- =============================================================================
-- One company can have many signals discovered over time.
-- Each Morning Grind run may add new signals for existing companies.

CREATE TABLE company.discovery_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES company.companies(id) ON DELETE CASCADE,
    signal_type TEXT NOT NULL CHECK (signal_type IN (
        'hiring',               -- AI/ML job postings
        'funding',              -- AI-related funding round
        'press',                -- News article about AI initiative
        'tech_stack',           -- Public evidence of AI tools/frameworks
        'executive_statement',  -- CEO/CTO talking about AI plans
        'partnership'           -- AI partnership announcement
    )),
    signal_source TEXT,         -- URL where signal was found
    signal_date DATE,           -- When the signal occurred
    signal_summary TEXT,        -- One-liner description
    score_contribution INTEGER DEFAULT 0,  -- Points this signal adds to relevance score
    batch_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_discovery_signals_company ON company.discovery_signals(company_id);
CREATE INDEX idx_discovery_signals_type ON company.discovery_signals(signal_type);
CREATE INDEX idx_discovery_signals_batch ON company.discovery_signals(batch_date DESC);

COMMENT ON TABLE company.discovery_signals IS 'AI interest signals found during lead discovery';
COMMENT ON COLUMN company.discovery_signals.signal_type IS 'Type of signal: hiring, funding, press, tech_stack, executive_statement, partnership';
COMMENT ON COLUMN company.discovery_signals.score_contribution IS 'Points this signal adds to the company relevance score';

-- =============================================================================
-- OUTREACH TABLE (pipeline tracking)
-- =============================================================================
-- Tracks the outreach pipeline from discovery through close.
-- One company has one outreach record (the current state of engagement).

CREATE TABLE company.outreach (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES company.companies(id) ON DELETE CASCADE,

    -- Scoring (matches SCORING.md rubric in lead-discovery-skill)
    relevance_score INTEGER CHECK (relevance_score BETWEEN 1 AND 10),
    score_breakdown JSONB,      -- { "ai_hiring": 3, "funding": 2, "press": 1, "stretch_goal": 3, "decision_maker": 1 }
    company_fit_notes TEXT,     -- Why this company fits the ICP

    -- The Stretch Goal (most important field for Rapid AI pitch)
    stretch_goal TEXT,          -- Their "change everything" ambition
    stretch_goal_source TEXT,   -- Where we found/inferred this

    -- Key Contact
    key_contact_name TEXT,
    key_contact_title TEXT,
    key_contact_linkedin TEXT,
    key_contact_email TEXT,

    -- Pipeline Status
    status TEXT NOT NULL DEFAULT 'discovered' CHECK (status IN (
        'discovered',   -- Found by Morning Grind
        'researched',   -- Deep research completed
        'drafted',      -- Email drafts created
        'sent',         -- Email sent
        'replied',      -- Got a reply
        'meeting',      -- Meeting scheduled
        'qualified',    -- Real opportunity
        'closed_won',   -- Became a client
        'closed_lost'   -- Not interested
    )),
    email_angle TEXT CHECK (email_angle IN (
        'process_automation',   -- Template 1: operational bottleneck angle
        'stretch_goal',         -- Template 2: big ambition angle
        'the_unlock'            -- Template 3: non-obvious insight angle
    )),
    outreach_date DATE,
    response_summary TEXT,      -- What they said back

    -- OrchDev Document References
    research_file_id UUID,      -- Reference to orch_flow.team_files (hot lead research doc)
    email_draft_file_id UUID,   -- Reference to orch_flow.team_files (email drafts doc)

    batch_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outreach_company ON company.outreach(company_id);
CREATE INDEX idx_outreach_status ON company.outreach(status);
CREATE INDEX idx_outreach_score ON company.outreach(relevance_score DESC);
CREATE INDEX idx_outreach_batch ON company.outreach(batch_date DESC);

COMMENT ON TABLE company.outreach IS 'Outreach pipeline for lead discovery - tracks from discovery through close';
COMMENT ON COLUMN company.outreach.stretch_goal IS 'The company''s "change everything" ambition - key to Rapid AI pitch';
COMMENT ON COLUMN company.outreach.email_angle IS 'Which email template angle was used: process_automation, stretch_goal, the_unlock';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE company.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company.discovery_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE company.outreach ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_companies"
    ON company.companies FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_signals"
    ON company.discovery_signals FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_outreach"
    ON company.outreach FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION company.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_companies_updated_at
    BEFORE UPDATE ON company.companies
    FOR EACH ROW EXECUTE FUNCTION company.set_updated_at();

CREATE TRIGGER set_outreach_updated_at
    BEFORE UPDATE ON company.outreach
    FOR EACH ROW EXECUTE FUNCTION company.set_updated_at();

-- =============================================================================
-- POSTGREST SCHEMA EXPOSURE
-- =============================================================================
-- Supabase CLI sets pgrst.db_schemas as a role-level GUC on authenticator.
-- This overrides the PGRST_DB_SCHEMAS env var from config.toml.
-- NOTE: This must be run manually with supabase_admin user (authenticator is reserved):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U supabase_admin -d postgres -c \
--     "ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, marketing, orch_flow, engineering, prediction, risk, crawler, leads, authz, company';"
-- Then restart PostgREST: docker restart supabase_rest_api-dev
-- =============================================================================

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Company Schema Activation Complete';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Created: company schema';
    RAISE NOTICE 'Created: company.companies (master record)';
    RAISE NOTICE 'Created: company.discovery_signals (AI interest indicators)';
    RAISE NOTICE 'Created: company.outreach (pipeline tracking)';
    RAISE NOTICE 'Created: Indexes, RLS policies, triggers';
    RAISE NOTICE '================================================';
END $$;

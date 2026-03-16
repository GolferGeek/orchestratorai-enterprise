-- =============================================================================
-- ORGANIZATIONS TABLE
-- =============================================================================
-- Multi-tenant organization management for Orchestrator AI
-- Each organization can have multiple agents and users
-- Created: Phase 1 - Agent Infrastructure
-- =============================================================================

-- Create organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  -- Primary identifier (human-readable slug)
  slug TEXT PRIMARY KEY,

  -- Organization metadata
  name TEXT NOT NULL,
  description TEXT,
  url TEXT,

  -- Organization settings (JSONB for flexibility)
  -- Example: {"theme": "dark", "features": ["rag", "langgraph"], "limits": {"max_agents": 50}}
  settings JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Index for common lookups
CREATE INDEX IF NOT EXISTS idx_organizations_name ON public.organizations(name);
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON public.organizations(created_at DESC);

-- GIN index for settings JSONB queries
CREATE INDEX IF NOT EXISTS idx_organizations_settings ON public.organizations USING GIN(settings);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on organizations table
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read organizations they belong to
-- Note: This assumes auth.users table exists and has organization membership
-- Will be expanded in future phases when user management is implemented
CREATE POLICY "Users can read their organizations"
  ON public.organizations
  FOR SELECT
  USING (true); -- Temporarily allow all reads until user management is implemented

-- Policy: Service role has full access (currently disabled - auth schema not in this DB)
-- CREATE POLICY "Service role has full access to organizations"
--   ON public.organizations
--   FOR ALL
--   USING (auth.role() = 'service_role');

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

-- Create or replace the updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to organizations table
CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE public.organizations IS 'Multi-tenant organizations for agent and user management';
COMMENT ON COLUMN public.organizations.slug IS 'Human-readable unique identifier (e.g., "acme-corp", "demo-org")';
COMMENT ON COLUMN public.organizations.name IS 'Display name of the organization';
COMMENT ON COLUMN public.organizations.description IS 'Optional description of the organization';
COMMENT ON COLUMN public.organizations.url IS 'Optional organization website URL';
COMMENT ON COLUMN public.organizations.settings IS 'Flexible JSONB settings for organization preferences, features, and limits';
COMMENT ON COLUMN public.organizations.created_at IS 'Timestamp when organization was created';
COMMENT ON COLUMN public.organizations.updated_at IS 'Timestamp when organization was last updated (auto-maintained by trigger)';

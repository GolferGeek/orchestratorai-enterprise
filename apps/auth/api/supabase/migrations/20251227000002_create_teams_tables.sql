-- =============================================================================
-- TEAMS AND TEAM MEMBERS TABLES
-- =============================================================================
-- Centralized teams management for multi-tenancy across all apps.
-- Teams belong to organizations, and users can be members of multiple teams.
-- =============================================================================

-- =============================================================================
-- TEAMS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure unique team names within an org
  UNIQUE(org_slug, name)
);

-- =============================================================================
-- TEAM MEMBERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',  -- member, lead, admin
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate memberships
  UNIQUE(team_id, user_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_teams_org_slug ON public.teams(org_slug);
CREATE INDEX IF NOT EXISTS idx_teams_created_by ON public.teams(created_by);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_teams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.set_teams_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Teams: Users can view teams in orgs they belong to
CREATE POLICY "Users can view teams in their orgs"
  ON public.teams
  FOR SELECT
  USING (
    org_slug IN (
      SELECT organization_slug FROM rbac_user_org_roles
      WHERE user_id = auth.uid()
        AND (expires_at IS NULL OR expires_at > NOW())
    )
    OR
    -- Super-admins with '*' org access can see all
    EXISTS (
      SELECT 1 FROM rbac_user_org_roles
      WHERE user_id = auth.uid()
        AND organization_slug = '*'
        AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

-- Teams: Admins can create teams in their orgs
CREATE POLICY "Admins can create teams"
  ON public.teams
  FOR INSERT
  WITH CHECK (
    -- Check if user has admin role in this org
    EXISTS (
      SELECT 1 FROM rbac_user_org_roles uor
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE uor.user_id = auth.uid()
        AND (uor.organization_slug = org_slug OR uor.organization_slug = '*')
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    )
  );

-- Teams: Admins can update teams in their orgs
CREATE POLICY "Admins can update teams"
  ON public.teams
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM rbac_user_org_roles uor
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE uor.user_id = auth.uid()
        AND (uor.organization_slug = org_slug OR uor.organization_slug = '*')
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    )
  );

-- Teams: Admins can delete teams in their orgs
CREATE POLICY "Admins can delete teams"
  ON public.teams
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM rbac_user_org_roles uor
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE uor.user_id = auth.uid()
        AND (uor.organization_slug = org_slug OR uor.organization_slug = '*')
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    )
  );

-- Team Members: Users can view members of teams they can see
CREATE POLICY "Users can view team members"
  ON public.team_members
  FOR SELECT
  USING (
    team_id IN (
      SELECT t.id FROM public.teams t
      WHERE t.org_slug IN (
        SELECT organization_slug FROM rbac_user_org_roles
        WHERE user_id = auth.uid()
          AND (expires_at IS NULL OR expires_at > NOW())
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM rbac_user_org_roles
      WHERE user_id = auth.uid()
        AND organization_slug = '*'
        AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

-- Team Members: Admins can add members
CREATE POLICY "Admins can add team members"
  ON public.team_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN rbac_user_org_roles uor ON (uor.organization_slug = t.org_slug OR uor.organization_slug = '*')
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE t.id = team_id
        AND uor.user_id = auth.uid()
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    )
  );

-- Team Members: Admins can update member roles
CREATE POLICY "Admins can update team members"
  ON public.team_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN rbac_user_org_roles uor ON (uor.organization_slug = t.org_slug OR uor.organization_slug = '*')
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE t.id = team_id
        AND uor.user_id = auth.uid()
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    )
  );

-- Team Members: Admins can remove members, or users can remove themselves
CREATE POLICY "Admins can remove team members or self-remove"
  ON public.team_members
  FOR DELETE
  USING (
    user_id = auth.uid()  -- Users can leave teams
    OR
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN rbac_user_org_roles uor ON (uor.organization_slug = t.org_slug OR uor.organization_slug = '*')
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE t.id = team_id
        AND uor.user_id = auth.uid()
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    )
  );

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Get all teams for a user (across all their orgs)
CREATE OR REPLACE FUNCTION public.get_user_teams(p_user_id UUID)
RETURNS TABLE (
  team_id UUID,
  team_name TEXT,
  team_description TEXT,
  org_slug TEXT,
  member_role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
  SELECT
    t.id AS team_id,
    t.name AS team_name,
    t.description AS team_description,
    t.org_slug,
    tm.role AS member_role,
    tm.joined_at
  FROM public.teams t
  JOIN public.team_members tm ON t.id = tm.team_id
  WHERE tm.user_id = p_user_id
  ORDER BY t.org_slug, t.name;
$$;

-- Get team member count
CREATE OR REPLACE FUNCTION public.get_team_member_count(p_team_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*)::INTEGER FROM public.team_members WHERE team_id = p_team_id;
$$;

-- =============================================================================
-- SEED INITIAL GLOBAL TEAMS
-- =============================================================================
DO $$
DECLARE
  v_admin_user_id UUID;
  v_team_id UUID;
  v_user_record RECORD;
BEGIN
  -- Get admin user ID for created_by (use justin as fallback)
  SELECT id INTO v_admin_user_id
  FROM public.users
  WHERE email IN ('admin@orchestratorai.io', 'justin@orchestratorai.io')
  ORDER BY email ASC
  LIMIT 1;

  -- Create global teams (no org_slug)
  -- Note: org_slug becomes nullable in migration 20251227000003.
  -- Wrap in sub-block to handle NOT NULL violation on fresh runs.
  BEGIN
    INSERT INTO public.teams (org_slug, name, description, created_by)
    VALUES
      (NULL, 'AI SLT', 'Senior Leadership Team', v_admin_user_id),
      (NULL, 'AI Evangelists', 'AI advocacy and education', v_admin_user_id),
      (NULL, 'AI Hardware', 'Hardware infrastructure team', v_admin_user_id),
      (NULL, 'AI Software', 'Software development team', v_admin_user_id),
      (NULL, 'AI Agent Development', 'Agent development specialists', v_admin_user_id)
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'Skipping global team seed — org_slug NOT NULL still active';
  END;

  -- Add all non-demo users to all teams
  FOR v_user_record IN
    SELECT DISTINCT u.id
    FROM public.users u
    WHERE u.email != 'demo.user@orchestratorai.io'
  LOOP
    FOR v_team_id IN
      SELECT id FROM public.teams
    LOOP
      INSERT INTO public.team_members (team_id, user_id, role)
      VALUES (v_team_id, v_user_record.id, 'member')
      ON CONFLICT (team_id, user_id) DO NOTHING;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Global teams created and members assigned';
END $$;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE public.teams IS 'Teams within organizations for multi-tenancy';
COMMENT ON TABLE public.team_members IS 'User membership in teams';
COMMENT ON COLUMN public.teams.org_slug IS 'Organization this team belongs to';
COMMENT ON COLUMN public.teams.name IS 'Team name (unique within org)';
COMMENT ON COLUMN public.team_members.role IS 'Member role: member, lead, admin';

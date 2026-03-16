-- =============================================================================
-- MAKE ORG_SLUG NULLABLE IN TEAMS TABLE
-- =============================================================================
-- This allows teams to exist without an organization, enabling:
-- 1. Development teams (Orch-Flow, internal dev squads)
-- 2. Cross-org collaboration teams
-- While still supporting org-scoped teams for customer-facing apps like Notebook.
-- =============================================================================

-- =============================================================================
-- ALTER TEAMS TABLE
-- =============================================================================

-- Make org_slug nullable
ALTER TABLE public.teams ALTER COLUMN org_slug DROP NOT NULL;

-- Drop the existing unique constraint (org_slug, name)
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_org_slug_name_key;

-- Add a new unique constraint that handles null org_slug
-- For teams with org_slug: unique within org
-- For teams without org_slug: unique globally (null org_slug teams)
CREATE UNIQUE INDEX teams_org_name_unique
  ON public.teams (COALESCE(org_slug, ''), name);

-- =============================================================================
-- UPDATE RLS POLICIES
-- =============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view teams in their orgs" ON public.teams;
DROP POLICY IF EXISTS "Admins can create teams" ON public.teams;
DROP POLICY IF EXISTS "Admins can update teams" ON public.teams;
DROP POLICY IF EXISTS "Admins can delete teams" ON public.teams;

-- Teams: Users can view teams they are members of, or teams in orgs they belong to
CREATE POLICY "Users can view accessible teams"
  ON public.teams
  FOR SELECT
  USING (
    -- User is a member of this team
    id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
    OR
    -- Team has an org and user belongs to that org
    (org_slug IS NOT NULL AND org_slug IN (
      SELECT organization_slug FROM rbac_user_org_roles
      WHERE user_id = auth.uid()
        AND (expires_at IS NULL OR expires_at > NOW())
    ))
    OR
    -- Super-admins can see all
    EXISTS (
      SELECT 1 FROM rbac_user_org_roles
      WHERE user_id = auth.uid()
        AND organization_slug = '*'
        AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

-- Teams: Admins can create teams (with or without org)
CREATE POLICY "Admins can create teams"
  ON public.teams
  FOR INSERT
  WITH CHECK (
    -- For org-scoped teams: user must be admin in that org
    (org_slug IS NOT NULL AND EXISTS (
      SELECT 1 FROM rbac_user_org_roles uor
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE uor.user_id = auth.uid()
        AND (uor.organization_slug = org_slug OR uor.organization_slug = '*')
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ))
    OR
    -- For global teams (no org): user must be a super-admin or have any admin role
    (org_slug IS NULL AND EXISTS (
      SELECT 1 FROM rbac_user_org_roles uor
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE uor.user_id = auth.uid()
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ))
  );

-- Teams: Admins/creators can update teams
CREATE POLICY "Admins can update teams"
  ON public.teams
  FOR UPDATE
  USING (
    -- Creator can update
    created_by = auth.uid()
    OR
    -- For org-scoped teams: org admin can update
    (org_slug IS NOT NULL AND EXISTS (
      SELECT 1 FROM rbac_user_org_roles uor
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE uor.user_id = auth.uid()
        AND (uor.organization_slug = org_slug OR uor.organization_slug = '*')
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ))
    OR
    -- For global teams: any admin can update
    (org_slug IS NULL AND EXISTS (
      SELECT 1 FROM rbac_user_org_roles uor
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE uor.user_id = auth.uid()
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ))
  );

-- Teams: Admins/creators can delete teams
CREATE POLICY "Admins can delete teams"
  ON public.teams
  FOR DELETE
  USING (
    -- Creator can delete
    created_by = auth.uid()
    OR
    -- For org-scoped teams: org admin can delete
    (org_slug IS NOT NULL AND EXISTS (
      SELECT 1 FROM rbac_user_org_roles uor
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE uor.user_id = auth.uid()
        AND (uor.organization_slug = org_slug OR uor.organization_slug = '*')
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ))
    OR
    -- For global teams: any admin can delete
    (org_slug IS NULL AND EXISTS (
      SELECT 1 FROM rbac_user_org_roles uor
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE uor.user_id = auth.uid()
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ))
  );

-- =============================================================================
-- UPDATE TEAM MEMBERS POLICIES
-- =============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view team members" ON public.team_members;
DROP POLICY IF EXISTS "Admins can add team members" ON public.team_members;
DROP POLICY IF EXISTS "Admins can update team members" ON public.team_members;
DROP POLICY IF EXISTS "Admins can remove team members or self-remove" ON public.team_members;

-- Team Members: Users can view members of teams they can access
CREATE POLICY "Users can view team members"
  ON public.team_members
  FOR SELECT
  USING (
    -- User is a member of this team
    team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
    OR
    -- User can view the team
    team_id IN (
      SELECT t.id FROM public.teams t
      WHERE t.org_slug IS NOT NULL AND t.org_slug IN (
        SELECT organization_slug FROM rbac_user_org_roles
        WHERE user_id = auth.uid()
          AND (expires_at IS NULL OR expires_at > NOW())
      )
    )
    OR
    -- Super-admin
    EXISTS (
      SELECT 1 FROM rbac_user_org_roles
      WHERE user_id = auth.uid()
        AND organization_slug = '*'
        AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

-- Team Members: Admins/team leads can add members
CREATE POLICY "Admins can add team members"
  ON public.team_members
  FOR INSERT
  WITH CHECK (
    -- User is team admin/lead
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'lead')
    )
    OR
    -- User is org admin for org-scoped team
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN rbac_user_org_roles uor ON (uor.organization_slug = t.org_slug OR uor.organization_slug = '*')
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE t.id = team_id
        AND t.org_slug IS NOT NULL
        AND uor.user_id = auth.uid()
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    )
    OR
    -- User is any admin for global team
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN rbac_user_org_roles uor ON true
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE t.id = team_id
        AND t.org_slug IS NULL
        AND uor.user_id = auth.uid()
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    )
    OR
    -- Team creator can add members
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id AND t.created_by = auth.uid()
    )
  );

-- Team Members: Admins can update member roles
CREATE POLICY "Admins can update team members"
  ON public.team_members
  FOR UPDATE
  USING (
    -- User is team admin/lead
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'lead')
    )
    OR
    -- User is org admin for org-scoped team
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN rbac_user_org_roles uor ON (uor.organization_slug = t.org_slug OR uor.organization_slug = '*')
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE t.id = team_id
        AND t.org_slug IS NOT NULL
        AND uor.user_id = auth.uid()
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    )
    OR
    -- User is any admin for global team
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN rbac_user_org_roles uor ON true
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE t.id = team_id
        AND t.org_slug IS NULL
        AND uor.user_id = auth.uid()
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    )
    OR
    -- Team creator can update members
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id AND t.created_by = auth.uid()
    )
  );

-- Team Members: Admins can remove members, or users can remove themselves
CREATE POLICY "Admins can remove team members or self-remove"
  ON public.team_members
  FOR DELETE
  USING (
    -- Users can leave teams
    user_id = auth.uid()
    OR
    -- User is team admin/lead
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'lead')
    )
    OR
    -- User is org admin for org-scoped team
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN rbac_user_org_roles uor ON (uor.organization_slug = t.org_slug OR uor.organization_slug = '*')
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE t.id = team_id
        AND t.org_slug IS NOT NULL
        AND uor.user_id = auth.uid()
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    )
    OR
    -- User is any admin for global team
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN rbac_user_org_roles uor ON true
      JOIN rbac_roles r ON uor.role_id = r.id
      WHERE t.id = team_id
        AND t.org_slug IS NULL
        AND uor.user_id = auth.uid()
        AND r.name IN ('admin', 'super-admin')
        AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    )
    OR
    -- Team creator can remove members
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id AND t.created_by = auth.uid()
    )
  );

-- =============================================================================
-- UPDATE HELPER FUNCTION
-- =============================================================================

-- Get all teams for a user (handles null org_slug)
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
    t.org_slug,  -- Will be NULL for global teams
    tm.role AS member_role,
    tm.joined_at
  FROM public.teams t
  JOIN public.team_members tm ON t.id = tm.team_id
  WHERE tm.user_id = p_user_id
  ORDER BY COALESCE(t.org_slug, ''), t.name;
$$;

-- =============================================================================
-- UPDATE COMMENTS
-- =============================================================================
COMMENT ON COLUMN public.teams.org_slug IS 'Organization this team belongs to (NULL for global/dev teams)';

-- =============================================================================
-- SEED GLOBAL DEV TEAMS (moved to 20251227000002_create_teams_tables.sql)
-- =============================================================================
-- Teams are now seeded as global teams in the initial migration.

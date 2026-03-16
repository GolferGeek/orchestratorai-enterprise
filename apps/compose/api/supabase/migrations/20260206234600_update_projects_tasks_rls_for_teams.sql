-- Update RLS policies for projects and tasks to support team-scoped efforts
-- Migration: Allow viewing/modifying projects and tasks linked to team-scoped efforts

-- =============================================================================
-- Projects RLS Policies
-- =============================================================================

DROP POLICY IF EXISTS "Users can view projects in their org" ON orch_flow.projects;
DROP POLICY IF EXISTS "Users can manage projects in their org" ON orch_flow.projects;
DROP POLICY IF EXISTS "Users can view team-scoped or org projects" ON orch_flow.projects;
DROP POLICY IF EXISTS "Users can manage team-scoped or org projects" ON orch_flow.projects;

-- Allow viewing projects linked to team-scoped OR org-scoped efforts
CREATE POLICY "Users can view team-scoped or org projects" ON orch_flow.projects
  FOR SELECT
  USING (
    effort_id IN (
      SELECT id FROM orch_flow.efforts 
      WHERE organization_slug IS NULL  -- Team-scoped efforts (global)
         OR organization_slug IN (SELECT organization_slug FROM public.users WHERE id = auth.uid())
    )
  );

-- Allow managing projects linked to team-scoped OR org-scoped efforts
CREATE POLICY "Users can manage team-scoped or org projects" ON orch_flow.projects
  FOR ALL
  USING (
    effort_id IN (
      SELECT id FROM orch_flow.efforts 
      WHERE organization_slug IS NULL  -- Team-scoped efforts (global)
         OR organization_slug IN (SELECT organization_slug FROM public.users WHERE id = auth.uid())
    )
  );

-- =============================================================================
-- Tasks RLS Policies
-- =============================================================================

DROP POLICY IF EXISTS "Users can view tasks in their org" ON orch_flow.tasks;
DROP POLICY IF EXISTS "Users can manage tasks in their org" ON orch_flow.tasks;
DROP POLICY IF EXISTS "Users can view team-scoped or org tasks" ON orch_flow.tasks;
DROP POLICY IF EXISTS "Users can manage team-scoped or org tasks" ON orch_flow.tasks;

-- Allow viewing tasks linked to team-scoped OR org-scoped projects
CREATE POLICY "Users can view team-scoped or org tasks" ON orch_flow.tasks
  FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM orch_flow.projects p
      INNER JOIN orch_flow.efforts e ON p.effort_id = e.id
      WHERE e.organization_slug IS NULL  -- Team-scoped efforts (global)
         OR e.organization_slug IN (SELECT organization_slug FROM public.users WHERE id = auth.uid())
    )
  );

-- Allow managing tasks linked to team-scoped OR org-scoped projects
CREATE POLICY "Users can manage team-scoped or org tasks" ON orch_flow.tasks
  FOR ALL
  USING (
    project_id IN (
      SELECT p.id FROM orch_flow.projects p
      INNER JOIN orch_flow.efforts e ON p.effort_id = e.id
      WHERE e.organization_slug IS NULL  -- Team-scoped efforts (global)
         OR e.organization_slug IN (SELECT organization_slug FROM public.users WHERE id = auth.uid())
    )
  );

-- Note: This migration completes team-scoped content support
-- Allows projects and tasks to be accessed when their parent effort is team-scoped (organization_slug = NULL)
-- Maintains organization-scoped access for efforts with a specific organization_slug

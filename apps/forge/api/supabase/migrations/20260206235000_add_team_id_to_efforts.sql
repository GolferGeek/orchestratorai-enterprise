-- Add team_id to efforts table to associate efforts with specific teams
-- Migration: Link efforts to teams for team-based filtering

ALTER TABLE orch_flow.efforts
ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX idx_efforts_team_id ON orch_flow.efforts(team_id);

-- Update RLS policies to include team_id filtering
DROP POLICY IF EXISTS "Users can view team-scoped or org efforts" ON orch_flow.efforts;

CREATE POLICY "Users can view team or org efforts" ON orch_flow.efforts
  FOR SELECT
  USING (
    -- Team-scoped: user is member of the team
    (team_id IS NOT NULL AND team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    ))
    OR
    -- Org-scoped: user is in the organization
    (organization_slug IS NOT NULL AND organization_slug IN (
      SELECT organization_slug FROM public.users WHERE id = auth.uid()
    ))
    OR
    -- Global efforts (both NULL)
    (team_id IS NULL AND organization_slug IS NULL)
  );

-- Update other RLS policies similarly
DROP POLICY IF EXISTS "Users can create team-scoped or org efforts" ON orch_flow.efforts;
DROP POLICY IF EXISTS "Users can update team-scoped or org efforts" ON orch_flow.efforts;
DROP POLICY IF EXISTS "Users can delete team-scoped or org efforts" ON orch_flow.efforts;

CREATE POLICY "Users can create team or org efforts" ON orch_flow.efforts
  FOR INSERT
  WITH CHECK (
    (team_id IS NOT NULL AND team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    ))
    OR
    (organization_slug IS NOT NULL AND organization_slug IN (
      SELECT organization_slug FROM public.users WHERE id = auth.uid()
    ))
    OR
    (team_id IS NULL AND organization_slug IS NULL)
  );

CREATE POLICY "Users can update team or org efforts" ON orch_flow.efforts
  FOR UPDATE
  USING (
    (team_id IS NOT NULL AND team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    ))
    OR
    (organization_slug IS NOT NULL AND organization_slug IN (
      SELECT organization_slug FROM public.users WHERE id = auth.uid()
    ))
    OR
    (team_id IS NULL AND organization_slug IS NULL)
  );

CREATE POLICY "Users can delete team or org efforts" ON orch_flow.efforts
  FOR DELETE
  USING (
    (team_id IS NOT NULL AND team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    ))
    OR
    (organization_slug IS NOT NULL AND organization_slug IN (
      SELECT organization_slug FROM public.users WHERE id = auth.uid()
    ))
    OR
    (team_id IS NULL AND organization_slug IS NULL)
  );

-- Assign existing efforts to teams based on their names/content
-- This is a one-time data migration for the onboarding content

UPDATE orch_flow.efforts SET team_id = (SELECT id FROM public.teams WHERE name = 'AI Agent Development' LIMIT 1)
WHERE name IN ('Advanced Agent Development', 'Agent Orchestration', 'Agent Testing & Quality');

UPDATE orch_flow.efforts SET team_id = (SELECT id FROM public.teams WHERE name = 'AI Software' LIMIT 1)
WHERE name IN ('API & Integration Development', 'Development Excellence', 'Performance & Optimization', 'Security & Compliance', 'Testing & Quality Assurance');

UPDATE orch_flow.efforts SET team_id = (SELECT id FROM public.teams WHERE name = 'AI Hardware' LIMIT 1)
WHERE name IN ('Production Infrastructure', 'Resource & Risk Management');

UPDATE orch_flow.efforts SET team_id = (SELECT id FROM public.teams WHERE name = 'AI Evangelists' LIMIT 1)
WHERE name IN ('Community & Content', 'Developer Resources', 'Comprehensive Documentation');

UPDATE orch_flow.efforts SET team_id = (SELECT id FROM public.teams WHERE name = 'AI Data' LIMIT 1)
WHERE name IN ('Analytics & Reporting', 'Data Infrastructure Setup', 'Data Quality & Governance');

UPDATE orch_flow.efforts SET team_id = (SELECT id FROM public.teams WHERE name = 'AI SLT' LIMIT 1)
WHERE name IN ('Strategic AI Initiative');

-- Note: This migration enables team-based filtering of efforts
-- Efforts are now associated with specific teams via team_id
-- Future efforts created by seeding scripts will automatically include team_id

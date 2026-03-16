-- Update RLS policies to support team-scoped efforts (organization_slug IS NULL)
-- Migration: Allow viewing/modifying efforts that are team-scoped OR org-scoped

-- Drop old organization-only policies
DROP POLICY IF EXISTS "Users can view efforts in their org" ON orch_flow.efforts;
DROP POLICY IF EXISTS "Users can create efforts in their org" ON orch_flow.efforts;
DROP POLICY IF EXISTS "Users can update efforts in their org" ON orch_flow.efforts;
DROP POLICY IF EXISTS "Users can delete efforts in their org" ON orch_flow.efforts;

-- Create new policies that allow team-scoped (NULL org) AND org-scoped efforts
CREATE POLICY "Users can view team-scoped or org efforts" ON orch_flow.efforts
  FOR SELECT
  USING (
    organization_slug IS NULL  -- Team-scoped efforts (global)
    OR 
    organization_slug IN (
      SELECT organization_slug FROM public.users WHERE id = auth.uid()
    )  -- Or efforts in user's organization
  );

CREATE POLICY "Users can create team-scoped or org efforts" ON orch_flow.efforts
  FOR INSERT
  WITH CHECK (
    organization_slug IS NULL  -- Team-scoped efforts (global)
    OR 
    organization_slug IN (
      SELECT organization_slug FROM public.users WHERE id = auth.uid()
    )  -- Or efforts in user's organization
  );

CREATE POLICY "Users can update team-scoped or org efforts" ON orch_flow.efforts
  FOR UPDATE
  USING (
    organization_slug IS NULL  -- Team-scoped efforts (global)
    OR 
    organization_slug IN (
      SELECT organization_slug FROM public.users WHERE id = auth.uid()
    )  -- Or efforts in user's organization
  );

CREATE POLICY "Users can delete team-scoped or org efforts" ON orch_flow.efforts
  FOR DELETE
  USING (
    organization_slug IS NULL  -- Team-scoped efforts (global)
    OR 
    organization_slug IN (
      SELECT organization_slug FROM public.users WHERE id = auth.uid()
    )  -- Or efforts in user's organization
  );

-- Note: This migration enables team-scoped content management
-- Efforts with organization_slug = NULL are visible to all authenticated users
-- Efforts with a specific organization_slug are only visible to users in that org

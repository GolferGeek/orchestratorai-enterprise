-- =============================================================================
-- Make organization_slug nullable in orch_flow.efforts
-- =============================================================================
-- Teams are global and content should be team-scoped, not org-scoped
-- This allows efforts to exist without requiring an organization

-- Drop the NOT NULL constraint
ALTER TABLE orch_flow.efforts 
  ALTER COLUMN organization_slug DROP NOT NULL;

-- Drop the foreign key constraint (we'll recreate it as optional)
ALTER TABLE orch_flow.efforts 
  DROP CONSTRAINT IF EXISTS efforts_organization_slug_fkey;

-- Recreate the foreign key constraint as optional (allows NULL)
ALTER TABLE orch_flow.efforts 
  ADD CONSTRAINT efforts_organization_slug_fkey 
  FOREIGN KEY (organization_slug) 
  REFERENCES public.organizations(slug) 
  ON DELETE CASCADE;

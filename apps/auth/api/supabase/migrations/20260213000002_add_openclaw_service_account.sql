-- Migration: Add OpenClaw service account to RBAC system
-- Date: 2026-02-13
-- Description: Creates RBAC assignment for openclaw@orchestratorai.io
--              with admin role on star org (*) for cross-org API access
--
-- Note: The Supabase auth user must be created first via:
--   supabase auth admin create-user --email openclaw@orchestratorai.io --password <password>
-- This migration handles the RBAC assignment only.

-- Ensure user exists in public.users with star org
UPDATE public.users
SET organization_slug = '*'
WHERE email = 'openclaw@orchestratorai.io'
  AND organization_slug IS NULL;

DO $$
DECLARE
  v_openclaw_user_id UUID;
  v_admin_role_id UUID;
BEGIN
  -- Get OpenClaw user ID
  SELECT id INTO v_openclaw_user_id FROM public.users WHERE email = 'openclaw@orchestratorai.io';

  -- Get admin role ID
  SELECT id INTO v_admin_role_id FROM rbac_roles WHERE name = 'admin';

  -- Assign OpenClaw as admin of star org (cross-org visibility)
  IF v_openclaw_user_id IS NOT NULL AND v_admin_role_id IS NOT NULL THEN
    INSERT INTO rbac_user_org_roles (user_id, organization_slug, role_id, assigned_by)
    VALUES (v_openclaw_user_id, '*', v_admin_role_id, v_openclaw_user_id)
    ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;
  END IF;
END $$;

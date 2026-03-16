-- Migration: Add demo and admin users to RBAC system
-- Date: 2025-12-04
-- Description: Assigns demo.user@orchestratorai.io and admin@orchestratorai.io
--              to all orgs (*) with appropriate roles

-- First, update the users table to set their organization
UPDATE public.users
SET organization_slug = '*'
WHERE email IN ('demo.user@orchestratorai.io', 'admin@orchestratorai.io')
  AND organization_slug IS NULL;

-- Get the role IDs we need
DO $$
DECLARE
  v_demo_user_id UUID;
  v_admin_user_id UUID;
  v_member_role_id UUID;
  v_admin_role_id UUID;
BEGIN
  -- Get user IDs
  SELECT id INTO v_demo_user_id FROM public.users WHERE email = 'demo.user@orchestratorai.io';
  SELECT id INTO v_admin_user_id FROM public.users WHERE email = 'admin@orchestratorai.io';

  -- Get role IDs
  SELECT id INTO v_member_role_id FROM rbac_roles WHERE name = 'member';
  SELECT id INTO v_admin_role_id FROM rbac_roles WHERE name = 'admin';

  -- Assign demo user as member of demo-org (if user exists)
  IF v_demo_user_id IS NOT NULL AND v_member_role_id IS NOT NULL THEN
    INSERT INTO rbac_user_org_roles (user_id, organization_slug, role_id, assigned_by)
    VALUES (v_demo_user_id, '*', v_member_role_id, v_demo_user_id)
    ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;
  END IF;

  -- Assign admin user as admin of demo-org (if user exists)
  IF v_admin_user_id IS NOT NULL AND v_admin_role_id IS NOT NULL THEN
    INSERT INTO rbac_user_org_roles (user_id, organization_slug, role_id, assigned_by)
    VALUES (v_admin_user_id, '*', v_admin_role_id, v_admin_user_id)
    ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;
  END IF;
END $$;

-- Migration: Update super-admin organization_slug from 'global' to '*'
-- Super-admin should use '*' to indicate global access across all organizations
-- This aligns with the schema design where '*' means global/super-admin access

DO $$
DECLARE
  v_super_admin_role_id UUID;
  v_updated_count INTEGER;
BEGIN
  -- Get the super-admin role ID
  SELECT id INTO v_super_admin_role_id FROM rbac_roles WHERE name = 'super-admin';
  
  IF v_super_admin_role_id IS NULL THEN
    RAISE NOTICE 'Super-admin role not found - skipping migration';
    RETURN;
  END IF;

  -- Update any super-admin role assignments with organization_slug = 'global' to '*'
  UPDATE rbac_user_org_roles
  SET organization_slug = '*'
  WHERE role_id = v_super_admin_role_id
    AND organization_slug = 'global';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RAISE NOTICE 'Updated % super-admin role assignment(s) from "global" to "*"', v_updated_count;
END $$;


-- Migration: Assign admin roles to specific users
-- admin@orchestratorai.io -> admin role for all orgs
-- golfergeek@golfergeek.com -> super-admin role (global)

-- Get role IDs
DO $$
DECLARE
  v_admin_user_id UUID := '43432813-7b99-44c0-b094-7c7f20305939';
  v_golfergeek_user_id UUID := 'b894f14e-1937-4831-8b1e-195e7535d859';
  v_admin_role_id UUID;
  v_super_admin_role_id UUID;
  v_org RECORD;
BEGIN
  -- Get role IDs
  SELECT id INTO v_admin_role_id FROM rbac_roles WHERE name = 'admin';
  SELECT id INTO v_super_admin_role_id FROM rbac_roles WHERE name = 'super-admin';

  -- Assign super-admin to golfergeek for global org
  INSERT INTO rbac_user_org_roles (user_id, organization_slug, role_id, assigned_by)
  VALUES (v_golfergeek_user_id, 'global', v_super_admin_role_id, v_golfergeek_user_id)
  ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;

  -- Assign admin role to admin@orchestratorai.io for all organizations
  FOR v_org IN SELECT slug FROM organizations LOOP
    INSERT INTO rbac_user_org_roles (user_id, organization_slug, role_id, assigned_by)
    VALUES (v_admin_user_id, v_org.slug, v_admin_role_id, v_golfergeek_user_id)
    ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;
  END LOOP;

  -- Also give golfergeek super-admin in all orgs for convenience
  FOR v_org IN SELECT slug FROM organizations LOOP
    INSERT INTO rbac_user_org_roles (user_id, organization_slug, role_id, assigned_by)
    VALUES (v_golfergeek_user_id, v_org.slug, v_super_admin_role_id, v_golfergeek_user_id)
    ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Assigned admin role to admin@orchestratorai.io for all orgs';
  RAISE NOTICE 'Assigned super-admin role to golfergeek@golfergeek.com for all orgs';
END $$;

-- Add the organization-user RBAC helper used by the unified admin module.
-- Returns users with roles in the requested organization plus users with
-- global (*) roles, preserving whether each returned role is global.

CREATE OR REPLACE FUNCTION authz.rbac_get_organization_users(
  p_organization_slug varchar
)
RETURNS TABLE(
  user_id uuid,
  email varchar,
  display_name varchar,
  role_id uuid,
  role_name varchar,
  role_display_name varchar,
  is_global boolean,
  assigned_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'authz', 'public'
AS $$
  SELECT
    u.id AS user_id,
    u.email,
    u.display_name,
    r.id AS role_id,
    r.name AS role_name,
    r.display_name AS role_display_name,
    (uor.organization_slug = '*') AS is_global,
    uor.assigned_at,
    uor.expires_at
  FROM authz.rbac_user_org_roles uor
  JOIN authz.users u ON u.id = uor.user_id
  JOIN authz.rbac_roles r ON r.id = uor.role_id
  WHERE (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
    AND (uor.expires_at IS NULL OR uor.expires_at > now())
    AND u.status = 'active'
  ORDER BY u.email, is_global DESC, r.name;
$$;

GRANT EXECUTE ON FUNCTION authz.rbac_get_organization_users(varchar)
  TO anon, authenticated, service_role;

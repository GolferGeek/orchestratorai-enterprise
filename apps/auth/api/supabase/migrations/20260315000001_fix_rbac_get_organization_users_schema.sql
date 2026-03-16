-- Migration: Fix rbac_get_organization_users to use authz schema
-- Date: 2026-03-15
-- Description: The function was left in public schema referencing public.users,
--              but users table was moved to authz.users. This creates the function
--              in authz schema with correct table references and drops the broken public version.

-- Drop the broken public version
DROP FUNCTION IF EXISTS public.rbac_get_organization_users(character varying);

-- Create the function in authz schema with correct references
CREATE OR REPLACE FUNCTION authz.rbac_get_organization_users(
    p_organization_slug VARCHAR(255)
)
RETURNS TABLE (
    user_id UUID,
    email TEXT,
    display_name TEXT,
    role_id UUID,
    role_name VARCHAR(100),
    role_display_name VARCHAR(255),
    is_global BOOLEAN,
    assigned_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
    SELECT DISTINCT
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
    JOIN authz.users u ON uor.user_id = u.id
    JOIN authz.rbac_roles r ON uor.role_id = r.id
    WHERE (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
      AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ORDER BY u.email, r.name;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION authz.rbac_get_organization_users(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION authz.rbac_get_organization_users(VARCHAR) TO service_role;

COMMENT ON FUNCTION authz.rbac_get_organization_users IS 'Returns all users in an organization with their assigned roles. Includes users with global access (*). Lives in authz schema.';

-- Migration: Add function to get all users in an organization with their roles
-- Date: 2025-12-04
-- Description: Creates rbac_get_organization_users function to retrieve all users
--              belonging to a specific organization along with their role information

-- -----------------------------------------------------------------------------
-- GET ORGANIZATION USERS WITH ROLES
-- -----------------------------------------------------------------------------
-- Returns all users in a specific organization with their role details

CREATE OR REPLACE FUNCTION rbac_get_organization_users(
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
    FROM rbac_user_org_roles uor
    JOIN public.users u ON uor.user_id = u.id
    JOIN rbac_roles r ON uor.role_id = r.id
    WHERE (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
      AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ORDER BY u.email, r.name;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION rbac_get_organization_users(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION rbac_get_organization_users(VARCHAR) TO service_role;

-- Comment on function
COMMENT ON FUNCTION rbac_get_organization_users IS 'Returns all users in an organization with their assigned roles. Includes users with global access (*).';

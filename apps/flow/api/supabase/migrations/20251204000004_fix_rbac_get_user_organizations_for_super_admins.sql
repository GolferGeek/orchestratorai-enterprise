-- Migration: Fix rbac_get_user_organizations to return actual orgs for super-admins
-- Date: 2025-12-04
-- Description: When a user has organization_slug = '*' (global access), return all actual
--              organizations instead of a virtual "all" organization. This allows super-admins
--              to select which organization to view/manage in the UI.

DROP FUNCTION IF EXISTS rbac_get_user_organizations(UUID);

CREATE OR REPLACE FUNCTION rbac_get_user_organizations(
    p_user_id UUID
)
RETURNS TABLE (
    organization_slug VARCHAR(255),
    organization_name TEXT,
    role_name VARCHAR(100),
    is_global BOOLEAN
)
LANGUAGE sql STABLE
AS $$
    -- If user has global access (*), return all actual organizations
    WITH user_has_global AS (
        SELECT EXISTS(
            SELECT 1
            FROM rbac_user_org_roles
            WHERE user_id = p_user_id
              AND organization_slug = '*'
              AND (expires_at IS NULL OR expires_at > NOW())
        ) AS has_global
    ),
    global_role AS (
        SELECT r.name AS role_name
        FROM rbac_user_org_roles uor
        JOIN rbac_roles r ON uor.role_id = r.id
        WHERE uor.user_id = p_user_id
          AND uor.organization_slug = '*'
          AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
        LIMIT 1
    )
    SELECT DISTINCT
        CASE
            WHEN (SELECT has_global FROM user_has_global) THEN o.slug
            ELSE uor.organization_slug
        END AS organization_slug,
        CASE
            WHEN (SELECT has_global FROM user_has_global) THEN o.name
            ELSE o.name
        END AS organization_name,
        CASE
            WHEN (SELECT has_global FROM user_has_global) THEN (SELECT role_name FROM global_role)
            ELSE r.name
        END AS role_name,
        (SELECT has_global FROM user_has_global) AS is_global
    FROM (
        SELECT has_global FROM user_has_global
    ) ug
    CROSS JOIN organizations o
    LEFT JOIN rbac_user_org_roles uor ON uor.organization_slug = o.slug AND uor.user_id = p_user_id
    LEFT JOIN rbac_roles r ON uor.role_id = r.id
    WHERE (SELECT has_global FROM user_has_global)
       OR (uor.user_id = p_user_id AND (uor.expires_at IS NULL OR uor.expires_at > NOW()))
    ORDER BY organization_slug;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION rbac_get_user_organizations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rbac_get_user_organizations(UUID) TO service_role;

-- Comment
COMMENT ON FUNCTION rbac_get_user_organizations IS 'Returns all organizations a user has access to. For global users (*), returns all actual organizations instead of a virtual "all" entry.';

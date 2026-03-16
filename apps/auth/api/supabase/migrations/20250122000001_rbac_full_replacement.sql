-- =============================================================================
-- RBAC FULL REPLACEMENT MIGRATION
-- =============================================================================
-- This migration creates a complete RBAC system and migrates from the legacy
-- role system to organization-scoped, permission-based access control.
-- =============================================================================

-- =============================================================================
-- STEP 1: Create RBAC Tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLES TABLE
-- -----------------------------------------------------------------------------
-- Defines available roles in the system
-- Roles are global (not per-org) - the same "admin" role exists everywhere

CREATE TABLE IF NOT EXISTS rbac_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT false,  -- System roles cannot be deleted
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_rbac_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rbac_roles_updated_at
    BEFORE UPDATE ON rbac_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_rbac_roles_updated_at();


-- -----------------------------------------------------------------------------
-- PERMISSIONS TABLE
-- -----------------------------------------------------------------------------
-- Defines available permissions (actions)
-- Format: resource:action (e.g., rag:read, agents:execute, admin:users)

CREATE TABLE IF NOT EXISTS rbac_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),  -- For UI grouping: 'rag', 'agents', 'admin', etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- -----------------------------------------------------------------------------
-- ROLE-PERMISSION MAPPING
-- -----------------------------------------------------------------------------
-- Links roles to permissions
-- Can optionally scope to specific resources

CREATE TABLE IF NOT EXISTS rbac_role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES rbac_permissions(id) ON DELETE CASCADE,

    -- Resource scoping (NULL = all resources of this type in org)
    resource_type VARCHAR(100),  -- 'collection', 'document', 'agent', etc.
    resource_id UUID,            -- Specific resource ID (NULL = all)

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate assignments
    UNIQUE(role_id, permission_id, resource_type, resource_id)
);

-- Create index for permission lookups
CREATE INDEX idx_role_permissions_role ON rbac_role_permissions(role_id);
CREATE INDEX idx_role_permissions_resource ON rbac_role_permissions(resource_type, resource_id)
    WHERE resource_type IS NOT NULL;


-- -----------------------------------------------------------------------------
-- USER-ORGANIZATION-ROLE MAPPING
-- -----------------------------------------------------------------------------
-- Links users to organizations with specific roles
-- organization_slug = '*' means global access (super-admin)

CREATE TABLE IF NOT EXISTS rbac_user_org_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_slug VARCHAR(255) NOT NULL,  -- '*' for global/super-admin
    role_id UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,

    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,  -- Optional expiration

    -- Prevent duplicate role assignments
    UNIQUE(user_id, organization_slug, role_id)
);

-- Create indexes for lookups
CREATE INDEX idx_user_org_roles_user ON rbac_user_org_roles(user_id);
CREATE INDEX idx_user_org_roles_org ON rbac_user_org_roles(organization_slug);
CREATE INDEX idx_user_org_roles_user_org ON rbac_user_org_roles(user_id, organization_slug);


-- -----------------------------------------------------------------------------
-- PERMISSION AUDIT LOG
-- -----------------------------------------------------------------------------
-- Track all permission changes for compliance

CREATE TABLE IF NOT EXISTS rbac_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(50) NOT NULL,  -- 'grant', 'revoke', 'role_created', etc.
    actor_id UUID REFERENCES auth.users(id),
    target_user_id UUID REFERENCES auth.users(id),
    target_role_id UUID REFERENCES rbac_roles(id),
    organization_slug VARCHAR(255),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rbac_audit_created ON rbac_audit_log(created_at DESC);
CREATE INDEX idx_rbac_audit_actor ON rbac_audit_log(actor_id);
CREATE INDEX idx_rbac_audit_target ON rbac_audit_log(target_user_id);


-- =============================================================================
-- STEP 2: Seed Roles
-- =============================================================================

INSERT INTO rbac_roles (name, display_name, description, is_system) VALUES
    ('super-admin', 'Super Administrator', 'Full access to all organizations and resources', true),
    ('admin', 'Administrator', 'Full access within assigned organization', true),
    ('manager', 'Manager', 'Can manage users and resources within organization', true),
    ('member', 'Member', 'Standard access within organization', true),
    ('viewer', 'Viewer', 'Read-only access within organization', true)
ON CONFLICT (name) DO NOTHING;


-- =============================================================================
-- STEP 3: Seed Permissions
-- =============================================================================

INSERT INTO rbac_permissions (name, display_name, category, description) VALUES
    -- Wildcard permissions
    ('*:*', 'Full Access', 'system', 'Complete access to everything'),

    -- RAG permissions
    ('rag:read', 'Read RAG', 'rag', 'Query RAG collections and view documents'),
    ('rag:write', 'Write RAG', 'rag', 'Upload documents and manage collections'),
    ('rag:delete', 'Delete RAG', 'rag', 'Delete documents and collections'),
    ('rag:admin', 'Administer RAG', 'rag', 'Full RAG administration'),

    -- Agent permissions
    ('agents:execute', 'Execute Agents', 'agents', 'Run agent conversations'),
    ('agents:manage', 'Manage Agents', 'agents', 'Create and configure agents'),
    ('agents:admin', 'Administer Agents', 'agents', 'Full agent administration'),

    -- Admin permissions
    ('admin:users', 'Manage Users', 'admin', 'Invite and manage organization users'),
    ('admin:roles', 'Manage Roles', 'admin', 'Assign roles to users'),
    ('admin:settings', 'Manage Settings', 'admin', 'Configure organization settings'),
    ('admin:billing', 'Manage Billing', 'admin', 'View and manage billing'),
    ('admin:audit', 'View Audit Logs', 'admin', 'Access audit and usage logs'),

    -- LLM permissions
    ('llm:use', 'Use LLM', 'llm', 'Make LLM API calls'),
    ('llm:admin', 'Administer LLM', 'llm', 'Configure models and usage limits'),

    -- Deliverables permissions
    ('deliverables:read', 'Read Deliverables', 'deliverables', 'View deliverables'),
    ('deliverables:write', 'Write Deliverables', 'deliverables', 'Create and edit deliverables'),
    ('deliverables:delete', 'Delete Deliverables', 'deliverables', 'Delete deliverables')
ON CONFLICT (name) DO NOTHING;


-- =============================================================================
-- STEP 4: Seed Role-Permission Mappings
-- =============================================================================

-- Super-admin gets everything
INSERT INTO rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM rbac_roles r, rbac_permissions p
WHERE r.name = 'super-admin' AND p.name = '*:*'
ON CONFLICT DO NOTHING;

-- Admin gets most permissions (within their org)
INSERT INTO rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM rbac_roles r, rbac_permissions p
WHERE r.name = 'admin'
  AND p.name IN ('rag:admin', 'agents:admin', 'admin:users', 'admin:roles',
                 'admin:settings', 'admin:audit', 'llm:admin',
                 'deliverables:read', 'deliverables:write', 'deliverables:delete')
ON CONFLICT DO NOTHING;

-- Manager gets operational permissions
INSERT INTO rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM rbac_roles r, rbac_permissions p
WHERE r.name = 'manager'
  AND p.name IN ('rag:read', 'rag:write', 'agents:execute', 'agents:manage',
                 'admin:users', 'llm:use', 'deliverables:read', 'deliverables:write')
ON CONFLICT DO NOTHING;

-- Member gets standard access
INSERT INTO rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM rbac_roles r, rbac_permissions p
WHERE r.name = 'member'
  AND p.name IN ('rag:read', 'agents:execute', 'llm:use',
                 'deliverables:read', 'deliverables:write')
ON CONFLICT DO NOTHING;

-- Viewer gets read-only
INSERT INTO rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM rbac_roles r, rbac_permissions p
WHERE r.name = 'viewer'
  AND p.name IN ('rag:read', 'deliverables:read')
ON CONFLICT DO NOTHING;


-- =============================================================================
-- STEP 5: Create Permission Check Functions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PERMISSION CHECK FUNCTION
-- -----------------------------------------------------------------------------
-- Returns TRUE if user has the specified permission in the organization
-- Handles wildcards, resource scoping, and super-admin

CREATE OR REPLACE FUNCTION rbac_has_permission(
    p_user_id UUID,
    p_organization_slug VARCHAR(255),
    p_permission VARCHAR(100),
    p_resource_type VARCHAR(100) DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_has_permission BOOLEAN := FALSE;
    v_permission_parts TEXT[];
    v_permission_category TEXT;
BEGIN
    -- Parse permission into category:action
    v_permission_parts := string_to_array(p_permission, ':');
    v_permission_category := v_permission_parts[1];

    -- Check for permission (including wildcards and resource scoping)
    SELECT EXISTS(
        SELECT 1
        FROM rbac_user_org_roles uor
        JOIN rbac_role_permissions rp ON uor.role_id = rp.role_id
        JOIN rbac_permissions p ON rp.permission_id = p.id
        WHERE uor.user_id = p_user_id
          -- Organization check: user's org matches OR user has global access ('*')
          AND (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
          -- Not expired
          AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
          -- Permission check: exact match, category wildcard, or full wildcard
          AND (
              p.name = p_permission                           -- Exact: rag:read
              OR p.name = v_permission_category || ':*'       -- Category wildcard: rag:*
              OR p.name = '*:*'                               -- Full wildcard
          )
          -- Resource scoping: NULL means all, or must match specific resource
          AND (
              rp.resource_type IS NULL                        -- No resource restriction
              OR (
                  rp.resource_type = p_resource_type
                  AND (rp.resource_id IS NULL OR rp.resource_id = p_resource_id)
              )
          )
    ) INTO v_has_permission;

    RETURN v_has_permission;
END;
$$;


-- -----------------------------------------------------------------------------
-- GET USER'S EFFECTIVE PERMISSIONS
-- -----------------------------------------------------------------------------
-- Returns all permissions a user has in an organization (for UI display)

CREATE OR REPLACE FUNCTION rbac_get_user_permissions(
    p_user_id UUID,
    p_organization_slug VARCHAR(255)
)
RETURNS TABLE (
    permission_name VARCHAR(100),
    resource_type VARCHAR(100),
    resource_id UUID
)
LANGUAGE sql STABLE
AS $$
    SELECT DISTINCT
        p.name AS permission_name,
        rp.resource_type,
        rp.resource_id
    FROM rbac_user_org_roles uor
    JOIN rbac_role_permissions rp ON uor.role_id = rp.role_id
    JOIN rbac_permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = p_user_id
      AND (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
      AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ORDER BY p.name;
$$;


-- -----------------------------------------------------------------------------
-- GET USER'S ROLES IN ORGANIZATION
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rbac_get_user_roles(
    p_user_id UUID,
    p_organization_slug VARCHAR(255)
)
RETURNS TABLE (
    role_id UUID,
    role_name VARCHAR(100),
    role_display_name VARCHAR(255),
    is_global BOOLEAN,
    assigned_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
    SELECT
        r.id AS role_id,
        r.name AS role_name,
        r.display_name AS role_display_name,
        (uor.organization_slug = '*') AS is_global,
        uor.assigned_at,
        uor.expires_at
    FROM rbac_user_org_roles uor
    JOIN rbac_roles r ON uor.role_id = r.id
    WHERE uor.user_id = p_user_id
      AND (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
      AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ORDER BY r.name;
$$;


-- -----------------------------------------------------------------------------
-- GET USER'S ORGANIZATIONS
-- -----------------------------------------------------------------------------
-- Returns all organizations a user has access to

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
    SELECT DISTINCT
        CASE WHEN uor.organization_slug = '*' THEN 'all' ELSE uor.organization_slug END AS organization_slug,
        COALESCE(o.name, 'All Organizations') AS organization_name,
        r.name AS role_name,
        (uor.organization_slug = '*') AS is_global
    FROM rbac_user_org_roles uor
    JOIN rbac_roles r ON uor.role_id = r.id
    LEFT JOIN organizations o ON uor.organization_slug = o.slug
    WHERE uor.user_id = p_user_id
      AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ORDER BY is_global DESC, organization_slug;
$$;


-- =============================================================================
-- STEP 6: Migrate Existing User Data
-- =============================================================================

-- Migrate existing users to the new RBAC system
-- Map old roles to new roles
INSERT INTO rbac_user_org_roles (user_id, organization_slug, role_id, assigned_by)
SELECT
    u.id,
    COALESCE(u.organization_slug, 'demo-org'),
    r.id,
    u.id
FROM public.users u
CROSS JOIN LATERAL (
    SELECT jsonb_array_elements_text(u.roles) AS old_role
) roles
JOIN rbac_roles r ON (
    CASE roles.old_role
        WHEN 'admin' THEN 'admin'
        WHEN 'developer' THEN 'manager'
        WHEN 'evaluation-monitor' THEN 'viewer'
        WHEN 'beta-tester' THEN 'member'
        WHEN 'support' THEN 'member'
        WHEN 'user' THEN 'member'
        ELSE 'member'
    END = r.name
)
ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;


-- =============================================================================
-- STEP 7: Drop Legacy Columns
-- =============================================================================

-- Remove legacy columns from users table
ALTER TABLE public.users DROP COLUMN IF EXISTS role;
ALTER TABLE public.users DROP COLUMN IF EXISTS roles;
ALTER TABLE public.users DROP COLUMN IF EXISTS namespace_access;

-- Drop the now-unused index
DROP INDEX IF EXISTS users_role_idx;


-- =============================================================================
-- Success notification
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'RBAC Migration Complete';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  - rbac_roles (5 system roles)';
    RAISE NOTICE '  - rbac_permissions (18 permissions)';
    RAISE NOTICE '  - rbac_role_permissions (role->permission mappings)';
    RAISE NOTICE '  - rbac_user_org_roles (user->org->role mappings)';
    RAISE NOTICE '  - rbac_audit_log (change tracking)';
    RAISE NOTICE '';
    RAISE NOTICE 'Functions created:';
    RAISE NOTICE '  - rbac_has_permission()';
    RAISE NOTICE '  - rbac_get_user_permissions()';
    RAISE NOTICE '  - rbac_get_user_roles()';
    RAISE NOTICE '  - rbac_get_user_organizations()';
    RAISE NOTICE '';
    RAISE NOTICE 'Legacy columns dropped:';
    RAISE NOTICE '  - users.role';
    RAISE NOTICE '  - users.roles';
    RAISE NOTICE '  - users.namespace_access';
    RAISE NOTICE '================================================';
END $$;

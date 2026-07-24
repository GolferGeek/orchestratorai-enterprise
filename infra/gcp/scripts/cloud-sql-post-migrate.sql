-- =============================================================================
-- CLOUD SQL POST-MIGRATION FIXUP
-- =============================================================================
-- Run AFTER the Supabase migrations to fix tables that failed due to
-- missing auth.users foreign-key target.
--
-- With the bootstrap script creating auth.users stub FIRST, these fixups
-- should not be needed. This script is kept as a safety net.
--
-- Usage (as postgres superuser):
--   psql "host=<IP> dbname=orchestrator_ai user=postgres sslmode=require" \
--     -f cloud-sql-post-migrate.sql
-- =============================================================================

-- 1) Ensure authz.users exists (may not have been created if auth.users was missing)
CREATE TABLE IF NOT EXISTS authz.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    roles JSONB NOT NULL DEFAULT '["user"]'::jsonb,
    namespace_access JSONB NOT NULL DEFAULT '[]'::jsonb,
    organization_slug VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON authz.users(email);
CREATE INDEX IF NOT EXISTS users_organization_slug_idx ON authz.users(organization_slug);
CREATE INDEX IF NOT EXISTS users_status_idx ON authz.users(status);
CREATE INDEX IF NOT EXISTS users_role_idx ON authz.users(role);

CREATE OR REPLACE FUNCTION authz.update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON authz.users;
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON authz.users
    FOR EACH ROW
    EXECUTE FUNCTION authz.update_users_updated_at();

-- 2) Ensure authz.auth_identity_links exists (maps external OIDC identities to internal users)
CREATE TABLE IF NOT EXISTS authz.auth_identity_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    issuer TEXT NOT NULL,
    subject TEXT NOT NULL,
    email TEXT,
    raw_claims JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (issuer, subject)
);

CREATE INDEX IF NOT EXISTS idx_auth_identity_links_user_id ON authz.auth_identity_links(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_identity_links_issuer_subject ON authz.auth_identity_links(issuer, subject);

-- 3) Ensure authz.rbac_user_org_roles exists (maps users to roles within orgs)
CREATE TABLE IF NOT EXISTS authz.rbac_user_org_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES authz.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES authz.rbac_roles(id) ON DELETE CASCADE,
    organization_slug VARCHAR(255) NOT NULL,
    assigned_by UUID,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    UNIQUE (user_id, role_id, organization_slug)
);

CREATE INDEX IF NOT EXISTS idx_rbac_user_org_roles_user_id ON authz.rbac_user_org_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_rbac_user_org_roles_org_slug ON authz.rbac_user_org_roles(organization_slug);

-- 4) Ensure authz.rbac_audit_log exists
CREATE TABLE IF NOT EXISTS authz.rbac_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID,
    action VARCHAR(100) NOT NULL,
    target_user_id UUID,
    target_role_id UUID,
    organization_slug VARCHAR(255),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_actor ON authz.rbac_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_target ON authz.rbac_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_created ON authz.rbac_audit_log(created_at);

-- 5) RBAC stored functions in authz schema
CREATE OR REPLACE FUNCTION authz.rbac_has_permission(
    p_user_id UUID,
    p_organization_slug VARCHAR(255),
    p_permission VARCHAR(100),
    p_resource_type VARCHAR(100) DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = authz, public
AS $$
DECLARE
    v_has_permission BOOLEAN := FALSE;
    v_permission_parts TEXT[];
    v_permission_category TEXT;
BEGIN
    v_permission_parts := string_to_array(p_permission, ':');
    v_permission_category := v_permission_parts[1];
    SELECT EXISTS(
        SELECT 1
        FROM rbac_user_org_roles uor
        JOIN rbac_role_permissions rp ON uor.role_id = rp.role_id
        JOIN rbac_permissions p ON rp.permission_id = p.id
        WHERE uor.user_id = p_user_id
          AND (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
          AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
          AND (p.name = p_permission OR p.name = v_permission_category || ':*' OR p.name = '*:*')
          AND (rp.resource_type IS NULL
               OR (rp.resource_type = p_resource_type
                   AND (rp.resource_id IS NULL OR rp.resource_id = p_resource_id)))
    ) INTO v_has_permission;
    RETURN v_has_permission;
END;
$$;

CREATE OR REPLACE FUNCTION authz.rbac_get_user_permissions(
    p_user_id UUID,
    p_organization_slug VARCHAR(255)
)
RETURNS TABLE (permission_name VARCHAR(100), resource_type VARCHAR(100), resource_id UUID)
LANGUAGE sql STABLE
SET search_path = authz, public
AS $$
    SELECT DISTINCT p.name, rp.resource_type, rp.resource_id
    FROM rbac_user_org_roles uor
    JOIN rbac_role_permissions rp ON uor.role_id = rp.role_id
    JOIN rbac_permissions p ON rp.permission_id = p.id
    WHERE uor.user_id = p_user_id
      AND (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
      AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ORDER BY p.name;
$$;

CREATE OR REPLACE FUNCTION authz.rbac_get_user_roles(
    p_user_id UUID,
    p_organization_slug VARCHAR(255)
)
RETURNS TABLE (role_id UUID, role_name VARCHAR(100), role_display_name VARCHAR(255), is_global BOOLEAN, assigned_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)
LANGUAGE sql STABLE
SET search_path = authz, public
AS $$
    SELECT r.id, r.name, r.display_name, (uor.organization_slug = '*'), uor.assigned_at, uor.expires_at
    FROM rbac_user_org_roles uor
    JOIN rbac_roles r ON uor.role_id = r.id
    WHERE uor.user_id = p_user_id
      AND (uor.organization_slug = p_organization_slug OR uor.organization_slug = '*')
      AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
    ORDER BY r.name;
$$;

CREATE OR REPLACE FUNCTION authz.rbac_get_user_organizations(p_user_id UUID)
RETURNS TABLE (organization_slug VARCHAR(255), organization_name TEXT, role_name VARCHAR(100), is_global BOOLEAN)
LANGUAGE sql STABLE
SET search_path = authz, public
AS $$
    WITH user_has_global AS (
        SELECT EXISTS(
            SELECT 1 FROM rbac_user_org_roles
            WHERE user_id = p_user_id AND organization_slug = '*'
              AND (expires_at IS NULL OR expires_at > NOW())
        ) AS has_global
    ),
    global_role AS (
        SELECT r.name AS role_name
        FROM rbac_user_org_roles uor JOIN rbac_roles r ON uor.role_id = r.id
        WHERE uor.user_id = p_user_id AND uor.organization_slug = '*'
          AND (uor.expires_at IS NULL OR uor.expires_at > NOW())
        LIMIT 1
    )
    SELECT DISTINCT
        CASE WHEN (SELECT has_global FROM user_has_global) THEN o.slug ELSE uor.organization_slug END,
        o.name,
        CASE WHEN (SELECT has_global FROM user_has_global) THEN (SELECT role_name FROM global_role) ELSE r.name END,
        (SELECT has_global FROM user_has_global)
    FROM (SELECT has_global FROM user_has_global) ug
    CROSS JOIN public.organizations o
    LEFT JOIN rbac_user_org_roles uor ON uor.organization_slug = o.slug AND uor.user_id = p_user_id
    LEFT JOIN rbac_roles r ON uor.role_id = r.id
    WHERE (SELECT has_global FROM user_has_global)
       OR (uor.user_id = p_user_id AND (uor.expires_at IS NULL OR uor.expires_at > NOW()))
    ORDER BY 1;
$$;

-- 6) Grant all schema access to orchestrator_app
DO $$
DECLARE
  s text;
  t record;
BEGIN
  FOR s IN SELECT schema_name FROM information_schema.schemata
           WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
  LOOP
    EXECUTE format('GRANT USAGE, CREATE ON SCHEMA %I TO orchestrator_app', s);
    EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO orchestrator_app', s);
    -- Grant table-by-table, skipping tables already owned by orchestrator_app
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = s AND tableowner != 'orchestrator_app'
    LOOP
      EXECUTE format('GRANT ALL ON TABLE %I.%I TO orchestrator_app', s, t.tablename);
    END LOOP;
  END LOOP;
END
$$;

-- 7) Set default privileges for future tables
DO $$
DECLARE
  s text;
BEGIN
  FOR s IN SELECT schema_name FROM information_schema.schemata
           WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
  LOOP
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO orchestrator_app', s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON SEQUENCES TO orchestrator_app', s);
  END LOOP;
END
$$;

-- 8) Verify
DO $$
BEGIN
  RAISE NOTICE '=== Post-Migration Fixup Complete ===';
  RAISE NOTICE 'authz.users table ensured';
  RAISE NOTICE 'Grants applied to all schemas';
END
$$;

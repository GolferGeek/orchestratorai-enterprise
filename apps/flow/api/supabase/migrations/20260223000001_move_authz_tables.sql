-- =============================================================================
-- MOVE AUTH/RBAC TABLES TO authz SCHEMA
-- =============================================================================
-- Moves users and rbac_* tables from public to authz schema.
-- This aligns with the provider planes architecture where the code already
-- queries .from('authz', 'users') etc.
-- Made idempotent: skips ALTER TABLE if tables already live in authz.
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: Move tables (order matters: parent tables first)
-- =============================================================================
-- Only move if the public version is a real table (not a view) and authz doesn't have it yet.

DO $$
DECLARE
  v_tables TEXT[] := ARRAY['users', 'rbac_roles', 'rbac_permissions', 'rbac_role_permissions', 'rbac_user_org_roles', 'rbac_audit_log'];
  v_tbl TEXT;
  v_relkind CHAR;
BEGIN
  FOREACH v_tbl IN ARRAY v_tables LOOP
    SELECT c.relkind INTO v_relkind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = v_tbl;

    IF v_relkind = 'r' THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'authz' AND c.relname = v_tbl
      ) THEN
        EXECUTE format('ALTER TABLE public.%I SET SCHEMA authz', v_tbl);
        RAISE NOTICE 'Moved public.% to authz', v_tbl;
      ELSE
        RAISE NOTICE 'authz.% already exists, skipping move', v_tbl;
      END IF;
    ELSE
      RAISE NOTICE 'public.% is not a table (relkind=%), skipping', v_tbl, COALESCE(v_relkind, '?');
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- STEP 2: Move trigger functions to authz schema
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'update_users_updated_at' AND n.nspname = 'public'
  ) THEN
    ALTER FUNCTION public.update_users_updated_at() SET SCHEMA authz;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'update_rbac_roles_updated_at' AND n.nspname = 'public'
  ) THEN
    ALTER FUNCTION public.update_rbac_roles_updated_at() SET SCHEMA authz;
  END IF;
END $$;

-- =============================================================================
-- STEP 3: Recreate RBAC functions in authz schema
-- =============================================================================

DROP FUNCTION IF EXISTS public.rbac_has_permission(UUID, VARCHAR, VARCHAR, VARCHAR, UUID);
DROP FUNCTION IF EXISTS public.rbac_get_user_permissions(UUID, VARCHAR);
DROP FUNCTION IF EXISTS public.rbac_get_user_roles(UUID, VARCHAR);

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
          AND (
              p.name = p_permission
              OR p.name = v_permission_category || ':*'
              OR p.name = '*:*'
          )
          AND (
              rp.resource_type IS NULL
              OR (
                  rp.resource_type = p_resource_type
                  AND (rp.resource_id IS NULL OR rp.resource_id = p_resource_id)
              )
          )
    ) INTO v_has_permission;

    RETURN v_has_permission;
END;
$$;

CREATE OR REPLACE FUNCTION authz.rbac_get_user_permissions(
    p_user_id UUID,
    p_organization_slug VARCHAR(255)
)
RETURNS TABLE (
    permission_name VARCHAR(100),
    resource_type VARCHAR(100),
    resource_id UUID
)
LANGUAGE sql STABLE
SET search_path = authz, public
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

CREATE OR REPLACE FUNCTION authz.rbac_get_user_roles(
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
SET search_path = authz, public
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

-- =============================================================================
-- STEP 3b: Recreate rbac_get_user_organizations in authz schema
-- =============================================================================

DROP FUNCTION IF EXISTS rag_data.rbac_get_user_organizations(UUID);

CREATE OR REPLACE FUNCTION authz.rbac_get_user_organizations(
    p_user_id UUID
)
RETURNS TABLE (
    organization_slug VARCHAR(255),
    organization_name TEXT,
    role_name VARCHAR(100),
    is_global BOOLEAN
)
LANGUAGE sql STABLE
SET search_path = authz, public
AS $$
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
    CROSS JOIN public.organizations o
    LEFT JOIN rbac_user_org_roles uor ON uor.organization_slug = o.slug AND uor.user_id = p_user_id
    LEFT JOIN rbac_roles r ON uor.role_id = r.id
    WHERE (SELECT has_global FROM user_has_global)
       OR (uor.user_id = p_user_id AND (uor.expires_at IS NULL OR uor.expires_at > NOW()))
    ORDER BY organization_slug;
$$;

-- =============================================================================
-- STEP 4: Update cross-schema functions
-- =============================================================================

DROP FUNCTION IF EXISTS rag_data.rbac_get_organization_users(character varying);

CREATE OR REPLACE FUNCTION rag_data.rbac_get_organization_users(
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
SET search_path = authz, public
AS $$
    SELECT DISTINCT
        u.id AS user_id,
        u.email::TEXT,
        u.display_name::TEXT,
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
    ORDER BY email, role_name;
$$;

CREATE OR REPLACE FUNCTION prediction.user_has_org_access(
    p_org_slug TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = authz, public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM authz.rbac_get_user_organizations(auth.uid())
    WHERE organization_slug = p_org_slug
  );
END;
$$;

-- =============================================================================
-- STEP 5: Grant permissions
-- =============================================================================

GRANT USAGE ON SCHEMA authz TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA authz TO postgres, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA authz TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA authz TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA authz TO postgres, anon, authenticated, service_role;

-- =============================================================================
-- STEP 6: Add authz to PostgREST exposed schemas
-- =============================================================================

DO $$
DECLARE
    current_schemas TEXT;
BEGIN
    SELECT option_value INTO current_schemas
    FROM pg_options_to_table(
        (SELECT rolconfig FROM pg_roles WHERE rolname = 'authenticator')
    )
    WHERE option_name = 'pgrst.db_schemas';

    IF current_schemas IS NULL THEN
        EXECUTE 'ALTER ROLE authenticator SET pgrst.db_schemas = ''public,graphql_public,authz''';
    ELSIF current_schemas NOT LIKE '%authz%' THEN
        EXECUTE format(
            'ALTER ROLE authenticator SET pgrst.db_schemas = %L',
            current_schemas || ',authz'
        );
    END IF;
END $$;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- STEP 7: Clean up demo-org seed data (idempotent)
-- =============================================================================

DELETE FROM authz.rbac_user_org_roles WHERE organization_slug = 'demo-org';

UPDATE authz.users SET organization_slug = NULL
WHERE id IN (
    SELECT DISTINCT uor.user_id FROM authz.rbac_user_org_roles uor
    WHERE uor.organization_slug = '*'
);

DELETE FROM authz.users WHERE email = 'demo.user@orchestratorai.io';
DELETE FROM auth.users WHERE id = 'e2e00000-0000-4000-a000-000000000001';
DELETE FROM public.organizations WHERE slug = 'demo-org';

COMMIT;

-- =============================================================================
-- Verification
-- =============================================================================
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'authz'
      AND table_name IN ('users', 'rbac_roles', 'rbac_permissions', 'rbac_role_permissions', 'rbac_user_org_roles', 'rbac_audit_log');

    IF v_count = 6 THEN
        RAISE NOTICE '================================================';
        RAISE NOTICE 'authz schema migration complete';
        RAISE NOTICE '================================================';
    ELSE
        RAISE EXCEPTION 'Migration verification FAILED: expected 6 tables in authz, found %', v_count;
    END IF;
END $$;

-- Canonicalize app-owned users + RBAC tables into authz schema.
-- Keep backward compatibility with updatable public views so existing code paths remain stable.

CREATE SCHEMA IF NOT EXISTS authz;

GRANT USAGE ON SCHEMA authz TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA authz TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA authz TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA authz
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA authz
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('authz.users') IS NULL
     AND to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.users SET SCHEMA authz';
  END IF;

  IF to_regclass('authz.rbac_roles') IS NULL
     AND to_regclass('public.rbac_roles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.rbac_roles SET SCHEMA authz';
  END IF;

  IF to_regclass('authz.rbac_permissions') IS NULL
     AND to_regclass('public.rbac_permissions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.rbac_permissions SET SCHEMA authz';
  END IF;

  IF to_regclass('authz.rbac_role_permissions') IS NULL
     AND to_regclass('public.rbac_role_permissions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.rbac_role_permissions SET SCHEMA authz';
  END IF;

  IF to_regclass('authz.rbac_user_org_roles') IS NULL
     AND to_regclass('public.rbac_user_org_roles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.rbac_user_org_roles SET SCHEMA authz';
  END IF;

  IF to_regclass('authz.rbac_audit_log') IS NULL
     AND to_regclass('public.rbac_audit_log') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.rbac_audit_log SET SCHEMA authz';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL
     AND to_regclass('authz.users') IS NOT NULL THEN
    EXECUTE '
      CREATE VIEW public.users AS
      SELECT * FROM authz.users
    ';
  END IF;

  IF to_regclass('public.rbac_roles') IS NULL
     AND to_regclass('authz.rbac_roles') IS NOT NULL THEN
    EXECUTE '
      CREATE VIEW public.rbac_roles AS
      SELECT * FROM authz.rbac_roles
    ';
  END IF;

  IF to_regclass('public.rbac_permissions') IS NULL
     AND to_regclass('authz.rbac_permissions') IS NOT NULL THEN
    EXECUTE '
      CREATE VIEW public.rbac_permissions AS
      SELECT * FROM authz.rbac_permissions
    ';
  END IF;

  IF to_regclass('public.rbac_role_permissions') IS NULL
     AND to_regclass('authz.rbac_role_permissions') IS NOT NULL THEN
    EXECUTE '
      CREATE VIEW public.rbac_role_permissions AS
      SELECT * FROM authz.rbac_role_permissions
    ';
  END IF;

  IF to_regclass('public.rbac_user_org_roles') IS NULL
     AND to_regclass('authz.rbac_user_org_roles') IS NOT NULL THEN
    EXECUTE '
      CREATE VIEW public.rbac_user_org_roles AS
      SELECT * FROM authz.rbac_user_org_roles
    ';
  END IF;

  IF to_regclass('public.rbac_audit_log') IS NULL
     AND to_regclass('authz.rbac_audit_log') IS NOT NULL THEN
    EXECUTE '
      CREATE VIEW public.rbac_audit_log AS
      SELECT * FROM authz.rbac_audit_log
    ';
  END IF;
END $$;

-- Ensure PostgREST exposes authz for direct schema-qualified access.
-- NOTE: This must be run manually with supabase_admin user (authenticator is reserved):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U supabase_admin -d postgres -c \
--     "ALTER ROLE authenticator SET pgrst.db_schemas = '<current_schemas>, authz';"

-- Cleanup: ensure all RBAC tables, views, and functions live in authz schema only.
-- The migration 20260221113000 moved tables to authz but left public views and
-- some functions in the wrong schemas. This migration cleans up any remnants.

-- 1. Drop backward-compatibility views in public (data lives in authz)
DROP VIEW IF EXISTS public.users CASCADE;
DROP VIEW IF EXISTS public.rbac_roles CASCADE;
DROP VIEW IF EXISTS public.rbac_permissions CASCADE;
DROP VIEW IF EXISTS public.rbac_role_permissions CASCADE;
DROP VIEW IF EXISTS public.rbac_user_org_roles CASCADE;
DROP VIEW IF EXISTS public.rbac_audit_log CASCADE;

-- 2. Remove misplaced function copies (canonical versions live in authz)
DROP FUNCTION IF EXISTS rag_data.rbac_get_organization_users(character varying);
DROP FUNCTION IF EXISTS public.rbac_find_user_id_by_identity(text, text);

-- 3. Ensure PostgREST exposes authz schema (idempotent)
-- NOTE: ALTER ROLE authenticator requires supabase_admin. Run manually if needed:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U supabase_admin -d postgres -c \
--     "ALTER ROLE authenticator SET pgrst.db_schemas = '<current_schemas>, authz';"

-- 4. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

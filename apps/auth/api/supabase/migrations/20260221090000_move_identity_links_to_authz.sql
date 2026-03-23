-- Move app-owned identity-link table into canonical authz schema.
-- Keep compatibility surface for legacy public references.

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
  IF to_regclass('authz.auth_identity_links') IS NULL
     AND to_regclass('public.auth_identity_links') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.auth_identity_links SET SCHEMA authz';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('authz.auth_identity_links') IS NOT NULL
     AND to_regclass('public.auth_identity_links') IS NOT NULL THEN
    INSERT INTO authz.auth_identity_links (
      id,
      user_id,
      issuer,
      subject,
      email,
      raw_claims,
      created_at,
      updated_at
    )
    SELECT
      id,
      user_id,
      issuer,
      subject,
      email,
      raw_claims,
      created_at,
      updated_at
    FROM public.auth_identity_links
    ON CONFLICT (issuer, subject) DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('authz.auth_identity_links') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_auth_identity_links_user_id ON authz.auth_identity_links(user_id)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.rbac_find_user_id_by_identity(
  p_issuer TEXT,
  p_subject TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id
    INTO v_user_id
  FROM authz.auth_identity_links
  WHERE issuer = p_issuer
    AND subject = p_subject
  LIMIT 1;

  RETURN v_user_id;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.auth_identity_links') IS NULL
     AND to_regclass('authz.auth_identity_links') IS NOT NULL THEN
    EXECUTE '
      CREATE VIEW public.auth_identity_links AS
      SELECT
        id,
        user_id,
        issuer,
        subject,
        email,
        raw_claims,
        created_at,
        updated_at
      FROM authz.auth_identity_links
    ';
  END IF;
END $$;

-- Ensure PostgREST exposes authz for direct schema-qualified API access.
-- NOTE: This must be run manually with supabase_admin user (authenticator is reserved):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U supabase_admin -d postgres -c \
--     "ALTER ROLE authenticator SET pgrst.db_schemas = '<current_schemas>, authz';"

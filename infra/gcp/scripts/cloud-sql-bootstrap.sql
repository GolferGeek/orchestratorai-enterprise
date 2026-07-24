-- =============================================================================
-- CLOUD SQL BOOTSTRAP
-- =============================================================================
-- Run this BEFORE running Supabase migrations on Cloud SQL.
-- It creates the Supabase-specific roles and schemas that migrations reference.
--
-- Usage (as postgres superuser):
--   psql "host=<IP> dbname=orchestrator_ai user=postgres sslmode=require" \
--     -f cloud-sql-bootstrap.sql
-- =============================================================================

-- 1) Install the portable extensions used by application schemas.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS rag_data;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA rag_data;

-- 2) Create Supabase-equivalent roles (referenced by GRANT statements in migrations)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

-- 3) Grant roles to the app user
GRANT anon, authenticated, service_role TO orchestrator_app;
GRANT ALL ON DATABASE orchestrator_ai TO orchestrator_app;

-- 4) Create the auth schema compatibility contract used by legacy foreign
--    keys and RLS policy definitions. Google OIDC identities are persisted in
--    authz; no Supabase Auth service is emulated here.
--    On Cloud SQL there is no Supabase auth layer, so we create a minimal
--    auth.users table that satisfies foreign-key references.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
$$;

GRANT USAGE ON SCHEMA auth TO orchestrator_app;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO orchestrator_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO orchestrator_app;

-- 5) Success
DO $$
BEGIN
  RAISE NOTICE '=== Cloud SQL Bootstrap Complete ===';
  RAISE NOTICE 'Created roles: anon, authenticated, service_role';
  RAISE NOTICE 'Created stub: auth.users';
  RAISE NOTICE 'Now run the Supabase migrations.';
END
$$;

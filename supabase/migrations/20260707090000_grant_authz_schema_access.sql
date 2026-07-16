-- Ensure unified platform auth can resolve and upsert identity links.
-- The API database plane uses direct Postgres access through DATABASE_URL,
-- so authz must grant schema and table privileges to the Supabase runtime roles.

CREATE SCHEMA IF NOT EXISTS authz;

GRANT USAGE ON SCHEMA authz TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA authz TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA authz TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA authz TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA authz
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA authz
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA authz
  GRANT EXECUTE ON FUNCTIONS TO postgres, anon, authenticated, service_role;

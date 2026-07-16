-- Restore marketing schema privileges after no-owner Supabase restores.
-- Marketing Swarm reads and writes these tables through the database plane
-- and PostgREST roles.

GRANT USAGE ON SCHEMA marketing TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA marketing TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA marketing TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA marketing TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA marketing
  GRANT ALL PRIVILEGES ON TABLES TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA marketing
  GRANT ALL PRIVILEGES ON SEQUENCES TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA marketing
  GRANT ALL PRIVILEGES ON FUNCTIONS TO postgres, anon, authenticated, service_role;

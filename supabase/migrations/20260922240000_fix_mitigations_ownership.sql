-- Give risk.mitigations to the role the API actually connects as.
--
-- The first real run of decision-risk made all ten mitigation LLM calls and
-- then died on the write:
--
--   Error: Recording 10 mitigations failed: permission denied for table mitigations
--
-- scripts/migrate-deployed.sh connects as `supabase_admin`, because
-- supabase_admin owns the public schema and DDL has to run as the owner after a
-- no-owner restore. So every object a migration creates is owned by
-- supabase_admin. The API connects as `postgres` (see DATABASE_URL on
-- platform-api), and every pre-existing risk.* table is owned by postgres.
--
-- The new table therefore had exactly one grantee — supabase_admin — and the
-- API could not touch it.
--
-- This is not specific to this table. ANY table created by a future migration
-- inherits the same mismatch, so the note is repeated in migrate-deployed.sh.
-- Matching the siblings is the fix: hand it to postgres.

BEGIN;

ALTER TABLE risk.mitigations OWNER TO postgres;

-- Belt and braces: ownership carries full rights, but be explicit so a reader
-- comparing this table to its siblings sees the same shape.
GRANT SELECT, INSERT, UPDATE, DELETE ON risk.mitigations TO postgres;

COMMIT;

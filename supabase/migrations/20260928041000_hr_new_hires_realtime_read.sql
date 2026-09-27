-- Supabase Realtime sends a change only with the columns the subscriber may
-- SELECT. The API's change stream subscribes as service_role, which had no
-- grant on the hr schema, so new-hire inserts arrived as an empty record and
-- the onboarding trigger could not read the hire's id.
BEGIN;
GRANT USAGE ON SCHEMA hr TO service_role;
GRANT SELECT ON hr.new_hires TO service_role;
COMMIT;

-- Ambient database triggers name the database they watch (enterprise-client
-- sync, item 3 of the company-database plan): source_config.connection is
-- 'platform' (DATABASE_CHANGE_STREAM_SERVICE) or 'business' (the company
-- database, BUSINESS_DATABASE_CHANGE_STREAM_SERVICE). There is no default:
-- the watcher refuses a trigger without one, and so does this constraint.
-- Every existing database trigger watches the platform database, so it says so.

UPDATE ambient.triggers
SET source_config = source_config || '{"connection": "platform"}'::jsonb,
    updated_at = now()
WHERE source_type = 'database'
  AND NOT (source_config ? 'connection');

ALTER TABLE ambient.triggers
  ADD CONSTRAINT triggers_database_connection_check
  CHECK (source_type <> 'database' OR source_config->>'connection' IN ('platform', 'business'));

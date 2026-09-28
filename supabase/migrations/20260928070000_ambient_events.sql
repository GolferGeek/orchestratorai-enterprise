-- Ambient push mode: named events handed to ambient, kept so a caller holding
-- an event id can look it up, and so a restart never loses one.
--
-- Watch sources (database, filesystem, cron) observe something and emit to the
-- bus as before. A pushed event (POST /ambient/events, AmbientEventsService.push)
-- is stored here first, then emitted with its id. Triggers match it by name:
-- source_type 'event', source_config.event = the name.
BEGIN;

CREATE TABLE ambient.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug text NOT NULL,
  name text NOT NULL CHECK (name ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  -- Who pushed it: 'api:<user id>', a module name, or later 'a2a:<agent slug>'.
  source text NOT NULL CHECK (length(source) > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  dedupe_key text,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ambient.events OWNER TO postgres;

-- The same key pushed twice for one event name is one event.
CREATE UNIQUE INDEX ambient_events_dedupe_idx
  ON ambient.events (org_slug, name, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX ambient_events_org_received_idx ON ambient.events (org_slug, received_at DESC);

ALTER TABLE ambient.trigger_executions
  ADD COLUMN event_id uuid REFERENCES ambient.events(id) ON DELETE SET NULL;
CREATE INDEX ambient_trigger_executions_event_id_idx
  ON ambient.trigger_executions (event_id) WHERE event_id IS NOT NULL;

COMMIT;

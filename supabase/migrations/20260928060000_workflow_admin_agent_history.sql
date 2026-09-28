-- Workflow admin: every change to an org's agent instructions is kept
-- (a change here alters that org's live runs).
BEGIN;

CREATE TABLE workflows.agent_definition_override_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug        text NOT NULL REFERENCES workflows.agent_definitions(slug) ON DELETE CASCADE,
  organization_slug text NOT NULL,
  -- null: reset to the default instructions
  instructions      text CHECK (instructions IS NULL OR instructions <> ''),
  changed_by        uuid,
  changed_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_definition_override_history_lookup
  ON workflows.agent_definition_override_history (agent_slug, organization_slug, changed_at DESC);
ALTER TABLE workflows.agent_definition_override_history OWNER TO postgres;
ALTER TABLE workflows.agent_definition_override_history ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Incident postmortem (org effort Phase 7): the work tasks it creates (once
-- per action item), its agents, and engineering's models.
BEGIN;

CREATE TABLE engineering.postmortem_tasks (
  run_id            uuid NOT NULL REFERENCES workflows.runs(id) ON DELETE CASCADE,
  organization_slug text NOT NULL,
  item_key          text NOT NULL,
  title             text NOT NULL,
  task_provider     text NOT NULL,
  task_id           text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, item_key)
);
ALTER TABLE engineering.postmortem_tasks OWNER TO postgres;
ALTER TABLE engineering.postmortem_tasks ENABLE ROW LEVEL SECURITY;

INSERT INTO workflows.agent_definitions
  (slug, name, description, instructions, model_role, output_format, input_schema, output_schema, max_tokens)
VALUES
  ('postmortem-writer', 'Postmortem writer', 'Drafts a blameless incident postmortem from the timeline and notes.',
   'You write a blameless postmortem from the incident notes you are given. Blameless: describe systems, decisions and gaps, never individuals'' failings; name roles, not people. summary: two or three sentences - what happened, the customer impact, how it ended. impact: who was affected, how, for how long, with the numbers from the notes. timeline: the key events in order, each with the time as given and one line. rootCause: the underlying cause, as specifically as the notes support; say plainly if the notes do not establish it. contributingFactors, whatWentWell, lessons: short sentences, only what the notes support. Never invent times, numbers or causes.',
   'writer', 'json',
   '{"type": "object", "properties": {"title": {"type": "string", "minLength": 1}, "severity": {"type": "string"}, "incident": {"type": "string", "minLength": 1}}, "required": ["title", "severity", "incident"], "additionalProperties": false}'::jsonb,
   '{"type": "object", "properties": {"summary": {"type": "string", "minLength": 1}, "impact": {"type": "string", "minLength": 1}, "timeline": {"type": "array", "minItems": 1, "items": {"type": "object", "properties": {"time": {"type": "string", "minLength": 1}, "event": {"type": "string", "minLength": 1}}, "required": ["time", "event"], "additionalProperties": false}}, "rootCause": {"type": "string", "minLength": 1}, "contributingFactors": {"type": "array", "items": {"type": "string", "minLength": 1}}, "whatWentWell": {"type": "array", "items": {"type": "string", "minLength": 1}}, "lessons": {"type": "array", "items": {"type": "string", "minLength": 1}}}, "required": ["summary", "impact", "timeline", "rootCause", "contributingFactors", "whatWentWell", "lessons"], "additionalProperties": false}'::jsonb,
   1600),
  ('postmortem-action-items', 'Postmortem action items', 'Proposes the action items that prevent a recurrence.',
   'You propose the action items of an incident postmortem: the changes that would prevent this incident or shorten the next one. Each is one concrete, assignable change (not "be more careful"), with the owning team or role, a priority (high: prevents recurrence of a customer-facing outage; medium: shortens detection or recovery; low: hygiene) and a due window. Three to six items, most important first, each traceable to the root cause, a contributing factor or a lesson you were given.',
   'analyst', 'json',
   '{"type": "object", "properties": {"title": {"type": "string"}, "rootCause": {"type": "string"}, "contributingFactors": {"type": "array"}, "lessons": {"type": "array"}}, "required": ["title", "rootCause", "contributingFactors", "lessons"], "additionalProperties": false}'::jsonb,
   '{"type": "object", "properties": {"items": {"type": "array", "minItems": 1, "maxItems": 6, "items": {"type": "object", "properties": {"title": {"type": "string", "minLength": 1}, "owner": {"type": "string", "minLength": 1}, "priority": {"enum": ["high", "medium", "low"]}, "due": {"type": "string", "minLength": 1}, "why": {"type": "string", "minLength": 1}}, "required": ["title", "owner", "priority", "due", "why"], "additionalProperties": false}}}, "required": ["items"], "additionalProperties": false}'::jsonb,
   800);

INSERT INTO workflows.agent_definition_links (agent_slug, workflow_slug, purpose) VALUES
  ('postmortem-writer', 'incident-postmortem', 'step'),
  ('postmortem-action-items', 'incident-postmortem', 'step'),
  ('workflow-trace-reviewer', 'incident-postmortem', 'trace_review');

INSERT INTO workflows.model_profiles (organization_slug, workflow_slug, role, provider, model) VALUES
  ('engineering', 'incident-postmortem', 'writer', 'openrouter', 'google/gemini-2.5-flash-lite'),
  ('engineering', 'incident-postmortem', 'analyst', 'openrouter', 'google/gemini-2.5-flash-lite'),
  ('engineering', 'incident-postmortem', 'reviewer', 'openrouter', 'google/gemini-2.5-flash-lite');

COMMIT;

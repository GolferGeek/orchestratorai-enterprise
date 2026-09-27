-- New-hire onboarding (org effort Phase 8): HR's new hires (an insert starts
-- the onboarding plan through an ambient database trigger), the tasks it
-- creates, its planner agent and HR's models.
BEGIN;

CREATE SCHEMA IF NOT EXISTS hr AUTHORIZATION postgres;

CREATE TABLE hr.new_hires (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_slug  text NOT NULL,
  full_name          text NOT NULL CHECK (full_name <> ''),
  role_title         text NOT NULL CHECK (role_title <> ''),
  team               text NOT NULL CHECK (team <> ''),
  manager_name       text NOT NULL CHECK (manager_name <> ''),
  location           text NOT NULL CHECK (location <> ''),
  employment_type    text NOT NULL CHECK (employment_type IN ('full-time', 'part-time', 'contractor')),
  start_date         date NOT NULL,
  notes              text,
  onboarding_run_id  uuid REFERENCES workflows.runs(id) ON DELETE SET NULL,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hr.onboarding_tasks (
  run_id            uuid NOT NULL REFERENCES workflows.runs(id) ON DELETE CASCADE,
  organization_slug text NOT NULL,
  item_key          text NOT NULL,
  title             text NOT NULL,
  task_provider     text NOT NULL,
  task_id           text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, item_key)
);

ALTER TABLE hr.new_hires OWNER TO postgres;
ALTER TABLE hr.onboarding_tasks OWNER TO postgres;
ALTER TABLE hr.new_hires ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.onboarding_tasks ENABLE ROW LEVEL SECURITY;

-- Inserts reach the ambient DB watcher through the change stream (Supabase
-- Realtime). The trigger's condition skips a hire an onboarding run recorded
-- itself (onboarding_run_id already set), so it never gets a second plan.
ALTER PUBLICATION supabase_realtime ADD TABLE hr.new_hires;

INSERT INTO workflows.agent_definitions
  (slug, name, description, instructions, model_role, output_format, input_schema, output_schema, max_tokens)
VALUES
  ('onboarding-planner', 'Onboarding planner', 'Drafts a new hire''s first week, 30/60/90-day plan and the accounts and equipment to request.',
   'You draft a new hire''s onboarding plan for their manager to approve. Use the hire''s role, team, location, employment type and start date, and follow the company policy facts you are given (enrollment deadlines, required trainings, equipment standards) - cite the policy where you use one. welcome: two sentences to the new hire, warm and specific to the role. firstWeek: day 1 to day 5, each with three or four concrete items. plan30, plan60, plan90: three or four outcomes each, specific to the role. requests: every account, piece of equipment and access the hire needs before or on day 1, each with the owning team and when it is needed (relative to the start date). Do not invent policies; if a fact is not given, leave it out.',
   'writer', 'json',
   '{"type": "object", "properties": {"hire": {"type": "object"}, "policyFacts": {"type": "array"}}, "required": ["hire", "policyFacts"], "additionalProperties": false}'::jsonb,
   '{"type": "object", "properties": {"welcome": {"type": "string", "minLength": 1}, "firstWeek": {"type": "array", "minItems": 5, "maxItems": 5, "items": {"type": "object", "properties": {"day": {"type": "integer", "minimum": 1, "maximum": 5}, "items": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}}, "required": ["day", "items"], "additionalProperties": false}}, "plan30": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}, "plan60": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}, "plan90": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}, "requests": {"type": "array", "minItems": 1, "maxItems": 12, "items": {"type": "object", "properties": {"kind": {"enum": ["account", "equipment", "access", "other"]}, "item": {"type": "string", "minLength": 1}, "owner": {"type": "string", "minLength": 1}, "neededBy": {"type": "string", "minLength": 1}}, "required": ["kind", "item", "owner", "neededBy"], "additionalProperties": false}}}, "required": ["welcome", "firstWeek", "plan30", "plan60", "plan90", "requests"], "additionalProperties": false}'::jsonb,
   2000);

INSERT INTO workflows.agent_definition_links (agent_slug, workflow_slug, purpose) VALUES
  ('onboarding-planner', 'onboarding-plan', 'step'),
  ('workflow-trace-reviewer', 'onboarding-plan', 'trace_review');

INSERT INTO workflows.model_profiles (organization_slug, workflow_slug, role, provider, model) VALUES
  ('human-resources', 'onboarding-plan', 'writer', 'openrouter', 'google/gemini-2.5-flash-lite'),
  ('human-resources', 'onboarding-plan', 'reviewer', 'openrouter', 'google/gemini-2.5-flash-lite');

INSERT INTO ambient.triggers
  (org_slug, name, description, source_type, enabled, source_config, condition, action_config, trigger_kind, trigger_config, response_kind, response_config, cooldown_seconds, created_by)
SELECT 'human-resources', 'New hire onboarding', 'A new hire recorded in HR starts their onboarding plan.', 'database', true,
       '{"schema": "hr", "table": "new_hires", "events": ["INSERT"]}'::jsonb,
       '{"new.onboarding_run_id": null}'::jsonb,
       '{"workflowSlug": "onboarding-plan", "inputFromEvent": {"hireId": "new.id"}}'::jsonb,
       'database', '{"schema": "hr", "table": "new_hires", "events": ["INSERT"]}'::jsonb,
       'workflow', '{"workflowSlug": "onboarding-plan", "inputFromEvent": {"hireId": "new.id"}}'::jsonb,
       0, u.id
FROM auth.users u WHERE u.email = 'admin-user@orchestratorai.io'
  AND NOT EXISTS (SELECT 1 FROM ambient.triggers WHERE org_slug = 'human-resources' AND name = 'New hire onboarding');

COMMIT;

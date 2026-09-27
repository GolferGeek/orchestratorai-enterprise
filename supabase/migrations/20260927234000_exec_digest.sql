-- Weekly executive digest (org effort Phase 3): its two agents, their link to
-- the workflow (and the generic trace reviewer), corporate's model for the
-- writer role, and a Friday cron trigger that runs it for every department.
BEGIN;

INSERT INTO workflows.agent_definitions
  (slug, name, description, instructions, model_role, output_format, input_schema, output_schema, max_tokens)
VALUES
  ('exec-digest-org-writer', 'Digest department writer', 'Summarizes one department''s week from its activity counts.',
   'You summarize one department''s week for the executive team, from the activity counts you are given and nothing else. Headline: one line that says what the week was. Summary: two to four sentences - what ran, what finished, what is waiting on people, and what it cost - citing the numbers exactly as given. Watch: up to three items an executive should follow up on (for example reviews waiting, failed runs, unusual cost); empty when there is nothing. A quiet week is reported as quiet; never invent activity, names or reasons.',
   'writer', 'json',
   '{"type": "object", "properties": {"organization": {"type": "string", "minLength": 1}, "week": {"type": "object"}, "activity": {"type": "object"}}, "required": ["organization", "week", "activity"], "additionalProperties": false}'::jsonb,
   '{"type": "object", "properties": {"headline": {"type": "string", "minLength": 1}, "summary": {"type": "string", "minLength": 1}, "watch": {"type": "array", "items": {"type": "string", "minLength": 1}, "maxItems": 3}}, "required": ["headline", "summary", "watch"], "additionalProperties": false}'::jsonb,
   600),
  ('exec-digest-composer', 'Digest composer', 'Writes the company summary of the weekly digest.',
   'You write the company summary of the weekly executive digest from the company totals and each department''s headline, summary and watch items. Lead with the one thing the executive team should know, then the week in two or three sentences using the totals exactly as given, then the follow-ups that matter most across departments. Plain prose, under 150 words, no headings, no lists. Use only what you are given.',
   'writer', 'text',
   '{"type": "object", "properties": {"weekEnding": {"type": "string", "minLength": 1}, "totals": {"type": "object"}, "departments": {"type": "array"}}, "required": ["weekEnding", "totals", "departments"], "additionalProperties": false}'::jsonb,
   NULL, 500);

INSERT INTO workflows.agent_definition_links (agent_slug, workflow_slug, purpose) VALUES
  ('exec-digest-org-writer', 'exec-digest', 'step'),
  ('exec-digest-composer', 'exec-digest', 'step'),
  ('workflow-trace-reviewer', 'exec-digest', 'trace_review');

INSERT INTO workflows.model_profiles (organization_slug, workflow_slug, role, provider, model) VALUES
  ('corporate', 'exec-digest', 'writer', 'openrouter', 'google/gemini-2.5-flash-lite'),
  ('corporate', 'exec-digest', 'reviewer', 'openrouter', 'google/gemini-2.5-flash-lite');

INSERT INTO ambient.triggers
  (org_slug, name, description, source_type, enabled, source_config, action_config, trigger_kind, trigger_config, response_kind, response_config, cooldown_seconds, created_by)
SELECT 'corporate', 'Weekly exec digest', 'Every Friday at 16:00 (Denver): the digest for every department.', 'cron', true,
       '{"expression": "0 16 * * 5", "timezone": "America/Denver"}'::jsonb,
       '{"workflowSlug": "exec-digest", "input": {"organizations": ["corporate", "finance", "human-resources", "marketing", "engineering", "building"]}}'::jsonb,
       'cron', '{"expression": "0 16 * * 5", "timezone": "America/Denver"}'::jsonb,
       'workflow', '{"workflowSlug": "exec-digest", "input": {"organizations": ["corporate", "finance", "human-resources", "marketing", "engineering", "building"]}}'::jsonb,
       3600, u.id
FROM auth.users u WHERE u.email = 'admin-user@orchestratorai.io'
  AND NOT EXISTS (SELECT 1 FROM ambient.triggers WHERE org_slug = 'corporate' AND name = 'Weekly exec digest');

COMMIT;

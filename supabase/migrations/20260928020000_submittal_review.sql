-- Submittal review (org effort Phase 6): its agents, their links, building's
-- models, and where decisions are kept.
BEGIN;

CREATE SCHEMA IF NOT EXISTS building AUTHORIZATION postgres;

CREATE TABLE building.submittal_decisions (
  run_id            uuid PRIMARY KEY REFERENCES workflows.runs(id) ON DELETE CASCADE,
  organization_slug text NOT NULL,
  spec_section      text NOT NULL,
  action            text NOT NULL CHECK (action IN ('approved', 'approved_as_noted', 'revise_and_resubmit')),
  findings          jsonb NOT NULL,
  decided_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE building.submittal_decisions OWNER TO postgres;
ALTER TABLE building.submittal_decisions ENABLE ROW LEVEL SECURITY;

INSERT INTO workflows.agent_definitions
  (slug, name, description, instructions, model_role, output_format, input_schema, output_schema, max_tokens)
VALUES
  ('spec-requirement-extractor', 'Spec requirement extractor', 'Lists the requirements of a specification section that a product submittal can show compliance with.',
   'You read one section of a construction project specification and list the requirements a contractor''s product submittal must show compliance with: materials, performance values, ratings, standards, warranties and prohibited products. Skip installation workmanship and administrative items a product data sheet cannot show. For each, give its article reference as written (for example "2.1.B") and the requirement in one sentence that keeps every value and standard exactly as the specification states it. At most 12, in the order they appear.',
   'analyst', 'json',
   '{"type": "object", "properties": {"section": {"type": "string", "minLength": 1}, "specText": {"type": "string", "minLength": 1}}, "required": ["section", "specText"], "additionalProperties": false}'::jsonb,
   '{"type": "object", "properties": {"requirements": {"type": "array", "minItems": 1, "maxItems": 12, "items": {"type": "object", "properties": {"ref": {"type": "string", "minLength": 1}, "requirement": {"type": "string", "minLength": 1}}, "required": ["ref", "requirement"], "additionalProperties": false}}}, "required": ["requirements"], "additionalProperties": false}'::jsonb,
   1200),
  ('submittal-evaluator', 'Submittal evaluator', 'Decides whether a submittal shows compliance with one specification requirement, quoting its evidence.',
   'You check one specification requirement against a contractor''s product submittal. status: "compliant" when the submittal states a value or product that meets the requirement; "deviation" when it states something that does not meet it (a lower value, a different standard, a prohibited product); "missing" when the submittal does not address it. evidence: the exact words from the submittal that you relied on, copied verbatim (a single short passage), or null when missing. note: one sentence a reviewer can act on, citing the numbers. Compare values carefully (60 mil meets "minimum 60 mil"; 45 mil does not).',
   'analyst', 'json',
   '{"type": "object", "properties": {"ref": {"type": "string"}, "requirement": {"type": "string", "minLength": 1}, "submittalText": {"type": "string", "minLength": 1}}, "required": ["ref", "requirement", "submittalText"], "additionalProperties": false}'::jsonb,
   '{"type": "object", "properties": {"status": {"enum": ["compliant", "deviation", "missing"]}, "evidence": {"type": ["string", "null"]}, "note": {"type": "string", "minLength": 1}}, "required": ["status", "evidence", "note"], "additionalProperties": false}'::jsonb,
   500),
  ('submittal-response-writer', 'Submittal response writer', 'Writes the architect''s response letter for a reviewed submittal.',
   'You write the architect''s response to a contractor''s submittal from the review findings and the action already decided. Open with the action (Approved / Approved as noted / Revise and resubmit) and the specification section. Then list each deviation and each missing item with the article reference and exactly what the contractor must provide or change. Close with one sentence on resubmittal when the action requires it. Professional and specific, under 250 words. Use only the findings given.',
   'writer', 'text',
   '{"type": "object", "properties": {"section": {"type": "string"}, "action": {"type": "string"}, "findings": {"type": "array"}}, "required": ["section", "action", "findings"], "additionalProperties": false}'::jsonb,
   NULL, 700);

INSERT INTO workflows.agent_definition_links (agent_slug, workflow_slug, purpose) VALUES
  ('spec-requirement-extractor', 'submittal-review', 'step'),
  ('submittal-evaluator', 'submittal-review', 'step'),
  ('submittal-response-writer', 'submittal-review', 'step'),
  ('workflow-trace-reviewer', 'submittal-review', 'trace_review');

INSERT INTO workflows.model_profiles (organization_slug, workflow_slug, role, provider, model) VALUES
  ('building', 'submittal-review', 'analyst', 'openrouter', 'google/gemini-2.5-flash-lite'),
  ('building', 'submittal-review', 'writer', 'openrouter', 'google/gemini-2.5-flash-lite'),
  ('building', 'submittal-review', 'reviewer', 'openrouter', 'google/gemini-2.5-flash-lite');

COMMIT;

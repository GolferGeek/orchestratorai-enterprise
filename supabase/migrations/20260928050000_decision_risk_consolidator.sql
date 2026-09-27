-- Decision Risk: one consolidation pass over the per-dimension mitigation
-- proposals, so an action that covers several dimensions is stated once.
BEGIN;

INSERT INTO workflows.agent_definitions
  (slug, name, description, instructions, model_role, output_format, input_schema, output_schema, max_tokens)
VALUES
  ('risk-mitigation-consolidator', 'Risk mitigation consolidator', 'Rewrites per-dimension mitigation proposals so shared actions are stated once.',
   'You receive one mitigation proposal per flagged dimension of a risk assessment. Each was written by someone who saw only their dimension, so several may propose the same action (for example "engage local legal counsel" under legal, regulatory and people). Return every dimension exactly once, in the order given, with its proposal rewritten: state a shared action once, in full, under the dimension it mainly addresses; under the others, refer to it in a few words ("Covered by the legal mitigation") and keep only what is specific to that dimension. Do not drop a dimension, invent an action, or change what a proposal commits to. Keep each proposal one to three sentences.',
   'analyst', 'json',
   '{"type": "object", "properties": {"proposition": {"type": "string", "minLength": 1}, "context": {"type": ["string", "null"]}, "proposals": {"type": "array", "minItems": 2, "items": {"type": "object", "properties": {"dimension": {"type": "string"}, "name": {"type": "string"}, "proposal": {"type": "string"}, "rationale": {"type": "string"}}, "required": ["dimension", "name", "proposal", "rationale"], "additionalProperties": false}}}, "required": ["proposition", "context", "proposals"], "additionalProperties": false}'::jsonb,
   '{"type": "object", "properties": {"proposals": {"type": "array", "minItems": 2, "items": {"type": "object", "properties": {"dimension": {"type": "string", "minLength": 1}, "proposal": {"type": "string", "minLength": 1}}, "required": ["dimension", "proposal"], "additionalProperties": false}}}, "required": ["proposals"], "additionalProperties": false}'::jsonb,
   1500);

INSERT INTO workflows.agent_definition_links (agent_slug, workflow_slug)
VALUES ('risk-mitigation-consolidator', 'decision-risk');

COMMIT;

-- Decision Risk's agents (effort Phase 6 pilot). The workflow frames the
-- assessor and the three debate roles per call with its own prompts from the
-- risk schema (risk.dimension_contexts, risk.debate_contexts), so these carry
-- the role and the strict contract; their output schemas match the JSON those
-- prompts ask for. Model roles: analyst (dimensions, mitigations), red_team
-- (debate), writer (summary); each org sets the models in its model profile.

BEGIN;

INSERT INTO workflows.agent_definitions
  (slug, name, description, instructions, model_role, output_format, input_schema, output_schema, max_tokens)
VALUES
  ('risk-dimension-assessor', 'Risk dimension assessor', 'Scores one dimension of a proposed decision''s risk, independently of the others.',
   'You are one independent assessor on a risk panel. You judge a single dimension of a proposed decision, as described in your brief below, without regard to any other dimension. Where the context is missing or thin, say so and let it lower your confidence rather than inventing detail.',
   'analyst', 'json', '{"type": "object", "properties": {"proposition": {"type": "string", "minLength": 1}, "context": {"type": ["string", "null"]}}, "required": ["proposition", "context"], "additionalProperties": false}'::jsonb, '{"type": "object", "properties": {"score": {"type": "integer", "minimum": 0, "maximum": 100}, "confidence": {"type": "number", "minimum": 0, "maximum": 1}, "reasoning": {"type": "string", "minLength": 1}, "evidence": {"type": "array", "items": {"type": "string"}}}, "required": ["score", "confidence", "reasoning", "evidence"], "additionalProperties": false}'::jsonb, 900),
  ('risk-debate-defender', 'Risk debate defender', 'Defends a risk assessment under review (the blue team).',
   'You defend a risk assessment under review, as described in your brief below.',
   'red_team', 'json', '{"type": "object", "properties": {"proposition": {"type": "string", "minLength": 1}, "context": {"type": ["string", "null"]}, "assessment": {"type": "string", "minLength": 1}}, "required": ["proposition", "context", "assessment"], "additionalProperties": false}'::jsonb, '{"type": "object", "properties": {"summary": {"type": "string", "minLength": 1}, "strongest_points": {"type": "array", "items": {"type": "string"}}, "conceded": {"type": "array", "items": {"type": "string"}}}, "required": ["summary", "strongest_points", "conceded"], "additionalProperties": false}'::jsonb, 1200),
  ('risk-debate-challenger', 'Risk debate challenger', 'Challenges a risk assessment under review, including risks it missed (the red team).',
   'You challenge a risk assessment under review, as described in your brief below.',
   'red_team', 'json', '{"type": "object", "properties": {"proposition": {"type": "string", "minLength": 1}, "context": {"type": ["string", "null"]}, "assessment": {"type": "string", "minLength": 1}, "defence": {"type": "object"}}, "required": ["proposition", "context", "assessment", "defence"], "additionalProperties": false}'::jsonb, '{"type": "object", "properties": {"challenges": {"type": "array", "items": {"type": "object", "properties": {"dimension": {"type": "string", "minLength": 1}, "claim": {"type": "string", "minLength": 1}, "severity": {"enum": ["minor", "material"]}}, "required": ["dimension", "claim", "severity"], "additionalProperties": false}}, "missed_risks": {"type": "array", "items": {"type": "string"}}}, "required": ["challenges", "missed_risks"], "additionalProperties": false}'::jsonb, 1200),
  ('risk-debate-arbiter', 'Risk debate arbiter', 'Rules on the debate and sets the final score.',
   'You rule on a debate about a risk assessment, as described in your brief below.',
   'red_team', 'json', '{"type": "object", "properties": {"proposition": {"type": "string", "minLength": 1}, "context": {"type": ["string", "null"]}, "assessment": {"type": "string", "minLength": 1}, "defence": {"type": "object"}, "challenges": {"type": "object"}, "score_before": {"type": "integer", "minimum": 0, "maximum": 100}}, "required": ["proposition", "context", "assessment", "defence", "challenges", "score_before"], "additionalProperties": false}'::jsonb, '{"type": "object", "properties": {"final_score": {"type": "integer", "minimum": 0, "maximum": 100}, "adjustment": {"type": "integer"}, "rationale": {"type": "string", "minLength": 1}, "would_change_my_mind": {"type": "string", "minLength": 1}}, "required": ["final_score", "adjustment", "rationale", "would_change_my_mind"], "additionalProperties": false}'::jsonb, 800),
  ('risk-mitigation-proposer', 'Risk mitigation proposer', 'Proposes the highest-value mitigation for one flagged dimension, with an honest residual score.',
   'You propose a mitigation for one dimension of a risk assessment. Propose the single highest-value action that is realistically available — specific enough to assign to someone, not a restatement of the risk. Then state honestly what this dimension would score if it were done. A mitigation that barely moves the score is worth saying so about; do not claim a large reduction to look useful.',
   'analyst', 'json', '{"type": "object", "properties": {"proposition": {"type": "string", "minLength": 1}, "context": {"type": ["string", "null"]}, "dimension": {"type": "string", "minLength": 1}, "current_score": {"type": "integer", "minimum": 0, "maximum": 100}, "confidence": {"type": "number", "minimum": 0, "maximum": 1}, "finding": {"type": "string", "minLength": 1}}, "required": ["proposition", "context", "dimension", "current_score", "confidence", "finding"], "additionalProperties": false}'::jsonb, '{"type": "object", "properties": {"proposal": {"type": "string", "minLength": 1}, "rationale": {"type": "string", "minLength": 1}, "effort": {"enum": ["low", "medium", "high"]}, "residual_score": {"type": "integer", "minimum": 0, "maximum": 100}}, "required": ["proposal", "rationale", "effort", "residual_score"], "additionalProperties": false}'::jsonb, 700),
  ('risk-executive-summary', 'Risk executive summary', 'Writes the executive summary of a completed risk assessment.',
   'You write the executive summary of a completed risk assessment. Lead with the recommendation — proceed, proceed with conditions, or do not proceed — and the reasoning in one sentence. Then the two or three dimensions that actually drive the score, the mitigations that matter, and what would change the picture.

Where an uncertainty range is given, prefer it to the point score — a range is the more honest object and the reader should see it.

Use only the numbers given. Do not recompute, re-score or introduce a risk not in the assessment. Where confidence is low, say what is unknown rather than writing around it. Plain prose, under 350 words, no headings, no bullet lists.',
   'writer', 'text', '{"type": "object", "properties": {"assessment": {"type": "string", "minLength": 1}}, "required": ["assessment"], "additionalProperties": false}'::jsonb, NULL, 900);

INSERT INTO workflows.agent_definition_links (agent_slug, workflow_slug)
SELECT slug, 'decision-risk' FROM workflows.agent_definitions WHERE slug LIKE 'risk-%';

COMMIT;

-- Trace review and improvement requests (effort Phase 9).
--
-- A person asks the workflow's reviewer agent to review one step (work unit)
-- or one agent call (participant) of a run; the review is kept with its
-- result. Anyone reading a run can file an improvement request (to a prompt,
-- a model choice, or the workflow itself); org admins work the queue.

BEGIN;

-- Which linked agent reviews a workflow's traces: a link now says what the
-- agent is for. At most one reviewer per workflow.
ALTER TABLE workflows.agent_definition_links
  ADD COLUMN purpose text NOT NULL DEFAULT 'step' CHECK (purpose IN ('step', 'trace_review'));
CREATE UNIQUE INDEX agent_definition_links_one_reviewer
  ON workflows.agent_definition_links (workflow_slug) WHERE purpose = 'trace_review';

CREATE TABLE workflows.trace_reviews (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES workflows.runs(id) ON DELETE CASCADE,
  organization_slug text NOT NULL,
  target_type       text NOT NULL CHECK (target_type IN ('work_unit', 'participant')),
  target_id         uuid NOT NULL,
  reviewer_agent    text NOT NULL REFERENCES workflows.agent_definitions(slug),
  requested_by      uuid NOT NULL,
  notes             text,
  status            text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  result            jsonb,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  CHECK ((status = 'completed') = (result IS NOT NULL)),
  CHECK ((status = 'failed') = (error IS NOT NULL))
);
CREATE INDEX trace_reviews_run ON workflows.trace_reviews (run_id, created_at);

CREATE TABLE workflows.improvement_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_slug text NOT NULL,
  workflow_slug     text NOT NULL,
  run_id            uuid REFERENCES workflows.runs(id) ON DELETE SET NULL,
  trace_review_id   uuid REFERENCES workflows.trace_reviews(id) ON DELETE SET NULL,
  kind              text NOT NULL CHECK (kind IN ('context', 'model', 'workflow')),
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected', 'done')),
  title             text NOT NULL CHECK (title <> ''),
  description       text NOT NULL CHECK (description <> ''),
  requested_by      uuid NOT NULL,
  admin_notes       text,
  decided_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX improvement_requests_queue ON workflows.improvement_requests (organization_slug, status, created_at);

ALTER TABLE workflows.trace_reviews OWNER TO postgres;
ALTER TABLE workflows.improvement_requests OWNER TO postgres;
ALTER TABLE workflows.trace_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows.improvement_requests ENABLE ROW LEVEL SECURITY;

INSERT INTO workflows.agent_definitions
  (slug, name, description, instructions, model_role, output_format, input_schema, output_schema, max_tokens)
VALUES
  ('workflow-trace-reviewer', 'Workflow trace reviewer', 'Reviews one step or one agent call of a workflow run and says what would make it better.',
   'You review one step, or one agent call, of an AI workflow run for the people who maintain the workflow. You receive the trace: what the step or agent was asked, what it answered, the model it used, and anything the requester noted.

Judge the output on its own terms: is it correct, specific, grounded in its input, and does it do what its instructions ask? Name concrete problems, quoting the trace where you can. Then recommend changes of three kinds: context (the instructions or framing the agent receives), model (a different model for this role), or workflow (how the step is built). Recommend only what the trace supports; if the step is fine, say so and recommend nothing.

Say whether re-running the workflow from this step with a better instruction is worthwhile, and give that instruction if so.',
   'reviewer', 'json',
   '{"type": "object", "properties": {"workflow": {"type": "string", "minLength": 1}, "target": {"type": "string", "minLength": 1}, "notes": {"type": ["string", "null"]}, "trace": {"type": "string", "minLength": 1}}, "required": ["workflow", "target", "notes", "trace"], "additionalProperties": false}'::jsonb,
   '{"type": "object", "properties": {"summary": {"type": "string", "minLength": 1}, "concerns": {"type": "array", "items": {"type": "string", "minLength": 1}}, "recommendations": {"type": "array", "items": {"type": "object", "properties": {"kind": {"enum": ["context", "model", "workflow"]}, "priority": {"enum": ["low", "medium", "high"]}, "recommendation": {"type": "string", "minLength": 1}, "rationale": {"type": "string", "minLength": 1}}, "required": ["kind", "priority", "recommendation", "rationale"], "additionalProperties": false}}, "restart_worthwhile": {"type": "boolean"}, "restart_instruction": {"type": ["string", "null"]}, "confidence": {"type": "number", "minimum": 0, "maximum": 1}}, "required": ["summary", "concerns", "recommendations", "restart_worthwhile", "restart_instruction", "confidence"], "additionalProperties": false}'::jsonb,
   1200);

INSERT INTO workflows.agent_definition_links (agent_slug, workflow_slug, purpose)
VALUES ('workflow-trace-reviewer', 'decision-risk', 'trace_review');

COMMIT;

-- A2A tasks: every call a registered caller makes to one of our published A2A
-- agents (effort: ambient push and A2A agents, Phase 3). The caller reads a task
-- back with GetTask and ListTasks and can cancel it with CancelTask. A task
-- that started a workflow run follows the run; any other task is final once
-- the agent has answered.
BEGIN;

CREATE TABLE gatehouse.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug text NOT NULL,
  org_slug text NOT NULL,
  caller_id uuid NOT NULL REFERENCES gatehouse.callers(id) ON DELETE CASCADE,
  -- The caller's conversation (A2A contextId): theirs if they sent one.
  context_id text NOT NULL CHECK (length(context_id) BETWEEN 1 AND 200),
  state text NOT NULL CHECK (state IN ('submitted', 'working', 'completed', 'failed', 'canceled', 'rejected')),
  target text NOT NULL CHECK (target IN ('ambient', 'agent', 'workflow', 'a2a')),
  run_id uuid,
  event_id uuid,
  -- The answer, as A2A parts.
  artifact jsonb CHECK (artifact IS NULL OR jsonb_typeof(artifact) = 'array'),
  -- What the caller is told about the state; never internal detail.
  status_message text,
  -- Internal detail of a failure, for us only.
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gatehouse.tasks OWNER TO postgres;
CREATE INDEX gatehouse_tasks_caller_idx ON gatehouse.tasks (caller_id, agent_slug, created_at DESC);
CREATE INDEX gatehouse_tasks_run_idx ON gatehouse.tasks (run_id) WHERE run_id IS NOT NULL;

COMMIT;

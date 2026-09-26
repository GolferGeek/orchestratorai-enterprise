-- The workflow run: one row per run of any workflow, and the job queue the
-- worker claims from (DATABASE_JOB_QUEUE_SERVICE column contract).
--
-- efforts/current/enterprise-workflow-runtime-port.md, Phase 1. Ported from
-- orchestratorai-local's legal.agent_jobs, with its defects fixed:
--
-- - `id` is the ExecutionContext.conversationId: the LangGraph thread id and
--   the llm_usage correlation key, as risk.assessment_runs established. It is
--   a foreign key to public.conversations, so a run cannot exist without its
--   conversation row. Every workflow LLM call before this silently lost its
--   usage row to llm_usage_conversation_id_fkey (0 usage rows across every
--   decision-risk and marketing-swarm run); this makes that impossible.
-- - `execution_context` is the capsule exactly as the frontend sent it. The
--   worker hands this to the workflow; it never rebuilds a context from
--   columns. CHECKs keep it consistent with the indexed columns.
-- - Statuses are the transport-types WorkflowRunStatus set, enforced.
-- - Lease columns let a crashed worker's runs be reclaimed; local had none, so
--   a restart left rows in `processing` forever.

BEGIN;

CREATE SCHEMA IF NOT EXISTS workflows;
ALTER SCHEMA workflows OWNER TO postgres;

CREATE TABLE workflows.runs (
  id                  UUID PRIMARY KEY
                        REFERENCES public.conversations(id) ON DELETE CASCADE,
  organization_slug   TEXT NOT NULL REFERENCES public.organizations(slug),
  user_id             UUID NOT NULL REFERENCES auth.users(id),
  workflow_slug       TEXT NOT NULL,
  execution_context   JSONB NOT NULL,

  status              TEXT NOT NULL CHECK (status IN (
                        'queued', 'running', 'awaiting_review', 'awaiting_answer',
                        'cancel_requested', 'canceled', 'completed', 'failed')),
  current_step        TEXT,
  progress            SMALLINT CHECK (progress BETWEEN 0 AND 100),
  last_message        TEXT,
  error               TEXT,

  input               JSONB NOT NULL,
  result              JSONB,
  pending_action      JSONB,
  access_control      JSONB NOT NULL
                        CHECK (access_control->>'mode' IN ('org', 'owner', 'allowlist')),

  attempt             INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts        INTEGER NOT NULL CHECK (max_attempts >= 1),
  lease_expires_at    TIMESTAMPTZ,
  worker_id           TEXT,

  queued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT runs_context_matches_row CHECK (
    execution_context->>'conversationId' = id::text
    AND execution_context->>'orgSlug' = organization_slug
    AND execution_context->>'userId' = user_id::text
    AND execution_context->>'agentSlug' = workflow_slug
  ),
  CONSTRAINT runs_lease_only_while_held CHECK (
    (worker_id IS NULL) = (lease_expires_at IS NULL)
  )
);

CREATE INDEX runs_queue_idx ON workflows.runs (status, queued_at);
CREATE INDEX runs_org_status_idx ON workflows.runs (organization_slug, status);
CREATE INDEX runs_org_workflow_created_idx
  ON workflows.runs (organization_slug, workflow_slug, created_at DESC);

COMMENT ON TABLE workflows.runs IS
  'One row per workflow run and the queue the worker claims from. id is the ExecutionContext.conversationId (LangGraph thread id, llm_usage key).';
COMMENT ON COLUMN workflows.runs.execution_context IS
  'The ExecutionContext exactly as received from the frontend. Passed whole to the workflow; never rebuilt from columns.';
COMMENT ON COLUMN workflows.runs.pending_action IS
  'A human decision or answer waiting for the worker to resume the run with.';
COMMENT ON COLUMN workflows.runs.access_control IS
  'Who in the org may read the run: {"mode":"org"}, {"mode":"owner"} or {"mode":"allowlist","userIds":[...]}.';

ALTER TABLE workflows.runs ENABLE ROW LEVEL SECURITY;

-- The API connects as `postgres`; migrations run as `supabase_admin`.
ALTER TABLE workflows.runs OWNER TO postgres;

COMMIT;

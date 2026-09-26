-- Work units: each structured step of a run (one agent, a panel, red/blue,
-- an arbitrated panel, a drafter→reviewer→editor chain, or a human gate)
-- and the agent calls inside it. They are the run's trace.
--
-- efforts/current/enterprise-workflow-runtime-port.md, Phase 4. Ported from
-- orchestratorai-local's legal.work_unit_runs / participant_runs, with its
-- defects fixed:
-- - Units are ordered by an identity column (local's sequence was always 0).
-- - Statuses are enforced, and a finished row has its completion time.
-- - Each participant records the model that answered and its
--   llm_usage.run_id, so usage and reasoning join exactly (local matched by
--   agent name and nearest timestamp).
-- - A contract miss keeps the raw answer and the error on the participant.

BEGIN;

CREATE TABLE workflows.work_unit_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID NOT NULL REFERENCES workflows.runs(id) ON DELETE CASCADE,
  organization_slug   TEXT NOT NULL REFERENCES public.organizations(slug),
  ordinal             BIGINT GENERATED ALWAYS AS IDENTITY,
  work_unit_slug      TEXT NOT NULL CHECK (work_unit_slug <> ''),
  pattern             TEXT NOT NULL CHECK (pattern IN
                        ('solo', 'panel', 'red_blue', 'arbitrated', 'summarizer', 'human')),
  status              TEXT NOT NULL CHECK (status IN
                        ('running', 'completed', 'completed_partial', 'failed')),
  input_ref           JSONB,
  output_ref          JSONB,
  error               TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  duration_ms         INTEGER CHECK (duration_ms >= 0),

  CONSTRAINT work_unit_runs_finished CHECK (
    (status = 'running') = (completed_at IS NULL)
  ),
  CONSTRAINT work_unit_runs_failure_has_error CHECK (
    status <> 'failed' OR error IS NOT NULL
  )
);
CREATE INDEX work_unit_runs_run ON workflows.work_unit_runs (run_id, ordinal);

CREATE TABLE workflows.participant_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_unit_run_id    UUID NOT NULL REFERENCES workflows.work_unit_runs(id) ON DELETE CASCADE,
  run_id              UUID NOT NULL REFERENCES workflows.runs(id) ON DELETE CASCADE,
  organization_slug   TEXT NOT NULL REFERENCES public.organizations(slug),
  position            INTEGER NOT NULL CHECK (position >= 0),
  stage               TEXT NOT NULL CHECK (stage <> ''),
  agent_slug          TEXT NOT NULL,
  agent_version       INTEGER,
  model_role          TEXT,
  provider            TEXT,
  model               TEXT,
  llm_request_id      TEXT,
  status              TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  input_ref           JSONB,
  output_ref          JSONB,
  raw_output          TEXT,
  error               TEXT,
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  duration_ms         INTEGER CHECK (duration_ms >= 0),

  CONSTRAINT participant_runs_position UNIQUE (work_unit_run_id, position),
  CONSTRAINT participant_runs_finished CHECK (
    (status = 'running') = (completed_at IS NULL)
  ),
  CONSTRAINT participant_runs_failure_has_error CHECK (
    status <> 'failed' OR error IS NOT NULL
  )
);
CREATE INDEX participant_runs_unit ON workflows.participant_runs (work_unit_run_id, position);
CREATE INDEX participant_runs_request ON workflows.participant_runs (llm_request_id)
  WHERE llm_request_id IS NOT NULL;

-- The trace joins a participant to its usage row by request id.
CREATE INDEX IF NOT EXISTS llm_usage_run_id ON public.llm_usage (run_id)
  WHERE run_id IS NOT NULL;

ALTER TABLE workflows.work_unit_runs OWNER TO postgres;
ALTER TABLE workflows.participant_runs OWNER TO postgres;
ALTER TABLE workflows.work_unit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows.participant_runs ENABLE ROW LEVEL SECURITY;

COMMIT;

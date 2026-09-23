-- A run record: what happened, how far it got, and the narrative.
--
-- Solves three things that were all the same missing thing.
--
-- 1. THE SUMMARY WAS NEVER PERSISTED. It was generated, charged for, and
--    returned in the HTTP body only. Every run whose client disconnected lost
--    its narrative while keeping its scores — the least useful half.
--
-- 2. THE ENDPOINT WAS SYNCHRONOUS. A run takes 2-5 minutes; nginx gives it 60
--    seconds. The work completed server-side and the caller got a 504, which is
--    not a shape a browser can consume. With a run row the request can return
--    immediately and the caller polls.
--
-- 3. THERE WAS NOWHERE TO PUT THE MONTE CARLO. A distribution is not a column
--    on composite_scores.
--
-- `id` is the ExecutionContext.conversationId, which is also the LangGraph
-- thread id and the key llm_usage rows carry. One identifier for a run,
-- everywhere — so a row here, its checkpoints, its cost and its observability
-- events all join without a translation table.

BEGIN;

CREATE TABLE IF NOT EXISTS risk.assessment_runs (
  id                 UUID PRIMARY KEY,
  scope_id           UUID NOT NULL REFERENCES risk.scopes(id) ON DELETE CASCADE,
  subject_id         UUID REFERENCES risk.subjects(id) ON DELETE CASCADE,
  organization_slug  TEXT NOT NULL,
  user_id            TEXT NOT NULL,
  proposition        TEXT NOT NULL,
  background         TEXT,

  status             TEXT NOT NULL DEFAULT 'running'
                       CHECK (status IN ('running', 'completed', 'failed')),
  -- Matches the graph node that is currently executing, so a poller can report
  -- progress without subscribing to the event stream.
  phase              TEXT,

  overall_score      INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  overall_confidence NUMERIC(3,2),
  residual_score     INTEGER CHECK (residual_score >= 0 AND residual_score <= 100),
  executive_summary  TEXT,
  monte_carlo        JSONB,

  error_message      TEXT,
  provider           TEXT,
  model              TEXT,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assessment_runs_subject
  ON risk.assessment_runs (subject_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessment_runs_org_status
  ON risk.assessment_runs (organization_slug, status);

COMMENT ON TABLE risk.assessment_runs IS
  'One row per decision-risk run. id is the ExecutionContext.conversationId, which is also the LangGraph thread id and the llm_usage correlation key.';
COMMENT ON COLUMN risk.assessment_runs.monte_carlo IS
  'Distribution of the composite (and of the residual) from sampling each dimension by its confidence. Percentiles, standard deviation, and probability of exceeding the scope alert threshold.';
COMMENT ON COLUMN risk.assessment_runs.phase IS
  'Currently executing graph node. Lets a poller show progress without the SSE stream.';

-- The API connects as `postgres`; migrations run as `supabase_admin`. Without
-- this the application cannot touch the table it just created. See the note in
-- scripts/migrate-deployed.sh — risk.mitigations shipped without it and failed
-- at runtime after spending the calls that produced its rows.
ALTER TABLE risk.assessment_runs OWNER TO postgres;

COMMIT;

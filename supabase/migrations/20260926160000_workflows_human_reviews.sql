-- Human gates of workflow runs: one row per time a run stops for a person.
--
-- efforts/current/enterprise-workflow-runtime-port.md, Phase 3. Ported from
-- orchestratorai-local's legal.human_checkpoints, with its defects fixed:
--
-- - Unique on (run_id, gate_slug, round). LangGraph re-runs an interrupted
--   node from the top when it resumes, so the gate asks for its review again;
--   the round (from graph state) makes that second ask find the same row
--   instead of creating a duplicate review and a duplicate work task.
-- - A decision is recorded and the run requeued in one guarded statement
--   (see HumanReviewsRepository.respond), so a lost race answers 409 and a
--   half-written decision cannot strand a run.
-- - The decision is stored as given (HumanReviewDecision or answer), with who
--   gave it and when.

BEGIN;

CREATE TABLE workflows.human_reviews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                UUID NOT NULL REFERENCES workflows.runs(id) ON DELETE CASCADE,
  organization_slug     TEXT NOT NULL REFERENCES public.organizations(slug),
  workflow_slug         TEXT NOT NULL,
  gate_slug             TEXT NOT NULL CHECK (gate_slug <> ''),
  round                 INTEGER NOT NULL CHECK (round >= 0),
  kind                  TEXT NOT NULL CHECK (kind IN ('approval', 'answer')),
  allowed_decisions     TEXT[] NOT NULL DEFAULT '{}'
                          CHECK (allowed_decisions <@ ARRAY['approve', 'reject', 'modify']),
  allow_item_decisions  BOOLEAN NOT NULL DEFAULT false,
  payload               JSONB NOT NULL,
  status                TEXT NOT NULL DEFAULT 'waiting'
                          CHECK (status IN ('waiting', 'responded', 'expired')),
  response              JSONB,
  responded_by          UUID REFERENCES auth.users(id),
  responded_at          TIMESTAMPTZ,
  work_task_provider    TEXT,
  work_task_id          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT human_reviews_round_unique UNIQUE (run_id, gate_slug, round),
  CONSTRAINT human_reviews_approval_has_decisions CHECK (
    kind <> 'approval' OR cardinality(allowed_decisions) > 0
  ),
  CONSTRAINT human_reviews_response_matches_status CHECK (
    (status = 'responded') = (response IS NOT NULL AND responded_by IS NOT NULL AND responded_at IS NOT NULL)
  ),
  CONSTRAINT human_reviews_work_task_pair CHECK (
    (work_task_provider IS NULL) = (work_task_id IS NULL)
  )
);

-- At most one open gate per run: a run waits on one person at a time.
CREATE UNIQUE INDEX human_reviews_one_waiting_per_run
  ON workflows.human_reviews (run_id) WHERE status = 'waiting';
CREATE INDEX human_reviews_org_status
  ON workflows.human_reviews (organization_slug, status);

ALTER TABLE workflows.human_reviews OWNER TO postgres;
ALTER TABLE workflows.human_reviews ENABLE ROW LEVEL SECURITY;

COMMIT;

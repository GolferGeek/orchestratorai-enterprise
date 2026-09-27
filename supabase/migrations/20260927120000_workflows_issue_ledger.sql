-- The issue ledger: findings a workflow run raises (by stage) and what
-- happened to each (accepted, rejected, addressed...), with every status
-- change recorded as an event.
--
-- efforts/current/enterprise-workflow-runtime-port.md, Phase 7. Ported from
-- orchestratorai-local's legal.workflow_issue_ledger, with its defects fixed:
-- - Keyed per (run, stage, issue_key): one stage can no longer take over
--   another stage's rows.
-- - A run is required (FK); local silently skipped persistence without one.
-- - Status changes are validated in code and recorded in
--   issue_ledger_events (local had no history).
-- - Nothing domain-specific: `source` is the workflow's own vocabulary and
--   `subject` holds what the issue is about (a clause, a document).

BEGIN;

CREATE TABLE workflows.issue_ledger (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID NOT NULL REFERENCES workflows.runs(id) ON DELETE CASCADE,
  organization_slug   TEXT NOT NULL REFERENCES public.organizations(slug),
  stage_slug          TEXT NOT NULL CHECK (stage_slug <> ''),
  issue_key           TEXT NOT NULL CHECK (issue_key <> ''),
  work_unit_run_id    UUID REFERENCES workflows.work_unit_runs(id) ON DELETE SET NULL,
  source              TEXT NOT NULL CHECK (source <> ''),
  status              TEXT NOT NULL CHECK (status IN
                        ('identified', 'accepted', 'rejected', 'addressed', 'not_addressed', 'report_only')),
  severity            TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  category            TEXT NOT NULL CHECK (category <> ''),
  title               TEXT NOT NULL CHECK (title <> ''),
  finding             TEXT NOT NULL CHECK (finding <> ''),
  recommended_action  TEXT,
  subject             JSONB,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT issue_ledger_key_per_stage UNIQUE (run_id, stage_slug, issue_key)
);
CREATE INDEX issue_ledger_run ON workflows.issue_ledger (run_id);
CREATE INDEX issue_ledger_org_status ON workflows.issue_ledger (organization_slug, status, severity);

CREATE TABLE workflows.issue_ledger_events (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issue_id            UUID NOT NULL REFERENCES workflows.issue_ledger(id) ON DELETE CASCADE,
  run_id              UUID NOT NULL REFERENCES workflows.runs(id) ON DELETE CASCADE,
  organization_slug   TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT NOT NULL,
  -- Who moved it: 'stage:<slug>', 'human:<user id>', or 'system'.
  actor               TEXT NOT NULL CHECK (actor <> ''),
  rationale           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX issue_ledger_events_issue ON workflows.issue_ledger_events (issue_id, id);

ALTER TABLE workflows.issue_ledger OWNER TO postgres;
ALTER TABLE workflows.issue_ledger_events OWNER TO postgres;
ALTER TABLE workflows.issue_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows.issue_ledger_events ENABLE ROW LEVEL SECURITY;

COMMIT;

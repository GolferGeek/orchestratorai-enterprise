-- Restart / replay: a run can branch from another run after one of its work
-- units. parent_run_id is the lineage (kept queryable and cleared if the parent
-- is deleted); restart records the branch point and the overrides.
ALTER TABLE workflows.runs
  ADD COLUMN parent_run_id uuid REFERENCES workflows.runs(id) ON DELETE SET NULL,
  ADD COLUMN restart jsonb;

CREATE INDEX runs_parent_run_id_idx ON workflows.runs (parent_run_id) WHERE parent_run_id IS NOT NULL;

COMMENT ON COLUMN workflows.runs.restart IS
  '{parentRunId, fromWorkUnitRunId, fromWorkUnitSlug, resumeAt, instruction} when this run was restarted from another';

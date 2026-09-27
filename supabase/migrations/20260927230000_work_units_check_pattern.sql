-- Jev rubric checks are work units too (pattern 'check'): each check is a
-- participant (agent 'jev:<rubric>', provider 'jev') in the run's trace.
ALTER TABLE workflows.work_unit_runs DROP CONSTRAINT work_unit_runs_pattern_check;
ALTER TABLE workflows.work_unit_runs ADD CONSTRAINT work_unit_runs_pattern_check
  CHECK (pattern IN ('solo', 'panel', 'red_blue', 'arbitrated', 'summarizer', 'human', 'check'));

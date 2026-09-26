-- Drop copies of orchestratorai-local's workflow runtime tables.
--
-- These arrived through database restores, not through this repo's code: no
-- enterprise code reads any of them, and apart from legal.capability_model_config
-- (created by 20260407100001 for the old Forge product, also unread) no
-- migration here creates them. The workflow runtime being ported from local
-- (efforts/current/enterprise-workflow-runtime-port.md) gets a clean
-- `workflows` schema instead, so these copies must not be mistaken for live
-- data or collide with it. Decision 3, Matt, 2026-09-25.
--
-- Backed up before this ran (pg_dump, outside git):
--   ~/backups/orchestratorai-enterprise/20260926-pre-orphan-drop-schemas.sql.gz
--   ~/backups/orchestratorai-enterprise/20260926-pre-orphan-drop-public-tables.sql.gz
--
-- Deliberately NOT dropped here:
--   - legal.agent_jobs: legal.matter_documents and legal.workflow_outputs
--     still reference it.
--   - the rest of the legal schema (matters, clients, contracts, memory_*, …):
--     domain data awaiting its own decision.
--
-- One DROP without CASCADE: if anything outside this list depends on these
-- tables, the migration fails instead of taking more with it.

BEGIN;

DROP TABLE
  legal.human_checkpoints,
  legal.arbitration_decisions,
  legal.participant_runs,
  legal.work_unit_runs,
  legal.workflow_replay_requests,
  legal.workflow_issue_ledger,
  legal.trace_review_requests,
  legal.workflow_improvement_requests,
  legal.workflow_runs,
  legal.capability_model_config,
  legal.agent_overrides,
  agents.agent_catalog_workflow_links,
  agents.agent_catalog_org_overrides,
  agents.agent_catalog_versions,
  agents.agent_catalog,
  evaluation.evaluator_results,
  evaluation.findings,
  evaluation.workflow_evaluator_agents,
  evaluation.workflow_evaluations,
  evaluation.evaluation_runs,
  evaluation.rubric_versions,
  evaluation.context_snapshots,
  public.human_approvals,
  public.workflow_checkpoints,
  public.workflow_group_items,
  public.workflow_groups,
  public.workflow_registry,
  public.workflow_runs;

DROP SCHEMA agents;
DROP SCHEMA evaluation;

COMMIT;

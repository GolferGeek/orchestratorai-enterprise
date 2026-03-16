-- Phase 5 ADO v1: persist external work-item mappings in local Flow task rows
-- This enables internal UUID task IDs to be resolved to provider-native external IDs.

ALTER TABLE orch_flow.shared_tasks
ADD COLUMN IF NOT EXISTS external_provider TEXT;

ALTER TABLE orch_flow.shared_tasks
ADD COLUMN IF NOT EXISTS external_task_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orch_flow_shared_tasks_external_provider
  ON orch_flow.shared_tasks(external_provider);

CREATE INDEX IF NOT EXISTS idx_orch_flow_shared_tasks_external_task_id
  ON orch_flow.shared_tasks(external_task_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orch_flow_shared_tasks_provider_external
  ON orch_flow.shared_tasks(external_provider, external_task_id)
  WHERE external_provider IS NOT NULL AND external_task_id IS NOT NULL;

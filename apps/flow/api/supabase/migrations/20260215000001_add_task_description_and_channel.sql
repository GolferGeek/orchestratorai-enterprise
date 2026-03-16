-- =============================================================================
-- Add description and channel_id to shared_tasks
-- =============================================================================
-- Phase 4: Development Automation requires:
-- - description: Full task spec for Claude Code (title alone is insufficient)
-- - channel_id: Links task to the Flow channel where it was discussed

ALTER TABLE orch_flow.shared_tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE orch_flow.shared_tasks ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES orch_flow.channels(id) ON DELETE SET NULL;

-- Index for task-channel lookups
CREATE INDEX IF NOT EXISTS idx_orch_flow_shared_tasks_channel ON orch_flow.shared_tasks(channel_id);

-- Index for Claude task listener (filters on assigned_to)
CREATE INDEX IF NOT EXISTS idx_orch_flow_shared_tasks_assigned ON orch_flow.shared_tasks(assigned_to);

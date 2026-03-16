-- Add HITL pending tracking to TASKS (not conversations)
-- This is future-proof for multiple tasks per conversation
-- Task already knows its agent via agent_slug

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS hitl_pending BOOLEAN DEFAULT false;

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS hitl_pending_since TIMESTAMP WITH TIME ZONE;

-- Link deliverables to their creating task
-- This allows us to find the deliverable for a task directly
ALTER TABLE deliverables
ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id);

-- Index for efficient pending query
CREATE INDEX IF NOT EXISTS idx_tasks_hitl_pending
ON tasks (hitl_pending, hitl_pending_since DESC)
WHERE hitl_pending = true;

-- Index for finding deliverables by task
CREATE INDEX IF NOT EXISTS idx_deliverables_task_id
ON deliverables (task_id)
WHERE task_id IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN tasks.hitl_pending IS 'True when this task has a pending HITL review';
COMMENT ON COLUMN tasks.hitl_pending_since IS 'Timestamp when HITL became pending (for ordering)';
COMMENT ON COLUMN deliverables.task_id IS 'Task that created this deliverable (for HITL tracking)';

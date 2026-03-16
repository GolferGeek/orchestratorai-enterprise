-- Migration: Remove deliverable_type from tasks table
-- Reason: deliverable_type is now stored in the deliverables table (linked via task_id)
--         This removes the redundant column from tasks.
-- Date: 2025-01-29

-- First drop the view that depends on this column
DROP VIEW IF EXISTS shared_tasks CASCADE;

-- Remove the deliverable_type column from tasks table
-- The type is now tracked in the deliverables table's type column
ALTER TABLE tasks DROP COLUMN IF EXISTS deliverable_type;

-- Add comment explaining the change
COMMENT ON TABLE tasks IS 'Task records for agent execution. deliverable_type removed in favor of deliverables.type (linked via task_id)';

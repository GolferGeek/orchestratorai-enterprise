-- Backfill task_id for existing deliverables
-- Strategy: Link each deliverable to the most recent task for its conversation
-- This assumes 1:1 conversation:task relationship (current state)

-- First, create a temp table mapping conversation_id -> latest task_id
CREATE TEMP TABLE conversation_task_mapping AS
SELECT DISTINCT ON (conversation_id)
  conversation_id,
  id as task_id
FROM tasks
ORDER BY conversation_id, created_at DESC;

-- Update deliverables with null task_id
UPDATE deliverables d
SET task_id = ctm.task_id
FROM conversation_task_mapping ctm
WHERE d.conversation_id = ctm.conversation_id
  AND d.task_id IS NULL;

-- Log orphaned deliverables (conversations with no tasks)
-- These would be from before task tracking was implemented
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM deliverables
  WHERE task_id IS NULL;

  IF orphan_count > 0 THEN
    RAISE NOTICE 'WARNING: % deliverables have no matching task (legacy data)', orphan_count;
  END IF;
END $$;

-- Clean up
DROP TABLE conversation_task_mapping;

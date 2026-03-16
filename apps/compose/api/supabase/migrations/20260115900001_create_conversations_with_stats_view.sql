-- =============================================================================
-- CONVERSATIONS WITH STATS VIEW
-- =============================================================================
-- Create view that aggregates conversation statistics from tasks
-- This view is required by the agent-conversations endpoint
-- =============================================================================

-- Drop existing view if it exists
DROP VIEW IF EXISTS public.conversations_with_stats;

-- Create view that joins conversations with task statistics
CREATE VIEW public.conversations_with_stats AS
SELECT
    c.id,
    c.user_id,
    c.agent_name,
    c.agent_type,
    c.ended_at,
    c.started_at,
    c.last_active_at,
    c.metadata,
    c.created_at,
    c.updated_at,
    c.organization_slug,
    c.primary_work_product_type,
    c.primary_work_product_id,
    COALESCE(task_stats.task_count, 0) AS task_count,
    COALESCE(task_stats.completed_tasks, 0) AS completed_tasks,
    COALESCE(task_stats.failed_tasks, 0) AS failed_tasks,
    COALESCE(task_stats.active_tasks, 0) AS active_tasks
FROM public.conversations c
LEFT JOIN (
    SELECT
        t.conversation_id,
        COUNT(*) AS task_count,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) AS completed_tasks,
        COUNT(CASE WHEN t.status = 'failed' THEN 1 END) AS failed_tasks,
        COUNT(CASE WHEN t.status IN ('pending', 'running') THEN 1 END) AS active_tasks
    FROM public.tasks t
    GROUP BY t.conversation_id
) task_stats ON c.id = task_stats.conversation_id;

-- Grant access to the view (same as conversations table)
GRANT SELECT ON public.conversations_with_stats TO anon, authenticated;

-- Success notification
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Conversations with stats view created successfully';
    RAISE NOTICE '================================================';
END $$;

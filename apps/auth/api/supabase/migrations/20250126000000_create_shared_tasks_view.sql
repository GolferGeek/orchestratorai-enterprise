-- Create view alias for shared_tasks -> tasks
-- Orch-Flow code expects 'shared_tasks' but migrations create 'tasks'
CREATE OR REPLACE VIEW public.shared_tasks AS SELECT * FROM public.tasks;

-- Grant permissions on the view
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_tasks TO anon, authenticated, service_role;

-- Enable RLS on the view (inherits from underlying table)
-- Note: Views don't support RLS directly, but PostgREST will use the underlying table's RLS


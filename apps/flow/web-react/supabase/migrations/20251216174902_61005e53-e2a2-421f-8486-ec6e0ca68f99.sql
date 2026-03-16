-- Update RLS policies to allow unauthenticated access
DROP POLICY IF EXISTS "Authenticated users can insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated users can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated users can delete tasks" ON public.tasks;

-- Allow anyone to manage tasks (for unauthenticated team use)
CREATE POLICY "Anyone can insert tasks"
ON public.tasks
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update tasks"
ON public.tasks
FOR UPDATE
USING (true);

CREATE POLICY "Anyone can delete tasks"
ON public.tasks
FOR DELETE
USING (true);
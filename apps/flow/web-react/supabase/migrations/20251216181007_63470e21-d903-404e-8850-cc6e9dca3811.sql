-- Add pomodoro_count to tasks for timer tracking
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS pomodoro_count integer DEFAULT 0;

-- Make tasks table support unassigned shared pool (user_id can be null, which it already is)
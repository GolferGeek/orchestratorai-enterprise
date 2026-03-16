-- Create enum for task status
CREATE TYPE public.task_status AS ENUM ('projects', 'this_week', 'today', 'in_progress', 'done');

-- Add status column to tasks table
ALTER TABLE public.tasks ADD COLUMN status public.task_status NOT NULL DEFAULT 'today';

-- Migrate existing completed tasks to 'done' status
UPDATE public.tasks SET status = 'done' WHERE is_completed = true;

-- Add index for better performance on status queries
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_user_id ON public.tasks(user_id);
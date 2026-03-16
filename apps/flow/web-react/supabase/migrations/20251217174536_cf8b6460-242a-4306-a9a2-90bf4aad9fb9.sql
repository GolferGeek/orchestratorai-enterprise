-- Add due_date column to tasks table for task deadlines
ALTER TABLE public.tasks ADD COLUMN due_date timestamp with time zone DEFAULT NULL;
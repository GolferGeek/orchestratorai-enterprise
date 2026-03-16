-- Add parent_task_id for subtasks (unlimited nesting)
ALTER TABLE public.tasks ADD COLUMN parent_task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE;

-- Create index for subtask queries
CREATE INDEX idx_tasks_parent ON public.tasks(parent_task_id);

-- Task collaborators (people working together on a task)
CREATE TABLE public.task_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_name text,
  joined_at timestamp with time zone DEFAULT now(),
  CONSTRAINT collaborator_identity CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

ALTER TABLE public.task_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view collaborators" ON public.task_collaborators FOR SELECT USING (true);
CREATE POLICY "Anyone can add collaborators" ON public.task_collaborators FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can remove collaborators" ON public.task_collaborators FOR DELETE USING (true);

-- Task watchers (people who want to be notified of updates)
CREATE TABLE public.task_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_name text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT watcher_identity CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

ALTER TABLE public.task_watchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view watchers" ON public.task_watchers FOR SELECT USING (true);
CREATE POLICY "Anyone can add watchers" ON public.task_watchers FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can remove watchers" ON public.task_watchers FOR DELETE USING (true);

-- Update requests (ask someone for a status update)
CREATE TABLE public.task_update_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  requested_by_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by_guest text,
  message text,
  created_at timestamp with time zone DEFAULT now(),
  is_resolved boolean DEFAULT false,
  CONSTRAINT requester_identity CHECK (requested_by_user_id IS NOT NULL OR requested_by_guest IS NOT NULL)
);

ALTER TABLE public.task_update_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view update requests" ON public.task_update_requests FOR SELECT USING (true);
CREATE POLICY "Anyone can create update requests" ON public.task_update_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update requests" ON public.task_update_requests FOR UPDATE USING (true);

-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_name text,
  type text NOT NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notification_recipient CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view notifications" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "Anyone can create notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update notifications" ON public.notifications FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete notifications" ON public.notifications FOR DELETE USING (true);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_collaborators;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_watchers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
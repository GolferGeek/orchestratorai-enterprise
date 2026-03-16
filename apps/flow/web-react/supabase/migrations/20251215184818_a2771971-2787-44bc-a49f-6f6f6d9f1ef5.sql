-- Create timer state table (single shared timer)
CREATE TABLE public.timer_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  end_time TIMESTAMPTZ,
  is_running BOOLEAN DEFAULT false,
  is_break BOOLEAN DEFAULT false,
  duration_minutes INTEGER DEFAULT 25,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create shared tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  assigned_to TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS but allow public access (shared timer for all)
ALTER TABLE public.timer_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Public read/write policies for timer_state
CREATE POLICY "Anyone can read timer state" ON public.timer_state FOR SELECT USING (true);
CREATE POLICY "Anyone can update timer state" ON public.timer_state FOR UPDATE USING (true);
CREATE POLICY "Anyone can insert timer state" ON public.timer_state FOR INSERT WITH CHECK (true);

-- Public read/write policies for tasks
CREATE POLICY "Anyone can read tasks" ON public.tasks FOR SELECT USING (true);
CREATE POLICY "Anyone can insert tasks" ON public.tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update tasks" ON public.tasks FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete tasks" ON public.tasks FOR DELETE USING (true);

-- Insert initial timer state
INSERT INTO public.timer_state (is_running, is_break, duration_minutes) VALUES (false, false, 25);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.timer_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
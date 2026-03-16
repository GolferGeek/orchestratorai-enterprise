-- Channels table
CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by_user_id UUID,
  created_by_guest TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

-- Anyone can view/manage channels
CREATE POLICY "Anyone can view channels" ON public.channels FOR SELECT USING (true);
CREATE POLICY "Anyone can create channels" ON public.channels FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update channels" ON public.channels FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete channels" ON public.channels FOR DELETE USING (true);

-- Messages table
CREATE TABLE public.channel_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  user_id UUID,
  guest_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can view/manage messages
CREATE POLICY "Anyone can view messages" ON public.channel_messages FOR SELECT USING (true);
CREATE POLICY "Anyone can create messages" ON public.channel_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update messages" ON public.channel_messages FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete messages" ON public.channel_messages FOR DELETE USING (true);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;

-- Insert default General channel
INSERT INTO public.channels (name, description) VALUES ('General', 'General discussion channel');
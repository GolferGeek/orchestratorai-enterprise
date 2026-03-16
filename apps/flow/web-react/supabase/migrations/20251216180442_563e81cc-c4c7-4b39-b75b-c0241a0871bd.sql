-- Create team_files table for shared files
CREATE TABLE public.team_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  path text NOT NULL DEFAULT '/',
  content text,
  file_type text NOT NULL DEFAULT 'markdown',
  storage_path text,
  size_bytes integer DEFAULT 0,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_guest text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT file_creator CHECK (created_by_user_id IS NOT NULL OR created_by_guest IS NOT NULL)
);

ALTER TABLE public.team_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view files" ON public.team_files FOR SELECT USING (true);
CREATE POLICY "Anyone can create files" ON public.team_files FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update files" ON public.team_files FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete files" ON public.team_files FOR DELETE USING (true);

-- Create team_notes table for quick notes (not persisted as files)
CREATE TABLE public.team_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Untitled Note',
  content text,
  is_pinned boolean DEFAULT false,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_guest text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT note_creator CHECK (created_by_user_id IS NOT NULL OR created_by_guest IS NOT NULL)
);

ALTER TABLE public.team_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view notes" ON public.team_notes FOR SELECT USING (true);
CREATE POLICY "Anyone can create notes" ON public.team_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update notes" ON public.team_notes FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete notes" ON public.team_notes FOR DELETE USING (true);

-- Create storage bucket for file uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('team-files', 'team-files', true);

CREATE POLICY "Anyone can view team files" ON storage.objects FOR SELECT USING (bucket_id = 'team-files');
CREATE POLICY "Anyone can upload team files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'team-files');
CREATE POLICY "Anyone can update team files" ON storage.objects FOR UPDATE USING (bucket_id = 'team-files');
CREATE POLICY "Anyone can delete team files" ON storage.objects FOR DELETE USING (bucket_id = 'team-files');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_files;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_notes;

-- Create indexes
CREATE INDEX idx_team_files_path ON public.team_files(path);
CREATE INDEX idx_team_notes_pinned ON public.team_notes(is_pinned DESC, created_at DESC);
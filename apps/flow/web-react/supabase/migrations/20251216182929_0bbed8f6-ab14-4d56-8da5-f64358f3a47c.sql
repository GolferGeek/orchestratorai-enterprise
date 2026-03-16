-- Table to store GitHub connections per user
CREATE TABLE public.github_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  github_user_id TEXT NOT NULL,
  github_username TEXT NOT NULL,
  access_token TEXT NOT NULL,
  scope TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own connection
CREATE POLICY "Users can view own github connection"
ON public.github_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own github connection"
ON public.github_connections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own github connection"
ON public.github_connections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own github connection"
ON public.github_connections FOR DELETE
USING (auth.uid() = user_id);

-- Table to link tasks to GitHub issues/PRs
CREATE TABLE public.task_github_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  repo_full_name TEXT NOT NULL,
  issue_number INTEGER,
  pr_number INTEGER,
  link_type TEXT NOT NULL CHECK (link_type IN ('issue', 'pr', 'repo')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(task_id, repo_full_name, issue_number),
  UNIQUE(task_id, repo_full_name, pr_number)
);

-- Enable RLS
ALTER TABLE public.task_github_links ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view links
CREATE POLICY "Authenticated users can view github links"
ON public.task_github_links FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can manage links
CREATE POLICY "Authenticated users can insert github links"
ON public.task_github_links FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete github links"
ON public.task_github_links FOR DELETE
TO authenticated
USING (true);
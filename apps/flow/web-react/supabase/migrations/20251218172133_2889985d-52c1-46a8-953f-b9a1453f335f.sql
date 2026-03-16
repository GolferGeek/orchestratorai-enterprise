-- Create teams table
CREATE TABLE public.teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create team_members table
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Add team_id to existing tables
ALTER TABLE public.efforts ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.team_files ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.team_notes ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.timer_state ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.sprints ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.channels ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;

-- Enable RLS on new tables
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Teams policies - authenticated users can view teams they're members of
CREATE POLICY "Users can view teams they belong to"
ON public.teams FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = teams.id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can create teams"
ON public.teams FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Team creators can update their teams"
ON public.teams FOR UPDATE
TO authenticated
USING (created_by_user_id = auth.uid());

CREATE POLICY "Team creators can delete their teams"
ON public.teams FOR DELETE
TO authenticated
USING (created_by_user_id = auth.uid());

-- Team members policies
CREATE POLICY "Users can view members of their teams"
ON public.team_members FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members AS my_membership
    WHERE my_membership.team_id = team_members.team_id
    AND my_membership.user_id = auth.uid()
  )
);

CREATE POLICY "Users can join teams"
ON public.team_members FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave teams"
ON public.team_members FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Update existing table policies to be team-scoped
-- Drop old policies first, then create new team-scoped ones

-- Efforts: team members only
DROP POLICY IF EXISTS "Anyone can view efforts" ON public.efforts;
DROP POLICY IF EXISTS "Anyone can create efforts" ON public.efforts;
DROP POLICY IF EXISTS "Anyone can update efforts" ON public.efforts;
DROP POLICY IF EXISTS "Anyone can delete efforts" ON public.efforts;

CREATE POLICY "Team members can view efforts"
ON public.efforts FOR SELECT
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = efforts.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can create efforts"
ON public.efforts FOR INSERT
TO authenticated
WITH CHECK (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = efforts.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can update efforts"
ON public.efforts FOR UPDATE
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = efforts.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can delete efforts"
ON public.efforts FOR DELETE
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = efforts.team_id
    AND team_members.user_id = auth.uid()
  )
);

-- Tasks: team members only
DROP POLICY IF EXISTS "Everyone can read tasks" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can delete tasks" ON public.tasks;

CREATE POLICY "Team members can view tasks"
ON public.tasks FOR SELECT
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = tasks.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can create tasks"
ON public.tasks FOR INSERT
TO authenticated
WITH CHECK (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = tasks.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can update tasks"
ON public.tasks FOR UPDATE
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = tasks.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can delete tasks"
ON public.tasks FOR DELETE
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = tasks.team_id
    AND team_members.user_id = auth.uid()
  )
);

-- Team files: team members only
DROP POLICY IF EXISTS "Anyone can view files" ON public.team_files;
DROP POLICY IF EXISTS "Anyone can create files" ON public.team_files;
DROP POLICY IF EXISTS "Anyone can update files" ON public.team_files;
DROP POLICY IF EXISTS "Anyone can delete files" ON public.team_files;

CREATE POLICY "Team members can view files"
ON public.team_files FOR SELECT
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = team_files.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can create files"
ON public.team_files FOR INSERT
TO authenticated
WITH CHECK (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = team_files.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can update files"
ON public.team_files FOR UPDATE
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = team_files.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can delete files"
ON public.team_files FOR DELETE
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = team_files.team_id
    AND team_members.user_id = auth.uid()
  )
);

-- Team notes: team members only
DROP POLICY IF EXISTS "Anyone can view notes" ON public.team_notes;
DROP POLICY IF EXISTS "Anyone can create notes" ON public.team_notes;
DROP POLICY IF EXISTS "Anyone can update notes" ON public.team_notes;
DROP POLICY IF EXISTS "Anyone can delete notes" ON public.team_notes;

CREATE POLICY "Team members can view notes"
ON public.team_notes FOR SELECT
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = team_notes.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can create notes"
ON public.team_notes FOR INSERT
TO authenticated
WITH CHECK (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = team_notes.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can update notes"
ON public.team_notes FOR UPDATE
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = team_notes.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can delete notes"
ON public.team_notes FOR DELETE
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = team_notes.team_id
    AND team_members.user_id = auth.uid()
  )
);

-- Timer state: team members only
DROP POLICY IF EXISTS "Anyone can read timer state" ON public.timer_state;
DROP POLICY IF EXISTS "Anyone can update timer state" ON public.timer_state;
DROP POLICY IF EXISTS "Anyone can insert timer state" ON public.timer_state;

CREATE POLICY "Team members can view timer state"
ON public.timer_state FOR SELECT
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = timer_state.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can update timer state"
ON public.timer_state FOR UPDATE
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = timer_state.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can insert timer state"
ON public.timer_state FOR INSERT
TO authenticated
WITH CHECK (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = timer_state.team_id
    AND team_members.user_id = auth.uid()
  )
);

-- Sprints: team members only
DROP POLICY IF EXISTS "Anyone can view sprints" ON public.sprints;
DROP POLICY IF EXISTS "Anyone can create sprints" ON public.sprints;
DROP POLICY IF EXISTS "Anyone can update sprints" ON public.sprints;
DROP POLICY IF EXISTS "Anyone can delete sprints" ON public.sprints;

CREATE POLICY "Team members can view sprints"
ON public.sprints FOR SELECT
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = sprints.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can create sprints"
ON public.sprints FOR INSERT
TO authenticated
WITH CHECK (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = sprints.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can update sprints"
ON public.sprints FOR UPDATE
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = sprints.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can delete sprints"
ON public.sprints FOR DELETE
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = sprints.team_id
    AND team_members.user_id = auth.uid()
  )
);

-- Channels: team members only
DROP POLICY IF EXISTS "Anyone can view channels" ON public.channels;
DROP POLICY IF EXISTS "Anyone can create channels" ON public.channels;
DROP POLICY IF EXISTS "Anyone can update channels" ON public.channels;
DROP POLICY IF EXISTS "Anyone can delete channels" ON public.channels;

CREATE POLICY "Team members can view channels"
ON public.channels FOR SELECT
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = channels.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can create channels"
ON public.channels FOR INSERT
TO authenticated
WITH CHECK (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = channels.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can update channels"
ON public.channels FOR UPDATE
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = channels.team_id
    AND team_members.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can delete channels"
ON public.channels FOR DELETE
TO authenticated
USING (
  team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = channels.team_id
    AND team_members.user_id = auth.uid()
  )
);

-- Goals: update policies for team scope (goals are linked via efforts)
DROP POLICY IF EXISTS "Anyone can view goals" ON public.goals;
DROP POLICY IF EXISTS "Anyone can create goals" ON public.goals;
DROP POLICY IF EXISTS "Anyone can update goals" ON public.goals;
DROP POLICY IF EXISTS "Anyone can delete goals" ON public.goals;

CREATE POLICY "Team members can view goals"
ON public.goals FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.efforts
    WHERE efforts.id = goals.effort_id
    AND (
      efforts.team_id IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_members.team_id = efforts.team_id
        AND team_members.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Team members can create goals"
ON public.goals FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.efforts
    WHERE efforts.id = goals.effort_id
    AND (
      efforts.team_id IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_members.team_id = efforts.team_id
        AND team_members.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Team members can update goals"
ON public.goals FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.efforts
    WHERE efforts.id = goals.effort_id
    AND (
      efforts.team_id IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_members.team_id = efforts.team_id
        AND team_members.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Team members can delete goals"
ON public.goals FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.efforts
    WHERE efforts.id = goals.effort_id
    AND (
      efforts.team_id IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_members.team_id = efforts.team_id
        AND team_members.user_id = auth.uid()
      )
    )
  )
);

-- Projects: update policies for team scope (projects are linked via goals -> efforts)
DROP POLICY IF EXISTS "Anyone can view projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can create projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can update projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can delete projects" ON public.projects;

CREATE POLICY "Team members can view projects"
ON public.projects FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.goals
    JOIN public.efforts ON efforts.id = goals.effort_id
    WHERE goals.id = projects.goal_id
    AND (
      efforts.team_id IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_members.team_id = efforts.team_id
        AND team_members.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Team members can create projects"
ON public.projects FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.goals
    JOIN public.efforts ON efforts.id = goals.effort_id
    WHERE goals.id = projects.goal_id
    AND (
      efforts.team_id IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_members.team_id = efforts.team_id
        AND team_members.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Team members can update projects"
ON public.projects FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.goals
    JOIN public.efforts ON efforts.id = goals.effort_id
    WHERE goals.id = projects.goal_id
    AND (
      efforts.team_id IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_members.team_id = efforts.team_id
        AND team_members.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Team members can delete projects"
ON public.projects FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.goals
    JOIN public.efforts ON efforts.id = goals.effort_id
    WHERE goals.id = projects.goal_id
    AND (
      efforts.team_id IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_members.team_id = efforts.team_id
        AND team_members.user_id = auth.uid()
      )
    )
  )
);

-- Add teams and team_members to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
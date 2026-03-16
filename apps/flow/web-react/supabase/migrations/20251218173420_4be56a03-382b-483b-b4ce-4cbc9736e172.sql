-- Drop all existing policies on team_members to fix recursion
DROP POLICY IF EXISTS "Team members can view their team members" ON public.team_members;
DROP POLICY IF EXISTS "Team owners can manage team members" ON public.team_members;
DROP POLICY IF EXISTS "Users can join teams" ON public.team_members;
DROP POLICY IF EXISTS "Users can leave teams" ON public.team_members;

-- Recreate team_members policies WITHOUT referencing team_members itself
CREATE POLICY "Users can view team members of their teams"
ON public.team_members FOR SELECT
USING (
  user_id = auth.uid() OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

CREATE POLICY "Users can join teams"
ON public.team_members FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave teams"
ON public.team_members FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY "Team owners can manage members"
ON public.team_members FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.teams t 
    WHERE t.id = team_id AND t.created_by_user_id = auth.uid()
  )
);

-- Fix policies on other tables that might have similar issues
-- Use a simpler approach: check team membership directly

-- Drop and recreate tasks policy
DROP POLICY IF EXISTS "Users can view tasks in their teams" ON public.tasks;
DROP POLICY IF EXISTS "Users can manage tasks in their teams" ON public.tasks;

CREATE POLICY "Users can view tasks in their teams"
ON public.tasks FOR SELECT
USING (
  team_id IS NULL OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

CREATE POLICY "Users can manage tasks in their teams"
ON public.tasks FOR ALL
USING (
  team_id IS NULL OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

-- Fix sprints policies
DROP POLICY IF EXISTS "Users can view sprints in their teams" ON public.sprints;
DROP POLICY IF EXISTS "Users can manage sprints in their teams" ON public.sprints;

CREATE POLICY "Users can view sprints in their teams"
ON public.sprints FOR SELECT
USING (
  team_id IS NULL OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

CREATE POLICY "Users can manage sprints in their teams"
ON public.sprints FOR ALL
USING (
  team_id IS NULL OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

-- Fix efforts policies
DROP POLICY IF EXISTS "Users can view efforts in their teams" ON public.efforts;
DROP POLICY IF EXISTS "Users can manage efforts in their teams" ON public.efforts;

CREATE POLICY "Users can view efforts in their teams"
ON public.efforts FOR SELECT
USING (
  team_id IS NULL OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

CREATE POLICY "Users can manage efforts in their teams"
ON public.efforts FOR ALL
USING (
  team_id IS NULL OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

-- Fix goals policies  
DROP POLICY IF EXISTS "Users can view goals in their team efforts" ON public.goals;
DROP POLICY IF EXISTS "Users can manage goals in their team efforts" ON public.goals;

CREATE POLICY "Users can view goals in their team efforts"
ON public.goals FOR SELECT
USING (
  effort_id IN (
    SELECT e.id FROM public.efforts e 
    WHERE e.team_id IS NULL OR e.team_id IN (
      SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can manage goals in their team efforts"
ON public.goals FOR ALL
USING (
  effort_id IN (
    SELECT e.id FROM public.efforts e 
    WHERE e.team_id IS NULL OR e.team_id IN (
      SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()
    )
  )
);

-- Fix projects policies
DROP POLICY IF EXISTS "Users can view projects in their team goals" ON public.projects;
DROP POLICY IF EXISTS "Users can manage projects in their team goals" ON public.projects;

CREATE POLICY "Users can view projects in their team goals"
ON public.projects FOR SELECT
USING (
  goal_id IN (
    SELECT g.id FROM public.goals g
    JOIN public.efforts e ON g.effort_id = e.id
    WHERE e.team_id IS NULL OR e.team_id IN (
      SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can manage projects in their team goals"
ON public.projects FOR ALL
USING (
  goal_id IN (
    SELECT g.id FROM public.goals g
    JOIN public.efforts e ON g.effort_id = e.id
    WHERE e.team_id IS NULL OR e.team_id IN (
      SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()
    )
  )
);

-- Fix timer_state policies
DROP POLICY IF EXISTS "Users can view timer in their teams" ON public.timer_state;
DROP POLICY IF EXISTS "Users can manage timer in their teams" ON public.timer_state;

CREATE POLICY "Users can view timer in their teams"
ON public.timer_state FOR SELECT
USING (
  team_id IS NULL OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

CREATE POLICY "Users can manage timer in their teams"
ON public.timer_state FOR ALL
USING (
  team_id IS NULL OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

-- Fix team_files policies
DROP POLICY IF EXISTS "Users can view files in their teams" ON public.team_files;
DROP POLICY IF EXISTS "Users can manage files in their teams" ON public.team_files;

CREATE POLICY "Users can view files in their teams"
ON public.team_files FOR SELECT
USING (
  team_id IS NULL OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

CREATE POLICY "Users can manage files in their teams"
ON public.team_files FOR ALL
USING (
  team_id IS NULL OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

-- Fix team_notes policies
DROP POLICY IF EXISTS "Users can view notes in their teams" ON public.team_notes;
DROP POLICY IF EXISTS "Users can manage notes in their teams" ON public.team_notes;

CREATE POLICY "Users can view notes in their teams"
ON public.team_notes FOR SELECT
USING (
  team_id IS NULL OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

CREATE POLICY "Users can manage notes in their teams"
ON public.team_notes FOR ALL
USING (
  team_id IS NULL OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

-- Fix channels policies
DROP POLICY IF EXISTS "Users can view channels in their teams" ON public.channels;
DROP POLICY IF EXISTS "Users can manage channels in their teams" ON public.channels;

CREATE POLICY "Users can view channels in their teams"
ON public.channels FOR SELECT
USING (
  team_id IS NULL OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

CREATE POLICY "Users can manage channels in their teams"
ON public.channels FOR ALL
USING (
  team_id IS NULL OR 
  team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);
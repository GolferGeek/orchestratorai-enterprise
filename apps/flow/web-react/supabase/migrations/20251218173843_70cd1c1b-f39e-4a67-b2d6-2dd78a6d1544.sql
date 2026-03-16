-- Drop all existing policies on efforts, goals, projects and recreate using security definer function

-- EFFORTS
DROP POLICY IF EXISTS "Team members can create efforts" ON public.efforts;
DROP POLICY IF EXISTS "Team members can delete efforts" ON public.efforts;
DROP POLICY IF EXISTS "Team members can update efforts" ON public.efforts;
DROP POLICY IF EXISTS "Team members can view efforts" ON public.efforts;
DROP POLICY IF EXISTS "Users can manage efforts in their teams" ON public.efforts;
DROP POLICY IF EXISTS "Users can view efforts in their teams" ON public.efforts;

CREATE POLICY "Users can view efforts in their teams"
ON public.efforts FOR SELECT
USING (team_id IS NULL OR public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can create efforts in their teams"
ON public.efforts FOR INSERT
WITH CHECK (team_id IS NULL OR public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can update efforts in their teams"
ON public.efforts FOR UPDATE
USING (team_id IS NULL OR public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can delete efforts in their teams"
ON public.efforts FOR DELETE
USING (team_id IS NULL OR public.is_team_member(auth.uid(), team_id));

-- GOALS - need to check via effort's team
-- Create helper function for goals
CREATE OR REPLACE FUNCTION public.can_access_goal(_user_id uuid, _effort_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.efforts e
    WHERE e.id = _effort_id
      AND (e.team_id IS NULL OR public.is_team_member(_user_id, e.team_id))
  )
$$;

DROP POLICY IF EXISTS "Team members can create goals" ON public.goals;
DROP POLICY IF EXISTS "Team members can delete goals" ON public.goals;
DROP POLICY IF EXISTS "Team members can update goals" ON public.goals;
DROP POLICY IF EXISTS "Team members can view goals" ON public.goals;
DROP POLICY IF EXISTS "Users can manage goals in their team efforts" ON public.goals;
DROP POLICY IF EXISTS "Users can view goals in their team efforts" ON public.goals;

CREATE POLICY "Users can view goals"
ON public.goals FOR SELECT
USING (public.can_access_goal(auth.uid(), effort_id));

CREATE POLICY "Users can create goals"
ON public.goals FOR INSERT
WITH CHECK (public.can_access_goal(auth.uid(), effort_id));

CREATE POLICY "Users can update goals"
ON public.goals FOR UPDATE
USING (public.can_access_goal(auth.uid(), effort_id));

CREATE POLICY "Users can delete goals"
ON public.goals FOR DELETE
USING (public.can_access_goal(auth.uid(), effort_id));

-- PROJECTS - need to check via goal's effort's team
CREATE OR REPLACE FUNCTION public.can_access_project(_user_id uuid, _goal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.goals g
    JOIN public.efforts e ON e.id = g.effort_id
    WHERE g.id = _goal_id
      AND (e.team_id IS NULL OR public.is_team_member(_user_id, e.team_id))
  )
$$;

DROP POLICY IF EXISTS "Team members can create projects" ON public.projects;
DROP POLICY IF EXISTS "Team members can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Team members can update projects" ON public.projects;
DROP POLICY IF EXISTS "Team members can view projects" ON public.projects;
DROP POLICY IF EXISTS "Users can manage projects in their team goals" ON public.projects;
DROP POLICY IF EXISTS "Users can view projects in their team goals" ON public.projects;

CREATE POLICY "Users can view projects"
ON public.projects FOR SELECT
USING (public.can_access_project(auth.uid(), goal_id));

CREATE POLICY "Users can create projects"
ON public.projects FOR INSERT
WITH CHECK (public.can_access_project(auth.uid(), goal_id));

CREATE POLICY "Users can update projects"
ON public.projects FOR UPDATE
USING (public.can_access_project(auth.uid(), goal_id));

CREATE POLICY "Users can delete projects"
ON public.projects FOR DELETE
USING (public.can_access_project(auth.uid(), goal_id));
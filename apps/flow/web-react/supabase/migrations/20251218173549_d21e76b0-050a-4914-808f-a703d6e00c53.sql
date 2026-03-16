-- First create a security definer function to check team membership without RLS
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members
    WHERE user_id = _user_id
      AND team_id = _team_id
  )
$$;

-- Create function to get all team IDs for a user
CREATE OR REPLACE FUNCTION public.get_user_team_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id
  FROM public.team_members
  WHERE user_id = _user_id
$$;

-- Drop ALL existing policies on team_members
DROP POLICY IF EXISTS "Team owners can manage members" ON public.team_members;
DROP POLICY IF EXISTS "Users can join teams" ON public.team_members;
DROP POLICY IF EXISTS "Users can leave teams" ON public.team_members;
DROP POLICY IF EXISTS "Users can view members of their teams" ON public.team_members;
DROP POLICY IF EXISTS "Users can view team members of their teams" ON public.team_members;

-- Create new simple policies for team_members that don't reference themselves
-- Users can view their own memberships
CREATE POLICY "Users can view own memberships"
ON public.team_members FOR SELECT
USING (user_id = auth.uid());

-- Users can view other members in teams they belong to (using security definer function)
CREATE POLICY "Users can view team members"
ON public.team_members FOR SELECT
USING (public.is_team_member(auth.uid(), team_id));

-- Users can join any team (insert their own record)
CREATE POLICY "Users can join teams"
ON public.team_members FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can leave teams (delete their own record)
CREATE POLICY "Users can leave teams"
ON public.team_members FOR DELETE
USING (user_id = auth.uid());

-- Team creators can manage members
CREATE POLICY "Team creators can manage members"
ON public.team_members FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.teams t 
    WHERE t.id = team_members.team_id 
    AND t.created_by_user_id = auth.uid()
  )
);

-- Now fix the teams table policies
DROP POLICY IF EXISTS "Users can view teams they belong to" ON public.teams;

-- Teams: users can view teams they belong to using the security definer function
CREATE POLICY "Users can view their teams"
ON public.teams FOR SELECT
USING (public.is_team_member(auth.uid(), id));

-- Also need to allow users to view a team they just created (before joining as member)
CREATE POLICY "Creators can view their teams"
ON public.teams FOR SELECT
USING (created_by_user_id = auth.uid());
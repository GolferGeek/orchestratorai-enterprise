-- Move efforts, goals, and projects tables to orch_flow schema
-- These tables are currently in public schema but the client expects them in orch_flow

-- First, ensure the is_team_member function exists in orch_flow schema
CREATE OR REPLACE FUNCTION orch_flow.is_team_member(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = orch_flow, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM orch_flow.team_members
    WHERE user_id = _user_id
      AND team_id = _team_id
  )
$$;

-- Create the tables in orch_flow schema if they don't exist
CREATE TABLE IF NOT EXISTS orch_flow.efforts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  team_id UUID REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orch_flow.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effort_id UUID NOT NULL REFERENCES orch_flow.efforts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orch_flow.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES orch_flow.goals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE orch_flow.efforts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.projects ENABLE ROW LEVEL SECURITY;

-- Efforts policies
CREATE POLICY "Users can view efforts in their teams"
ON orch_flow.efforts FOR SELECT
USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can create efforts in their teams"
ON orch_flow.efforts FOR INSERT
WITH CHECK (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can update efforts in their teams"
ON orch_flow.efforts FOR UPDATE
USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can delete efforts in their teams"
ON orch_flow.efforts FOR DELETE
USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

-- Goals policies
CREATE POLICY "Users can view goals"
ON orch_flow.goals FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM orch_flow.efforts e
    WHERE e.id = goals.effort_id
      AND (e.team_id IS NULL OR orch_flow.is_team_member(auth.uid(), e.team_id))
  )
);

CREATE POLICY "Users can create goals"
ON orch_flow.goals FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM orch_flow.efforts e
    WHERE e.id = goals.effort_id
      AND (e.team_id IS NULL OR orch_flow.is_team_member(auth.uid(), e.team_id))
  )
);

CREATE POLICY "Users can update goals"
ON orch_flow.goals FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM orch_flow.efforts e
    WHERE e.id = goals.effort_id
      AND (e.team_id IS NULL OR orch_flow.is_team_member(auth.uid(), e.team_id))
  )
);

CREATE POLICY "Users can delete goals"
ON orch_flow.goals FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM orch_flow.efforts e
    WHERE e.id = goals.effort_id
      AND (e.team_id IS NULL OR orch_flow.is_team_member(auth.uid(), e.team_id))
  )
);

-- Projects policies
CREATE POLICY "Users can view projects"
ON orch_flow.projects FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM orch_flow.goals g
    JOIN orch_flow.efforts e ON e.id = g.effort_id
    WHERE g.id = projects.goal_id
      AND (e.team_id IS NULL OR orch_flow.is_team_member(auth.uid(), e.team_id))
  )
);

CREATE POLICY "Users can create projects"
ON orch_flow.projects FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM orch_flow.goals g
    JOIN orch_flow.efforts e ON e.id = g.effort_id
    WHERE g.id = projects.goal_id
      AND (e.team_id IS NULL OR orch_flow.is_team_member(auth.uid(), e.team_id))
  )
);

CREATE POLICY "Users can update projects"
ON orch_flow.projects FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM orch_flow.goals g
    JOIN orch_flow.efforts e ON e.id = g.effort_id
    WHERE g.id = projects.goal_id
      AND (e.team_id IS NULL OR orch_flow.is_team_member(auth.uid(), e.team_id))
  )
);

CREATE POLICY "Users can delete projects"
ON orch_flow.projects FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM orch_flow.goals g
    JOIN orch_flow.efforts e ON e.id = g.effort_id
    WHERE g.id = projects.goal_id
      AND (e.team_id IS NULL OR orch_flow.is_team_member(auth.uid(), e.team_id))
  )
);

-- Migrate data from public schema if tables exist there
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'efforts') THEN
    INSERT INTO orch_flow.efforts (id, name, description, team_id, created_at, updated_at)
    SELECT id, name, description, team_id, created_at, updated_at
    FROM public.efforts
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'goals') THEN
    INSERT INTO orch_flow.goals (id, effort_id, name, description, created_at, updated_at)
    SELECT id, effort_id, name, description, created_at, updated_at
    FROM public.goals
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    INSERT INTO orch_flow.projects (id, goal_id, name, description, created_at, updated_at)
    SELECT id, goal_id, name, description, created_at, updated_at
    FROM public.projects
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Drop old public schema tables (if they exist)
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.goals CASCADE;
DROP TABLE IF EXISTS public.efforts CASCADE;

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.efforts;
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.goals;
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.projects;

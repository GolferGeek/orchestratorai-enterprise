-- Migration: Recreate team_files table in orch_flow schema
-- Previously dropped in 20251227000001. Bringing back with improved schema using parent_id
-- for tree hierarchy instead of path strings.

CREATE TABLE orch_flow.team_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES orch_flow.team_files(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_folder BOOLEAN NOT NULL DEFAULT false,
  content TEXT,
  file_type TEXT NOT NULL DEFAULT 'markdown',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_team_files_team_id ON orch_flow.team_files(team_id);
CREATE INDEX idx_team_files_parent_id ON orch_flow.team_files(parent_id);
CREATE INDEX idx_team_files_team_parent ON orch_flow.team_files(team_id, parent_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION orch_flow.set_team_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER team_files_updated_at
  BEFORE UPDATE ON orch_flow.team_files
  FOR EACH ROW
  EXECUTE FUNCTION orch_flow.set_team_files_updated_at();

-- Enable RLS
ALTER TABLE orch_flow.team_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies: team members can read, team members can manage
CREATE POLICY "Team members can view team files"
  ON orch_flow.team_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = team_files.team_id
        AND team_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can manage team files"
  ON orch_flow.team_files FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = team_files.team_id
        AND team_members.user_id = auth.uid()
    )
  );

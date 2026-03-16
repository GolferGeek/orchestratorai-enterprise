-- =============================================================================
-- Orch-Flow Schema - SyncFocus Tables (Team Collaboration Features)
-- =============================================================================
-- This migration adds the SyncFocus app tables to the orch_flow schema
-- These tables support teams, tasks, timer, files, notes, and messaging

-- =============================================================================
-- Task Status Type
-- =============================================================================
CREATE TYPE orch_flow.task_status AS ENUM ('projects', 'this_week', 'today', 'in_progress', 'done');

-- =============================================================================
-- Profiles Table (display names for users)
-- =============================================================================
CREATE TABLE orch_flow.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Teams Table
-- =============================================================================
CREATE TABLE orch_flow.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_public BOOLEAN NOT NULL DEFAULT true,
  join_passcode TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Team Members Table
-- =============================================================================
CREATE TABLE orch_flow.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- =============================================================================
-- Timer State Table (shared pomodoro timer per team)
-- =============================================================================
CREATE TABLE orch_flow.timer_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
  end_time TIMESTAMPTZ,
  is_running BOOLEAN DEFAULT false,
  is_break BOOLEAN DEFAULT false,
  duration_seconds INTEGER DEFAULT 1500, -- 25 minutes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Sprints Table
-- =============================================================================
CREATE TABLE orch_flow.sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Shared Tasks Table (kanban/pomodoro tasks)
-- =============================================================================
CREATE TABLE orch_flow.shared_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  assigned_to TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status orch_flow.task_status NOT NULL DEFAULT 'today',
  parent_task_id UUID REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE,
  pomodoro_count INTEGER DEFAULT 0,
  project_id UUID, -- References orch_flow.projects if linked
  sprint_id UUID REFERENCES orch_flow.sprints(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Task Collaborators (people working together on a task)
-- =============================================================================
CREATE TABLE orch_flow.task_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_name TEXT,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT collaborator_identity CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

-- =============================================================================
-- Task Watchers (people who want notifications)
-- =============================================================================
CREATE TABLE orch_flow.task_watchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT watcher_identity CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

-- =============================================================================
-- Task Update Requests
-- =============================================================================
CREATE TABLE orch_flow.task_update_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE,
  requested_by_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by_guest TEXT,
  message TEXT,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT requester_identity CHECK (requested_by_user_id IS NOT NULL OR requested_by_guest IS NOT NULL)
);

-- =============================================================================
-- Notifications Table
-- =============================================================================
CREATE TABLE orch_flow.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_name TEXT,
  type TEXT NOT NULL,
  task_id UUID REFERENCES orch_flow.shared_tasks(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT notification_recipient CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

-- =============================================================================
-- Team Files Table
-- =============================================================================
CREATE TABLE orch_flow.team_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  content TEXT,
  file_type TEXT NOT NULL DEFAULT 'markdown',
  storage_path TEXT,
  size_bytes INTEGER DEFAULT 0,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_guest TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Team Notes Table
-- =============================================================================
CREATE TABLE orch_flow.team_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Note',
  content TEXT,
  is_pinned BOOLEAN DEFAULT false,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_guest TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Channels Table (chat channels)
-- =============================================================================
CREATE TABLE orch_flow.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES orch_flow.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_guest TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Channel Messages Table
-- =============================================================================
CREATE TABLE orch_flow.channel_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES orch_flow.channels(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Security Definer Functions for RLS
-- =============================================================================

-- Check if user is a team member
CREATE OR REPLACE FUNCTION orch_flow.is_team_member(_user_id UUID, _team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = orch_flow
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM orch_flow.team_members
    WHERE user_id = _user_id
      AND team_id = _team_id
  )
$$;

-- Get all team IDs for a user
CREATE OR REPLACE FUNCTION orch_flow.get_user_team_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = orch_flow
AS $$
  SELECT team_id
  FROM orch_flow.team_members
  WHERE user_id = _user_id
$$;

-- =============================================================================
-- Enable RLS on all tables
-- =============================================================================
ALTER TABLE orch_flow.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.timer_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.shared_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.task_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.task_watchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.task_update_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.team_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.team_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE orch_flow.channel_messages ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS Policies - Profiles
-- =============================================================================
CREATE POLICY "Profiles are viewable by everyone"
  ON orch_flow.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON orch_flow.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON orch_flow.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- =============================================================================
-- RLS Policies - Teams
-- =============================================================================
CREATE POLICY "Users can view their teams"
  ON orch_flow.teams FOR SELECT
  USING (orch_flow.is_team_member(auth.uid(), id) OR created_by_user_id = auth.uid());

CREATE POLICY "Anyone can view public teams"
  ON orch_flow.teams FOR SELECT
  USING (is_public = true);

CREATE POLICY "Authenticated users can create teams"
  ON orch_flow.teams FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Team creators can update their teams"
  ON orch_flow.teams FOR UPDATE
  USING (created_by_user_id = auth.uid());

CREATE POLICY "Team creators can delete their teams"
  ON orch_flow.teams FOR DELETE
  USING (created_by_user_id = auth.uid());

-- =============================================================================
-- RLS Policies - Team Members
-- =============================================================================
CREATE POLICY "Users can view own memberships"
  ON orch_flow.team_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can view team members"
  ON orch_flow.team_members FOR SELECT
  USING (orch_flow.is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can join teams"
  ON orch_flow.team_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave teams"
  ON orch_flow.team_members FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Team creators can manage members"
  ON orch_flow.team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM orch_flow.teams t
      WHERE t.id = team_members.team_id
      AND t.created_by_user_id = auth.uid()
    )
  );

-- =============================================================================
-- RLS Policies - Timer State
-- =============================================================================
CREATE POLICY "Users can view timer in their teams"
  ON orch_flow.timer_state FOR SELECT
  USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can manage timer in their teams"
  ON orch_flow.timer_state FOR ALL
  USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

-- =============================================================================
-- RLS Policies - Sprints
-- =============================================================================
CREATE POLICY "Users can view sprints in their teams"
  ON orch_flow.sprints FOR SELECT
  USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can manage sprints in their teams"
  ON orch_flow.sprints FOR ALL
  USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

-- =============================================================================
-- RLS Policies - Shared Tasks
-- =============================================================================
CREATE POLICY "Users can view tasks in their teams"
  ON orch_flow.shared_tasks FOR SELECT
  USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can manage tasks in their teams"
  ON orch_flow.shared_tasks FOR ALL
  USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

-- =============================================================================
-- RLS Policies - Task Collaboration Tables
-- =============================================================================
CREATE POLICY "Anyone can view collaborators"
  ON orch_flow.task_collaborators FOR SELECT USING (true);
CREATE POLICY "Anyone can add collaborators"
  ON orch_flow.task_collaborators FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can remove collaborators"
  ON orch_flow.task_collaborators FOR DELETE USING (true);

CREATE POLICY "Anyone can view watchers"
  ON orch_flow.task_watchers FOR SELECT USING (true);
CREATE POLICY "Anyone can add watchers"
  ON orch_flow.task_watchers FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can remove watchers"
  ON orch_flow.task_watchers FOR DELETE USING (true);

CREATE POLICY "Anyone can view update requests"
  ON orch_flow.task_update_requests FOR SELECT USING (true);
CREATE POLICY "Anyone can create update requests"
  ON orch_flow.task_update_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update requests"
  ON orch_flow.task_update_requests FOR UPDATE USING (true);

-- =============================================================================
-- RLS Policies - Notifications
-- =============================================================================
CREATE POLICY "Anyone can view notifications"
  ON orch_flow.notifications FOR SELECT USING (true);
CREATE POLICY "Anyone can create notifications"
  ON orch_flow.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update notifications"
  ON orch_flow.notifications FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete notifications"
  ON orch_flow.notifications FOR DELETE USING (true);

-- =============================================================================
-- RLS Policies - Team Files
-- =============================================================================
CREATE POLICY "Users can view files in their teams"
  ON orch_flow.team_files FOR SELECT
  USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can manage files in their teams"
  ON orch_flow.team_files FOR ALL
  USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

-- =============================================================================
-- RLS Policies - Team Notes
-- =============================================================================
CREATE POLICY "Users can view notes in their teams"
  ON orch_flow.team_notes FOR SELECT
  USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can manage notes in their teams"
  ON orch_flow.team_notes FOR ALL
  USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

-- =============================================================================
-- RLS Policies - Channels
-- =============================================================================
CREATE POLICY "Users can view channels in their teams"
  ON orch_flow.channels FOR SELECT
  USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can manage channels in their teams"
  ON orch_flow.channels FOR ALL
  USING (team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id));

-- =============================================================================
-- RLS Policies - Channel Messages
-- =============================================================================
CREATE POLICY "Users can view messages in accessible channels"
  ON orch_flow.channel_messages FOR SELECT
  USING (
    channel_id IN (
      SELECT c.id FROM orch_flow.channels c
      WHERE c.team_id IS NULL OR orch_flow.is_team_member(auth.uid(), c.team_id)
    )
  );

CREATE POLICY "Users can send messages in accessible channels"
  ON orch_flow.channel_messages FOR INSERT
  WITH CHECK (
    channel_id IN (
      SELECT c.id FROM orch_flow.channels c
      WHERE c.team_id IS NULL OR orch_flow.is_team_member(auth.uid(), c.team_id)
    )
  );

CREATE POLICY "Users can manage their own messages"
  ON orch_flow.channel_messages FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own messages"
  ON orch_flow.channel_messages FOR DELETE
  USING (user_id = auth.uid());

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX idx_orch_flow_team_members_team ON orch_flow.team_members(team_id);
CREATE INDEX idx_orch_flow_team_members_user ON orch_flow.team_members(user_id);
CREATE INDEX idx_orch_flow_shared_tasks_team ON orch_flow.shared_tasks(team_id);
CREATE INDEX idx_orch_flow_shared_tasks_status ON orch_flow.shared_tasks(status);
CREATE INDEX idx_orch_flow_shared_tasks_user ON orch_flow.shared_tasks(user_id);
CREATE INDEX idx_orch_flow_shared_tasks_parent ON orch_flow.shared_tasks(parent_task_id);
CREATE INDEX idx_orch_flow_timer_state_team ON orch_flow.timer_state(team_id);
CREATE INDEX idx_orch_flow_sprints_team ON orch_flow.sprints(team_id);
CREATE INDEX idx_orch_flow_team_files_team ON orch_flow.team_files(team_id);
CREATE INDEX idx_orch_flow_team_files_path ON orch_flow.team_files(path);
CREATE INDEX idx_orch_flow_team_notes_team ON orch_flow.team_notes(team_id);
CREATE INDEX idx_orch_flow_team_notes_pinned ON orch_flow.team_notes(is_pinned DESC, created_at DESC);
CREATE INDEX idx_orch_flow_channels_team ON orch_flow.channels(team_id);
CREATE INDEX idx_orch_flow_channel_messages_channel ON orch_flow.channel_messages(channel_id);

-- =============================================================================
-- Enable Realtime
-- =============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.teams;
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.team_members;
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.timer_state;
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.sprints;
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.shared_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.task_collaborators;
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.task_watchers;
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.team_files;
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.team_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.channels;
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.channel_messages;

-- =============================================================================
-- Trigger for profile creation on user signup
-- =============================================================================
CREATE OR REPLACE FUNCTION orch_flow.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = orch_flow
AS $$
BEGIN
  INSERT INTO orch_flow.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created_orch_flow'
  ) THEN
    CREATE TRIGGER on_auth_user_created_orch_flow
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION orch_flow.handle_new_user();
  END IF;
END
$$;

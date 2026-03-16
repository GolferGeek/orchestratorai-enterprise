-- Migration: Remove ALL team-related tables from orch_flow schema
--
-- Reason: All team data (teams, team_members) is stored in public schema and accessed via API.
--         team_files and team_notes functionality moved to Open Notebook (SurrealDB).
--         Orch-Flow should NOT have any team-related tables in its schema.

-- ============================================
-- Step 1: Remove from Realtime publication
-- ============================================
-- Remove orch_flow.teams from realtime publication (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'orch_flow'
    AND tablename = 'teams'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE orch_flow.teams;
  END IF;
END $$;

-- Remove orch_flow.team_members from realtime publication (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'orch_flow'
    AND tablename = 'team_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE orch_flow.team_members;
  END IF;
END $$;

-- Remove orch_flow.team_files from realtime publication (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'orch_flow'
    AND tablename = 'team_files'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE orch_flow.team_files;
  END IF;
END $$;

-- Remove orch_flow.team_notes from realtime publication (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'orch_flow'
    AND tablename = 'team_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE orch_flow.team_notes;
  END IF;
END $$;

-- ============================================
-- Step 2: Drop RLS policies (only if tables exist)
-- ============================================
-- Teams policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'orch_flow' AND tablename = 'teams') THEN
    DROP POLICY IF EXISTS "Anyone can view teams" ON orch_flow.teams;
    DROP POLICY IF EXISTS "Team creators can create teams" ON orch_flow.teams;
    DROP POLICY IF EXISTS "Team creators can update teams" ON orch_flow.teams;
    DROP POLICY IF EXISTS "Team creators can delete teams" ON orch_flow.teams;
  END IF;
END $$;

-- Team members policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'orch_flow' AND tablename = 'team_members') THEN
    DROP POLICY IF EXISTS "Team members can view team members" ON orch_flow.team_members;
    DROP POLICY IF EXISTS "Team members can view their own membership" ON orch_flow.team_members;
    DROP POLICY IF EXISTS "Anyone can view team members" ON orch_flow.team_members;
  END IF;
END $$;

-- Team files policies (only if table exists - may have been removed by earlier migration)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'orch_flow' AND tablename = 'team_files') THEN
    DROP POLICY IF EXISTS "Team members can view team files" ON orch_flow.team_files;
    DROP POLICY IF EXISTS "Team members can create files" ON orch_flow.team_files;
    DROP POLICY IF EXISTS "File creators can update files" ON orch_flow.team_files;
    DROP POLICY IF EXISTS "File creators can delete files" ON orch_flow.team_files;
  END IF;
END $$;

-- Team notes policies (only if table exists - may have been removed by earlier migration)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'orch_flow' AND tablename = 'team_notes') THEN
    DROP POLICY IF EXISTS "Team members can view team notes" ON orch_flow.team_notes;
    DROP POLICY IF EXISTS "Team members can create notes" ON orch_flow.team_notes;
    DROP POLICY IF EXISTS "Note creators can update notes" ON orch_flow.team_notes;
    DROP POLICY IF EXISTS "Note creators can delete notes" ON orch_flow.team_notes;
  END IF;
END $$;

-- ============================================
-- Step 3: Drop indexes
-- ============================================
DROP INDEX IF EXISTS orch_flow.idx_orch_flow_teams_created_by;
DROP INDEX IF EXISTS orch_flow.idx_orch_flow_teams_name;
DROP INDEX IF EXISTS orch_flow.idx_orch_flow_team_members_team;
DROP INDEX IF EXISTS orch_flow.idx_orch_flow_team_members_user;
DROP INDEX IF EXISTS orch_flow.idx_orch_flow_team_files_team;
DROP INDEX IF EXISTS orch_flow.idx_orch_flow_team_files_path;
DROP INDEX IF EXISTS orch_flow.idx_orch_flow_team_notes_team;
DROP INDEX IF EXISTS orch_flow.idx_orch_flow_team_notes_pinned;

-- ============================================
-- Step 4: Drop foreign key constraints that reference these tables
-- ============================================
-- Drop FK from timer_state, sprints, shared_tasks, channels to teams
ALTER TABLE IF EXISTS orch_flow.timer_state DROP CONSTRAINT IF EXISTS timer_state_team_id_fkey;
ALTER TABLE IF EXISTS orch_flow.sprints DROP CONSTRAINT IF EXISTS sprints_team_id_fkey;
ALTER TABLE IF EXISTS orch_flow.shared_tasks DROP CONSTRAINT IF EXISTS shared_tasks_team_id_fkey;
ALTER TABLE IF EXISTS orch_flow.channels DROP CONSTRAINT IF EXISTS channels_team_id_fkey;

-- ============================================
-- Step 5: Drop tables
-- ============================================
DROP TABLE IF EXISTS orch_flow.team_members CASCADE;
DROP TABLE IF EXISTS orch_flow.teams CASCADE;
DROP TABLE IF EXISTS orch_flow.team_files CASCADE;
DROP TABLE IF EXISTS orch_flow.team_notes CASCADE;

-- ============================================
-- Step 6: Remove team-files storage bucket (if exists)
-- ============================================
-- Drop storage policies first
DROP POLICY IF EXISTS "Anyone can view team files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload team files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update team files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete team files" ON storage.objects;

-- Delete all objects in the bucket first (required before deleting bucket)
DO $$
BEGIN
  DELETE FROM storage.objects WHERE bucket_id = 'team-files';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping storage.objects cleanup for team-files: %', SQLERRM;
END $$;

-- Delete the bucket
DO $$
BEGIN
  DELETE FROM storage.buckets WHERE id = 'team-files';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping storage.buckets cleanup for team-files: %', SQLERRM;
END $$;

-- ============================================
-- Note: The team_id columns in other tables (timer_state, sprints,
-- shared_tasks, channels) will remain as UUIDs but without foreign key
-- constraints, as they reference public.teams via API, not orch_flow.teams.
-- ============================================

-- Migration: Remove team_files and team_notes tables from orch_flow schema
--
-- Reason: Moving file/note storage to Open Notebook (SurrealDB) for multi-tenancy support.
-- Users will access all files and notes through Open Notebook instead.
-- See: Claude/plans/open-notebook-multi-tenancy.md

-- ============================================
-- Step 1: Remove from Realtime publication
-- ============================================
-- Remove team_files from realtime publication (if exists)
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

-- Remove team_notes from realtime publication (if exists)
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
-- Step 2: Drop RLS policies for team_files
-- ============================================
DROP POLICY IF EXISTS "Team members can view team files" ON orch_flow.team_files;
DROP POLICY IF EXISTS "Team members can create files" ON orch_flow.team_files;
DROP POLICY IF EXISTS "File creators can update files" ON orch_flow.team_files;
DROP POLICY IF EXISTS "File creators can delete files" ON orch_flow.team_files;
-- Drop any public schema policies if they exist
DROP POLICY IF EXISTS "Anyone can view team files" ON orch_flow.team_files;
DROP POLICY IF EXISTS "Anyone can create team files" ON orch_flow.team_files;
DROP POLICY IF EXISTS "Anyone can update team files" ON orch_flow.team_files;
DROP POLICY IF EXISTS "Anyone can delete team files" ON orch_flow.team_files;


-- ============================================
-- Step 3: Drop RLS policies for team_notes
-- ============================================
DROP POLICY IF EXISTS "Team members can view team notes" ON orch_flow.team_notes;
DROP POLICY IF EXISTS "Team members can create notes" ON orch_flow.team_notes;
DROP POLICY IF EXISTS "Note creators can update notes" ON orch_flow.team_notes;
DROP POLICY IF EXISTS "Note creators can delete notes" ON orch_flow.team_notes;
-- Drop any public schema policies if they exist
DROP POLICY IF EXISTS "Anyone can view team notes" ON orch_flow.team_notes;
DROP POLICY IF EXISTS "Anyone can create team notes" ON orch_flow.team_notes;
DROP POLICY IF EXISTS "Anyone can update team notes" ON orch_flow.team_notes;
DROP POLICY IF EXISTS "Anyone can delete team notes" ON orch_flow.team_notes;


-- ============================================
-- Step 4: Drop indexes
-- ============================================
DROP INDEX IF EXISTS orch_flow.idx_orch_flow_team_files_team;
DROP INDEX IF EXISTS orch_flow.idx_orch_flow_team_files_path;
DROP INDEX IF EXISTS orch_flow.idx_orch_flow_team_notes_team;
DROP INDEX IF EXISTS orch_flow.idx_orch_flow_team_notes_pinned;


-- ============================================
-- Step 5: Drop tables
-- ============================================
DROP TABLE IF EXISTS orch_flow.team_files CASCADE;
DROP TABLE IF EXISTS orch_flow.team_notes CASCADE;


-- ============================================
-- Step 6: Remove team-files storage bucket
-- ============================================
-- Drop storage policies first
DROP POLICY IF EXISTS "Anyone can view team files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload team files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update team files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete team files" ON storage.objects;

-- Delete all objects in the bucket first (required before deleting bucket)
-- Wrapped in exception handler because Supabase blocks direct storage table manipulation
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
-- Note: UI code in orch-flow app should be updated
-- to redirect users to Open Notebook for files/notes.
-- ============================================

-- =============================================================================
-- legal.agent_jobs.original_file_path — store the original uploaded file
-- =============================================================================
-- The async workspace's upload endpoint extracts text from incoming files
-- (PDF, DOCX, PPTX, image, etc.) and stores ONLY the extracted text on the
-- job row. This effort preserves the original bytes too, via the storage
-- plane, so the modal's Source section can render the actual document the
-- user dropped.
--
-- The column is nullable: jobs created before this migration (or jobs
-- enqueued via the JSON body path with no file) keep NULL and the UI
-- falls back to rendering the extracted text with a small badge.
--
-- See: docs/efforts/current/prd.md §4.2 + Phase 5
-- Created: 2026-04-07
-- =============================================================================

ALTER TABLE legal.agent_jobs
  ADD COLUMN IF NOT EXISTS original_file_path text;

COMMENT ON COLUMN legal.agent_jobs.original_file_path IS
  'Storage path (bucket-relative) for the original uploaded file under MEDIA_STORAGE_PROVIDER. NULL for jobs created before 2026-04-07 or for jobs enqueued via the JSON body path (no file upload).';

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'legal.agent_jobs.original_file_path column added';
    RAISE NOTICE '================================================';
END $$;

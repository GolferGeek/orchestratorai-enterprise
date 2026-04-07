-- =============================================================================
-- LEGAL.AGENT_JOBS — Phase 2 input-size-limits / multi-document observability
-- =============================================================================
-- Adds `document_count` so the worker and UI can record how many documents
-- were attached to a job. Phase 2 always writes 1 (single document still),
-- and Phase 3 will start writing real values once the multi-file upload
-- path lands. Defaulting to 1 keeps existing rows valid.
--
-- See: docs/efforts/current/plan.md Phase 2 §2.4
-- Created: 2026-04-07
-- =============================================================================

ALTER TABLE legal.agent_jobs
    ADD COLUMN IF NOT EXISTS document_count integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN legal.agent_jobs.document_count IS
    'Number of documents attached to this job. Phase 2: always 1. Phase 3 will populate per-job from the multi-file upload payload.';

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'legal.agent_jobs: document_count column added';
    RAISE NOTICE '================================================';
END $$;

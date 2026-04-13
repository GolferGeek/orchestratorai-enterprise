-- =============================================================================
-- Create the "legal" schema and legal.agent_jobs table
-- =============================================================================
-- The original "law" schema holds analysis_tasks, document_extractions, etc.
-- The "legal" schema was added later for the Legal Department async job queue
-- and capability model config. Both schemas coexist.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS legal;

-- Grant usage to standard roles so PostgREST can expose it
GRANT USAGE ON SCHEMA legal TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA legal TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA legal
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- =============================================================================
-- legal.agent_jobs — async job queue for Legal Department workflows
-- =============================================================================

CREATE TABLE legal.agent_jobs (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_slug          text NOT NULL,
    user_id           text NOT NULL,
    conversation_id   text NOT NULL,
    agent_slug        text NOT NULL DEFAULT 'legal-department',
    job_type          text NOT NULL DEFAULT 'document-analysis',
    provider          text,
    model             text,

    status            text NOT NULL DEFAULT 'queued'
                      CHECK (status IN (
                        'queued','processing','awaiting_review','review_rejected',
                        'completed','failed','cancel_requested','canceled'
                      )),
    current_step      text,
    progress          integer NOT NULL DEFAULT 0,
    last_message      text,
    error             text,

    input             jsonb NOT NULL DEFAULT '{}'::jsonb,
    result            jsonb,
    review_decision   jsonb,

    original_file_path text,
    document_paths    text[] NOT NULL DEFAULT '{}',
    document_count    integer NOT NULL DEFAULT 1,

    queued_at         timestamptz NOT NULL DEFAULT now(),
    started_at        timestamptz,
    completed_at      timestamptz
);

CREATE INDEX legal_agent_jobs_org_status_idx
    ON legal.agent_jobs (org_slug, status);
CREATE INDEX legal_agent_jobs_conversation_idx
    ON legal.agent_jobs (conversation_id);
CREATE INDEX legal_agent_jobs_queued_at_idx
    ON legal.agent_jobs (queued_at DESC);

COMMENT ON TABLE legal.agent_jobs IS
    'Async job queue for Legal Department LangGraph workflows.';

ALTER TABLE legal.agent_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_agent_jobs" ON legal.agent_jobs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'legal schema and agent_jobs table created';
    RAISE NOTICE '================================================';
END $$;

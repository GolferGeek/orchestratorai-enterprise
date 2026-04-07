-- =============================================================================
-- LEGAL.AGENT_JOBS — Phase 1 HITL review support
-- =============================================================================
-- Adds the `awaiting_review` and `review_rejected` job states used by the new
-- production HITL flow, plus a JSONB column holding the most recent
-- ReviewDecisionPayload (approve / reject+feedback / modify+editedOutputs).
--
-- The re-enqueue resume pattern: when the graph hits interrupt() at the HITL
-- checkpoint, the worker catches GraphInterrupt and flips the row to
-- `awaiting_review`. The POST /jobs/:id/review endpoint writes the decision
-- and flips the row back to `queued` in a single guarded UPDATE. The worker
-- picks it up on the next tick, sees `review_decision IS NOT NULL`, and
-- invokes the compiled graph with Command({ resume: decision }).
--
-- See: docs/efforts/current/prd.md §4.1, docs/efforts/current/plan.md Phase 1
-- Created: 2026-04-07
-- =============================================================================

ALTER TABLE legal.agent_jobs
    DROP CONSTRAINT IF EXISTS agent_jobs_status_check;

ALTER TABLE legal.agent_jobs
    ADD CONSTRAINT agent_jobs_status_check
    CHECK (status IN (
        'queued',
        'processing',
        'awaiting_review',
        'review_rejected',
        'completed',
        'failed'
    ));

ALTER TABLE legal.agent_jobs
    ADD COLUMN IF NOT EXISTS review_decision jsonb;

COMMENT ON COLUMN legal.agent_jobs.review_decision IS
    'Most recent ReviewDecisionPayload: { decision: approve|reject|modify, feedback?, editedOutputs? }. Written by POST /jobs/:id/review; cleared by the worker after a successful resume.';

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'legal.agent_jobs: HITL review columns added';
    RAISE NOTICE '================================================';
END $$;

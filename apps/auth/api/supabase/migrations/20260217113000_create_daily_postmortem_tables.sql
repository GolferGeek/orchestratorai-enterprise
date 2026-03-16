-- =============================================================================
-- DAILY POSTMORTEM REPORTING TABLES
-- =============================================================================
-- Stores dashboard-first daily report runs and recommendation actions.
-- Created: 2026-02-17
-- =============================================================================

CREATE TABLE IF NOT EXISTS prediction.daily_postmortem_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug TEXT NOT NULL,
  agent_slug TEXT NOT NULL,
  run_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed', -- running|completed|failed
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  report_markdown TEXT NOT NULL DEFAULT '',
  report_html TEXT NOT NULL DEFAULT '',
  report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prediction.daily_postmortem_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES prediction.daily_postmortem_runs(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL, -- context_update|source_candidate|replay_experiment
  scope_level TEXT NOT NULL, -- instrument_context|domain_context|prediction_global_context
  target_id UUID,
  target_symbol TEXT,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  proposed_change JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected|applied|escalated
  action_source TEXT, -- dashboard|openclaw-web|openclaw-phone
  action_note TEXT,
  actioned_by TEXT,
  actioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_postmortem_runs_org_agent_date
  ON prediction.daily_postmortem_runs(org_slug, agent_slug, run_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_postmortem_recs_run
  ON prediction.daily_postmortem_recommendations(run_id);

CREATE INDEX IF NOT EXISTS idx_daily_postmortem_recs_status
  ON prediction.daily_postmortem_recommendations(status);

CREATE INDEX IF NOT EXISTS idx_daily_postmortem_recs_scope
  ON prediction.daily_postmortem_recommendations(scope_level);

CREATE OR REPLACE FUNCTION prediction.update_daily_postmortem_runs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_postmortem_runs_updated_at ON prediction.daily_postmortem_runs;
CREATE TRIGGER trg_daily_postmortem_runs_updated_at
  BEFORE UPDATE ON prediction.daily_postmortem_runs
  FOR EACH ROW
  EXECUTE FUNCTION prediction.update_daily_postmortem_runs_timestamp();

CREATE OR REPLACE FUNCTION prediction.update_daily_postmortem_recommendations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_postmortem_recommendations_updated_at ON prediction.daily_postmortem_recommendations;
CREATE TRIGGER trg_daily_postmortem_recommendations_updated_at
  BEFORE UPDATE ON prediction.daily_postmortem_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION prediction.update_daily_postmortem_recommendations_timestamp();


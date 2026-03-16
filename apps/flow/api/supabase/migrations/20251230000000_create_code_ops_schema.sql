-- Migration: Create code_ops schema for Claude Code Quality Swarm
-- Date: 2025-12-30
-- Description: Creates schema, tables, views, and functions for code quality monitoring,
--              parallel fixing, pivot learning, and skill/agent/command evaluation.

-- ============================================================================
-- SCHEMA
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS code_ops;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Table: quality_issues
-- Tracks every build/lint/test error across the monorepo
CREATE TABLE code_ops.quality_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Location
  app TEXT NOT NULL,              -- 'api', 'web', 'langgraph', 'orch-flow', 'notebook'
  file_path TEXT NOT NULL,
  line_number INT,
  column_number INT,

  -- Identity / de-dupe
  -- Stable identifier for "the same issue" across repeated scans.
  -- This prevents repeated scans from creating duplicates while still letting us track last_seen_at.
  -- Hash of normalized (app, file_path, error_type, error_code/rule_name, message, line_number, column_number).
  issue_fingerprint TEXT NOT NULL,

  -- Issue details
  error_type TEXT NOT NULL,       -- 'build', 'lint', 'test'
  error_code TEXT,                -- 'TS2352', '@typescript-eslint/no-explicit-any'
  rule_name TEXT,                 -- For lint errors
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'error',  -- 'error', 'warning'

  -- Priority & Category
  priority TEXT DEFAULT 'medium', -- 'critical', 'high', 'medium', 'low'
  is_auto_fixable BOOLEAN DEFAULT FALSE, -- Can ESLint --fix handle this?
  error_category TEXT,            -- 'type-error', 'unused-var', 'formatting', etc.

  -- Status tracking
  status TEXT DEFAULT 'open',     -- 'open', 'claimed', 'fixing', 'fixed', 'wont_fix'
  claimed_by TEXT,                -- Agent ID that claimed it
  claimed_at TIMESTAMPTZ,

  -- Resolution
  fixed_at TIMESTAMPTZ,
  fix_commit TEXT,
  fix_approach TEXT,              -- How it was fixed

  -- Scan tracking
  scan_id UUID,                   -- Which scan found this
  last_seen_at TIMESTAMPTZ,       -- Last scan that saw this issue

  CONSTRAINT valid_status CHECK (status IN ('open', 'claimed', 'fixing', 'fixed', 'wont_fix')),
  CONSTRAINT valid_error_type CHECK (error_type IN ('build', 'lint', 'test')),
  CONSTRAINT valid_priority CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT valid_app CHECK (app IN ('api', 'web', 'langgraph', 'orch-flow', 'notebook'))
);

CREATE INDEX idx_quality_issues_status ON code_ops.quality_issues(status);
CREATE INDEX idx_quality_issues_app ON code_ops.quality_issues(app);
CREATE INDEX idx_quality_issues_file ON code_ops.quality_issues(file_path);
CREATE INDEX idx_quality_issues_type ON code_ops.quality_issues(error_type);
CREATE INDEX idx_quality_issues_priority ON code_ops.quality_issues(priority);
CREATE INDEX idx_quality_issues_claimed ON code_ops.quality_issues(claimed_at) WHERE status = 'claimed';
CREATE UNIQUE INDEX uq_quality_issues_fingerprint ON code_ops.quality_issues(issue_fingerprint);

-- Table: scan_runs
-- Tracks each time we scan for errors
CREATE TABLE code_ops.scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- What was scanned
  scan_type TEXT NOT NULL,        -- 'full', 'incremental', 'app-specific'
  apps_scanned TEXT[],            -- ['api', 'web', 'langgraph', 'orch-flow', 'notebook']

  -- Source context (needed for confidence + comparisons)
  repo TEXT,
  branch TEXT,
  commit_sha TEXT,
  is_dirty BOOLEAN DEFAULT FALSE,

  -- Environment context (helps debug "works on my machine")
  runner_id TEXT,                 -- 'gg-macstudio', 'laptop', etc.
  os TEXT,
  node_version TEXT,
  package_manager TEXT,           -- 'pnpm', 'npm'
  package_manager_version TEXT,

  -- Tooling versioning (ties results back to the code that performed the scan)
  scanner_version TEXT,           -- e.g., git sha or file hash of scanner agent/command

  -- Results
  build_errors_found INT DEFAULT 0,
  lint_errors_found INT DEFAULT 0,
  test_failures_found INT DEFAULT 0,
  total_issues INT DEFAULT 0,

  -- Comparison to previous
  new_issues INT DEFAULT 0,
  fixed_since_last INT DEFAULT 0,

  -- Meta
  duration_ms INT,
  triggered_by TEXT               -- 'manual', 'scheduled', 'monitor'
);

CREATE INDEX idx_scan_runs_started ON code_ops.scan_runs(started_at);
CREATE INDEX idx_scan_runs_type ON code_ops.scan_runs(scan_type);

-- Table: pivot_learnings
-- Records when agents try something that doesn't work and need to change approach
CREATE TABLE code_ops.pivot_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Context
  agent_type TEXT NOT NULL,       -- Which agent was working
  task_description TEXT,          -- What was being attempted
  file_path TEXT,                 -- Which file was being worked on
  issue_id UUID REFERENCES code_ops.quality_issues(id),

  -- What was tried
  approach_tried TEXT NOT NULL,   -- What the agent tried
  tool_used TEXT,                 -- Which tool was used (Edit, Bash, etc.)

  -- Why it failed
  failure_type TEXT,              -- 'build-error', 'lint-error', 'test-failure', 'runtime-error', 'logic-error'
  failure_message TEXT,           -- The actual error message

  -- The pivot
  new_approach TEXT NOT NULL,     -- What the agent decided to try instead
  why_pivot TEXT,                 -- Reasoning for the change

  -- Outcome
  new_approach_worked BOOLEAN,    -- Did the new approach succeed?

  -- Learning
  lesson_learned TEXT,            -- Key takeaway for future
  applies_to TEXT[]               -- Tags: ['typescript', 'eslint', 'testing', etc.]
);

CREATE INDEX idx_pivot_learnings_agent ON code_ops.pivot_learnings(agent_type);
CREATE INDEX idx_pivot_learnings_failure ON code_ops.pivot_learnings(failure_type);
CREATE INDEX idx_pivot_learnings_applies ON code_ops.pivot_learnings USING GIN(applies_to);

-- Table: skill_events
-- Tracks skill discovery and usage
CREATE TABLE code_ops.skill_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),

  -- Context
  agent_type TEXT,                -- Which agent was running

  -- Run context / outcome linkage
  scan_id UUID REFERENCES code_ops.scan_runs(id),
  issue_id UUID REFERENCES code_ops.quality_issues(id),
  fix_attempt_id UUID,             -- references code_ops.fix_attempts(id); add FK after table creation if desired

  -- Skill info
  skill_name TEXT NOT NULL,       -- 'api-architecture-skill'
  skill_category TEXT,            -- 'architecture', 'testing', 'quality'
  skill_version TEXT,             -- e.g., hash of skill file contents

  -- Discovery phase
  was_searched_for BOOLEAN,       -- Did agent look for this skill?
  was_found BOOLEAN,              -- Was it found when searched?
  discovery_method TEXT,          -- 'keyword', 'mandatory', 'explicit', 'related'
  search_query TEXT,              -- What query was used to find it
  search_attempts INT DEFAULT 1,  -- How many searches before found

  -- Usage phase
  was_loaded BOOLEAN DEFAULT FALSE,
  was_followed BOOLEAN,           -- Did agent follow the patterns?

  -- Command info (for command-level trust)
  command_name TEXT,              -- '/scan-errors', '/fix-errors', '/monitor', etc.
  command_version TEXT,           -- e.g., hash of command definition

  -- Pattern tracking
  patterns_available JSONB,       -- Patterns defined in skill
  patterns_used JSONB,            -- Which patterns were actually used
  patterns_ignored JSONB,         -- Which patterns were skipped

  -- Effectiveness
  helped_task BOOLEAN,            -- Did loading this skill help?
  rating INT,                     -- 1-5 how useful was it
  notes TEXT,

  CONSTRAINT valid_skill_rating CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX idx_skill_events_name ON code_ops.skill_events(skill_name);
CREATE INDEX idx_skill_events_found ON code_ops.skill_events(was_found);
CREATE INDEX idx_skill_events_timestamp ON code_ops.skill_events(timestamp);

-- Table: fix_attempts
-- Links issues to fix attempts
CREATE TABLE code_ops.fix_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Links
  issue_id UUID REFERENCES code_ops.quality_issues(id),
  scan_id UUID REFERENCES code_ops.scan_runs(id),

  -- What was tried
  approach TEXT NOT NULL,         -- Description of fix approach
  diff TEXT,                      -- The actual changes made

  -- Result
  succeeded BOOLEAN,
  verified BOOLEAN,               -- Did re-running check confirm fix?
  verification_output TEXT,

  -- If failed
  failure_reason TEXT,
  will_retry BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_fix_attempts_issue ON code_ops.fix_attempts(issue_id);
CREATE INDEX idx_fix_attempts_scan ON code_ops.fix_attempts(scan_id);

-- Add FK from skill_events to fix_attempts now that fix_attempts exists
ALTER TABLE code_ops.skill_events
  ADD CONSTRAINT fk_skill_events_fix_attempt
  FOREIGN KEY (fix_attempt_id) REFERENCES code_ops.fix_attempts(id);

-- Table: artifacts
-- Inventory of all Claude Code artifacts (skills, agents, commands)
CREATE TABLE code_ops.artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type TEXT NOT NULL,     -- 'skill', 'agent', 'command'
  name TEXT NOT NULL,              -- canonical name, e.g. 'pivot-learning-skill' or '/scan-errors'
  file_path TEXT NOT NULL,
  version_hash TEXT NOT NULL,      -- hash of file contents
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  CONSTRAINT valid_artifact_type CHECK (artifact_type IN ('skill', 'agent', 'command'))
);

CREATE UNIQUE INDEX uq_artifacts_type_name_version
  ON code_ops.artifacts(artifact_type, name, version_hash);
CREATE INDEX idx_artifacts_type ON code_ops.artifacts(artifact_type);
CREATE INDEX idx_artifacts_active ON code_ops.artifacts(is_active);

-- Table: artifact_events
-- Single event stream for all calls to everything (agent/skill/command)
CREATE TABLE code_ops.artifact_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),

  -- Correlation / run context
  run_id UUID,                     -- groups events from one command/agent run (optional but recommended)
  scan_id UUID REFERENCES code_ops.scan_runs(id),

  -- What happened
  artifact_type TEXT NOT NULL,     -- 'skill', 'agent', 'command'
  artifact_name TEXT NOT NULL,     -- name at time of event
  artifact_version TEXT NOT NULL,  -- version hash at time of event
  event_type TEXT NOT NULL,        -- 'invoked', 'loaded', 'started', 'completed', 'error', 'pivot'

  -- Outcome
  success BOOLEAN,
  rating INT,                      -- optional 1-5 (e.g., "did this help?")
  issue_count INT DEFAULT 0,        -- quick count of issues in this event (optional)

  -- Details (keep small; raw data lives here; summaries live in views)
  details JSONB,

  CONSTRAINT valid_artifact_type_event CHECK (artifact_type IN ('skill', 'agent', 'command'))
);

CREATE INDEX idx_artifact_events_ts ON code_ops.artifact_events(timestamp);
CREATE INDEX idx_artifact_events_artifact ON code_ops.artifact_events(artifact_type, artifact_name);
CREATE INDEX idx_artifact_events_event_type ON code_ops.artifact_events(event_type);
CREATE INDEX idx_artifact_events_run_id ON code_ops.artifact_events(run_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: release_stale_claims
-- Releases claims older than 6 hours to prevent stale locks
CREATE OR REPLACE FUNCTION code_ops.release_stale_claims()
RETURNS INT AS $$
DECLARE
  released_count INT;
BEGIN
  UPDATE code_ops.quality_issues
  SET status = 'open', claimed_by = NULL, claimed_at = NULL
  WHERE status = 'claimed'
    AND claimed_at < NOW() - INTERVAL '6 hours';

  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$ LANGUAGE plpgsql;

-- Function: claim_issues_for_file
-- Claim all open issues for a given file in one atomic operation
-- Uses SKIP LOCKED so concurrent claimers don't collide
CREATE OR REPLACE FUNCTION code_ops.claim_issues_for_file(
  p_file_path TEXT,
  p_claimed_by TEXT,
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS INT AS $$
DECLARE
  claimed_count INT;
BEGIN
  -- Release stale claims first (keeps locking semantics simple)
  PERFORM code_ops.release_stale_claims();

  WITH to_claim AS (
    SELECT id
    FROM code_ops.quality_issues
    WHERE status = 'open'
      AND file_path = p_file_path
    FOR UPDATE SKIP LOCKED
  )
  UPDATE code_ops.quality_issues qi
  SET status = 'claimed',
      claimed_by = p_claimed_by,
      claimed_at = p_now
  FROM to_claim
  WHERE qi.id = to_claim.id;

  GET DIAGNOSTICS claimed_count = ROW_COUNT;
  RETURN claimed_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: skill_health
-- Aggregated skill health metrics
CREATE VIEW code_ops.skill_health AS
SELECT
  skill_name,
  COUNT(*) as total_events,

  -- Discovery metrics
  SUM(CASE WHEN was_searched_for THEN 1 ELSE 0 END) as times_searched,
  SUM(CASE WHEN was_found THEN 1 ELSE 0 END) as times_found,
  ROUND(AVG(CASE WHEN was_searched_for AND was_found THEN 1.0 ELSE 0.0 END) * 100, 1) as discovery_rate_pct,

  -- Usage metrics
  SUM(CASE WHEN was_loaded THEN 1 ELSE 0 END) as times_loaded,
  SUM(CASE WHEN was_followed THEN 1 ELSE 0 END) as times_followed,
  ROUND(AVG(CASE WHEN was_loaded AND was_followed THEN 1.0 ELSE 0.0 END) * 100, 1) as compliance_rate_pct,

  -- Effectiveness metrics
  SUM(CASE WHEN helped_task THEN 1 ELSE 0 END) as times_helped,
  ROUND(AVG(CASE WHEN was_loaded THEN (CASE WHEN helped_task THEN 1.0 ELSE 0.0 END) END) * 100, 1) as effectiveness_rate_pct,
  ROUND(AVG(rating), 2) as avg_rating,

  -- Time range
  MIN(timestamp) as first_seen,
  MAX(timestamp) as last_seen

FROM code_ops.skill_events
GROUP BY skill_name;

-- View: codebase_health_daily
-- Daily rollup of codebase health
CREATE VIEW code_ops.codebase_health_daily AS
SELECT
  DATE(created_at) as date,
  app,
  COUNT(*) FILTER (WHERE error_type = 'build' AND status = 'open') as open_build_errors,
  COUNT(*) FILTER (WHERE error_type = 'lint' AND status = 'open') as open_lint_errors,
  COUNT(*) FILTER (WHERE error_type = 'test' AND status = 'open') as open_test_failures,
  COUNT(*) FILTER (WHERE status = 'fixed' AND DATE(fixed_at) = DATE(created_at)) as fixed_today
FROM code_ops.quality_issues
GROUP BY DATE(created_at), app;

-- View: pivot_insights
-- Aggregated insights from pivot learnings
CREATE VIEW code_ops.pivot_insights AS
SELECT
  failure_type,
  COUNT(*) as total_pivots,
  SUM(CASE WHEN new_approach_worked THEN 1 ELSE 0 END) as successful_pivots,
  ROUND(AVG(CASE WHEN new_approach_worked THEN 1.0 ELSE 0.0 END) * 100, 1) as success_rate_pct,
  (
    SELECT array_agg(DISTINCT tag)
    FROM (
      SELECT unnest(pl2.applies_to) AS tag
      FROM code_ops.pivot_learnings pl2
      WHERE pl2.failure_type = pl.failure_type
        AND pl2.applies_to IS NOT NULL
    ) tags
  ) AS common_tags
FROM code_ops.pivot_learnings pl
GROUP BY failure_type;

-- View: v_artifact_daily_summary
-- One row per day per artifact (including zeros)
-- Includes an issues_rollup JSONB so you can scan without raw-event queries
CREATE VIEW code_ops.v_artifact_daily_summary AS
WITH days AS (
  SELECT generate_series(CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE, INTERVAL '1 day')::date AS day
),
artifact_days AS (
  SELECT d.day, a.artifact_type, a.name, a.file_path, a.version_hash
  FROM days d
  CROSS JOIN code_ops.artifacts a
  WHERE a.is_active = TRUE
)
SELECT
  ad.day,
  ad.artifact_type,
  ad.name,
  ad.file_path,
  ad.version_hash,

  -- Simple columns
  COUNT(e.id) FILTER (WHERE e.event_type IN ('invoked','loaded','started')) AS call_count,
  COUNT(e.id) FILTER (WHERE e.event_type = 'error') AS error_count,
  COUNT(e.id) FILTER (WHERE e.event_type = 'pivot') AS pivot_count,
  MAX(e.timestamp) AS last_event_at,
  ROUND(AVG(e.rating) FILTER (WHERE e.rating IS NOT NULL), 2) AS avg_rating,

  -- JSON rollup (keep it compact; use event IDs to drill down)
  jsonb_build_object(
    'by_event_type', jsonb_build_object(
      'invoked', COUNT(e.id) FILTER (WHERE e.event_type = 'invoked'),
      'loaded', COUNT(e.id) FILTER (WHERE e.event_type = 'loaded'),
      'started', COUNT(e.id) FILTER (WHERE e.event_type = 'started'),
      'completed', COUNT(e.id) FILTER (WHERE e.event_type = 'completed'),
      'error', COUNT(e.id) FILTER (WHERE e.event_type = 'error'),
      'pivot', COUNT(e.id) FILTER (WHERE e.event_type = 'pivot')
    ),
    'example_event_ids', COALESCE(jsonb_agg(e.id) FILTER (WHERE e.id IS NOT NULL) -> 0, '[]'::jsonb)
  ) AS issues_rollup
FROM artifact_days ad
LEFT JOIN code_ops.artifact_events e
  ON e.artifact_type = ad.artifact_type
 AND e.artifact_name = ad.name
 AND e.artifact_version = ad.version_hash
 AND e.timestamp::date = ad.day
GROUP BY ad.day, ad.artifact_type, ad.name, ad.file_path, ad.version_hash;

-- View: v_artifact_never_called
-- Artifacts that have never been called
CREATE VIEW code_ops.v_artifact_never_called AS
SELECT a.*
FROM code_ops.artifacts a
LEFT JOIN code_ops.artifact_events e
  ON e.artifact_type = a.artifact_type
 AND e.artifact_name = a.name
WHERE a.is_active = TRUE
GROUP BY a.id
HAVING COUNT(e.id) = 0;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON SCHEMA code_ops IS 'Code operations database for Claude Code Quality Swarm - tracks quality issues, scans, pivots, and artifact events';

COMMENT ON TABLE code_ops.quality_issues IS 'Tracks every build/lint/test error across the monorepo';
COMMENT ON TABLE code_ops.scan_runs IS 'Tracks each time we scan for errors';
COMMENT ON TABLE code_ops.pivot_learnings IS 'Records when agents try something that doesn''t work and need to change approach';
COMMENT ON TABLE code_ops.skill_events IS 'Tracks skill discovery and usage';
COMMENT ON TABLE code_ops.fix_attempts IS 'Links issues to fix attempts';
COMMENT ON TABLE code_ops.artifacts IS 'Inventory of all Claude Code artifacts (skills, agents, commands)';
COMMENT ON TABLE code_ops.artifact_events IS 'Single event stream for all calls to everything (agent/skill/command)';

COMMENT ON FUNCTION code_ops.release_stale_claims IS 'Releases claims older than 6 hours to prevent stale locks';
COMMENT ON FUNCTION code_ops.claim_issues_for_file IS 'Claim all open issues for a given file in one atomic operation';

COMMENT ON VIEW code_ops.skill_health IS 'Aggregated skill health metrics';
COMMENT ON VIEW code_ops.codebase_health_daily IS 'Daily rollup of codebase health';
COMMENT ON VIEW code_ops.pivot_insights IS 'Aggregated insights from pivot learnings';
COMMENT ON VIEW code_ops.v_artifact_daily_summary IS 'One row per day per artifact (including zeros) with issues_rollup JSONB';
COMMENT ON VIEW code_ops.v_artifact_never_called IS 'Artifacts that have never been called';

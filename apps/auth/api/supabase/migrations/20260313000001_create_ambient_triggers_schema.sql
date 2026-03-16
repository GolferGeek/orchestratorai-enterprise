-- =============================================================================
-- CREATE AMBIENT TRIGGERS SCHEMA
-- =============================================================================
-- First-class ambient trigger system that watches databases, file systems,
-- schedules, infrastructure, email, browsers, and external APIs, then fires
-- agent workflows via A2A calls when conditions are met.
--
-- Architecture Principle: One direct trigger exists — the A2A call.
-- Everything else is ambient. This module is a new front door, not a new
-- execution engine.
--
-- Step 1-1: Database Schema Creation
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS ambient;

COMMENT ON SCHEMA ambient IS 'Ambient Triggers Module: watches the world and fires agent workflows via A2A calls when conditions are met.';

-- Grant usage on schema
GRANT USAGE ON SCHEMA ambient TO postgres, anon, authenticated, service_role;

-- Grant all privileges on all tables in schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ambient TO service_role;

-- Grant all privileges on all sequences in schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ambient TO service_role;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA ambient GRANT ALL ON TABLES TO service_role;

-- Set default privileges for future sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA ambient GRANT ALL ON SEQUENCES TO service_role;

-- ---------------------------------------------------------------------------
-- Shared trigger function: keep updated_at current
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ambient.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION ambient.set_updated_at() IS 'Automatically updates updated_at on every row modification.';

-- =============================================================================
-- TABLE: ambient.triggers
-- =============================================================================
-- One row per configured trigger. Defines what to watch, when to fire, and
-- what to do. Managed via the Ambient Triggers API (CRUD endpoints).
-- =============================================================================

CREATE TABLE ambient.triggers (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant isolation
  org_slug            TEXT        NOT NULL,

  -- Human-readable identity
  name                TEXT        NOT NULL,
  description         TEXT,                     -- what this trigger does and why

  -- Adapter selection
  source_type         TEXT        NOT NULL,      -- which adapter handles this trigger
  enabled             BOOLEAN     NOT NULL DEFAULT true,  -- on/off switch

  -- Adapter-specific configuration: what to watch, how to connect
  source_config       JSONB       NOT NULL,

  -- Optional additional filtering applied after the source fires
  condition           JSONB,

  -- Invocation target: which agent, mode, and payload template
  action_config       JSONB       NOT NULL,

  -- Rate controls
  cooldown_seconds    INT         NOT NULL DEFAULT 0,   -- min seconds between firings
  max_fires_per_hour  INT,                              -- null = unlimited

  -- Cooldown tracking
  last_fired_at       TIMESTAMPTZ,

  -- Provenance
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT triggers_source_type_check CHECK (
    source_type IN (
      'cron',
      'database',
      'filesystem',
      'infrastructure',
      'log_pattern',
      'email',
      'browser',
      'external_data',
      'custom'
    )
  )
);

COMMENT ON TABLE  ambient.triggers IS 'Configured ambient triggers: one row per watch rule.';
COMMENT ON COLUMN ambient.triggers.source_type    IS 'Adapter type. Must match one of the supported values: cron, database, filesystem, infrastructure, log_pattern, email, browser, external_data, custom.';
COMMENT ON COLUMN ambient.triggers.source_config  IS 'Adapter-specific config: connection details, target table/path/URL, poll interval, etc.';
COMMENT ON COLUMN ambient.triggers.condition      IS 'Optional JSONLogic / CEL expression evaluated against the normalised AmbientEvent payload.';
COMMENT ON COLUMN ambient.triggers.action_config  IS 'Invocation spec: { agentSlug, orgSlug, mode, payloadTemplate }.';
COMMENT ON COLUMN ambient.triggers.cooldown_seconds IS 'Minimum elapsed seconds between successful firings. 0 = no cooldown.';

-- Indexes on ambient.triggers
CREATE INDEX idx_ambient_triggers_org_slug
  ON ambient.triggers (org_slug);

CREATE INDEX idx_ambient_triggers_source_type
  ON ambient.triggers (source_type);

CREATE INDEX idx_ambient_triggers_org_enabled
  ON ambient.triggers (org_slug, enabled);

CREATE INDEX idx_ambient_triggers_org_source_type
  ON ambient.triggers (org_slug, source_type);

-- updated_at trigger
CREATE TRIGGER trg_ambient_triggers_updated_at
  BEFORE UPDATE ON ambient.triggers
  FOR EACH ROW EXECUTE FUNCTION ambient.set_updated_at();

-- =============================================================================
-- TABLE: ambient.trigger_executions
-- =============================================================================
-- Immutable audit log of every time a trigger fires (or is evaluated and
-- skipped). Used for observability, debugging, and rate-limit enforcement.
-- =============================================================================

CREATE TABLE ambient.trigger_executions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which trigger
  trigger_id        UUID        NOT NULL REFERENCES ambient.triggers(id) ON DELETE CASCADE,

  -- Denormalised for fast queries without joins
  trigger_name      TEXT        NOT NULL,
  source_type       TEXT        NOT NULL,

  -- When the source event was detected
  fired_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Raw event payload from the adapter
  source_event      JSONB,

  -- Evaluation results
  condition_met     BOOLEAN,    -- null = no condition configured
  action_taken      BOOLEAN     NOT NULL DEFAULT false,
  skip_reason       TEXT,       -- cooldown / rate_limit / condition_not_met / duplicate

  -- A2A invocation data
  execution_context JSONB,      -- ExecutionContext built for this invocation
  a2a_response      JSONB,      -- Response received from the agent

  -- Timing
  duration_ms       INT,        -- end-to-end wall time in milliseconds

  -- Lifecycle status
  status            TEXT        NOT NULL DEFAULT 'pending',

  -- Idempotency key: deterministic hash of (trigger_id + source event fingerprint)
  dedupe_key        TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT trigger_executions_skip_reason_check CHECK (
    skip_reason IS NULL OR skip_reason IN (
      'cooldown',
      'rate_limit',
      'condition_not_met',
      'duplicate'
    )
  ),
  CONSTRAINT trigger_executions_status_check CHECK (
    status IN (
      'pending',
      'fired',
      'skipped',
      'failed',
      'failed_permanent',
      'completed',
      'error'
    )
  )
);

COMMENT ON TABLE  ambient.trigger_executions IS 'Immutable audit log of every trigger evaluation: fired, skipped, or errored.';
COMMENT ON COLUMN ambient.trigger_executions.trigger_name     IS 'Denormalised from ambient.triggers.name at evaluation time for fast history queries.';
COMMENT ON COLUMN ambient.trigger_executions.source_type      IS 'Denormalised from ambient.triggers.source_type at evaluation time.';
COMMENT ON COLUMN ambient.trigger_executions.condition_met    IS 'True if condition passed (or no condition configured). False if condition failed. Null should not occur.';
COMMENT ON COLUMN ambient.trigger_executions.skip_reason      IS 'Non-null when action_taken = false: cooldown | rate_limit | condition_not_met | duplicate.';
COMMENT ON COLUMN ambient.trigger_executions.execution_context IS 'Full ExecutionContext capsule passed to the A2A call. Never cherry-picked.';
COMMENT ON COLUMN ambient.trigger_executions.dedupe_key       IS 'Deterministic key for idempotency checks. UNIQUE prevents double-firing the same logical event.';

-- Indexes on ambient.trigger_executions
CREATE INDEX idx_ambient_executions_trigger_id
  ON ambient.trigger_executions (trigger_id);

CREATE INDEX idx_ambient_executions_status
  ON ambient.trigger_executions (status);

CREATE INDEX idx_ambient_executions_fired_at
  ON ambient.trigger_executions (fired_at);

CREATE UNIQUE INDEX idx_ambient_executions_dedupe_key
  ON ambient.trigger_executions (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX idx_ambient_executions_trigger_status
  ON ambient.trigger_executions (trigger_id, status);

CREATE INDEX idx_ambient_executions_trigger_fired_at
  ON ambient.trigger_executions (trigger_id, fired_at);

-- =============================================================================
-- TABLE: ambient.adapter_state
-- =============================================================================
-- Persistent adapter state: last-seen cursors, file hashes, metric baselines,
-- etc. Each trigger has at most one state row (1:1 via UNIQUE FK).
-- Adapters read and write this row to maintain continuity across restarts.
-- =============================================================================

CREATE TABLE ambient.adapter_state (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One state row per trigger — enforced by UNIQUE
  trigger_id    UUID        NOT NULL UNIQUE REFERENCES ambient.triggers(id) ON DELETE CASCADE,

  adapter_type  TEXT        NOT NULL,

  -- Adapter-specific state: last-polled cursor, file hashes, baseline metrics, etc.
  state         JSONB       NOT NULL DEFAULT '{}'::JSONB,

  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  ambient.adapter_state IS 'Persistent adapter state: one row per trigger. Stores cursors, baselines, and other continuity data across restarts.';
COMMENT ON COLUMN ambient.adapter_state.trigger_id   IS 'One-to-one with ambient.triggers. The UNIQUE constraint enforces this.';
COMMENT ON COLUMN ambient.adapter_state.adapter_type IS 'Mirrors ambient.triggers.source_type — stored here to allow efficient adapter-level queries without joining triggers.';
COMMENT ON COLUMN ambient.adapter_state.state        IS 'Adapter-specific: { lastSeenId, lastHash, baseline, cursor, ... }. Schema is per adapter_type.';

-- The UNIQUE constraint on trigger_id already creates an implicit index; add a
-- named one for clarity and to satisfy the architecture checklist.
CREATE UNIQUE INDEX idx_ambient_adapter_state_trigger_id
  ON ambient.adapter_state (trigger_id);

-- updated_at trigger
CREATE TRIGGER trg_ambient_adapter_state_updated_at
  BEFORE UPDATE ON ambient.adapter_state
  FOR EACH ROW EXECUTE FUNCTION ambient.set_updated_at();

-- =============================================================================
-- Reload PostgREST schema cache
-- =============================================================================

NOTIFY pgrst, 'reload schema';

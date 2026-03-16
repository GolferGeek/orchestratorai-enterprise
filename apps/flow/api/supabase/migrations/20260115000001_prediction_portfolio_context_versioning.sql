-- =============================================================================
-- PORTFOLIO & CONTEXT VERSIONING SYSTEM
-- =============================================================================
-- Description: Implements the forked personality model with portfolio tracking
-- Features:
--   1. Context versioning for all prediction contexts (runner, analysts, universes, targets)
--   2. Fork model: User's version vs Agent's self-improving version
--   3. User portfolios with position tracking
--   4. Analyst portfolios with dual forks
--   5. Bidirectional learning exchanges
--   6. Agent self-modification audit log
-- =============================================================================

-- =============================================================================
-- SECTION 1: RUNNER CONTEXT VERSIONS
-- =============================================================================
-- Purpose: Version history for overall prediction agent configuration

CREATE TABLE prediction.runner_context_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Runner identification
  runner_type TEXT NOT NULL,  -- 'stock-predictor', 'crypto-predictor', etc.

  -- Version tracking
  version_number INTEGER NOT NULL DEFAULT 1,

  -- Context content
  context TEXT,  -- Overall prediction agent instructions
  model_config JSONB DEFAULT '{}'::jsonb,  -- Per-stage LLM configuration
  learning_config JSONB DEFAULT '{}'::jsonb,  -- Learning loop settings
  risk_profile TEXT DEFAULT 'moderate',  -- Default risk profile

  -- Change metadata
  change_reason TEXT,
  changed_by TEXT NOT NULL DEFAULT 'system',  -- 'system', 'user', 'learning_loop'

  -- Current version tracking
  is_current BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (changed_by IN ('system', 'user', 'learning_loop'))
);

CREATE INDEX idx_runner_context_versions_runner_type ON prediction.runner_context_versions(runner_type);
CREATE INDEX idx_runner_context_versions_current ON prediction.runner_context_versions(runner_type, is_current) WHERE is_current = TRUE;
CREATE INDEX idx_runner_context_versions_created ON prediction.runner_context_versions(created_at DESC);

COMMENT ON TABLE prediction.runner_context_versions IS 'Version history for prediction runner configurations';
COMMENT ON COLUMN prediction.runner_context_versions.runner_type IS 'Runner type identifier (stock-predictor, crypto-predictor, etc.)';
COMMENT ON COLUMN prediction.runner_context_versions.is_current IS 'Whether this is the current active version';

-- =============================================================================
-- SECTION 2: ANALYST CONTEXT VERSIONS (WITH FORK SUPPORT)
-- =============================================================================
-- Purpose: Version history for analyst contexts with user/agent fork separation

CREATE TABLE prediction.analyst_context_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Analyst reference
  analyst_id UUID NOT NULL REFERENCES prediction.analysts(id) ON DELETE CASCADE,

  -- Fork identification (the key innovation)
  fork_type TEXT NOT NULL DEFAULT 'user',  -- 'user' or 'agent'

  -- Version tracking
  version_number INTEGER NOT NULL DEFAULT 1,

  -- Context content (snapshot of analyst config at this version)
  perspective TEXT NOT NULL,
  tier_instructions JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_weight NUMERIC(5,4) NOT NULL DEFAULT 1.0000,

  -- Agent-specific fields (only populated for fork_type='agent')
  agent_journal TEXT,  -- Agent's self-notes and reflections

  -- Change metadata
  change_reason TEXT,
  changed_by TEXT NOT NULL DEFAULT 'system',  -- 'system', 'user', 'learning_loop', 'agent_self'

  -- Current version tracking (per fork)
  is_current BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (fork_type IN ('user', 'agent')),
  CHECK (changed_by IN ('system', 'user', 'learning_loop', 'agent_self')),
  CHECK (default_weight >= 0.0000 AND default_weight <= 2.0000)
);

CREATE INDEX idx_analyst_context_versions_analyst ON prediction.analyst_context_versions(analyst_id);
CREATE INDEX idx_analyst_context_versions_fork ON prediction.analyst_context_versions(analyst_id, fork_type);
CREATE INDEX idx_analyst_context_versions_current ON prediction.analyst_context_versions(analyst_id, fork_type, is_current)
  WHERE is_current = TRUE;
CREATE INDEX idx_analyst_context_versions_created ON prediction.analyst_context_versions(created_at DESC);
CREATE INDEX idx_analyst_context_versions_changed_by ON prediction.analyst_context_versions(changed_by);

COMMENT ON TABLE prediction.analyst_context_versions IS 'Version history for analyst contexts with user/agent fork separation';
COMMENT ON COLUMN prediction.analyst_context_versions.fork_type IS 'Which fork this version belongs to: user (learning loop controlled) or agent (self-improving)';
COMMENT ON COLUMN prediction.analyst_context_versions.agent_journal IS 'Agent self-notes (only for agent fork)';

-- =============================================================================
-- SECTION 3: UNIVERSE CONTEXT VERSIONS
-- =============================================================================

CREATE TABLE prediction.universe_context_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Universe reference
  universe_id UUID NOT NULL REFERENCES prediction.universes(id) ON DELETE CASCADE,

  -- Version tracking
  version_number INTEGER NOT NULL DEFAULT 1,

  -- Context content (snapshot)
  description TEXT,
  llm_config JSONB DEFAULT '{}'::jsonb,
  thresholds JSONB DEFAULT '{}'::jsonb,

  -- Change metadata
  change_reason TEXT,
  changed_by TEXT NOT NULL DEFAULT 'system',

  -- Current version tracking
  is_current BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (changed_by IN ('system', 'user', 'learning_loop'))
);

CREATE INDEX idx_universe_context_versions_universe ON prediction.universe_context_versions(universe_id);
CREATE INDEX idx_universe_context_versions_current ON prediction.universe_context_versions(universe_id, is_current) WHERE is_current = TRUE;

COMMENT ON TABLE prediction.universe_context_versions IS 'Version history for universe configurations';

-- =============================================================================
-- SECTION 4: TARGET CONTEXT VERSIONS
-- =============================================================================

CREATE TABLE prediction.target_context_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target reference
  target_id UUID NOT NULL REFERENCES prediction.targets(id) ON DELETE CASCADE,

  -- Version tracking
  version_number INTEGER NOT NULL DEFAULT 1,

  -- Context content (snapshot)
  context TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  llm_config_override JSONB,

  -- Change metadata
  change_reason TEXT,
  changed_by TEXT NOT NULL DEFAULT 'system',

  -- Current version tracking
  is_current BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (changed_by IN ('system', 'user', 'learning_loop'))
);

CREATE INDEX idx_target_context_versions_target ON prediction.target_context_versions(target_id);
CREATE INDEX idx_target_context_versions_current ON prediction.target_context_versions(target_id, is_current) WHERE is_current = TRUE;

COMMENT ON TABLE prediction.target_context_versions IS 'Version history for target configurations';

-- =============================================================================
-- SECTION 5: ANALYST PORTFOLIOS (DUAL FORK)
-- =============================================================================
-- Purpose: Track P&L for each analyst, separately for user and agent forks

CREATE TABLE prediction.analyst_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Analyst reference
  analyst_id UUID NOT NULL REFERENCES prediction.analysts(id) ON DELETE CASCADE,

  -- Fork identification
  fork_type TEXT NOT NULL DEFAULT 'user',  -- 'user' or 'agent'

  -- Balance tracking
  initial_balance NUMERIC(20,8) NOT NULL DEFAULT 1000000.00,
  current_balance NUMERIC(20,8) NOT NULL DEFAULT 1000000.00,

  -- P&L tracking
  total_realized_pnl NUMERIC(20,8) NOT NULL DEFAULT 0,
  total_unrealized_pnl NUMERIC(20,8) NOT NULL DEFAULT 0,

  -- Win/loss tracking
  win_count INTEGER NOT NULL DEFAULT 0,
  loss_count INTEGER NOT NULL DEFAULT 0,

  -- Status (agent fork only)
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'warning', 'probation', 'suspended'
  status_changed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (fork_type IN ('user', 'agent')),
  CHECK (status IN ('active', 'warning', 'probation', 'suspended')),
  UNIQUE (analyst_id, fork_type)
);

CREATE INDEX idx_analyst_portfolios_analyst ON prediction.analyst_portfolios(analyst_id);
CREATE INDEX idx_analyst_portfolios_fork ON prediction.analyst_portfolios(fork_type);
CREATE INDEX idx_analyst_portfolios_status ON prediction.analyst_portfolios(status) WHERE fork_type = 'agent';
CREATE INDEX idx_analyst_portfolios_balance ON prediction.analyst_portfolios(current_balance);

CREATE TRIGGER set_analyst_portfolios_updated_at
  BEFORE UPDATE ON prediction.analyst_portfolios
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

COMMENT ON TABLE prediction.analyst_portfolios IS 'Portfolio tracking for analysts with dual user/agent forks';
COMMENT ON COLUMN prediction.analyst_portfolios.fork_type IS 'user = learning loop controlled, agent = self-improving';
COMMENT ON COLUMN prediction.analyst_portfolios.status IS 'Agent fork status: active, warning, probation, suspended';

-- =============================================================================
-- SECTION 6: ANALYST POSITIONS
-- =============================================================================
-- Purpose: Track individual positions for analysts

CREATE TABLE prediction.analyst_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Portfolio reference
  portfolio_id UUID NOT NULL REFERENCES prediction.analyst_portfolios(id) ON DELETE CASCADE,

  -- Assessment/prediction references
  analyst_assessment_id UUID REFERENCES prediction.analyst_assessments(id) ON DELETE SET NULL,
  prediction_id UUID REFERENCES prediction.predictions(id) ON DELETE SET NULL,

  -- Target reference
  target_id UUID NOT NULL REFERENCES prediction.targets(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,

  -- Position details
  direction TEXT NOT NULL,  -- 'long' or 'short'
  quantity NUMERIC(20,8) NOT NULL,  -- Supports fractional for crypto

  -- Prices
  entry_price NUMERIC(20,8) NOT NULL,
  current_price NUMERIC(20,8) NOT NULL,
  exit_price NUMERIC(20,8),

  -- P&L
  unrealized_pnl NUMERIC(20,8) NOT NULL DEFAULT 0,
  realized_pnl NUMERIC(20,8),

  -- Paper-only flag (for suspended analysts in recovery)
  is_paper_only BOOLEAN NOT NULL DEFAULT FALSE,

  -- Status
  status TEXT NOT NULL DEFAULT 'open',  -- 'open', 'closed'

  -- Timestamps
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (direction IN ('long', 'short')),
  CHECK (quantity > 0),
  CHECK (status IN ('open', 'closed'))
);

CREATE INDEX idx_analyst_positions_portfolio ON prediction.analyst_positions(portfolio_id);
CREATE INDEX idx_analyst_positions_assessment ON prediction.analyst_positions(analyst_assessment_id) WHERE analyst_assessment_id IS NOT NULL;
CREATE INDEX idx_analyst_positions_prediction ON prediction.analyst_positions(prediction_id) WHERE prediction_id IS NOT NULL;
CREATE INDEX idx_analyst_positions_target ON prediction.analyst_positions(target_id);
CREATE INDEX idx_analyst_positions_status ON prediction.analyst_positions(status);
CREATE INDEX idx_analyst_positions_open ON prediction.analyst_positions(portfolio_id, status) WHERE status = 'open';
CREATE INDEX idx_analyst_positions_paper ON prediction.analyst_positions(is_paper_only) WHERE is_paper_only = TRUE;

CREATE TRIGGER set_analyst_positions_updated_at
  BEFORE UPDATE ON prediction.analyst_positions
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

COMMENT ON TABLE prediction.analyst_positions IS 'Individual positions for analyst portfolios';
COMMENT ON COLUMN prediction.analyst_positions.is_paper_only IS 'Paper trading for suspended analyst recovery';

-- =============================================================================
-- SECTION 7: ANALYST PERFORMANCE METRICS
-- =============================================================================
-- Purpose: Daily metrics for analyst performance tracking

CREATE TABLE prediction.analyst_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Analyst reference
  analyst_id UUID NOT NULL REFERENCES prediction.analysts(id) ON DELETE CASCADE,
  fork_type TEXT NOT NULL,  -- 'user' or 'agent'

  -- Date
  metric_date DATE NOT NULL,

  -- P&L metrics
  solo_pnl NUMERIC(20,8) NOT NULL DEFAULT 0,  -- P&L if only this analyst's picks used
  contribution_pnl NUMERIC(20,8) NOT NULL DEFAULT 0,  -- Weighted contribution to ensemble

  -- Dissent tracking
  dissent_accuracy NUMERIC(5,4),  -- Accuracy when disagreeing with ensemble
  dissent_count INTEGER NOT NULL DEFAULT 0,

  -- Ranking
  rank_in_portfolio INTEGER,  -- 1st, 2nd, 3rd among peers
  total_analysts INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (fork_type IN ('user', 'agent')),
  UNIQUE (analyst_id, fork_type, metric_date)
);

CREATE INDEX idx_analyst_performance_metrics_analyst ON prediction.analyst_performance_metrics(analyst_id);
CREATE INDEX idx_analyst_performance_metrics_date ON prediction.analyst_performance_metrics(metric_date DESC);
CREATE INDEX idx_analyst_performance_metrics_fork_date ON prediction.analyst_performance_metrics(analyst_id, fork_type, metric_date DESC);

COMMENT ON TABLE prediction.analyst_performance_metrics IS 'Daily performance metrics for analyst tracking';
COMMENT ON COLUMN prediction.analyst_performance_metrics.solo_pnl IS 'P&L if only this analyst picks were used';
COMMENT ON COLUMN prediction.analyst_performance_metrics.contribution_pnl IS 'Weighted contribution to ensemble P&L';
COMMENT ON COLUMN prediction.analyst_performance_metrics.dissent_accuracy IS 'Accuracy when disagreeing with ensemble';

-- =============================================================================
-- SECTION 8: USER PORTFOLIOS
-- =============================================================================
-- Purpose: Track user's paper trading portfolio

CREATE TABLE prediction.user_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id UUID NOT NULL,  -- References auth.users
  org_slug TEXT NOT NULL,

  -- Balance tracking
  initial_balance NUMERIC(20,8) NOT NULL DEFAULT 1000000.00,
  current_balance NUMERIC(20,8) NOT NULL DEFAULT 1000000.00,

  -- P&L tracking
  total_realized_pnl NUMERIC(20,8) NOT NULL DEFAULT 0,
  total_unrealized_pnl NUMERIC(20,8) NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE (user_id, org_slug)
);

CREATE INDEX idx_user_portfolios_user ON prediction.user_portfolios(user_id);
CREATE INDEX idx_user_portfolios_org ON prediction.user_portfolios(org_slug);

CREATE TRIGGER set_user_portfolios_updated_at
  BEFORE UPDATE ON prediction.user_portfolios
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

COMMENT ON TABLE prediction.user_portfolios IS 'User paper trading portfolios';

-- =============================================================================
-- SECTION 9: USER POSITIONS
-- =============================================================================
-- Purpose: Track individual positions for users

CREATE TABLE prediction.user_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Portfolio reference
  portfolio_id UUID NOT NULL REFERENCES prediction.user_portfolios(id) ON DELETE CASCADE,

  -- Prediction reference
  prediction_id UUID NOT NULL REFERENCES prediction.predictions(id) ON DELETE CASCADE,

  -- Target reference
  target_id UUID NOT NULL REFERENCES prediction.targets(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,

  -- Position details
  direction TEXT NOT NULL,  -- 'long' or 'short'
  quantity NUMERIC(20,8) NOT NULL,  -- User's actual quantity (may differ from recommended)

  -- Prices
  entry_price NUMERIC(20,8) NOT NULL,
  current_price NUMERIC(20,8) NOT NULL,
  exit_price NUMERIC(20,8),

  -- P&L
  unrealized_pnl NUMERIC(20,8) NOT NULL DEFAULT 0,
  realized_pnl NUMERIC(20,8),

  -- Status
  status TEXT NOT NULL DEFAULT 'open',  -- 'open', 'closed'

  -- Timestamps
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (direction IN ('long', 'short')),
  CHECK (quantity > 0),
  CHECK (status IN ('open', 'closed'))
);

CREATE INDEX idx_user_positions_portfolio ON prediction.user_positions(portfolio_id);
CREATE INDEX idx_user_positions_prediction ON prediction.user_positions(prediction_id);
CREATE INDEX idx_user_positions_target ON prediction.user_positions(target_id);
CREATE INDEX idx_user_positions_status ON prediction.user_positions(status);
CREATE INDEX idx_user_positions_open ON prediction.user_positions(portfolio_id, status) WHERE status = 'open';

CREATE TRIGGER set_user_positions_updated_at
  BEFORE UPDATE ON prediction.user_positions
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

COMMENT ON TABLE prediction.user_positions IS 'User positions in paper trading portfolio';

-- =============================================================================
-- SECTION 10: AGENT SELF-MODIFICATION LOG
-- =============================================================================
-- Purpose: Audit trail for agent self-modifications (HITL informational)

CREATE TABLE prediction.agent_self_modification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Analyst reference
  analyst_id UUID NOT NULL REFERENCES prediction.analysts(id) ON DELETE CASCADE,

  -- Modification details
  modification_type TEXT NOT NULL,  -- 'rule_added', 'rule_removed', 'weight_changed', 'journal_entry', 'status_change'
  summary TEXT NOT NULL,  -- Human-readable summary
  details JSONB NOT NULL,  -- Full before/after context diff

  -- Trigger context
  trigger_reason TEXT,  -- Why did agent make this change
  performance_context JSONB,  -- P&L at time of change

  -- Acknowledgment tracking
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (modification_type IN ('rule_added', 'rule_removed', 'weight_changed', 'journal_entry', 'status_change'))
);

CREATE INDEX idx_agent_self_modification_log_analyst ON prediction.agent_self_modification_log(analyst_id);
CREATE INDEX idx_agent_self_modification_log_type ON prediction.agent_self_modification_log(modification_type);
CREATE INDEX idx_agent_self_modification_log_created ON prediction.agent_self_modification_log(created_at DESC);
CREATE INDEX idx_agent_self_modification_log_unacked ON prediction.agent_self_modification_log(acknowledged, created_at DESC)
  WHERE acknowledged = FALSE;

COMMENT ON TABLE prediction.agent_self_modification_log IS 'Audit trail for agent self-modifications (HITL informational)';
COMMENT ON COLUMN prediction.agent_self_modification_log.acknowledged IS 'Whether user has seen this notification';

-- =============================================================================
-- SECTION 11: ANALYST ADAPTATION DIFFS
-- =============================================================================
-- Purpose: Track differences between user and agent forks

CREATE TABLE prediction.analyst_adaptation_diffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Analyst reference
  analyst_id UUID NOT NULL REFERENCES prediction.analysts(id) ON DELETE CASCADE,

  -- Version references
  user_version_id UUID NOT NULL REFERENCES prediction.analyst_context_versions(id) ON DELETE CASCADE,
  agent_version_id UUID NOT NULL REFERENCES prediction.analyst_context_versions(id) ON DELETE CASCADE,

  -- Diff content
  diff_summary TEXT NOT NULL,  -- Human-readable summary
  performance_comparison JSONB NOT NULL,  -- { user_pnl, agent_pnl, period }

  -- Adoption tracking
  adoption_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'adopted', 'rejected', 'partial'
  adopted_changes JSONB,  -- Which specific changes user pulled

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (adoption_status IN ('pending', 'adopted', 'rejected', 'partial'))
);

CREATE INDEX idx_analyst_adaptation_diffs_analyst ON prediction.analyst_adaptation_diffs(analyst_id);
CREATE INDEX idx_analyst_adaptation_diffs_status ON prediction.analyst_adaptation_diffs(adoption_status);
CREATE INDEX idx_analyst_adaptation_diffs_created ON prediction.analyst_adaptation_diffs(created_at DESC);

COMMENT ON TABLE prediction.analyst_adaptation_diffs IS 'Track differences between user and agent forks for comparison';

-- =============================================================================
-- SECTION 12: FORK LEARNING EXCHANGES
-- =============================================================================
-- Purpose: Record bidirectional learning dialogues between forks

CREATE TABLE prediction.fork_learning_exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Analyst reference
  analyst_id UUID NOT NULL REFERENCES prediction.analysts(id) ON DELETE CASCADE,

  -- Exchange details
  initiated_by TEXT NOT NULL,  -- 'user' or 'agent'
  question TEXT NOT NULL,
  response TEXT,

  -- Context
  context_diff JSONB,  -- Specific rules/weights being discussed
  performance_evidence JSONB,  -- P&L proof supporting the lesson

  -- Outcome
  outcome TEXT NOT NULL DEFAULT 'pending',  -- 'adopted', 'rejected', 'noted', 'pending'
  adoption_details JSONB,  -- What specifically was adopted

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (initiated_by IN ('user', 'agent')),
  CHECK (outcome IN ('adopted', 'rejected', 'noted', 'pending'))
);

CREATE INDEX idx_fork_learning_exchanges_analyst ON prediction.fork_learning_exchanges(analyst_id);
CREATE INDEX idx_fork_learning_exchanges_initiator ON prediction.fork_learning_exchanges(initiated_by);
CREATE INDEX idx_fork_learning_exchanges_outcome ON prediction.fork_learning_exchanges(outcome);
CREATE INDEX idx_fork_learning_exchanges_created ON prediction.fork_learning_exchanges(created_at DESC);

COMMENT ON TABLE prediction.fork_learning_exchanges IS 'Bidirectional learning dialogues between user and agent forks';

-- =============================================================================
-- SECTION 13: MODIFY EXISTING TABLES
-- =============================================================================

-- Add recommended_quantity to predictions
ALTER TABLE prediction.predictions
  ADD COLUMN IF NOT EXISTS recommended_quantity NUMERIC(20,8),
  ADD COLUMN IF NOT EXISTS quantity_reasoning TEXT;

-- Add context version tracking to predictions
ALTER TABLE prediction.predictions
  ADD COLUMN IF NOT EXISTS runner_context_version_id UUID REFERENCES prediction.runner_context_versions(id),
  ADD COLUMN IF NOT EXISTS analyst_context_version_ids JSONB DEFAULT '{}'::jsonb,  -- map of analyst_id -> version_id
  ADD COLUMN IF NOT EXISTS universe_context_version_id UUID REFERENCES prediction.universe_context_versions(id),
  ADD COLUMN IF NOT EXISTS target_context_version_id UUID REFERENCES prediction.target_context_versions(id);

-- Add fork tracking to analyst_assessments
ALTER TABLE prediction.analyst_assessments
  ADD COLUMN IF NOT EXISTS fork_type TEXT DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS context_version_id UUID REFERENCES prediction.analyst_context_versions(id);

-- Add constraint for fork_type
ALTER TABLE prediction.analyst_assessments
  ADD CONSTRAINT chk_analyst_assessments_fork_type CHECK (fork_type IS NULL OR fork_type IN ('user', 'agent'));

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_predictions_runner_context ON prediction.predictions(runner_context_version_id) WHERE runner_context_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_predictions_universe_context ON prediction.predictions(universe_context_version_id) WHERE universe_context_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_predictions_target_context ON prediction.predictions(target_context_version_id) WHERE target_context_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analyst_assessments_fork ON prediction.analyst_assessments(fork_type);
CREATE INDEX IF NOT EXISTS idx_analyst_assessments_context_version ON prediction.analyst_assessments(context_version_id) WHERE context_version_id IS NOT NULL;

COMMENT ON COLUMN prediction.predictions.recommended_quantity IS 'System-recommended position size based on confidence and risk';
COMMENT ON COLUMN prediction.predictions.quantity_reasoning IS 'Explanation for recommended position size';
COMMENT ON COLUMN prediction.predictions.analyst_context_version_ids IS 'Map of analyst_id to context version used for this prediction';
COMMENT ON COLUMN prediction.analyst_assessments.fork_type IS 'Which fork made this assessment: user or agent';
COMMENT ON COLUMN prediction.analyst_assessments.context_version_id IS 'Context version used for this assessment';

-- =============================================================================
-- SECTION 14: HELPER FUNCTIONS
-- =============================================================================

-- Function to get current analyst context version for a fork
CREATE OR REPLACE FUNCTION prediction.get_current_analyst_context(
  p_analyst_id UUID,
  p_fork_type TEXT DEFAULT 'user'
)
RETURNS prediction.analyst_context_versions AS $$
DECLARE
  v_result prediction.analyst_context_versions;
BEGIN
  SELECT * INTO v_result
  FROM prediction.analyst_context_versions
  WHERE analyst_id = p_analyst_id
    AND fork_type = p_fork_type
    AND is_current = TRUE
  LIMIT 1;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to create new analyst context version
CREATE OR REPLACE FUNCTION prediction.create_analyst_context_version(
  p_analyst_id UUID,
  p_fork_type TEXT,
  p_perspective TEXT,
  p_tier_instructions JSONB,
  p_default_weight NUMERIC,
  p_agent_journal TEXT DEFAULT NULL,
  p_change_reason TEXT DEFAULT NULL,
  p_changed_by TEXT DEFAULT 'system'
)
RETURNS UUID AS $$
DECLARE
  v_next_version INTEGER;
  v_new_id UUID;
BEGIN
  -- Mark previous version as not current
  UPDATE prediction.analyst_context_versions
  SET is_current = FALSE
  WHERE analyst_id = p_analyst_id
    AND fork_type = p_fork_type
    AND is_current = TRUE;

  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM prediction.analyst_context_versions
  WHERE analyst_id = p_analyst_id
    AND fork_type = p_fork_type;

  -- Insert new version
  INSERT INTO prediction.analyst_context_versions (
    analyst_id, fork_type, version_number,
    perspective, tier_instructions, default_weight,
    agent_journal, change_reason, changed_by, is_current
  ) VALUES (
    p_analyst_id, p_fork_type, v_next_version,
    p_perspective, p_tier_instructions, p_default_weight,
    p_agent_journal, p_change_reason, p_changed_by, TRUE
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate P&L for a position
CREATE OR REPLACE FUNCTION prediction.calculate_position_pnl(
  p_direction TEXT,
  p_entry_price NUMERIC,
  p_current_price NUMERIC,
  p_quantity NUMERIC
)
RETURNS NUMERIC AS $$
BEGIN
  IF p_direction = 'long' THEN
    RETURN (p_current_price - p_entry_price) * p_quantity;
  ELSE  -- short
    RETURN (p_entry_price - p_current_price) * p_quantity;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update analyst portfolio status based on balance
CREATE OR REPLACE FUNCTION prediction.update_analyst_portfolio_status()
RETURNS TRIGGER AS $$
DECLARE
  v_balance_percent NUMERIC;
  v_new_status TEXT;
BEGIN
  -- Only applies to agent fork
  IF NEW.fork_type != 'agent' THEN
    RETURN NEW;
  END IF;

  -- Calculate balance as percentage of initial
  v_balance_percent := (NEW.current_balance / NEW.initial_balance) * 100;

  -- Determine new status based on thresholds
  IF v_balance_percent >= 80 THEN
    v_new_status := 'active';
  ELSIF v_balance_percent >= 60 THEN
    v_new_status := 'warning';
  ELSIF v_balance_percent >= 40 THEN
    v_new_status := 'probation';
  ELSE
    v_new_status := 'suspended';
  END IF;

  -- Update status if changed
  IF NEW.status != v_new_status THEN
    NEW.status := v_new_status;
    NEW.status_changed_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_analyst_portfolio_status
  BEFORE UPDATE OF current_balance ON prediction.analyst_portfolios
  FOR EACH ROW
  EXECUTE FUNCTION prediction.update_analyst_portfolio_status();

-- =============================================================================
-- SECTION 15: INITIALIZE FORKS FOR EXISTING ANALYSTS
-- =============================================================================

-- Create initial context versions for both forks of existing analysts
INSERT INTO prediction.analyst_context_versions (
  analyst_id, fork_type, version_number,
  perspective, tier_instructions, default_weight,
  change_reason, changed_by
)
SELECT
  id AS analyst_id,
  'user' AS fork_type,
  1 AS version_number,
  perspective,
  tier_instructions,
  default_weight,
  'Initial version from existing analyst' AS change_reason,
  'system' AS changed_by
FROM prediction.analysts
WHERE NOT EXISTS (
  SELECT 1 FROM prediction.analyst_context_versions
  WHERE analyst_id = prediction.analysts.id AND fork_type = 'user'
);

INSERT INTO prediction.analyst_context_versions (
  analyst_id, fork_type, version_number,
  perspective, tier_instructions, default_weight,
  change_reason, changed_by
)
SELECT
  id AS analyst_id,
  'agent' AS fork_type,
  1 AS version_number,
  perspective,
  tier_instructions,
  default_weight,
  'Initial version from existing analyst' AS change_reason,
  'system' AS changed_by
FROM prediction.analysts
WHERE NOT EXISTS (
  SELECT 1 FROM prediction.analyst_context_versions
  WHERE analyst_id = prediction.analysts.id AND fork_type = 'agent'
);

-- Create portfolios for both forks of existing analysts
INSERT INTO prediction.analyst_portfolios (analyst_id, fork_type)
SELECT id, 'user' FROM prediction.analysts
WHERE NOT EXISTS (
  SELECT 1 FROM prediction.analyst_portfolios
  WHERE analyst_id = prediction.analysts.id AND fork_type = 'user'
);

INSERT INTO prediction.analyst_portfolios (analyst_id, fork_type)
SELECT id, 'agent' FROM prediction.analysts
WHERE NOT EXISTS (
  SELECT 1 FROM prediction.analyst_portfolios
  WHERE analyst_id = prediction.analysts.id AND fork_type = 'agent'
);

-- =============================================================================
-- SECTION 16: VIEWS
-- =============================================================================

-- View for analyst portfolio comparison
CREATE OR REPLACE VIEW prediction.v_analyst_fork_comparison AS
SELECT
  a.id AS analyst_id,
  a.slug,
  a.name,
  a.perspective,

  -- User fork
  up.current_balance AS user_balance,
  up.total_realized_pnl AS user_realized_pnl,
  up.total_unrealized_pnl AS user_unrealized_pnl,
  up.win_count AS user_wins,
  up.loss_count AS user_losses,

  -- Agent fork
  ap.current_balance AS agent_balance,
  ap.total_realized_pnl AS agent_realized_pnl,
  ap.total_unrealized_pnl AS agent_unrealized_pnl,
  ap.win_count AS agent_wins,
  ap.loss_count AS agent_losses,
  ap.status AS agent_status,

  -- Comparison
  (ap.current_balance - up.current_balance) AS balance_diff,
  CASE
    WHEN up.current_balance > 0 THEN
      ((ap.current_balance - up.current_balance) / up.current_balance * 100)
    ELSE 0
  END AS balance_diff_percent

FROM prediction.analysts a
LEFT JOIN prediction.analyst_portfolios up ON up.analyst_id = a.id AND up.fork_type = 'user'
LEFT JOIN prediction.analyst_portfolios ap ON ap.analyst_id = a.id AND ap.fork_type = 'agent';

COMMENT ON VIEW prediction.v_analyst_fork_comparison IS 'Compare user and agent fork performance for each analyst';

-- View for unacknowledged agent modifications
CREATE OR REPLACE VIEW prediction.v_agent_activity_feed AS
SELECT
  m.id,
  m.analyst_id,
  a.slug AS analyst_slug,
  a.name AS analyst_name,
  m.modification_type,
  m.summary,
  m.trigger_reason,
  m.performance_context,
  m.created_at,
  m.acknowledged
FROM prediction.agent_self_modification_log m
JOIN prediction.analysts a ON a.id = m.analyst_id
ORDER BY m.created_at DESC;

COMMENT ON VIEW prediction.v_agent_activity_feed IS 'Feed of agent self-modifications for HITL visibility';

-- =============================================================================
-- DONE
-- =============================================================================

-- =============================================================================
-- CREATE RISK SCHEMA
-- =============================================================================
-- Creates the 'risk' schema for the Investment Risk Agent
-- Phase 1: Foundation - Database Schema Creation
-- Architecture: Table-driven, fully generalized risk analysis
-- =============================================================================

-- Create risk schema
CREATE SCHEMA IF NOT EXISTS risk;
COMMENT ON SCHEMA risk IS 'Risk Analysis System: multi-factor risk assessment with adversarial debate and learning loop';

-- Grant usage on schema
GRANT USAGE ON SCHEMA risk TO postgres, anon, authenticated, service_role;

-- Grant all privileges on all tables in schema (for service_role)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA risk TO service_role;

-- Grant all privileges on all sequences in schema (for service_role)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA risk TO service_role;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA risk GRANT ALL ON TABLES TO service_role;

-- Set default privileges for future sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA risk GRANT ALL ON SEQUENCES TO service_role;

-- =============================================================================
-- SHARED FUNCTIONS
-- =============================================================================

-- Set updated_at function
CREATE OR REPLACE FUNCTION risk.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- CORE ENTITIES (Table-Driven Configuration)
-- =============================================================================

-- Scopes: Analysis boundaries/contexts (e.g., "US Tech Stocks", "Crypto Portfolio")
CREATE TABLE risk.scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_slug TEXT NOT NULL,
  agent_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  domain TEXT NOT NULL, -- 'investment', 'business', 'project', 'personal'
  llm_config JSONB DEFAULT '{}'::JSONB,  -- provider, model, tiers
  thresholds JSONB DEFAULT '{}'::JSONB,  -- alert thresholds, etc.
  analysis_config JSONB DEFAULT '{
    "riskRadar": { "enabled": true },
    "redTeam": { "enabled": false }
  }'::JSONB,  -- which analysis types enabled
  is_active BOOLEAN DEFAULT true,
  is_test BOOLEAN DEFAULT false,
  test_scenario_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_scopes_org ON risk.scopes(organization_slug);
CREATE INDEX idx_risk_scopes_agent ON risk.scopes(agent_slug);
CREATE INDEX idx_risk_scopes_domain ON risk.scopes(domain);
CREATE INDEX idx_risk_scopes_active ON risk.scopes(is_active) WHERE is_active = true;

-- Subjects: Things being risk-assessed (e.g., AAPL, BTC, a business decision)
CREATE TABLE risk.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES risk.scopes(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,  -- symbol for stocks, slug for decisions
  name TEXT,
  subject_type TEXT NOT NULL, -- 'stock', 'crypto', 'decision', 'project'
  metadata JSONB DEFAULT '{}'::JSONB,
  is_active BOOLEAN DEFAULT true,
  is_test BOOLEAN DEFAULT false,
  test_scenario_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(scope_id, identifier)
);

CREATE INDEX idx_risk_subjects_scope ON risk.subjects(scope_id);
CREATE INDEX idx_risk_subjects_type ON risk.subjects(subject_type);
CREATE INDEX idx_risk_subjects_identifier ON risk.subjects(identifier);
CREATE INDEX idx_risk_subjects_active ON risk.subjects(is_active) WHERE is_active = true;

-- =============================================================================
-- VERSIONED CONTEXT (Table-Driven Dimensions)
-- =============================================================================

-- Dimensions: Risk factors to analyze (e.g., 'market', 'fundamental', 'technical')
CREATE TABLE risk.dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES risk.scopes(id) ON DELETE CASCADE,
  slug TEXT NOT NULL, -- 'market', 'fundamental', 'technical', 'macro', 'correlation'
  name TEXT NOT NULL,
  description TEXT,
  weight NUMERIC(3,2) DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 2),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_test BOOLEAN DEFAULT false,
  test_scenario_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(scope_id, slug)
);

CREATE INDEX idx_risk_dimensions_scope ON risk.dimensions(scope_id);
CREATE INDEX idx_risk_dimensions_slug ON risk.dimensions(slug);
CREATE INDEX idx_risk_dimensions_active ON risk.dimensions(is_active) WHERE is_active = true;

-- Dimension Contexts: Versioned prompts for each dimension
CREATE TABLE risk.dimension_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_id UUID NOT NULL REFERENCES risk.dimensions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  system_prompt TEXT NOT NULL,  -- The full prompt for this dimension's analysis
  output_schema JSONB DEFAULT '{
    "type": "object",
    "properties": {
      "score": { "type": "integer", "minimum": 0, "maximum": 100 },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
      "reasoning": { "type": "string" },
      "evidence": { "type": "array", "items": { "type": "string" } },
      "signals": { "type": "array", "items": { "type": "object" } }
    },
    "required": ["score", "confidence", "reasoning"]
  }'::JSONB,
  examples JSONB DEFAULT '[]'::JSONB,  -- Few-shot examples
  is_active BOOLEAN DEFAULT true,
  is_test BOOLEAN DEFAULT false,
  test_scenario_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(dimension_id, version)
);

CREATE INDEX idx_risk_dim_contexts_dimension ON risk.dimension_contexts(dimension_id);
CREATE INDEX idx_risk_dim_contexts_version ON risk.dimension_contexts(dimension_id, version);
CREATE INDEX idx_risk_dim_contexts_active ON risk.dimension_contexts(is_active) WHERE is_active = true;

-- Debate Contexts: Versioned prompts for Red Team / Blue Team debate
CREATE TABLE risk.debate_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES risk.scopes(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('blue', 'red', 'arbiter')),
  version INTEGER NOT NULL DEFAULT 1,
  system_prompt TEXT NOT NULL,
  output_schema JSONB DEFAULT '{}'::JSONB,
  is_active BOOLEAN DEFAULT true,
  is_test BOOLEAN DEFAULT false,
  test_scenario_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(scope_id, role, version)
);

CREATE INDEX idx_risk_debate_contexts_scope ON risk.debate_contexts(scope_id);
CREATE INDEX idx_risk_debate_contexts_role ON risk.debate_contexts(role);
CREATE INDEX idx_risk_debate_contexts_active ON risk.debate_contexts(is_active) WHERE is_active = true;

-- =============================================================================
-- ASSESSMENT ENTITIES
-- =============================================================================

-- Assessments: Individual dimension risk assessments
CREATE TABLE risk.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES risk.subjects(id) ON DELETE CASCADE,
  dimension_id UUID NOT NULL REFERENCES risk.dimensions(id) ON DELETE CASCADE,
  dimension_context_id UUID REFERENCES risk.dimension_contexts(id),
  task_id UUID, -- ExecutionContext.taskId
  score INTEGER CHECK (score >= 0 AND score <= 100),
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  reasoning TEXT,
  evidence JSONB DEFAULT '[]'::JSONB,
  signals JSONB DEFAULT '[]'::JSONB,
  analyst_response JSONB DEFAULT '{}'::JSONB,
  llm_provider TEXT,
  llm_model TEXT,
  is_test BOOLEAN DEFAULT false,
  test_scenario_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_assessments_subject ON risk.assessments(subject_id);
CREATE INDEX idx_risk_assessments_dimension ON risk.assessments(dimension_id);
CREATE INDEX idx_risk_assessments_task ON risk.assessments(task_id);
CREATE INDEX idx_risk_assessments_created ON risk.assessments(created_at DESC);

-- Debates: Red Team / Blue Team adversarial debate records
CREATE TABLE risk.debates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES risk.subjects(id) ON DELETE CASCADE,
  composite_score_id UUID, -- Will be set after composite_scores table created
  task_id UUID,
  blue_assessment JSONB DEFAULT '{}'::JSONB, -- Risk Radar summary
  red_challenges JSONB DEFAULT '{}'::JSONB,  -- Red Team findings
  arbiter_synthesis JSONB DEFAULT '{}'::JSONB, -- Final synthesis
  original_score INTEGER CHECK (original_score >= 0 AND original_score <= 100),
  final_score INTEGER CHECK (final_score >= 0 AND final_score <= 100),
  score_adjustment INTEGER DEFAULT 0,
  transcript JSONB DEFAULT '[]'::JSONB, -- Full debate conversation
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  is_test BOOLEAN DEFAULT false,
  test_scenario_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_risk_debates_subject ON risk.debates(subject_id);
CREATE INDEX idx_risk_debates_task ON risk.debates(task_id);
CREATE INDEX idx_risk_debates_status ON risk.debates(status);
CREATE INDEX idx_risk_debates_created ON risk.debates(created_at DESC);

-- Composite Scores: Aggregated risk scores across all dimensions
CREATE TABLE risk.composite_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES risk.subjects(id) ON DELETE CASCADE,
  task_id UUID,
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  dimension_scores JSONB DEFAULT '{}'::JSONB, -- { "market": 65, "fundamental": 45, ... }
  debate_id UUID REFERENCES risk.debates(id),
  debate_adjustment INTEGER DEFAULT 0, -- Score change from Red Team
  pre_debate_score INTEGER CHECK (pre_debate_score >= 0 AND pre_debate_score <= 100),
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'expired')),
  valid_until TIMESTAMPTZ,
  is_test BOOLEAN DEFAULT false,
  test_scenario_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_composite_subject ON risk.composite_scores(subject_id);
CREATE INDEX idx_risk_composite_task ON risk.composite_scores(task_id);
CREATE INDEX idx_risk_composite_status ON risk.composite_scores(status);
CREATE INDEX idx_risk_composite_created ON risk.composite_scores(created_at DESC);
CREATE INDEX idx_risk_composite_active ON risk.composite_scores(subject_id, status) WHERE status = 'active';

-- Add foreign key from debates to composite_scores now that both tables exist
ALTER TABLE risk.debates ADD CONSTRAINT fk_debates_composite_score
  FOREIGN KEY (composite_score_id) REFERENCES risk.composite_scores(id) ON DELETE SET NULL;

-- =============================================================================
-- ALERTS
-- =============================================================================

-- Alerts: Threshold breaches and notifications
CREATE TABLE risk.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES risk.subjects(id) ON DELETE CASCADE,
  composite_score_id UUID REFERENCES risk.composite_scores(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('threshold_breach', 'rapid_change', 'dimension_spike', 'stale_assessment')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT,
  details JSONB DEFAULT '{}'::JSONB,
  triggered_value NUMERIC,
  threshold_value NUMERIC,
  is_acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  is_test BOOLEAN DEFAULT false,
  test_scenario_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_alerts_subject ON risk.alerts(subject_id);
CREATE INDEX idx_risk_alerts_composite ON risk.alerts(composite_score_id);
CREATE INDEX idx_risk_alerts_type ON risk.alerts(alert_type);
CREATE INDEX idx_risk_alerts_severity ON risk.alerts(severity);
CREATE INDEX idx_risk_alerts_unacknowledged ON risk.alerts(acknowledged_at) WHERE acknowledged_at IS NULL;
CREATE INDEX idx_risk_alerts_created ON risk.alerts(created_at DESC);

-- =============================================================================
-- LEARNING ENTITIES
-- =============================================================================

-- Learnings: Accumulated knowledge from evaluations
CREATE TABLE risk.learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_level TEXT NOT NULL CHECK (scope_level IN ('runner', 'domain', 'scope', 'subject', 'dimension')),
  domain TEXT, -- 'investment', 'business', etc.
  scope_id UUID REFERENCES risk.scopes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES risk.subjects(id) ON DELETE CASCADE,
  dimension_id UUID REFERENCES risk.dimensions(id) ON DELETE CASCADE,
  learning_type TEXT NOT NULL CHECK (learning_type IN ('rule', 'pattern', 'avoid', 'weight_adjustment', 'threshold')),
  title TEXT NOT NULL,
  description TEXT,
  config JSONB DEFAULT '{}'::JSONB,
  times_applied INTEGER DEFAULT 0,
  times_helpful INTEGER DEFAULT 0,
  effectiveness_score NUMERIC(3,2),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'testing', 'retired', 'superseded')),
  is_test BOOLEAN DEFAULT true,
  source_type TEXT CHECK (source_type IN ('human', 'ai_suggested', 'ai_approved')),
  parent_learning_id UUID REFERENCES risk.learnings(id),
  is_production BOOLEAN DEFAULT false,
  test_scenario_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_learnings_scope_level ON risk.learnings(scope_level);
CREATE INDEX idx_risk_learnings_scope ON risk.learnings(scope_id);
CREATE INDEX idx_risk_learnings_subject ON risk.learnings(subject_id);
CREATE INDEX idx_risk_learnings_dimension ON risk.learnings(dimension_id);
CREATE INDEX idx_risk_learnings_type ON risk.learnings(learning_type);
CREATE INDEX idx_risk_learnings_status ON risk.learnings(status);
CREATE INDEX idx_risk_learnings_production ON risk.learnings(is_production) WHERE is_production = true;

-- Learning Queue: AI-suggested learnings awaiting HITL review
CREATE TABLE risk.learning_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID REFERENCES risk.scopes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES risk.subjects(id) ON DELETE CASCADE,
  evaluation_id UUID, -- Reference to the evaluation that triggered this
  suggested_scope_level TEXT,
  suggested_learning_type TEXT,
  suggested_title TEXT NOT NULL,
  suggested_description TEXT,
  suggested_config JSONB DEFAULT '{}'::JSONB,
  ai_reasoning TEXT,
  ai_confidence NUMERIC(3,2) CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'modified')),
  reviewed_by_user_id UUID,
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  learning_id UUID REFERENCES risk.learnings(id), -- Created learning if approved
  is_test BOOLEAN DEFAULT false,
  test_scenario_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_learning_queue_scope ON risk.learning_queue(scope_id);
CREATE INDEX idx_risk_learning_queue_status ON risk.learning_queue(status);
CREATE INDEX idx_risk_learning_queue_pending ON risk.learning_queue(status) WHERE status = 'pending';
CREATE INDEX idx_risk_learning_queue_created ON risk.learning_queue(created_at DESC);

-- Evaluations: Compare assessments to actual outcomes
CREATE TABLE risk.evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composite_score_id UUID NOT NULL REFERENCES risk.composite_scores(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES risk.subjects(id) ON DELETE CASCADE,
  evaluation_window TEXT NOT NULL, -- '7d', '30d', '90d'
  actual_outcome JSONB DEFAULT '{}'::JSONB, -- What actually happened
  outcome_severity INTEGER CHECK (outcome_severity >= 0 AND outcome_severity <= 100), -- 0=nothing, 100=catastrophic
  score_accuracy NUMERIC(3,2) CHECK (score_accuracy >= 0 AND score_accuracy <= 1),
  dimension_accuracy JSONB DEFAULT '{}'::JSONB, -- Per-dimension accuracy
  calibration_error NUMERIC(5,4), -- Difference between predicted risk and actual outcome
  learnings_suggested TEXT[],
  notes TEXT,
  is_test BOOLEAN DEFAULT false,
  test_scenario_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_evaluations_composite ON risk.evaluations(composite_score_id);
CREATE INDEX idx_risk_evaluations_subject ON risk.evaluations(subject_id);
CREATE INDEX idx_risk_evaluations_window ON risk.evaluations(evaluation_window);
CREATE INDEX idx_risk_evaluations_created ON risk.evaluations(created_at DESC);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Updated_at triggers
CREATE TRIGGER set_updated_at_scopes
  BEFORE UPDATE ON risk.scopes
  FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();

CREATE TRIGGER set_updated_at_subjects
  BEFORE UPDATE ON risk.subjects
  FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();

CREATE TRIGGER set_updated_at_dimensions
  BEFORE UPDATE ON risk.dimensions
  FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();

CREATE TRIGGER set_updated_at_dimension_contexts
  BEFORE UPDATE ON risk.dimension_contexts
  FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();

CREATE TRIGGER set_updated_at_debate_contexts
  BEFORE UPDATE ON risk.debate_contexts
  FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();

CREATE TRIGGER set_updated_at_learnings
  BEFORE UPDATE ON risk.learnings
  FOR EACH ROW EXECUTE FUNCTION risk.set_updated_at();

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Active composite scores view (latest active score per subject)
CREATE OR REPLACE VIEW risk.active_composite_scores AS
SELECT DISTINCT ON (subject_id)
  cs.*,
  s.identifier AS subject_identifier,
  s.name AS subject_name,
  s.subject_type,
  sc.name AS scope_name,
  sc.domain AS scope_domain
FROM risk.composite_scores cs
JOIN risk.subjects s ON s.id = cs.subject_id
JOIN risk.scopes sc ON sc.id = s.scope_id
WHERE cs.status = 'active'
  AND cs.is_test = false
ORDER BY subject_id, cs.created_at DESC;

-- Pending learning queue view
CREATE OR REPLACE VIEW risk.pending_learnings AS
SELECT
  lq.*,
  s.identifier AS subject_identifier,
  s.name AS subject_name,
  sc.name AS scope_name
FROM risk.learning_queue lq
LEFT JOIN risk.subjects s ON s.id = lq.subject_id
LEFT JOIN risk.scopes sc ON sc.id = lq.scope_id
WHERE lq.status = 'pending'
  AND lq.is_test = false
ORDER BY lq.created_at DESC;

-- Unacknowledged alerts view
CREATE OR REPLACE VIEW risk.unacknowledged_alerts AS
SELECT
  a.*,
  s.identifier AS subject_identifier,
  s.name AS subject_name,
  sc.name AS scope_name
FROM risk.alerts a
JOIN risk.subjects s ON s.id = a.subject_id
JOIN risk.scopes sc ON sc.id = s.scope_id
WHERE a.acknowledged_at IS NULL
  AND a.is_test = false
ORDER BY
  CASE a.severity
    WHEN 'critical' THEN 1
    WHEN 'warning' THEN 2
    ELSE 3
  END,
  a.created_at DESC;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Risk schema created successfully';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - risk.scopes (analysis boundaries)';
  RAISE NOTICE '  - risk.subjects (things being assessed)';
  RAISE NOTICE '  - risk.dimensions (risk factors)';
  RAISE NOTICE '  - risk.dimension_contexts (versioned prompts)';
  RAISE NOTICE '  - risk.debate_contexts (Red/Blue/Arbiter prompts)';
  RAISE NOTICE '  - risk.assessments (dimension assessments)';
  RAISE NOTICE '  - risk.debates (adversarial debate records)';
  RAISE NOTICE '  - risk.composite_scores (aggregated scores)';
  RAISE NOTICE '  - risk.alerts (threshold notifications)';
  RAISE NOTICE '  - risk.learnings (accumulated knowledge)';
  RAISE NOTICE '  - risk.learning_queue (HITL review queue)';
  RAISE NOTICE '  - risk.evaluations (outcome comparisons)';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Views created:';
  RAISE NOTICE '  - risk.active_composite_scores';
  RAISE NOTICE '  - risk.pending_learnings';
  RAISE NOTICE '  - risk.unacknowledged_alerts';
  RAISE NOTICE '================================================';
END $$;

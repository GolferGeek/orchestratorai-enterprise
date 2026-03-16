-- =====================================================================================
-- PREDICTION SYSTEM - PHASE 2: LEARNING TABLES
-- =====================================================================================
-- Description: Creates learning system for accumulating insights from evaluations
-- Dependencies: prediction schema, universes, targets, analysts, evaluations, missed_opportunities
-- =====================================================================================

-- =====================================================================================
-- LEARNINGS TABLE
-- =====================================================================================
-- Purpose: Accumulated insights and patterns from evaluations with scope hierarchy
-- Scope Hierarchy: runner (global) -> domain -> universe -> target
-- =====================================================================================

CREATE TABLE prediction.learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope hierarchy (determines where this learning applies)
  scope_level TEXT NOT NULL DEFAULT 'runner',  -- 'runner', 'domain', 'universe', 'target'
  domain TEXT,  -- NULL for runner-level, required for domain+
  universe_id UUID REFERENCES prediction.universes(id) ON DELETE CASCADE,
  target_id UUID REFERENCES prediction.targets(id) ON DELETE CASCADE,
  analyst_id UUID REFERENCES prediction.analysts(id) ON DELETE SET NULL,  -- Optional analyst-specific

  -- Learning content
  learning_type TEXT NOT NULL,  -- 'rule', 'pattern', 'weight_adjustment', 'threshold', 'avoid'
  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Configuration
  config JSONB DEFAULT '{}'::jsonb,
  -- Examples:
  -- weight_adjustment: { "analyst_slug": "technical-tina", "adjustment": 0.2 }
  -- threshold: { "min_predictors": 5 }
  -- rule: { "trigger_condition": "...", "action": "..." }
  -- pattern: { "indicators": [...], "success_rate": 0.75 }
  -- avoid: { "conditions": [...] }

  -- Source
  source_type TEXT NOT NULL DEFAULT 'human',  -- 'human', 'ai_suggested', 'ai_approved'
  source_evaluation_id UUID REFERENCES prediction.evaluations(id) ON DELETE SET NULL,
  source_missed_opportunity_id UUID REFERENCES prediction.missed_opportunities(id) ON DELETE SET NULL,

  -- Status and versioning
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'superseded', 'disabled'
  superseded_by UUID REFERENCES prediction.learnings(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,

  -- Effectiveness tracking
  times_applied INTEGER NOT NULL DEFAULT 0,
  times_helpful INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (scope_level IN ('runner', 'domain', 'universe', 'target')),
  CHECK (learning_type IN ('rule', 'pattern', 'weight_adjustment', 'threshold', 'avoid')),
  CHECK (source_type IN ('human', 'ai_suggested', 'ai_approved')),
  CHECK (status IN ('active', 'superseded', 'disabled')),
  CHECK (scope_level = 'runner' OR domain IS NOT NULL),
  CHECK (scope_level IN ('runner', 'domain') OR universe_id IS NOT NULL),
  CHECK (scope_level != 'target' OR target_id IS NOT NULL),
  CHECK (status != 'superseded' OR superseded_by IS NOT NULL),
  CHECK (times_helpful <= times_applied)
);

-- Indexes
CREATE INDEX idx_learnings_scope ON prediction.learnings(scope_level, domain, universe_id, target_id);
CREATE INDEX idx_learnings_universe ON prediction.learnings(universe_id) WHERE universe_id IS NOT NULL;
CREATE INDEX idx_learnings_target ON prediction.learnings(target_id) WHERE target_id IS NOT NULL;
CREATE INDEX idx_learnings_analyst ON prediction.learnings(analyst_id) WHERE analyst_id IS NOT NULL;
CREATE INDEX idx_learnings_type ON prediction.learnings(learning_type);
CREATE INDEX idx_learnings_status ON prediction.learnings(status) WHERE status = 'active';
CREATE INDEX idx_learnings_source_eval ON prediction.learnings(source_evaluation_id) WHERE source_evaluation_id IS NOT NULL;
CREATE INDEX idx_learnings_source_missed ON prediction.learnings(source_missed_opportunity_id) WHERE source_missed_opportunity_id IS NOT NULL;
CREATE INDEX idx_learnings_superseded ON prediction.learnings(superseded_by) WHERE superseded_by IS NOT NULL;
CREATE INDEX idx_learnings_effectiveness ON prediction.learnings(times_applied, times_helpful);
CREATE INDEX idx_learnings_created ON prediction.learnings(created_at DESC);
CREATE INDEX idx_learnings_config ON prediction.learnings USING GIN(config);
CREATE INDEX idx_learnings_domain ON prediction.learnings(domain) WHERE domain IS NOT NULL;

-- Trigger
CREATE TRIGGER set_learnings_updated_at
  BEFORE UPDATE ON prediction.learnings
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- Comments
COMMENT ON TABLE prediction.learnings IS 'Accumulated insights and patterns from evaluations';
COMMENT ON COLUMN prediction.learnings.scope_level IS 'Scope hierarchy level: runner (global) -> domain -> universe -> target';
COMMENT ON COLUMN prediction.learnings.domain IS 'Domain (stocks, crypto, elections, polymarket) - required for domain+';
COMMENT ON COLUMN prediction.learnings.analyst_id IS 'Optional analyst-specific learning';
COMMENT ON COLUMN prediction.learnings.learning_type IS 'Type: rule, pattern, weight_adjustment, threshold, avoid';
COMMENT ON COLUMN prediction.learnings.config IS 'Type-specific configuration (see examples in schema)';
COMMENT ON COLUMN prediction.learnings.source_type IS 'Origin: human, ai_suggested, ai_approved';
COMMENT ON COLUMN prediction.learnings.source_evaluation_id IS 'Source evaluation if derived from evaluation';
COMMENT ON COLUMN prediction.learnings.source_missed_opportunity_id IS 'Source missed opportunity if derived from that';
COMMENT ON COLUMN prediction.learnings.status IS 'Status: active, superseded, disabled';
COMMENT ON COLUMN prediction.learnings.superseded_by IS 'Link to newer version if superseded';
COMMENT ON COLUMN prediction.learnings.version IS 'Version number for tracking iterations';
COMMENT ON COLUMN prediction.learnings.times_applied IS 'Number of times this learning was applied';
COMMENT ON COLUMN prediction.learnings.times_helpful IS 'Number of times this learning was marked as helpful';

-- =====================================================================================
-- LEARNING QUEUE TABLE
-- =====================================================================================
-- Purpose: AI-suggested learnings pending human review (HITL)
-- =====================================================================================

CREATE TABLE prediction.learning_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Suggested scope (AI determines initial scope)
  suggested_scope_level TEXT NOT NULL,
  suggested_domain TEXT,
  suggested_universe_id UUID REFERENCES prediction.universes(id) ON DELETE CASCADE,
  suggested_target_id UUID REFERENCES prediction.targets(id) ON DELETE CASCADE,
  suggested_analyst_id UUID REFERENCES prediction.analysts(id) ON DELETE SET NULL,

  -- Suggested learning content
  suggested_learning_type TEXT NOT NULL,
  suggested_title TEXT NOT NULL,
  suggested_description TEXT NOT NULL,
  suggested_config JSONB DEFAULT '{}'::jsonb,

  -- Source of suggestion
  source_evaluation_id UUID REFERENCES prediction.evaluations(id) ON DELETE SET NULL,
  source_missed_opportunity_id UUID REFERENCES prediction.missed_opportunities(id) ON DELETE SET NULL,

  -- AI reasoning
  ai_reasoning TEXT NOT NULL,
  ai_confidence NUMERIC(3,2) NOT NULL,  -- How confident AI is in this suggestion (0.00-1.00)

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected', 'modified'

  -- Human response (set when reviewed)
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id UUID,
  reviewer_notes TEXT,

  -- Final scope (may differ from suggested after human review)
  final_scope_level TEXT,
  final_domain TEXT,
  final_universe_id UUID REFERENCES prediction.universes(id) ON DELETE SET NULL,
  final_target_id UUID REFERENCES prediction.targets(id) ON DELETE SET NULL,
  final_analyst_id UUID REFERENCES prediction.analysts(id) ON DELETE SET NULL,

  -- Created learning (set when approved)
  learning_id UUID REFERENCES prediction.learnings(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (suggested_scope_level IN ('runner', 'domain', 'universe', 'target')),
  CHECK (suggested_learning_type IN ('rule', 'pattern', 'weight_adjustment', 'threshold', 'avoid')),
  CHECK (status IN ('pending', 'approved', 'rejected', 'modified')),
  CHECK (ai_confidence >= 0.00 AND ai_confidence <= 1.00),
  CHECK (status != 'approved' OR learning_id IS NOT NULL),
  CHECK (final_scope_level IS NULL OR final_scope_level IN ('runner', 'domain', 'universe', 'target'))
);

-- Indexes
CREATE INDEX idx_learning_queue_status ON prediction.learning_queue(status) WHERE status = 'pending';
CREATE INDEX idx_learning_queue_source_eval ON prediction.learning_queue(source_evaluation_id) WHERE source_evaluation_id IS NOT NULL;
CREATE INDEX idx_learning_queue_source_missed ON prediction.learning_queue(source_missed_opportunity_id) WHERE source_missed_opportunity_id IS NOT NULL;
CREATE INDEX idx_learning_queue_learning ON prediction.learning_queue(learning_id) WHERE learning_id IS NOT NULL;
CREATE INDEX idx_learning_queue_reviewed ON prediction.learning_queue(reviewed_at DESC) WHERE reviewed_at IS NOT NULL;
CREATE INDEX idx_learning_queue_reviewer ON prediction.learning_queue(reviewed_by_user_id) WHERE reviewed_by_user_id IS NOT NULL;
CREATE INDEX idx_learning_queue_created ON prediction.learning_queue(created_at DESC);
CREATE INDEX idx_learning_queue_confidence ON prediction.learning_queue(ai_confidence DESC);
CREATE INDEX idx_learning_queue_suggested_scope ON prediction.learning_queue(suggested_scope_level, suggested_domain);
CREATE INDEX idx_learning_queue_config ON prediction.learning_queue USING GIN(suggested_config);

-- Trigger
CREATE TRIGGER set_learning_queue_updated_at
  BEFORE UPDATE ON prediction.learning_queue
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- Comments
COMMENT ON TABLE prediction.learning_queue IS 'AI-suggested learnings pending human review (HITL)';
COMMENT ON COLUMN prediction.learning_queue.suggested_scope_level IS 'AI-suggested scope level';
COMMENT ON COLUMN prediction.learning_queue.suggested_learning_type IS 'AI-suggested learning type';
COMMENT ON COLUMN prediction.learning_queue.ai_reasoning IS 'AI explanation for why this learning is suggested';
COMMENT ON COLUMN prediction.learning_queue.ai_confidence IS 'AI confidence in this suggestion (0.00-1.00)';
COMMENT ON COLUMN prediction.learning_queue.status IS 'Review status: pending, approved, rejected, modified';
COMMENT ON COLUMN prediction.learning_queue.reviewed_by_user_id IS 'User who reviewed this suggestion';
COMMENT ON COLUMN prediction.learning_queue.final_scope_level IS 'Final scope after human review (may differ from suggested)';
COMMENT ON COLUMN prediction.learning_queue.learning_id IS 'Created learning if approved';

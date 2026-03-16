-- =====================================================================================
-- PREDICTION SYSTEM - PHASE 2: ANALYST TABLES
-- =====================================================================================
-- Description: Creates analyst system for multi-perspective signal assessment
-- Dependencies: prediction schema, universes, targets, evaluations
-- =====================================================================================

-- =====================================================================================
-- ANALYSTS TABLE
-- =====================================================================================
-- Purpose: Multi-perspective analysts for signal assessment with scope hierarchy
-- Scope Hierarchy: runner (global) -> domain -> universe -> target
-- =====================================================================================

CREATE TABLE prediction.analysts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope hierarchy (determines visibility and override levels)
  scope_level TEXT NOT NULL DEFAULT 'runner',  -- 'runner', 'domain', 'universe', 'target'
  domain TEXT,  -- NULL for runner-level, required for domain+
  universe_id UUID REFERENCES prediction.universes(id) ON DELETE CASCADE,
  target_id UUID REFERENCES prediction.targets(id) ON DELETE CASCADE,

  -- Identity
  slug TEXT NOT NULL,  -- Unique per scope
  name TEXT NOT NULL,
  perspective TEXT NOT NULL,  -- What this analyst focuses on

  -- Instructions by LLM tier
  tier_instructions JSONB DEFAULT '{}'::jsonb,
  -- Structure: { "gold": "Detailed instructions...", "silver": "...", "bronze": "..." }

  -- Weights for ensemble
  default_weight NUMERIC(3,2) NOT NULL DEFAULT 1.00,  -- 0.00-2.00

  -- Learned patterns (accumulated from evaluations)
  learned_patterns JSONB DEFAULT '[]'::jsonb,
  -- Structure: Array of learning_ids that have been incorporated

  -- A2A registration reference
  agent_id UUID,  -- FK to public.agents (must be registered as A2A agent)

  -- Status
  is_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (scope_level IN ('runner', 'domain', 'universe', 'target')),
  CHECK (scope_level = 'runner' OR domain IS NOT NULL),
  CHECK (scope_level IN ('runner', 'domain') OR universe_id IS NOT NULL),
  CHECK (scope_level != 'target' OR target_id IS NOT NULL),
  CHECK (default_weight >= 0.00 AND default_weight <= 2.00),
  UNIQUE (slug, scope_level, domain, universe_id, target_id)
);

-- Indexes
CREATE INDEX idx_analysts_scope ON prediction.analysts(scope_level, domain, universe_id, target_id);
CREATE INDEX idx_analysts_universe ON prediction.analysts(universe_id) WHERE universe_id IS NOT NULL;
CREATE INDEX idx_analysts_target ON prediction.analysts(target_id) WHERE target_id IS NOT NULL;
CREATE INDEX idx_analysts_enabled ON prediction.analysts(is_enabled) WHERE is_enabled = true;
CREATE INDEX idx_analysts_agent ON prediction.analysts(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_analysts_slug ON prediction.analysts(slug);
CREATE INDEX idx_analysts_domain ON prediction.analysts(domain) WHERE domain IS NOT NULL;
CREATE INDEX idx_analysts_tier_instructions ON prediction.analysts USING GIN(tier_instructions);
CREATE INDEX idx_analysts_learned_patterns ON prediction.analysts USING GIN(learned_patterns);

-- Trigger
CREATE TRIGGER set_analysts_updated_at
  BEFORE UPDATE ON prediction.analysts
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- Comments
COMMENT ON TABLE prediction.analysts IS 'Multi-perspective analysts for signal assessment with scope hierarchy';
COMMENT ON COLUMN prediction.analysts.scope_level IS 'Scope hierarchy level: runner (global) -> domain -> universe -> target';
COMMENT ON COLUMN prediction.analysts.domain IS 'Domain (stocks, crypto, elections, polymarket) - required for domain+';
COMMENT ON COLUMN prediction.analysts.perspective IS 'What this analyst focuses on (e.g., technical analysis, sentiment)';
COMMENT ON COLUMN prediction.analysts.tier_instructions IS 'Instructions by LLM tier: { gold, silver, bronze }';
COMMENT ON COLUMN prediction.analysts.default_weight IS 'Default weight for ensemble (0.00-2.00)';
COMMENT ON COLUMN prediction.analysts.learned_patterns IS 'Array of learning_ids incorporated into this analyst';
COMMENT ON COLUMN prediction.analysts.agent_id IS 'Reference to A2A agent registration (if using external agent)';

-- =====================================================================================
-- ANALYST OVERRIDES TABLE
-- =====================================================================================
-- Purpose: Per-universe/target weight and tier overrides
-- =====================================================================================

CREATE TABLE prediction.analyst_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Analyst reference
  analyst_id UUID NOT NULL REFERENCES prediction.analysts(id) ON DELETE CASCADE,

  -- Override scope (can override at universe or target level)
  universe_id UUID REFERENCES prediction.universes(id) ON DELETE CASCADE,
  target_id UUID REFERENCES prediction.targets(id) ON DELETE CASCADE,

  -- Override values
  weight_override NUMERIC(3,2),  -- NULL means use default
  tier_override TEXT,  -- 'gold', 'silver', 'bronze', NULL = use default
  is_enabled_override BOOLEAN,  -- NULL means use default

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (universe_id IS NOT NULL OR target_id IS NOT NULL),
  CHECK (weight_override IS NULL OR (weight_override >= 0.00 AND weight_override <= 2.00)),
  CHECK (tier_override IS NULL OR tier_override IN ('gold', 'silver', 'bronze')),
  UNIQUE (analyst_id, universe_id, target_id)
);

-- Indexes
CREATE INDEX idx_analyst_overrides_analyst ON prediction.analyst_overrides(analyst_id);
CREATE INDEX idx_analyst_overrides_universe ON prediction.analyst_overrides(universe_id) WHERE universe_id IS NOT NULL;
CREATE INDEX idx_analyst_overrides_target ON prediction.analyst_overrides(target_id) WHERE target_id IS NOT NULL;

-- Trigger
CREATE TRIGGER set_analyst_overrides_updated_at
  BEFORE UPDATE ON prediction.analyst_overrides
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- Comments
COMMENT ON TABLE prediction.analyst_overrides IS 'Per-universe/target weight and tier overrides for analysts';
COMMENT ON COLUMN prediction.analyst_overrides.weight_override IS 'Override default weight (NULL = use default)';
COMMENT ON COLUMN prediction.analyst_overrides.tier_override IS 'Override LLM tier (NULL = use default)';
COMMENT ON COLUMN prediction.analyst_overrides.is_enabled_override IS 'Override enabled status (NULL = use default)';

-- =====================================================================================
-- ANALYST ASSESSMENTS TABLE
-- =====================================================================================
-- Purpose: Individual assessment records from analysts
-- =====================================================================================

CREATE TABLE prediction.analyst_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links (must be linked to either predictor or prediction)
  predictor_id UUID REFERENCES prediction.predictors(id) ON DELETE CASCADE,
  prediction_id UUID REFERENCES prediction.predictions(id) ON DELETE CASCADE,
  analyst_id UUID NOT NULL REFERENCES prediction.analysts(id) ON DELETE CASCADE,

  -- LLM tier used
  llm_tier TEXT NOT NULL,  -- 'gold', 'silver', 'bronze'

  -- Assessment content
  direction TEXT NOT NULL,  -- 'bullish', 'bearish', 'neutral' (or 'yes', 'no' for elections)
  confidence NUMERIC(3,2) NOT NULL,  -- 0.00-1.00
  reasoning TEXT NOT NULL,

  -- Context used
  learnings_applied JSONB DEFAULT '[]'::jsonb,  -- Array of learning IDs that were injected

  -- LLM cost tracking (source of truth is public.llm_usage)
  llm_usage_id UUID,  -- FK to public.llm_usage for cost tracking

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (predictor_id IS NOT NULL OR prediction_id IS NOT NULL),
  CHECK (llm_tier IN ('gold', 'silver', 'bronze')),
  CHECK (confidence >= 0.00 AND confidence <= 1.00)
);

-- Indexes
CREATE INDEX idx_analyst_assessments_predictor ON prediction.analyst_assessments(predictor_id) WHERE predictor_id IS NOT NULL;
CREATE INDEX idx_analyst_assessments_prediction ON prediction.analyst_assessments(prediction_id) WHERE prediction_id IS NOT NULL;
CREATE INDEX idx_analyst_assessments_analyst ON prediction.analyst_assessments(analyst_id);
CREATE INDEX idx_analyst_assessments_tier ON prediction.analyst_assessments(llm_tier);
CREATE INDEX idx_analyst_assessments_created ON prediction.analyst_assessments(created_at DESC);
CREATE INDEX idx_analyst_assessments_llm_usage ON prediction.analyst_assessments(llm_usage_id) WHERE llm_usage_id IS NOT NULL;
CREATE INDEX idx_analyst_assessments_learnings ON prediction.analyst_assessments USING GIN(learnings_applied);

-- Comments
COMMENT ON TABLE prediction.analyst_assessments IS 'Individual assessment records from analysts';
COMMENT ON COLUMN prediction.analyst_assessments.predictor_id IS 'Link to predictor (for signal assessment)';
COMMENT ON COLUMN prediction.analyst_assessments.prediction_id IS 'Link to prediction (for re-evaluation)';
COMMENT ON COLUMN prediction.analyst_assessments.llm_tier IS 'LLM tier used for this assessment';
COMMENT ON COLUMN prediction.analyst_assessments.direction IS 'Assessment direction (bullish/bearish/neutral or yes/no)';
COMMENT ON COLUMN prediction.analyst_assessments.confidence IS 'Confidence level (0.00-1.00)';
COMMENT ON COLUMN prediction.analyst_assessments.learnings_applied IS 'Array of learning IDs that were injected into this assessment';
COMMENT ON COLUMN prediction.analyst_assessments.llm_usage_id IS 'Reference to public.llm_usage for cost tracking';

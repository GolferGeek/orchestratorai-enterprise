-- =============================================================================
-- PREDICTION UNIVERSES TABLE
-- =============================================================================
-- Universes group targets and define prediction strategy
-- Scoped to organization and agent
-- Phase 1, Step 1-1
-- =============================================================================

CREATE TABLE prediction.universes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization and agent ownership
  organization_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,
  agent_slug TEXT NOT NULL REFERENCES public.agents(slug) ON DELETE CASCADE,

  -- Universe metadata
  name TEXT NOT NULL,
  description TEXT,
  domain TEXT NOT NULL,  -- 'stocks', 'crypto', 'elections', 'polymarket'

  -- Strategy configuration
  strategy_id UUID REFERENCES prediction.strategies(id) ON DELETE SET NULL,

  -- LLM configuration for this universe
  llm_config JSONB DEFAULT NULL,  -- Override LLM tiers/models

  -- Threshold configuration (overrides strategy if set)
  thresholds JSONB DEFAULT NULL,

  -- Notification preferences
  notification_config JSONB DEFAULT '{
    "urgent_enabled": true,
    "new_prediction_enabled": true,
    "outcome_enabled": true,
    "channels": ["push", "email"]
  }'::jsonb,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(organization_slug, agent_slug, name),
  CHECK (domain IN ('stocks', 'crypto', 'elections', 'polymarket'))
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_prediction_universes_org ON prediction.universes(organization_slug);
CREATE INDEX idx_prediction_universes_agent ON prediction.universes(agent_slug);
CREATE INDEX idx_prediction_universes_domain ON prediction.universes(domain);
CREATE INDEX idx_prediction_universes_strategy ON prediction.universes(strategy_id);
CREATE INDEX idx_prediction_universes_active ON prediction.universes(is_active) WHERE is_active = true;
CREATE INDEX idx_prediction_universes_created_at ON prediction.universes(created_at DESC);

-- GIN indexes for JSONB queries
CREATE INDEX idx_prediction_universes_thresholds ON prediction.universes USING GIN(thresholds) WHERE thresholds IS NOT NULL;
CREATE INDEX idx_prediction_universes_llm_config ON prediction.universes USING GIN(llm_config) WHERE llm_config IS NOT NULL;

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

CREATE TRIGGER set_prediction_universes_updated_at
  BEFORE UPDATE ON prediction.universes
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.universes IS 'Prediction universes grouping targets by strategy and configuration';
COMMENT ON COLUMN prediction.universes.organization_slug IS 'Organization owning this universe';
COMMENT ON COLUMN prediction.universes.agent_slug IS 'Agent managing this universe';
COMMENT ON COLUMN prediction.universes.domain IS 'Prediction domain: stocks, crypto, elections, polymarket';
COMMENT ON COLUMN prediction.universes.strategy_id IS 'Investment/prediction strategy (defines default thresholds)';
COMMENT ON COLUMN prediction.universes.llm_config IS 'Override LLM tier configuration for this universe';
COMMENT ON COLUMN prediction.universes.thresholds IS 'Override strategy thresholds for this universe';
COMMENT ON COLUMN prediction.universes.notification_config IS 'Notification preferences';

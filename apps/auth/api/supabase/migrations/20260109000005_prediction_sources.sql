-- =============================================================================
-- PREDICTION SOURCES TABLE
-- =============================================================================
-- Data sources for signal detection (web, RSS, Twitter, APIs)
-- Supports scope hierarchy: runner, domain, universe, target
-- Phase 1, Step 1-1
-- =============================================================================

CREATE TABLE prediction.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope hierarchy (nullable FKs for hierarchical scoping)
  scope_level TEXT NOT NULL,  -- 'runner', 'domain', 'universe', 'target'
  domain TEXT,  -- NULL unless scope_level = 'domain'
  universe_id UUID REFERENCES prediction.universes(id) ON DELETE CASCADE,  -- NULL unless scope_level IN ('universe', 'target')
  target_id UUID REFERENCES prediction.targets(id) ON DELETE CASCADE,  -- NULL unless scope_level = 'target'

  -- Source metadata
  name TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL,  -- 'web', 'rss', 'twitter_search', 'api'
  url TEXT NOT NULL,

  -- Crawl configuration
  crawl_config JSONB NOT NULL DEFAULT '{
    "frequency": 15,
    "selector": null,
    "wait_for_element": null,
    "extract_rules": {},
    "filters": {}
  }'::jsonb,

  -- Authentication configuration (for paywalled sources)
  auth_config JSONB DEFAULT NULL,  -- { "type": "bearer|api-key|basic", "config": {...} }

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_crawled_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (scope_level IN ('runner', 'domain', 'universe', 'target')),
  CHECK (source_type IN ('web', 'rss', 'twitter_search', 'api')),
  CHECK (
    (scope_level = 'runner' AND domain IS NULL AND universe_id IS NULL AND target_id IS NULL) OR
    (scope_level = 'domain' AND domain IS NOT NULL AND universe_id IS NULL AND target_id IS NULL) OR
    (scope_level = 'universe' AND universe_id IS NOT NULL AND target_id IS NULL) OR
    (scope_level = 'target' AND universe_id IS NOT NULL AND target_id IS NOT NULL)
  )
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_prediction_sources_scope_level ON prediction.sources(scope_level);
CREATE INDEX idx_prediction_sources_domain ON prediction.sources(domain) WHERE domain IS NOT NULL;
CREATE INDEX idx_prediction_sources_universe ON prediction.sources(universe_id) WHERE universe_id IS NOT NULL;
CREATE INDEX idx_prediction_sources_target ON prediction.sources(target_id) WHERE target_id IS NOT NULL;
CREATE INDEX idx_prediction_sources_type ON prediction.sources(source_type);
CREATE INDEX idx_prediction_sources_active ON prediction.sources(is_active) WHERE is_active = true;
CREATE INDEX idx_prediction_sources_last_crawled ON prediction.sources(last_crawled_at DESC);
CREATE INDEX idx_prediction_sources_failures ON prediction.sources(consecutive_failures) WHERE consecutive_failures > 0;

-- GIN indexes for JSONB queries
CREATE INDEX idx_prediction_sources_crawl_config ON prediction.sources USING GIN(crawl_config);
CREATE INDEX idx_prediction_sources_auth_config ON prediction.sources USING GIN(auth_config) WHERE auth_config IS NOT NULL;

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

CREATE TRIGGER set_prediction_sources_updated_at
  BEFORE UPDATE ON prediction.sources
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.sources IS 'Data sources for signal detection with scope hierarchy';
COMMENT ON COLUMN prediction.sources.scope_level IS 'Scope: runner (global), domain (stocks/crypto), universe, or target';
COMMENT ON COLUMN prediction.sources.domain IS 'Domain when scope_level = domain';
COMMENT ON COLUMN prediction.sources.universe_id IS 'Universe when scope_level IN (universe, target)';
COMMENT ON COLUMN prediction.sources.target_id IS 'Target when scope_level = target';
COMMENT ON COLUMN prediction.sources.source_type IS 'Source type: web, rss, twitter_search, api';
COMMENT ON COLUMN prediction.sources.crawl_config IS 'Firecrawl configuration';
COMMENT ON COLUMN prediction.sources.auth_config IS 'Authentication for paywalled sources';

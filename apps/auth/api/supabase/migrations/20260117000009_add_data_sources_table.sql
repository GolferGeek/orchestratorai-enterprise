-- Migration: Add Data Sources Table
-- Feature 11: Live Data Integration for automatic risk updates
-- Created: 2026-01-17

-- Data sources table for external data integrations
CREATE TABLE IF NOT EXISTS risk.data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES risk.scopes(id) ON DELETE CASCADE,

  -- Source identification
  name VARCHAR(255) NOT NULL,
  description TEXT,
  source_type VARCHAR(50) NOT NULL,
  -- source_type: 'firecrawl', 'api', 'rss', 'webhook', 'manual'

  -- Configuration
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- config structure varies by source_type:
  --
  -- For 'firecrawl':
  -- {
  --   "url": "https://example.com/data",
  --   "selector": ".price-data",
  --   "extractFields": ["price", "volume", "change"],
  --   "authentication": {...}  -- optional
  -- }
  --
  -- For 'api':
  -- {
  --   "endpoint": "https://api.example.com/v1/data",
  --   "method": "GET",
  --   "headers": {"Authorization": "Bearer ..."},
  --   "params": {"symbol": "BTC"},
  --   "responseMapping": {"price": "$.data.price"}
  -- }
  --
  -- For 'rss':
  -- {
  --   "feedUrl": "https://news.example.com/feed.rss",
  --   "relevantCategories": ["market", "regulation"],
  --   "sentimentAnalysis": true
  -- }
  --
  -- For 'webhook':
  -- {
  --   "webhookId": "wh_abc123",
  --   "secretKey": "sk_...",
  --   "expectedPayloadSchema": {...}
  -- }

  -- Scheduling
  schedule VARCHAR(50),
  -- schedule: cron expression like '0 */1 * * *' (every hour)
  -- or preset: 'hourly', 'daily', 'weekly', 'realtime'

  -- Mapping to risk dimensions
  dimension_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- dimension_mapping structure:
  -- {
  --   "market-volatility": {
  --     "sourceField": "volatility_index",
  --     "transform": "normalize",  -- optional transform function
  --     "threshold": 0.2,          -- trigger reanalysis if change > threshold
  --     "weight": 1.0
  --   },
  --   "liquidity-risk": {
  --     "sourceField": "trading_volume",
  --     "transform": "inverse_normalize",
  --     "threshold": 0.15
  --   }
  -- }

  -- Subject mapping (which subjects this data affects)
  subject_filter JSONB DEFAULT NULL,
  -- subject_filter structure:
  -- {
  --   "subjectIds": ["uuid1", "uuid2"],
  --   "subjectTypes": ["crypto"],
  --   "identifierPattern": "^BTC.*"  -- regex match on identifier
  -- }

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  -- status: 'active', 'paused', 'error', 'disabled'
  error_message TEXT,
  error_count INTEGER DEFAULT 0,

  -- Fetch history
  last_fetch_at TIMESTAMPTZ,
  last_fetch_status VARCHAR(20),
  last_fetch_data JSONB,  -- Cached last successful fetch data
  next_fetch_at TIMESTAMPTZ,

  -- Reanalysis settings
  auto_reanalyze BOOLEAN DEFAULT TRUE,
  reanalyze_threshold DECIMAL(3,2) DEFAULT 0.1,
  -- Trigger reanalysis if any dimension changes by more than threshold

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_source_type CHECK (source_type IN ('firecrawl', 'api', 'rss', 'webhook', 'manual')),
  CONSTRAINT valid_status CHECK (status IN ('active', 'paused', 'error', 'disabled'))
);

-- Data source fetch history for audit trail
CREATE TABLE IF NOT EXISTS risk.data_source_fetch_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id UUID NOT NULL REFERENCES risk.data_sources(id) ON DELETE CASCADE,

  -- Fetch details
  status VARCHAR(20) NOT NULL,
  -- status: 'success', 'failed', 'timeout', 'rate_limited'
  fetch_duration_ms INTEGER,
  raw_response JSONB,
  parsed_data JSONB,
  error_message TEXT,

  -- Impact tracking
  dimensions_updated TEXT[],
  subjects_affected UUID[],
  reanalysis_triggered BOOLEAN DEFAULT FALSE,
  reanalysis_task_ids UUID[],

  -- Timing
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_fetch_status CHECK (status IN ('success', 'failed', 'timeout', 'rate_limited'))
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_data_sources_scope_id ON risk.data_sources(scope_id);
CREATE INDEX IF NOT EXISTS idx_data_sources_status ON risk.data_sources(status);
CREATE INDEX IF NOT EXISTS idx_data_sources_source_type ON risk.data_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_data_sources_next_fetch ON risk.data_sources(next_fetch_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_fetch_history_source_id ON risk.data_source_fetch_history(data_source_id);
CREATE INDEX IF NOT EXISTS idx_fetch_history_fetched_at ON risk.data_source_fetch_history(fetched_at DESC);

-- Enable RLS
ALTER TABLE risk.data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk.data_source_fetch_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for data_sources
CREATE POLICY data_sources_select_policy ON risk.data_sources
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM risk.scopes s
      WHERE s.id = risk.data_sources.scope_id
      AND s.organization_slug IN (
        SELECT organization_slug FROM public.rbac_user_org_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY data_sources_insert_policy ON risk.data_sources
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM risk.scopes s
      WHERE s.id = scope_id
      AND s.organization_slug IN (
        SELECT organization_slug FROM public.rbac_user_org_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY data_sources_update_policy ON risk.data_sources
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM risk.scopes s
      WHERE s.id = risk.data_sources.scope_id
      AND s.organization_slug IN (
        SELECT organization_slug FROM public.rbac_user_org_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY data_sources_delete_policy ON risk.data_sources
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM risk.scopes s
      WHERE s.id = risk.data_sources.scope_id
      AND s.organization_slug IN (
        SELECT organization_slug FROM public.rbac_user_org_roles WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for fetch_history
CREATE POLICY fetch_history_select_policy ON risk.data_source_fetch_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM risk.data_sources ds
      JOIN risk.scopes s ON s.id = ds.scope_id
      WHERE ds.id = risk.data_source_fetch_history.data_source_id
      AND s.organization_slug IN (
        SELECT organization_slug FROM public.rbac_user_org_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY fetch_history_insert_policy ON risk.data_source_fetch_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM risk.data_sources ds
      JOIN risk.scopes s ON s.id = ds.scope_id
      WHERE ds.id = data_source_id
      AND s.organization_slug IN (
        SELECT organization_slug FROM public.rbac_user_org_roles WHERE user_id = auth.uid()
      )
    )
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION risk.update_data_sources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_data_sources_updated_at
  BEFORE UPDATE ON risk.data_sources
  FOR EACH ROW
  EXECUTE FUNCTION risk.update_data_sources_updated_at();

-- Comments
COMMENT ON TABLE risk.data_sources IS 'External data source configurations for live risk data';
COMMENT ON COLUMN risk.data_sources.source_type IS 'Type of data source: firecrawl, api, rss, webhook, manual';
COMMENT ON COLUMN risk.data_sources.dimension_mapping IS 'Maps source data fields to risk dimensions with transform functions';
COMMENT ON COLUMN risk.data_sources.auto_reanalyze IS 'Whether to automatically trigger subject reanalysis on significant data changes';
COMMENT ON TABLE risk.data_source_fetch_history IS 'Audit trail of data source fetch operations';

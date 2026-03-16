-- =============================================================================
-- RISK SOURCE SUBSCRIPTIONS
-- =============================================================================
-- Bridge table linking crawler.sources to risk scopes
-- Enables risk agents to subscribe to shared sources
-- =============================================================================

-- =============================================================================
-- SOURCE SUBSCRIPTIONS TABLE
-- =============================================================================

CREATE TABLE risk.source_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to central crawler source
  source_id UUID NOT NULL REFERENCES crawler.sources(id) ON DELETE CASCADE,

  -- Risk-specific scope
  scope_id UUID NOT NULL REFERENCES risk.scopes(id) ON DELETE CASCADE,

  -- Dimension mapping (which risk dimensions this source affects)
  dimension_mapping JSONB DEFAULT '{
    "dimensions": [],
    "weight": 1.0,
    "auto_apply": true
  }'::jsonb,

  -- Subject filtering (which subjects to apply articles to)
  subject_filter JSONB DEFAULT '{
    "subject_ids": [],
    "subject_types": [],
    "identifier_pattern": null,
    "apply_to_all": false
  }'::jsonb,

  -- Processing watermark (for pull model)
  last_processed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Auto-reanalyze settings
  auto_reanalyze BOOLEAN DEFAULT true,
  reanalyze_threshold DECIMAL(3,2) DEFAULT 0.10,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique: one subscription per source per scope
  UNIQUE (source_id, scope_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_risk_source_subs_source ON risk.source_subscriptions(source_id);
CREATE INDEX idx_risk_source_subs_scope ON risk.source_subscriptions(scope_id);
CREATE INDEX idx_risk_source_subs_active ON risk.source_subscriptions(is_active) WHERE is_active = true;
CREATE INDEX idx_risk_source_subs_last_processed ON risk.source_subscriptions(last_processed_at);
CREATE INDEX idx_risk_source_subs_dimension_mapping ON risk.source_subscriptions USING GIN(dimension_mapping);
CREATE INDEX idx_risk_source_subs_subject_filter ON risk.source_subscriptions USING GIN(subject_filter);

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

-- Use existing risk.set_updated_at function if it exists, otherwise create
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'risk' AND p.proname = 'set_updated_at'
  ) THEN
    EXECUTE 'CREATE OR REPLACE FUNCTION risk.set_updated_at()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;';
  END IF;
END $$;

CREATE TRIGGER set_risk_source_subs_updated_at
  BEFORE UPDATE ON risk.source_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION risk.set_updated_at();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Get new articles for a subscription (pull model)
CREATE OR REPLACE FUNCTION risk.get_new_articles_for_subscription(
  p_subscription_id UUID,
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
  article_id UUID,
  source_id UUID,
  url TEXT,
  title TEXT,
  content TEXT,
  summary TEXT,
  content_hash TEXT,
  published_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ,
  raw_data JSONB
) AS $$
DECLARE
  v_subscription RECORD;
BEGIN
  -- Get subscription details
  SELECT rs.source_id, rs.last_processed_at
  INTO v_subscription
  FROM risk.source_subscriptions rs
  WHERE rs.id = p_subscription_id
    AND rs.is_active = true;

  IF v_subscription IS NULL THEN
    RETURN;
  END IF;

  -- Return new articles since last processed
  RETURN QUERY
  SELECT
    a.id,
    a.source_id,
    a.url,
    a.title,
    a.content,
    a.summary,
    a.content_hash,
    a.published_at,
    a.first_seen_at,
    a.raw_data
  FROM crawler.articles a
  WHERE a.source_id = v_subscription.source_id
    AND a.first_seen_at > v_subscription.last_processed_at
    AND a.is_test = false
  ORDER BY a.first_seen_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION risk.get_new_articles_for_subscription(UUID, INTEGER) IS
  'Get new articles for a risk subscription since last processed';

-- Get all new articles for a scope (across all subscriptions)
CREATE OR REPLACE FUNCTION risk.get_new_articles_for_scope(
  p_scope_id UUID,
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
  article_id UUID,
  subscription_id UUID,
  source_id UUID,
  url TEXT,
  title TEXT,
  content TEXT,
  summary TEXT,
  content_hash TEXT,
  published_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ,
  raw_data JSONB,
  dimension_mapping JSONB,
  subject_filter JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    rs.id as subscription_id,
    a.source_id,
    a.url,
    a.title,
    a.content,
    a.summary,
    a.content_hash,
    a.published_at,
    a.first_seen_at,
    a.raw_data,
    rs.dimension_mapping,
    rs.subject_filter
  FROM risk.source_subscriptions rs
  JOIN crawler.articles a ON a.source_id = rs.source_id
  WHERE rs.scope_id = p_scope_id
    AND rs.is_active = true
    AND a.first_seen_at > rs.last_processed_at
    AND a.is_test = false
  ORDER BY a.first_seen_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION risk.get_new_articles_for_scope(UUID, INTEGER) IS
  'Get new articles across all subscriptions for a risk scope';

-- Update watermark after processing
CREATE OR REPLACE FUNCTION risk.update_subscription_watermark(
  p_subscription_id UUID,
  p_last_processed_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS VOID AS $$
BEGIN
  UPDATE risk.source_subscriptions
  SET last_processed_at = p_last_processed_at
  WHERE id = p_subscription_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION risk.update_subscription_watermark(UUID, TIMESTAMPTZ) IS
  'Update the last_processed_at watermark for a subscription';

-- =============================================================================
-- VIEW: SUBSCRIPTION STATS
-- =============================================================================

CREATE OR REPLACE VIEW risk.subscription_stats AS
SELECT
  rs.id as subscription_id,
  rs.source_id,
  cs.name as source_name,
  cs.url as source_url,
  rs.scope_id,
  s.name as scope_name,
  rs.is_active,
  rs.auto_reanalyze,
  rs.last_processed_at,
  (
    SELECT COUNT(*)
    FROM crawler.articles a
    WHERE a.source_id = rs.source_id
      AND a.first_seen_at > rs.last_processed_at
  ) as pending_articles,
  (
    SELECT COUNT(*)
    FROM crawler.agent_article_outputs aao
    JOIN crawler.articles a ON aao.article_id = a.id
    WHERE a.source_id = rs.source_id
      AND aao.agent_type = 'risk'
  ) as processed_articles
FROM risk.source_subscriptions rs
JOIN crawler.sources cs ON rs.source_id = cs.id
JOIN risk.scopes s ON rs.scope_id = s.id;

COMMENT ON VIEW risk.subscription_stats IS
  'Subscription statistics including pending and processed article counts';

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE risk.source_subscriptions ENABLE ROW LEVEL SECURITY;

-- Read policy: Users can read subscriptions for their org's scopes
CREATE POLICY risk_source_subs_read ON risk.source_subscriptions
  FOR SELECT
  USING (
    scope_id IN (
      SELECT id FROM risk.scopes
      WHERE organization_slug = current_setting('app.current_org', true)
    )
  );

-- Insert policy
CREATE POLICY risk_source_subs_insert ON risk.source_subscriptions
  FOR INSERT
  WITH CHECK (
    scope_id IN (
      SELECT id FROM risk.scopes
      WHERE organization_slug = current_setting('app.current_org', true)
    )
  );

-- Update policy
CREATE POLICY risk_source_subs_update ON risk.source_subscriptions
  FOR UPDATE
  USING (
    scope_id IN (
      SELECT id FROM risk.scopes
      WHERE organization_slug = current_setting('app.current_org', true)
    )
  );

-- Delete policy
CREATE POLICY risk_source_subs_delete ON risk.source_subscriptions
  FOR DELETE
  USING (
    scope_id IN (
      SELECT id FROM risk.scopes
      WHERE organization_slug = current_setting('app.current_org', true)
    )
  );

-- Service role bypass
CREATE POLICY risk_source_subs_service_all ON risk.source_subscriptions
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE risk.source_subscriptions IS 'Links risk scopes to crawler sources';
COMMENT ON COLUMN risk.source_subscriptions.source_id IS 'Reference to crawler.sources';
COMMENT ON COLUMN risk.source_subscriptions.scope_id IS 'Risk scope this subscription is for';
COMMENT ON COLUMN risk.source_subscriptions.dimension_mapping IS 'Which risk dimensions this source affects';
COMMENT ON COLUMN risk.source_subscriptions.subject_filter IS 'Which subjects to apply articles to';
COMMENT ON COLUMN risk.source_subscriptions.last_processed_at IS 'Watermark for pull model - articles newer than this are pending';
COMMENT ON COLUMN risk.source_subscriptions.auto_reanalyze IS 'Automatically trigger reanalysis when new articles arrive';

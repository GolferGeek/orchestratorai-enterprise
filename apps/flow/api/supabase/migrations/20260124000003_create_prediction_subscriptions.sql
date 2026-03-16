-- =============================================================================
-- PREDICTION SOURCE SUBSCRIPTIONS
-- =============================================================================
-- Bridge table linking crawler.sources to prediction targets/universes
-- Enables prediction agents to subscribe to shared sources
-- =============================================================================

-- =============================================================================
-- SOURCE SUBSCRIPTIONS TABLE
-- =============================================================================

CREATE TABLE prediction.source_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to central crawler source
  source_id UUID NOT NULL REFERENCES crawler.sources(id) ON DELETE CASCADE,

  -- Prediction-specific scope
  target_id UUID NOT NULL REFERENCES prediction.targets(id) ON DELETE CASCADE,
  universe_id UUID NOT NULL REFERENCES prediction.universes(id) ON DELETE CASCADE,

  -- Filtering configuration
  filter_config JSONB DEFAULT '{
    "keywords_include": [],
    "keywords_exclude": [],
    "min_relevance_score": 0.5
  }'::jsonb,

  -- Processing watermark (for pull model)
  last_processed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique: one subscription per source per target
  UNIQUE (source_id, target_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_prediction_source_subs_source ON prediction.source_subscriptions(source_id);
CREATE INDEX idx_prediction_source_subs_target ON prediction.source_subscriptions(target_id);
CREATE INDEX idx_prediction_source_subs_universe ON prediction.source_subscriptions(universe_id);
CREATE INDEX idx_prediction_source_subs_active ON prediction.source_subscriptions(is_active) WHERE is_active = true;
CREATE INDEX idx_prediction_source_subs_last_processed ON prediction.source_subscriptions(last_processed_at);

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

CREATE TRIGGER set_prediction_source_subs_updated_at
  BEFORE UPDATE ON prediction.source_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION prediction.set_updated_at();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Get new articles for a subscription (pull model)
CREATE OR REPLACE FUNCTION prediction.get_new_articles_for_subscription(
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
  title_normalized TEXT,
  key_phrases TEXT[],
  published_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ,
  raw_data JSONB
) AS $$
DECLARE
  v_subscription RECORD;
BEGIN
  -- Get subscription details
  SELECT ps.source_id, ps.last_processed_at, ps.filter_config
  INTO v_subscription
  FROM prediction.source_subscriptions ps
  WHERE ps.id = p_subscription_id
    AND ps.is_active = true;

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
    a.title_normalized,
    a.key_phrases,
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

COMMENT ON FUNCTION prediction.get_new_articles_for_subscription(UUID, INTEGER) IS
  'Get new articles for a prediction subscription since last processed';

-- Get all new articles for a target (across all subscriptions)
CREATE OR REPLACE FUNCTION prediction.get_new_articles_for_target(
  p_target_id UUID,
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
  title_normalized TEXT,
  key_phrases TEXT[],
  published_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ,
  raw_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    ps.id as subscription_id,
    a.source_id,
    a.url,
    a.title,
    a.content,
    a.summary,
    a.content_hash,
    a.title_normalized,
    a.key_phrases,
    a.published_at,
    a.first_seen_at,
    a.raw_data
  FROM prediction.source_subscriptions ps
  JOIN crawler.articles a ON a.source_id = ps.source_id
  WHERE ps.target_id = p_target_id
    AND ps.is_active = true
    AND a.first_seen_at > ps.last_processed_at
    AND a.is_test = false
  ORDER BY a.first_seen_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION prediction.get_new_articles_for_target(UUID, INTEGER) IS
  'Get new articles across all subscriptions for a prediction target';

-- Update watermark after processing
CREATE OR REPLACE FUNCTION prediction.update_subscription_watermark(
  p_subscription_id UUID,
  p_last_processed_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS VOID AS $$
BEGIN
  UPDATE prediction.source_subscriptions
  SET last_processed_at = p_last_processed_at
  WHERE id = p_subscription_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION prediction.update_subscription_watermark(UUID, TIMESTAMPTZ) IS
  'Update the last_processed_at watermark for a subscription';

-- =============================================================================
-- VIEW: SUBSCRIPTION STATS
-- =============================================================================

CREATE OR REPLACE VIEW prediction.subscription_stats AS
SELECT
  ps.id as subscription_id,
  ps.source_id,
  cs.name as source_name,
  cs.url as source_url,
  ps.target_id,
  t.symbol as target_symbol,
  t.name as target_name,
  ps.universe_id,
  u.name as universe_name,
  ps.is_active,
  ps.last_processed_at,
  (
    SELECT COUNT(*)
    FROM crawler.articles a
    WHERE a.source_id = ps.source_id
      AND a.first_seen_at > ps.last_processed_at
  ) as pending_articles,
  (
    SELECT COUNT(*)
    FROM crawler.agent_article_outputs aao
    JOIN crawler.articles a ON aao.article_id = a.id
    WHERE a.source_id = ps.source_id
      AND aao.agent_type = 'prediction'
  ) as processed_articles
FROM prediction.source_subscriptions ps
JOIN crawler.sources cs ON ps.source_id = cs.id
JOIN prediction.targets t ON ps.target_id = t.id
JOIN prediction.universes u ON ps.universe_id = u.id;

COMMENT ON VIEW prediction.subscription_stats IS
  'Subscription statistics including pending and processed article counts';

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE prediction.source_subscriptions ENABLE ROW LEVEL SECURITY;

-- Read policy: Users can read subscriptions for their org's targets
CREATE POLICY prediction_source_subs_read ON prediction.source_subscriptions
  FOR SELECT
  USING (
    target_id IN (
      SELECT t.id FROM prediction.targets t
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE u.organization_slug = current_setting('app.current_org', true)
    )
  );

-- Insert policy
CREATE POLICY prediction_source_subs_insert ON prediction.source_subscriptions
  FOR INSERT
  WITH CHECK (
    target_id IN (
      SELECT t.id FROM prediction.targets t
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE u.organization_slug = current_setting('app.current_org', true)
    )
  );

-- Update policy
CREATE POLICY prediction_source_subs_update ON prediction.source_subscriptions
  FOR UPDATE
  USING (
    target_id IN (
      SELECT t.id FROM prediction.targets t
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE u.organization_slug = current_setting('app.current_org', true)
    )
  );

-- Delete policy
CREATE POLICY prediction_source_subs_delete ON prediction.source_subscriptions
  FOR DELETE
  USING (
    target_id IN (
      SELECT t.id FROM prediction.targets t
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE u.organization_slug = current_setting('app.current_org', true)
    )
  );

-- Service role bypass
CREATE POLICY prediction_source_subs_service_all ON prediction.source_subscriptions
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.source_subscriptions IS 'Links prediction targets to crawler sources';
COMMENT ON COLUMN prediction.source_subscriptions.source_id IS 'Reference to crawler.sources';
COMMENT ON COLUMN prediction.source_subscriptions.target_id IS 'Prediction target this subscription is for';
COMMENT ON COLUMN prediction.source_subscriptions.filter_config IS 'Keywords and filters for article relevance';
COMMENT ON COLUMN prediction.source_subscriptions.last_processed_at IS 'Watermark for pull model - articles newer than this are pending';

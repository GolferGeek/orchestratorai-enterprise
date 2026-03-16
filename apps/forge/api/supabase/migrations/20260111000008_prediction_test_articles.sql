-- =============================================================================
-- CREATE PREDICTION.TEST_ARTICLES TABLE
-- =============================================================================
-- Stores synthetic/test articles for scenario testing
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- PRD Section: 15.3.2 Test Articles Table
-- =============================================================================

CREATE TABLE prediction.test_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization scope (uses slug as PK, not UUID)
  organization_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,

  -- Optional link to scenario
  scenario_id UUID REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL,

  -- Article content
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_name TEXT NOT NULL DEFAULT 'synthetic_news',
  published_at TIMESTAMPTZ NOT NULL,

  -- Target symbols (must all start with T_)
  target_symbols TEXT[] NOT NULL DEFAULT '{}',

  -- Expected signal characteristics
  sentiment_expected TEXT,  -- positive, negative, neutral
  strength_expected DECIMAL(3,2),  -- 0.00 to 1.00

  -- Synthetic marker (INV-08 compliance)
  is_synthetic BOOLEAN NOT NULL DEFAULT true,
  synthetic_marker TEXT DEFAULT '[SYNTHETIC TEST CONTENT]',

  -- Processing status
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,

  -- Authorship
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Extended metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Constraints
  CONSTRAINT chk_test_articles_sentiment CHECK (sentiment_expected IS NULL OR sentiment_expected IN ('positive', 'negative', 'neutral')),
  CONSTRAINT chk_test_articles_strength CHECK (strength_expected IS NULL OR (strength_expected >= 0.00 AND strength_expected <= 1.00))
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_test_articles_org ON prediction.test_articles(organization_slug);
CREATE INDEX idx_test_articles_scenario ON prediction.test_articles(scenario_id) WHERE scenario_id IS NOT NULL;
CREATE INDEX idx_test_articles_processed ON prediction.test_articles(processed) WHERE processed = false;
CREATE INDEX idx_test_articles_published_at ON prediction.test_articles(published_at DESC);
CREATE INDEX idx_test_articles_target_symbols ON prediction.test_articles USING GIN(target_symbols);
CREATE INDEX idx_test_articles_created_by ON prediction.test_articles(created_by) WHERE created_by IS NOT NULL;

-- =============================================================================
-- VALIDATION FUNCTION FOR T_ PREFIX
-- =============================================================================

CREATE OR REPLACE FUNCTION prediction.validate_test_article_symbols()
RETURNS TRIGGER AS $$
BEGIN
  -- Check that all target_symbols start with T_
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.target_symbols) AS symbol
    WHERE symbol NOT LIKE 'T_%'
  ) THEN
    RAISE EXCEPTION 'All target_symbols must start with T_ prefix (INV-08)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_test_article_symbols
  BEFORE INSERT OR UPDATE ON prediction.test_articles
  FOR EACH ROW
  EXECUTE FUNCTION prediction.validate_test_article_symbols();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.test_articles IS 'Synthetic/test articles for scenario testing';
COMMENT ON COLUMN prediction.test_articles.target_symbols IS 'Target symbols this article relates to (must start with T_)';
COMMENT ON COLUMN prediction.test_articles.sentiment_expected IS 'Expected sentiment: positive, negative, neutral';
COMMENT ON COLUMN prediction.test_articles.strength_expected IS 'Expected signal strength 0.00-1.00';
COMMENT ON COLUMN prediction.test_articles.is_synthetic IS 'Always true for test articles';
COMMENT ON COLUMN prediction.test_articles.synthetic_marker IS 'Marker text identifying synthetic content';
COMMENT ON COLUMN prediction.test_articles.processed IS 'Whether this article has been processed by the runner';

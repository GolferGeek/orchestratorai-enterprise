-- =============================================================================
-- CREATE PREDICTION.TEST_PRICE_DATA TABLE
-- =============================================================================
-- Stores synthetic price data for test targets (T_ prefixed symbols)
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- PRD Section: 15.3.3 Test Price Data Table
-- =============================================================================

CREATE TABLE prediction.test_price_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization scope (uses slug as PK, not UUID)
  organization_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,

  -- Optional link to scenario
  scenario_id UUID REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL,

  -- Symbol (MUST start with T_)
  symbol TEXT NOT NULL,

  -- Price timestamp
  price_timestamp TIMESTAMPTZ NOT NULL,

  -- OHLCV data
  open DECIMAL(20,8) NOT NULL,
  high DECIMAL(20,8) NOT NULL,
  low DECIMAL(20,8) NOT NULL,
  close DECIMAL(20,8) NOT NULL,
  volume BIGINT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Extended metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Constraints
  CONSTRAINT chk_test_price_data_symbol CHECK (symbol LIKE 'T_%'),  -- INV-08
  CONSTRAINT chk_test_price_data_high_low CHECK (high >= low),
  CONSTRAINT chk_test_price_data_ohlc CHECK (
    high >= open AND high >= close AND
    low <= open AND low <= close
  ),
  CONSTRAINT uq_test_price_data_symbol_timestamp UNIQUE (organization_slug, symbol, price_timestamp)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_test_price_data_org ON prediction.test_price_data(organization_slug);
CREATE INDEX idx_test_price_data_scenario ON prediction.test_price_data(scenario_id) WHERE scenario_id IS NOT NULL;
CREATE INDEX idx_test_price_data_symbol ON prediction.test_price_data(symbol);
CREATE INDEX idx_test_price_data_symbol_timestamp ON prediction.test_price_data(symbol, price_timestamp DESC);
CREATE INDEX idx_test_price_data_timestamp ON prediction.test_price_data(price_timestamp DESC);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.test_price_data IS 'Synthetic price data for T_ prefixed test targets';
COMMENT ON COLUMN prediction.test_price_data.symbol IS 'Test target symbol (must start with T_)';
COMMENT ON COLUMN prediction.test_price_data.price_timestamp IS 'Timestamp for this price data point';
COMMENT ON COLUMN prediction.test_price_data.open IS 'Opening price';
COMMENT ON COLUMN prediction.test_price_data.high IS 'High price';
COMMENT ON COLUMN prediction.test_price_data.low IS 'Low price';
COMMENT ON COLUMN prediction.test_price_data.close IS 'Closing price';
COMMENT ON COLUMN prediction.test_price_data.volume IS 'Trading volume';

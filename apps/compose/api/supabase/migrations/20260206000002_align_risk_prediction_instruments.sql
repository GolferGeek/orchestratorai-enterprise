-- =============================================================================
-- ALIGN RISK AND PREDICTION INSTRUMENTS
-- =============================================================================
-- Ensures both systems cover the same 10 instruments:
--   Stocks: AAPL, AMZN, GOOGL, META, MSFT, NVDA
--   Crypto: AVAX, BTC, ETH, SOL
--
-- All inserts use ON CONFLICT ... DO NOTHING for idempotent re-runs.
-- =============================================================================

-- =============================================================================
-- PART A: Populate prediction crypto targets
-- =============================================================================
-- The "Crypto Majors 2025" universe exists but may have 0 targets in live DB.
-- Insert BTC, ETH, SOL, AVAX (same format as stock targets in seed).

DO $$
DECLARE
  v_crypto_universe_id UUID;
BEGIN
  SELECT id INTO v_crypto_universe_id FROM prediction.universes
    WHERE organization_slug = 'finance' AND name = 'Crypto Majors 2025';

  IF v_crypto_universe_id IS NULL THEN
    RAISE NOTICE 'Crypto universe not found - skipping crypto target alignment';
    RETURN;
  END IF;

  -- BTC - Bitcoin
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'BTC', 'Bitcoin', 'crypto',
    'Bitcoin is the original cryptocurrency. Watch for: halving cycles, ETF flows, institutional adoption, macro correlation, miner activity, whale movements.',
    true,
    '{"category": "Layer 1", "consensus": "PoW", "market_cap": "large", "coingecko_id": "bitcoin", "binance_symbol": "BTCUSDT"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO NOTHING;

  -- ETH - Ethereum
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'ETH', 'Ethereum', 'crypto',
    'Ethereum is the leading smart contract platform. Watch for: staking ratio, DeFi TVL, gas fees, L2 adoption, validator count, ETH/BTC ratio.',
    true,
    '{"category": "Layer 1", "consensus": "PoS", "market_cap": "large", "coingecko_id": "ethereum", "binance_symbol": "ETHUSDT"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO NOTHING;

  -- SOL - Solana
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'SOL', 'Solana', 'crypto',
    'Solana is a high-throughput blockchain. Watch for: TPS metrics, DeFi TVL, NFT activity, network stability, memecoin activity, validator distribution.',
    true,
    '{"category": "Layer 1", "consensus": "PoS+PoH", "market_cap": "mid", "coingecko_id": "solana", "binance_symbol": "SOLUSDT"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO NOTHING;

  -- AVAX - Avalanche
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'AVAX', 'Avalanche', 'crypto',
    'Avalanche is a multi-chain platform with subnets. Watch for: subnet launches, DeFi TVL, institutional adoption, gaming partnerships.',
    true,
    '{"category": "Layer 1", "consensus": "Snowman", "market_cap": "mid", "coingecko_id": "avalanche-2", "binance_symbol": "AVAXUSDT"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO NOTHING;

  -- T_BTC - Bitcoin (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'T_BTC', 'Bitcoin (Test)', 'crypto',
    'Bitcoin is the original cryptocurrency. Watch for: halving cycles, ETF flows, institutional adoption, macro correlation, miner activity, whale movements.',
    true,
    '{"category": "Layer 1", "consensus": "PoW", "market_cap": "large", "test_mode": true, "mirrors": "BTC"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO NOTHING;

  -- T_ETH - Ethereum (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'T_ETH', 'Ethereum (Test)', 'crypto',
    'Ethereum is the leading smart contract platform. Watch for: staking ratio, DeFi TVL, gas fees, L2 adoption, validator count, ETH/BTC ratio.',
    true,
    '{"category": "Layer 1", "consensus": "PoS", "market_cap": "large", "test_mode": true, "mirrors": "ETH"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO NOTHING;

  -- T_SOL - Solana (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'T_SOL', 'Solana (Test)', 'crypto',
    'Solana is a high-throughput blockchain. Watch for: TPS metrics, DeFi TVL, NFT activity, network stability, memecoin activity, validator distribution.',
    true,
    '{"category": "Layer 1", "consensus": "PoS+PoH", "market_cap": "mid", "test_mode": true, "mirrors": "SOL"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO NOTHING;

  -- T_AVAX - Avalanche (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'T_AVAX', 'Avalanche (Test)', 'crypto',
    'Avalanche is a multi-chain platform with subnets. Watch for: subnet launches, DeFi TVL, institutional adoption, gaming partnerships.',
    true,
    '{"category": "Layer 1", "consensus": "Snowman", "market_cap": "mid", "test_mode": true, "mirrors": "AVAX"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO NOTHING;

  RAISE NOTICE 'Aligned prediction crypto targets (BTC, ETH, SOL, AVAX + test variants)';
END $$;

-- =============================================================================
-- PART B: Add AMZN and META to prediction stock targets
-- =============================================================================
-- The "US Tech Stocks 2025" universe has AAPL, GOOGL, MSFT, NVDA but is
-- missing AMZN and META.

DO $$
DECLARE
  v_stocks_universe_id UUID;
BEGIN
  SELECT id INTO v_stocks_universe_id FROM prediction.universes
    WHERE organization_slug = 'finance' AND name = 'US Tech Stocks 2025';

  IF v_stocks_universe_id IS NULL THEN
    RAISE NOTICE 'Stocks universe not found - skipping stock target alignment';
    RETURN;
  END IF;

  -- AMZN - Amazon
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'AMZN', 'Amazon.com Inc', 'stock',
    'Amazon.com Inc. is a global e-commerce and cloud computing leader. Key segments: AWS cloud, e-commerce marketplace, advertising, Prime subscriptions. Watch for AWS growth, retail margins, ad revenue, and AI infrastructure spending.',
    true,
    '{"sector": "Technology", "industry": "Internet Retail", "market_cap": "large", "yahoo_symbol": "AMZN"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO NOTHING;

  -- META - Meta Platforms
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'META', 'Meta Platforms Inc', 'stock',
    'Meta Platforms Inc. operates Facebook, Instagram, WhatsApp, and Reality Labs. Key metrics: ad revenue, user engagement, Reels monetization, Reality Labs investment. Watch for ad market trends, AI integration, metaverse spending, and regulatory actions.',
    true,
    '{"sector": "Technology", "industry": "Social Media", "market_cap": "large", "yahoo_symbol": "META"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO NOTHING;

  -- T_AMZN - Amazon (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'T_AMZN', 'Amazon.com Inc (Test)', 'stock',
    'Amazon.com Inc. is a global e-commerce and cloud computing leader. Key segments: AWS cloud, e-commerce marketplace, advertising, Prime subscriptions. Watch for AWS growth, retail margins, ad revenue, and AI infrastructure spending.',
    true,
    '{"sector": "Technology", "industry": "Internet Retail", "market_cap": "large", "test_mode": true, "mirrors": "AMZN"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO NOTHING;

  -- T_META - Meta Platforms (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'T_META', 'Meta Platforms Inc (Test)', 'stock',
    'Meta Platforms Inc. operates Facebook, Instagram, WhatsApp, and Reality Labs. Key metrics: ad revenue, user engagement, Reels monetization, Reality Labs investment. Watch for ad market trends, AI integration, metaverse spending, and regulatory actions.',
    true,
    '{"sector": "Technology", "industry": "Social Media", "market_cap": "large", "test_mode": true, "mirrors": "META"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO NOTHING;

  -- TSLA - Tesla (update metadata if exists, insert if not)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'TSLA', 'Tesla Inc', 'stock',
    'Tesla Inc. is an electric vehicle and clean energy company. Key segments: automotive, energy generation/storage, FSD/autonomy. Watch for delivery numbers, margin trends, FSD progress, energy business growth, and regulatory credits.',
    true,
    '{"sector": "Consumer Cyclical", "industry": "Auto Manufacturers", "market_cap": "large", "yahoo_symbol": "TSLA"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- T_TSLA - Tesla (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'T_TSLA', 'Tesla Inc (Test)', 'stock',
    'Tesla Inc. is an electric vehicle and clean energy company. Key segments: automotive, energy generation/storage, FSD/autonomy. Watch for delivery numbers, margin trends, FSD progress, energy business growth, and regulatory credits.',
    true,
    '{"sector": "Consumer Cyclical", "industry": "Auto Manufacturers", "market_cap": "large", "test_mode": true, "mirrors": "TSLA"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO NOTHING;

  RAISE NOTICE 'Aligned prediction stock targets (added AMZN, META, TSLA + test variants)';
END $$;

-- =============================================================================
-- PART C: Add missing stocks to risk subjects
-- =============================================================================
-- The investment risk scope has GOOGL, NVDA + crypto but is missing
-- AAPL, AMZN, META, MSFT as stock subjects.

DO $$
DECLARE
  v_scope_id UUID;
BEGIN
  SELECT id INTO v_scope_id FROM risk.scopes WHERE domain = 'investment' LIMIT 1;

  IF v_scope_id IS NULL THEN
    RAISE NOTICE 'No investment risk scope found - skipping risk subject alignment';
    RETURN;
  END IF;

  -- AAPL - Apple
  INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
  VALUES (v_scope_id, 'AAPL', 'Apple Inc.', 'stock',
          '{"sector": "Technology", "industry": "Consumer Electronics", "marketCap": "3.4T", "exchange": "NASDAQ"}'::JSONB)
  ON CONFLICT (scope_id, identifier) DO NOTHING;

  -- AMZN - Amazon
  INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
  VALUES (v_scope_id, 'AMZN', 'Amazon.com Inc.', 'stock',
          '{"sector": "Technology", "industry": "Internet Retail", "marketCap": "2.3T", "exchange": "NASDAQ"}'::JSONB)
  ON CONFLICT (scope_id, identifier) DO NOTHING;

  -- META - Meta Platforms
  INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
  VALUES (v_scope_id, 'META', 'Meta Platforms Inc.', 'stock',
          '{"sector": "Technology", "industry": "Social Media", "marketCap": "1.6T", "exchange": "NASDAQ"}'::JSONB)
  ON CONFLICT (scope_id, identifier) DO NOTHING;

  -- MSFT - Microsoft
  INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
  VALUES (v_scope_id, 'MSFT', 'Microsoft Corporation', 'stock',
          '{"sector": "Technology", "industry": "Software", "marketCap": "3.1T", "exchange": "NASDAQ"}'::JSONB)
  ON CONFLICT (scope_id, identifier) DO NOTHING;

  -- TSLA - Tesla
  INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
  VALUES (v_scope_id, 'TSLA', 'Tesla Inc.', 'stock',
          '{"sector": "Consumer Cyclical", "industry": "Auto Manufacturers", "marketCap": "1.1T", "exchange": "NASDAQ"}'::JSONB)
  ON CONFLICT (scope_id, identifier) DO NOTHING;

  RAISE NOTICE 'Aligned risk subjects (added AAPL, AMZN, META, MSFT, TSLA)';
END $$;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  v_pred_count INTEGER;
  v_risk_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_pred_count
  FROM prediction.targets
  WHERE symbol IN ('AAPL', 'AMZN', 'AVAX', 'BTC', 'ETH', 'GOOGL', 'META', 'MSFT', 'NVDA', 'SOL', 'TSLA')
    AND is_active = true;

  SELECT COUNT(*) INTO v_risk_count
  FROM risk.subjects
  WHERE identifier IN ('AAPL', 'AMZN', 'AVAX', 'BTC', 'ETH', 'GOOGL', 'META', 'MSFT', 'NVDA', 'SOL', 'TSLA')
    AND is_active = true;

  RAISE NOTICE '========== ALIGNMENT VERIFICATION ==========';
  RAISE NOTICE 'Prediction targets (active, non-test): %/11', v_pred_count;
  RAISE NOTICE 'Risk subjects (active): %/11', v_risk_count;
  RAISE NOTICE '============================================';
END $$;

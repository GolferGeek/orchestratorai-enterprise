-- =====================================================================================
-- PREDICTION SYSTEM - COMPREHENSIVE SEED DATA
-- =====================================================================================
-- Description: Seeds all prediction tables for E2E testing and demo readiness
-- Dependencies: All prediction schema migrations, finance organization, prediction agents
-- NOTE: Test targets use T_ prefix for INV-08 compliance
-- =====================================================================================

-- =====================================================================================
-- SECTION 1: UNIVERSES
-- =====================================================================================
-- Create universes for stocks and crypto domains

-- Get the balanced strategy ID for reference
DO $$
DECLARE
  v_balanced_strategy_id UUID;
  v_stocks_universe_id UUID;
  v_crypto_universe_id UUID;
BEGIN
  SELECT id INTO v_balanced_strategy_id FROM prediction.strategies WHERE slug = 'balanced';

  -- Insert US Tech Stocks Universe
  INSERT INTO prediction.universes (
    organization_slug, agent_slug, name, description, domain, strategy_id, is_active
  ) VALUES (
    'finance', 'us-tech-stocks-2025',
    'US Tech Stocks 2025',
    'Major US technology stocks tracked by the prediction system',
    'stocks',
    v_balanced_strategy_id,
    true
  )
  ON CONFLICT (organization_slug, agent_slug, name) DO UPDATE SET
    description = EXCLUDED.description,
    strategy_id = EXCLUDED.strategy_id,
    updated_at = NOW()
  RETURNING id INTO v_stocks_universe_id;

  -- Store for later use
  PERFORM set_config('app.stocks_universe_id', v_stocks_universe_id::text, true);

  RAISE NOTICE 'Created stocks universe with ID: %', v_stocks_universe_id;
END $$;

-- Insert Crypto Majors Universe
DO $$
DECLARE
  v_balanced_strategy_id UUID;
  v_crypto_universe_id UUID;
BEGIN
  SELECT id INTO v_balanced_strategy_id FROM prediction.strategies WHERE slug = 'balanced';

  INSERT INTO prediction.universes (
    organization_slug, agent_slug, name, description, domain, strategy_id, is_active
  ) VALUES (
    'finance', 'us-tech-stocks-2025',
    'Crypto Majors 2025',
    'Major cryptocurrency assets tracked by the prediction system',
    'crypto',
    v_balanced_strategy_id,
    true
  )
  ON CONFLICT (organization_slug, agent_slug, name) DO UPDATE SET
    description = EXCLUDED.description,
    strategy_id = EXCLUDED.strategy_id,
    updated_at = NOW()
  RETURNING id INTO v_crypto_universe_id;

  PERFORM set_config('app.crypto_universe_id', v_crypto_universe_id::text, true);

  RAISE NOTICE 'Created crypto universe with ID: %', v_crypto_universe_id;
END $$;

-- =====================================================================================
-- SECTION 2: TARGETS - REAL INSTRUMENTS
-- =====================================================================================
-- Real instruments for actual market data tracking

DO $$
DECLARE
  v_stocks_universe_id UUID;
  v_crypto_universe_id UUID;
BEGIN
  -- Get universe IDs
  SELECT id INTO v_stocks_universe_id FROM prediction.universes
    WHERE organization_slug = 'finance' AND name = 'US Tech Stocks 2025';
  SELECT id INTO v_crypto_universe_id FROM prediction.universes
    WHERE organization_slug = 'finance' AND name = 'Crypto Majors 2025';

  -- =========== REAL STOCK TARGETS ===========

  -- AAPL - Apple Inc (Real)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'AAPL', 'Apple Inc', 'stock',
    'Apple Inc. is a multinational technology company. Key metrics: iPhone sales, Services revenue, Mac/iPad sales. Watch for earnings, product launches, China sales.',
    true,
    '{"sector": "Technology", "industry": "Consumer Electronics", "market_cap": "large", "yahoo_symbol": "AAPL"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- MSFT - Microsoft (Real)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'MSFT', 'Microsoft Corporation', 'stock',
    'Microsoft Corporation focuses on cloud (Azure), AI integration, Office 365, and gaming (Xbox). Watch for Azure growth, AI announcements, enterprise adoption.',
    true,
    '{"sector": "Technology", "industry": "Software", "market_cap": "large", "yahoo_symbol": "MSFT"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- GOOGL - Alphabet (Real)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'GOOGL', 'Alphabet Inc', 'stock',
    'Alphabet Inc. is Google parent company. Key segments: Search ads, YouTube, Google Cloud, Waymo. Watch for ad revenue trends, AI competition, regulatory concerns.',
    true,
    '{"sector": "Technology", "industry": "Internet Content", "market_cap": "large", "yahoo_symbol": "GOOGL"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- NVDA - NVIDIA (Real)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'NVDA', 'NVIDIA Corporation', 'stock',
    'NVIDIA is the leading AI chip company. Key products: H100/H200 GPUs, CUDA ecosystem, data center solutions. Watch for AI demand, competition from AMD/Intel, China restrictions.',
    true,
    '{"sector": "Technology", "industry": "Semiconductors", "market_cap": "large", "yahoo_symbol": "NVDA"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- AMZN - Amazon (Real)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'AMZN', 'Amazon.com Inc', 'stock',
    'Amazon.com Inc. is a global e-commerce and cloud computing leader. Key segments: AWS cloud, e-commerce marketplace, advertising, Prime subscriptions. Watch for AWS growth, retail margins, ad revenue, and AI infrastructure spending.',
    true,
    '{"sector": "Technology", "industry": "Internet Retail", "market_cap": "large", "yahoo_symbol": "AMZN"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- META - Meta Platforms (Real)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'META', 'Meta Platforms Inc', 'stock',
    'Meta Platforms Inc. operates Facebook, Instagram, WhatsApp, and Reality Labs. Key metrics: ad revenue, user engagement, Reels monetization, Reality Labs investment. Watch for ad market trends, AI integration, metaverse spending, and regulatory actions.',
    true,
    '{"sector": "Technology", "industry": "Social Media", "market_cap": "large", "yahoo_symbol": "META"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- TSLA - Tesla (Real)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'TSLA', 'Tesla Inc', 'stock',
    'Tesla Inc. is an electric vehicle and clean energy company. Key segments: automotive, energy generation/storage, FSD/autonomy. Watch for delivery numbers, margin trends, FSD progress, energy business growth, and regulatory credits.',
    true,
    '{"sector": "Consumer Cyclical", "industry": "Auto Manufacturers", "market_cap": "large", "yahoo_symbol": "TSLA"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- =========== REAL CRYPTO TARGETS ===========

  -- BTC - Bitcoin (Real)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'BTC', 'Bitcoin', 'crypto',
    'Bitcoin is the original cryptocurrency. Watch for: halving cycles, ETF flows, institutional adoption, macro correlation, miner activity, whale movements.',
    true,
    '{"category": "Layer 1", "consensus": "PoW", "market_cap": "large", "coingecko_id": "bitcoin", "binance_symbol": "BTCUSDT"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- ETH - Ethereum (Real)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'ETH', 'Ethereum', 'crypto',
    'Ethereum is the leading smart contract platform. Watch for: staking ratio, DeFi TVL, gas fees, L2 adoption, validator count, ETH/BTC ratio.',
    true,
    '{"category": "Layer 1", "consensus": "PoS", "market_cap": "large", "coingecko_id": "ethereum", "binance_symbol": "ETHUSDT"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- SOL - Solana (Real)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'SOL', 'Solana', 'crypto',
    'Solana is a high-throughput blockchain. Watch for: TPS metrics, DeFi TVL, NFT activity, network stability, memecoin activity, validator distribution.',
    true,
    '{"category": "Layer 1", "consensus": "PoS+PoH", "market_cap": "mid", "coingecko_id": "solana", "binance_symbol": "SOLUSDT"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- AVAX - Avalanche (Real)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'AVAX', 'Avalanche', 'crypto',
    'Avalanche is a multi-chain platform with subnets. Watch for: subnet launches, DeFi TVL, institutional adoption, gaming partnerships.',
    true,
    '{"category": "Layer 1", "consensus": "Snowman", "market_cap": "mid", "coingecko_id": "avalanche-2", "binance_symbol": "AVAXUSDT"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  RAISE NOTICE 'Created/updated 11 real targets (7 stocks, 4 crypto)';
END $$;

-- =====================================================================================
-- SECTION 2B: TARGETS - TEST INSTRUMENTS (T_ prefix for INV-08 compliance)
-- =====================================================================================
-- Test instruments mirror real ones but use synthetic data for testing

DO $$
DECLARE
  v_stocks_universe_id UUID;
  v_crypto_universe_id UUID;
  v_target_id UUID;
BEGIN
  -- Get universe IDs
  SELECT id INTO v_stocks_universe_id FROM prediction.universes
    WHERE organization_slug = 'finance' AND name = 'US Tech Stocks 2025';
  SELECT id INTO v_crypto_universe_id FROM prediction.universes
    WHERE organization_slug = 'finance' AND name = 'Crypto Majors 2025';

  -- =========== TEST STOCK TARGETS ===========

  -- T_AAPL - Apple Inc (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'T_AAPL', 'Apple Inc (Test)', 'stock',
    'Apple Inc. is a multinational technology company. Key metrics: iPhone sales, Services revenue, Mac/iPad sales. Watch for earnings, product launches, China sales.',
    true,
    '{"sector": "Technology", "industry": "Consumer Electronics", "market_cap": "large", "test_mode": true, "mirrors": "AAPL"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- T_MSFT - Microsoft (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'T_MSFT', 'Microsoft Corporation (Test)', 'stock',
    'Microsoft Corporation focuses on cloud (Azure), AI integration, Office 365, and gaming (Xbox). Watch for Azure growth, AI announcements, enterprise adoption.',
    true,
    '{"sector": "Technology", "industry": "Software", "market_cap": "large", "test_mode": true, "mirrors": "MSFT"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- T_GOOGL - Alphabet (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'T_GOOGL', 'Alphabet Inc (Test)', 'stock',
    'Alphabet Inc. is Google parent company. Key segments: Search ads, YouTube, Google Cloud, Waymo. Watch for ad revenue trends, AI competition, regulatory concerns.',
    true,
    '{"sector": "Technology", "industry": "Internet Content", "market_cap": "large", "test_mode": true, "mirrors": "GOOGL"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- T_NVDA - NVIDIA (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'T_NVDA', 'NVIDIA Corporation (Test)', 'stock',
    'NVIDIA is the leading AI chip company. Key products: H100/H200 GPUs, CUDA ecosystem, data center solutions. Watch for AI demand, competition from AMD/Intel, China restrictions.',
    true,
    '{"sector": "Technology", "industry": "Semiconductors", "market_cap": "large", "test_mode": true, "mirrors": "NVDA"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- T_AMZN - Amazon (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'T_AMZN', 'Amazon.com Inc (Test)', 'stock',
    'Amazon.com Inc. is a global e-commerce and cloud computing leader. Key segments: AWS cloud, e-commerce marketplace, advertising, Prime subscriptions. Watch for AWS growth, retail margins, ad revenue, and AI infrastructure spending.',
    true,
    '{"sector": "Technology", "industry": "Internet Retail", "market_cap": "large", "test_mode": true, "mirrors": "AMZN"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- T_META - Meta Platforms (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_stocks_universe_id, 'T_META', 'Meta Platforms Inc (Test)', 'stock',
    'Meta Platforms Inc. operates Facebook, Instagram, WhatsApp, and Reality Labs. Key metrics: ad revenue, user engagement, Reels monetization, Reality Labs investment. Watch for ad market trends, AI integration, metaverse spending, and regulatory actions.',
    true,
    '{"sector": "Technology", "industry": "Social Media", "market_cap": "large", "test_mode": true, "mirrors": "META"}'::jsonb
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
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- =========== TEST CRYPTO TARGETS ===========

  -- T_BTC - Bitcoin (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'T_BTC', 'Bitcoin (Test)', 'crypto',
    'Bitcoin is the original cryptocurrency. Watch for: halving cycles, ETF flows, institutional adoption, macro correlation, miner activity, whale movements.',
    true,
    '{"category": "Layer 1", "consensus": "PoW", "market_cap": "large", "test_mode": true, "mirrors": "BTC"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- T_ETH - Ethereum (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'T_ETH', 'Ethereum (Test)', 'crypto',
    'Ethereum is the leading smart contract platform. Watch for: staking ratio, DeFi TVL, gas fees, L2 adoption, validator count, ETH/BTC ratio.',
    true,
    '{"category": "Layer 1", "consensus": "PoS", "market_cap": "large", "test_mode": true, "mirrors": "ETH"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- T_SOL - Solana (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'T_SOL', 'Solana (Test)', 'crypto',
    'Solana is a high-throughput blockchain. Watch for: TPS metrics, DeFi TVL, NFT activity, network stability, memecoin activity, validator distribution.',
    true,
    '{"category": "Layer 1", "consensus": "PoS+PoH", "market_cap": "mid", "test_mode": true, "mirrors": "SOL"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  -- T_AVAX - Avalanche (Test)
  INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context, is_active, metadata)
  VALUES (
    v_crypto_universe_id, 'T_AVAX', 'Avalanche (Test)', 'crypto',
    'Avalanche is a multi-chain platform with subnets. Watch for: subnet launches, DeFi TVL, institutional adoption, gaming partnerships.',
    true,
    '{"category": "Layer 1", "consensus": "Snowman", "market_cap": "mid", "test_mode": true, "mirrors": "AVAX"}'::jsonb
  )
  ON CONFLICT (universe_id, symbol) DO UPDATE SET
    name = EXCLUDED.name, context = EXCLUDED.context, metadata = EXCLUDED.metadata, updated_at = NOW();

  RAISE NOTICE 'Created/updated 11 test targets (7 stocks, 4 crypto)';
END $$;

-- =====================================================================================
-- SECTION 3: TEST SCENARIOS
-- =====================================================================================

DO $$
DECLARE
  v_scenario_id UUID;
  v_target_id UUID;
BEGIN
  -- Get a target for scenario association
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_AAPL' LIMIT 1;

  -- Test Scenario 1: Bull Market Scenario
  INSERT INTO prediction.test_scenarios (
    name, description, injection_points, target_id, organization_slug, config, status, created_by
  ) VALUES (
    'Bull Market Tech Rally',
    'Simulates a tech bull market with positive earnings and AI hype',
    ARRAY['signals', 'predictors', 'predictions', 'test_articles', 'test_price_data'],
    v_target_id,
    'finance',
    '{"market_condition": "bull", "volatility": "medium", "sentiment": "positive", "duration_days": 30}'::jsonb,
    'active',
    'system'
  )
  ON CONFLICT DO NOTHING;

  -- Test Scenario 2: Earnings Season
  INSERT INTO prediction.test_scenarios (
    name, description, injection_points, target_id, organization_slug, config, status, created_by
  ) VALUES (
    'Q4 Earnings Season',
    'Tests prediction accuracy during earnings announcements',
    ARRAY['signals', 'predictors', 'predictions', 'test_articles'],
    v_target_id,
    'finance',
    '{"event_type": "earnings", "companies": ["AAPL", "MSFT", "GOOGL", "NVDA"], "expected_beats": 3}'::jsonb,
    'active',
    'system'
  )
  ON CONFLICT DO NOTHING;

  -- Test Scenario 3: Crypto Volatility
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_BTC' LIMIT 1;

  INSERT INTO prediction.test_scenarios (
    name, description, injection_points, target_id, organization_slug, config, status, created_by
  ) VALUES (
    'Crypto Volatility Event',
    'Tests prediction system during high crypto volatility',
    ARRAY['signals', 'predictors', 'predictions', 'test_articles', 'test_price_data'],
    v_target_id,
    'finance',
    '{"market_condition": "volatile", "catalyst": "regulatory_news", "expected_move_pct": 15}'::jsonb,
    'active',
    'system'
  )
  ON CONFLICT DO NOTHING;

  -- Test Scenario 4: Mixed Signals
  INSERT INTO prediction.test_scenarios (
    name, description, injection_points, target_id, organization_slug, config, status, created_by
  ) VALUES (
    'Mixed Signal Analysis',
    'Tests how system handles conflicting signals from multiple sources',
    ARRAY['signals', 'predictors', 'review_queue'],
    v_target_id,
    'finance',
    '{"signal_count": 10, "bullish_pct": 50, "bearish_pct": 50, "expected_outcome": "review_queue"}'::jsonb,
    'active',
    'system'
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Created 4 test scenarios';
END $$;

-- =====================================================================================
-- SECTION 4: TEST ARTICLES
-- =====================================================================================

DO $$
DECLARE
  v_scenario_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Get the Bull Market scenario
  SELECT id INTO v_scenario_id FROM prediction.test_scenarios WHERE name = 'Bull Market Tech Rally' LIMIT 1;

  -- Article 1: Positive Apple News
  INSERT INTO prediction.test_articles (
    organization_slug, scenario_id, title, content, source_name, published_at,
    target_symbols, sentiment_expected, strength_expected, is_synthetic, synthetic_marker
  ) VALUES (
    'finance', v_scenario_id,
    '[SYNTHETIC TEST CONTENT] Apple Reports Record iPhone Sales in China',
    'Apple Inc. (AAPL) announced record-breaking iPhone sales in the Chinese market for Q4, exceeding analyst expectations by 15%. The strong performance was driven by the iPhone 16 Pro Max which saw unprecedented demand. CEO Tim Cook stated that AI features have been a key driver of upgrades.',
    'synthetic_news',
    v_now - INTERVAL '2 hours',
    ARRAY['T_AAPL'],
    'positive',
    0.85,
    true,
    '[SYNTHETIC TEST CONTENT]'
  )
  ON CONFLICT DO NOTHING;

  -- Article 2: Positive NVIDIA News
  INSERT INTO prediction.test_articles (
    organization_slug, scenario_id, title, content, source_name, published_at,
    target_symbols, sentiment_expected, strength_expected, is_synthetic, synthetic_marker
  ) VALUES (
    'finance', v_scenario_id,
    '[SYNTHETIC TEST CONTENT] NVIDIA H200 Demand Exceeds Supply by 300%',
    'NVIDIA Corporation reports that demand for its H200 AI accelerators has exceeded manufacturing capacity by 300%. Major cloud providers including Microsoft Azure, Google Cloud, and AWS have placed multi-billion dollar orders. The company is expanding production with TSMC to meet demand.',
    'synthetic_news',
    v_now - INTERVAL '4 hours',
    ARRAY['T_NVDA'],
    'positive',
    0.90,
    true,
    '[SYNTHETIC TEST CONTENT]'
  )
  ON CONFLICT DO NOTHING;

  -- Article 3: Mixed Microsoft News
  INSERT INTO prediction.test_articles (
    organization_slug, scenario_id, title, content, source_name, published_at,
    target_symbols, sentiment_expected, strength_expected, is_synthetic, synthetic_marker
  ) VALUES (
    'finance', v_scenario_id,
    '[SYNTHETIC TEST CONTENT] Microsoft Azure Growth Slows but AI Revenue Surges',
    'Microsoft reported mixed results with Azure cloud growth slowing to 26% year-over-year, below the expected 28%. However, AI-related revenue surged 150% with Copilot adoption exceeding expectations. Analysts are divided on whether AI growth can offset cloud deceleration.',
    'synthetic_news',
    v_now - INTERVAL '6 hours',
    ARRAY['T_MSFT'],
    'neutral',
    0.50,
    true,
    '[SYNTHETIC TEST CONTENT]'
  )
  ON CONFLICT DO NOTHING;

  -- Article 4: Negative Google News
  INSERT INTO prediction.test_articles (
    organization_slug, scenario_id, title, content, source_name, published_at,
    target_symbols, sentiment_expected, strength_expected, is_synthetic, synthetic_marker
  ) VALUES (
    'finance', v_scenario_id,
    '[SYNTHETIC TEST CONTENT] DOJ Antitrust Ruling Goes Against Google',
    'The Department of Justice secured a significant victory in its antitrust case against Alphabet Inc. The ruling requires Google to allow alternative search engines on Android devices and share search data with competitors. Analysts estimate this could impact 15% of search revenue.',
    'synthetic_news',
    v_now - INTERVAL '8 hours',
    ARRAY['T_GOOGL'],
    'negative',
    0.75,
    true,
    '[SYNTHETIC TEST CONTENT]'
  )
  ON CONFLICT DO NOTHING;

  -- Get crypto scenario
  SELECT id INTO v_scenario_id FROM prediction.test_scenarios WHERE name = 'Crypto Volatility Event' LIMIT 1;

  -- Article 5: Positive Bitcoin News
  INSERT INTO prediction.test_articles (
    organization_slug, scenario_id, title, content, source_name, published_at,
    target_symbols, sentiment_expected, strength_expected, is_synthetic, synthetic_marker
  ) VALUES (
    'finance', v_scenario_id,
    '[SYNTHETIC TEST CONTENT] BlackRock Bitcoin ETF Sees Record $2B Daily Inflow',
    'BlackRocks iShares Bitcoin Trust (IBIT) recorded a historic $2 billion single-day inflow, the largest since its launch. Institutional adoption continues to accelerate with pension funds and sovereign wealth funds increasing Bitcoin allocations.',
    'synthetic_news',
    v_now - INTERVAL '3 hours',
    ARRAY['T_BTC'],
    'positive',
    0.88,
    true,
    '[SYNTHETIC TEST CONTENT]'
  )
  ON CONFLICT DO NOTHING;

  -- Article 6: Ethereum News
  INSERT INTO prediction.test_articles (
    organization_slug, scenario_id, title, content, source_name, published_at,
    target_symbols, sentiment_expected, strength_expected, is_synthetic, synthetic_marker
  ) VALUES (
    'finance', v_scenario_id,
    '[SYNTHETIC TEST CONTENT] Ethereum Staking Ratio Reaches All-Time High',
    'Ethereum network staking ratio has reached an all-time high of 32%, with over 35 million ETH now locked in the beacon chain. The increased staking has reduced circulating supply significantly, with some analysts projecting supply shock dynamics.',
    'synthetic_news',
    v_now - INTERVAL '5 hours',
    ARRAY['T_ETH'],
    'positive',
    0.72,
    true,
    '[SYNTHETIC TEST CONTENT]'
  )
  ON CONFLICT DO NOTHING;

  -- Article 7: Multi-target article
  INSERT INTO prediction.test_articles (
    organization_slug, scenario_id, title, content, source_name, published_at,
    target_symbols, sentiment_expected, strength_expected, is_synthetic, synthetic_marker
  ) VALUES (
    'finance', v_scenario_id,
    '[SYNTHETIC TEST CONTENT] Fed Signals Rate Cuts, Risk Assets Rally',
    'Federal Reserve Chair indicated potential rate cuts in the coming months, citing cooling inflation. Both crypto and tech stocks rallied on the news, with Bitcoin up 5% and the Nasdaq gaining 2%. Market participants expect multiple cuts through year-end.',
    'synthetic_news',
    v_now - INTERVAL '1 hour',
    ARRAY['T_BTC', 'T_ETH', 'T_AAPL', 'T_MSFT', 'T_NVDA', 'T_GOOGL'],
    'positive',
    0.80,
    true,
    '[SYNTHETIC TEST CONTENT]'
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Created 7 test articles';
END $$;

-- =====================================================================================
-- SECTION 5: TEST PRICE DATA
-- =====================================================================================
-- Note: OHLC constraint requires: high >= open, high >= close, low <= open, low <= close
-- We generate open and close first, then derive high/low from them

-- Helper function to generate valid OHLC data
CREATE OR REPLACE FUNCTION prediction.generate_ohlc(
  p_base NUMERIC,
  p_volatility NUMERIC
) RETURNS TABLE (
  o NUMERIC,
  h NUMERIC,
  l NUMERIC,
  c NUMERIC
) AS $$
DECLARE
  v_open NUMERIC;
  v_close NUMERIC;
  v_high NUMERIC;
  v_low NUMERIC;
BEGIN
  -- Generate open and close around the base price
  v_open := p_base + (random() * p_volatility - p_volatility/2);
  v_close := p_base + (random() * p_volatility - p_volatility/2);

  -- High is always >= max(open, close), add a small random bump
  v_high := GREATEST(v_open, v_close) + (random() * p_volatility * 0.5);

  -- Low is always <= min(open, close), subtract a small random amount
  v_low := LEAST(v_open, v_close) - (random() * p_volatility * 0.5);

  RETURN QUERY SELECT v_open, v_high, v_low, v_close;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  v_scenario_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_base_time TIMESTAMPTZ;
  v_ohlc RECORD;
  i INTEGER;
BEGIN
  -- Get scenario
  SELECT id INTO v_scenario_id FROM prediction.test_scenarios WHERE name = 'Bull Market Tech Rally' LIMIT 1;
  v_base_time := date_trunc('hour', v_now) - INTERVAL '7 days';

  -- Generate 7 days of hourly price data for T_AAPL (168 rows)
  FOR i IN 0..167 LOOP
    SELECT * INTO v_ohlc FROM prediction.generate_ohlc(175.00 + (i * 0.15), 2.0);
    INSERT INTO prediction.test_price_data (
      organization_slug, scenario_id, symbol, price_timestamp,
      open, high, low, close, volume
    ) VALUES (
      'finance', v_scenario_id, 'T_AAPL',
      v_base_time + (i * INTERVAL '1 hour'),
      v_ohlc.o, v_ohlc.h, v_ohlc.l, v_ohlc.c,
      (50000000 + (random() * 10000000))::bigint
    )
    ON CONFLICT (organization_slug, symbol, price_timestamp) DO NOTHING;
  END LOOP;

  -- Generate price data for T_NVDA
  FOR i IN 0..167 LOOP
    SELECT * INTO v_ohlc FROM prediction.generate_ohlc(850.00 + (i * 0.80), 15.0);
    INSERT INTO prediction.test_price_data (
      organization_slug, scenario_id, symbol, price_timestamp,
      open, high, low, close, volume
    ) VALUES (
      'finance', v_scenario_id, 'T_NVDA',
      v_base_time + (i * INTERVAL '1 hour'),
      v_ohlc.o, v_ohlc.h, v_ohlc.l, v_ohlc.c,
      (30000000 + (random() * 15000000))::bigint
    )
    ON CONFLICT (organization_slug, symbol, price_timestamp) DO NOTHING;
  END LOOP;

  -- Generate price data for T_MSFT
  FOR i IN 0..167 LOOP
    SELECT * INTO v_ohlc FROM prediction.generate_ohlc(420.00 + (i * 0.10), 4.0);
    INSERT INTO prediction.test_price_data (
      organization_slug, scenario_id, symbol, price_timestamp,
      open, high, low, close, volume
    ) VALUES (
      'finance', v_scenario_id, 'T_MSFT',
      v_base_time + (i * INTERVAL '1 hour'),
      v_ohlc.o, v_ohlc.h, v_ohlc.l, v_ohlc.c,
      (20000000 + (random() * 8000000))::bigint
    )
    ON CONFLICT (organization_slug, symbol, price_timestamp) DO NOTHING;
  END LOOP;

  -- Generate price data for T_GOOGL (slight downtrend)
  FOR i IN 0..167 LOOP
    SELECT * INTO v_ohlc FROM prediction.generate_ohlc(175.00 - (i * 0.05), 2.5);
    INSERT INTO prediction.test_price_data (
      organization_slug, scenario_id, symbol, price_timestamp,
      open, high, low, close, volume
    ) VALUES (
      'finance', v_scenario_id, 'T_GOOGL',
      v_base_time + (i * INTERVAL '1 hour'),
      v_ohlc.o, v_ohlc.h, v_ohlc.l, v_ohlc.c,
      (25000000 + (random() * 10000000))::bigint
    )
    ON CONFLICT (organization_slug, symbol, price_timestamp) DO NOTHING;
  END LOOP;

  -- Get crypto scenario
  SELECT id INTO v_scenario_id FROM prediction.test_scenarios WHERE name = 'Crypto Volatility Event' LIMIT 1;

  -- Generate price data for T_BTC
  FOR i IN 0..167 LOOP
    SELECT * INTO v_ohlc FROM prediction.generate_ohlc(95000.00 + (i * 50), 1500.0);
    INSERT INTO prediction.test_price_data (
      organization_slug, scenario_id, symbol, price_timestamp,
      open, high, low, close, volume
    ) VALUES (
      'finance', v_scenario_id, 'T_BTC',
      v_base_time + (i * INTERVAL '1 hour'),
      v_ohlc.o, v_ohlc.h, v_ohlc.l, v_ohlc.c,
      (2000000000 + (random() * 500000000))::bigint
    )
    ON CONFLICT (organization_slug, symbol, price_timestamp) DO NOTHING;
  END LOOP;

  -- Generate price data for T_ETH
  FOR i IN 0..167 LOOP
    SELECT * INTO v_ohlc FROM prediction.generate_ohlc(3200.00 + (i * 8), 80.0);
    INSERT INTO prediction.test_price_data (
      organization_slug, scenario_id, symbol, price_timestamp,
      open, high, low, close, volume
    ) VALUES (
      'finance', v_scenario_id, 'T_ETH',
      v_base_time + (i * INTERVAL '1 hour'),
      v_ohlc.o, v_ohlc.h, v_ohlc.l, v_ohlc.c,
      (800000000 + (random() * 200000000))::bigint
    )
    ON CONFLICT (organization_slug, symbol, price_timestamp) DO NOTHING;
  END LOOP;

  -- Generate price data for T_SOL
  FOR i IN 0..167 LOOP
    SELECT * INTO v_ohlc FROM prediction.generate_ohlc(180.00 + (i * 0.50), 12.0);
    INSERT INTO prediction.test_price_data (
      organization_slug, scenario_id, symbol, price_timestamp,
      open, high, low, close, volume
    ) VALUES (
      'finance', v_scenario_id, 'T_SOL',
      v_base_time + (i * INTERVAL '1 hour'),
      v_ohlc.o, v_ohlc.h, v_ohlc.l, v_ohlc.c,
      (400000000 + (random() * 100000000))::bigint
    )
    ON CONFLICT (organization_slug, symbol, price_timestamp) DO NOTHING;
  END LOOP;

  -- Generate price data for T_AVAX
  FOR i IN 0..167 LOOP
    SELECT * INTO v_ohlc FROM prediction.generate_ohlc(42.00 + (i * 0.08), 3.0);
    INSERT INTO prediction.test_price_data (
      organization_slug, scenario_id, symbol, price_timestamp,
      open, high, low, close, volume
    ) VALUES (
      'finance', v_scenario_id, 'T_AVAX',
      v_base_time + (i * INTERVAL '1 hour'),
      v_ohlc.o, v_ohlc.h, v_ohlc.l, v_ohlc.c,
      (150000000 + (random() * 50000000))::bigint
    )
    ON CONFLICT (organization_slug, symbol, price_timestamp) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Created price data for 8 symbols (168 hours each)';
END $$;

-- Drop the helper function after use
DROP FUNCTION IF EXISTS prediction.generate_ohlc(NUMERIC, NUMERIC);

-- =====================================================================================
-- SECTION 6: SIGNALS AND PREDICTORS
-- =====================================================================================

DO $$
DECLARE
  v_target_id UUID;
  v_source_id UUID;
  v_signal_id UUID;
  v_predictor_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Get T_AAPL target
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_AAPL' LIMIT 1;

  -- Get a stock source (Bloomberg)
  SELECT id INTO v_source_id FROM prediction.sources WHERE name LIKE '%Bloomberg%' LIMIT 1;
  IF v_source_id IS NULL THEN
    -- Create a fallback source for testing
    INSERT INTO prediction.sources (scope_level, domain, name, description, source_type, url, is_active)
    VALUES ('domain', 'stocks', 'Test Stock Source', 'Test source for E2E testing', 'rss', 'https://example.com/feed', true)
    RETURNING id INTO v_source_id;
  END IF;

  -- Signal 1: Bullish AAPL signal
  INSERT INTO prediction.signals (
    target_id, source_id, content, direction, detected_at, url, disposition, urgency,
    evaluation_result, is_test_data, metadata
  ) VALUES (
    v_target_id, v_source_id,
    'Apple reports record iPhone sales in China, beating analyst expectations by 15%',
    'bullish',
    v_now - INTERVAL '2 hours',
    'https://example.com/apple-china-sales',
    'predictor_created',
    'notable',
    '{"confidence": 0.85, "analyst_slug": "fundamental-fred", "reasoning": "Strong sales data supports bullish outlook"}'::jsonb,
    true,
    '{"source_type": "earnings", "reliability": "high"}'::jsonb
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_signal_id;

  -- Create predictor from signal
  IF v_signal_id IS NOT NULL THEN
    INSERT INTO prediction.predictors (
      signal_id, target_id, direction, strength, confidence, reasoning,
      analyst_slug, analyst_assessment, status, expires_at, is_test_data
    ) VALUES (
      v_signal_id, v_target_id, 'bullish', 8, 0.85,
      'iPhone sales beat indicates strong consumer demand and effective China strategy',
      'fundamental-fred',
      '{"score": 0.85, "factors": ["revenue_beat", "china_growth", "guidance"], "recommendation": "strong_buy"}'::jsonb,
      'active',
      v_now + INTERVAL '72 hours',
      true
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Signal 2: Bullish signal from sentiment
  INSERT INTO prediction.signals (
    target_id, source_id, content, direction, detected_at, url, disposition, urgency,
    evaluation_result, is_test_data, metadata
  ) VALUES (
    v_target_id, v_source_id,
    'Social media sentiment turns extremely bullish on Apple ahead of WWDC',
    'bullish',
    v_now - INTERVAL '4 hours',
    'https://example.com/apple-sentiment',
    'predictor_created',
    'routine',
    '{"confidence": 0.72, "analyst_slug": "sentiment-sally", "reasoning": "Social metrics show increased bullish activity"}'::jsonb,
    true,
    '{"source_type": "sentiment", "reliability": "medium"}'::jsonb
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_signal_id;

  IF v_signal_id IS NOT NULL THEN
    INSERT INTO prediction.predictors (
      signal_id, target_id, direction, strength, confidence, reasoning,
      analyst_slug, analyst_assessment, status, expires_at, is_test_data
    ) VALUES (
      v_signal_id, v_target_id, 'bullish', 6, 0.72,
      'Elevated social media activity suggests retail interest building ahead of event',
      'sentiment-sally',
      '{"score": 0.72, "factors": ["twitter_volume", "reddit_mentions", "sentiment_shift"], "recommendation": "buy"}'::jsonb,
      'active',
      v_now + INTERVAL '48 hours',
      true
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Get T_NVDA target
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_NVDA' LIMIT 1;

  -- Signal 3: Strong bullish NVDA
  INSERT INTO prediction.signals (
    target_id, source_id, content, direction, detected_at, url, disposition, urgency,
    evaluation_result, is_test_data, metadata
  ) VALUES (
    v_target_id, v_source_id,
    'NVIDIA H200 demand exceeds supply by 300%, major cloud providers increase orders',
    'bullish',
    v_now - INTERVAL '3 hours',
    'https://example.com/nvidia-demand',
    'predictor_created',
    'urgent',
    '{"confidence": 0.92, "analyst_slug": "fundamental-fred", "reasoning": "Supply constraints indicate exceptional demand"}'::jsonb,
    true,
    '{"source_type": "supply_chain", "reliability": "high"}'::jsonb
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_signal_id;

  IF v_signal_id IS NOT NULL THEN
    INSERT INTO prediction.predictors (
      signal_id, target_id, direction, strength, confidence, reasoning,
      analyst_slug, analyst_assessment, status, expires_at, is_test_data
    ) VALUES (
      v_signal_id, v_target_id, 'bullish', 9, 0.92,
      'Unprecedented demand for H200 GPUs validates AI infrastructure investment thesis',
      'fundamental-fred',
      '{"score": 0.92, "factors": ["demand_supply_gap", "cloud_orders", "pricing_power"], "recommendation": "strong_buy"}'::jsonb,
      'active',
      v_now + INTERVAL '96 hours',
      true
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Get T_BTC target
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_BTC' LIMIT 1;

  -- Get a crypto source
  SELECT id INTO v_source_id FROM prediction.sources WHERE name LIKE '%CoinDesk%' LIMIT 1;
  IF v_source_id IS NULL THEN
    SELECT id INTO v_source_id FROM prediction.sources WHERE domain = 'crypto' LIMIT 1;
  END IF;
  IF v_source_id IS NULL THEN
    INSERT INTO prediction.sources (scope_level, domain, name, description, source_type, url, is_active)
    VALUES ('domain', 'crypto', 'Test Crypto Source', 'Test source for crypto E2E testing', 'rss', 'https://example.com/crypto-feed', true)
    RETURNING id INTO v_source_id;
  END IF;

  -- Signal 4: Bullish BTC
  INSERT INTO prediction.signals (
    target_id, source_id, content, direction, detected_at, url, disposition, urgency,
    evaluation_result, is_test_data, metadata
  ) VALUES (
    v_target_id, v_source_id,
    'BlackRock Bitcoin ETF sees record $2B daily inflow as institutional adoption accelerates',
    'bullish',
    v_now - INTERVAL '2 hours',
    'https://example.com/btc-etf-inflow',
    'predictor_created',
    'urgent',
    '{"confidence": 0.88, "analyst_slug": "on-chain-otto", "reasoning": "Record ETF inflows indicate strong institutional demand"}'::jsonb,
    true,
    '{"source_type": "etf_flow", "reliability": "high"}'::jsonb
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_signal_id;

  IF v_signal_id IS NOT NULL THEN
    INSERT INTO prediction.predictors (
      signal_id, target_id, direction, strength, confidence, reasoning,
      analyst_slug, analyst_assessment, status, expires_at, is_test_data
    ) VALUES (
      v_signal_id, v_target_id, 'bullish', 8, 0.88,
      'Record ETF inflows represent sustained institutional buying pressure',
      'on-chain-otto',
      '{"score": 0.88, "factors": ["etf_inflows", "institutional_adoption", "supply_reduction"], "recommendation": "strong_buy"}'::jsonb,
      'active',
      v_now + INTERVAL '72 hours',
      true
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE 'Created signals and predictors for AAPL, NVDA, BTC';
END $$;

-- =====================================================================================
-- SECTION 7: PREDICTIONS
-- =====================================================================================

DO $$
DECLARE
  v_target_id UUID;
  v_prediction_id UUID;
  v_predictor_ids UUID[];
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Get T_AAPL target and its predictors
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_AAPL' LIMIT 1;
  SELECT array_agg(id) INTO v_predictor_ids FROM prediction.predictors WHERE target_id = v_target_id AND is_test_data = true;

  -- Create AAPL prediction
  INSERT INTO prediction.predictions (
    target_id, direction, confidence, magnitude, reasoning, timeframe_hours,
    predicted_at, expires_at, entry_price, target_price, stop_loss,
    analyst_ensemble, llm_ensemble, status, is_test_data
  ) VALUES (
    v_target_id, 'up', 0.82, 'medium',
    'Multiple bullish signals converge: strong iPhone sales in China, positive sentiment ahead of WWDC, and overall tech sector strength. Technical indicators show breakout potential above key resistance.',
    72,
    v_now - INTERVAL '1 hour',
    v_now + INTERVAL '71 hours',
    178.50, 188.00, 172.00,
    '[
      {"analyst_slug": "fundamental-fred", "direction": "bullish", "confidence": 0.85, "weight": 1.0},
      {"analyst_slug": "sentiment-sally", "direction": "bullish", "confidence": 0.72, "weight": 0.8},
      {"analyst_slug": "technical-tina", "direction": "bullish", "confidence": 0.78, "weight": 1.0}
    ]'::jsonb,
    '[
      {"tier": "gold", "direction": "up", "confidence": 0.85, "model": "claude-sonnet-4-20250514"},
      {"tier": "silver", "direction": "up", "confidence": 0.80, "model": "claude-3-5-haiku-20241022"},
      {"tier": "bronze", "direction": "up", "confidence": 0.78, "model": "claude-3-5-haiku-20241022"}
    ]'::jsonb,
    'active',
    true
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_prediction_id;

  -- Create snapshot for AAPL prediction
  IF v_prediction_id IS NOT NULL THEN
    INSERT INTO prediction.snapshots (
      prediction_id, predictors, rejected_signals, analyst_predictions, llm_ensemble,
      learnings_applied, threshold_evaluation, timeline
    ) VALUES (
      v_prediction_id,
      '["Signal: iPhone sales beat", "Signal: WWDC sentiment surge"]'::jsonb,
      '[]'::jsonb,
      '[
        {"analyst": "fundamental-fred", "assessment": "Strong fundamentals support bullish thesis"},
        {"analyst": "sentiment-sally", "assessment": "Social sentiment turning positive"},
        {"analyst": "technical-tina", "assessment": "Breaking above 50-day MA"}
      ]'::jsonb,
      '[
        {"tier": "gold", "assessment": "High conviction bullish based on multi-factor analysis"},
        {"tier": "silver", "assessment": "Bullish with moderate conviction"},
        {"tier": "bronze", "assessment": "Lean bullish based on recent news"}
      ]'::jsonb,
      '[]'::jsonb,
      '{"min_predictors_met": true, "min_combined_strength_met": true, "direction_consensus_met": true}'::jsonb,
      '[
        {"timestamp": "2025-01-12T10:00:00Z", "event": "Signal detected", "details": "iPhone sales news"},
        {"timestamp": "2025-01-12T10:30:00Z", "event": "Predictor created", "details": "fundamental-fred analysis"},
        {"timestamp": "2025-01-12T11:00:00Z", "event": "Prediction generated", "details": "Threshold met"}
      ]'::jsonb
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Get T_NVDA target
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_NVDA' LIMIT 1;

  -- Create NVDA prediction
  INSERT INTO prediction.predictions (
    target_id, direction, confidence, magnitude, reasoning, timeframe_hours,
    predicted_at, expires_at, entry_price, target_price, stop_loss,
    analyst_ensemble, llm_ensemble, status, is_test_data
  ) VALUES (
    v_target_id, 'up', 0.90, 'large',
    'Exceptional demand signals for H200 GPUs with 300% supply deficit. Cloud provider orders accelerating. AI infrastructure investment cycle in early stages with multi-year growth runway.',
    96,
    v_now - INTERVAL '2 hours',
    v_now + INTERVAL '94 hours',
    875.00, 950.00, 820.00,
    '[
      {"analyst_slug": "fundamental-fred", "direction": "bullish", "confidence": 0.92, "weight": 1.0},
      {"analyst_slug": "technical-tina", "direction": "bullish", "confidence": 0.85, "weight": 1.0}
    ]'::jsonb,
    '[
      {"tier": "gold", "direction": "up", "confidence": 0.92, "model": "claude-sonnet-4-20250514"},
      {"tier": "silver", "direction": "up", "confidence": 0.88, "model": "claude-3-5-haiku-20241022"}
    ]'::jsonb,
    'active',
    true
  )
  ON CONFLICT DO NOTHING;

  -- Get T_BTC target
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_BTC' LIMIT 1;

  -- Create BTC prediction
  INSERT INTO prediction.predictions (
    target_id, direction, confidence, magnitude, reasoning, timeframe_hours,
    predicted_at, expires_at, entry_price, target_price, stop_loss,
    analyst_ensemble, llm_ensemble, status, is_test_data
  ) VALUES (
    v_target_id, 'up', 0.85, 'medium',
    'Record ETF inflows indicate sustained institutional demand. On-chain metrics show accumulation by long-term holders. Post-halving supply dynamics remain bullish.',
    72,
    v_now - INTERVAL '1 hour',
    v_now + INTERVAL '71 hours',
    97500.00, 105000.00, 92000.00,
    '[
      {"analyst_slug": "on-chain-otto", "direction": "bullish", "confidence": 0.88, "weight": 1.0},
      {"analyst_slug": "crypto-sentiment-sam", "direction": "bullish", "confidence": 0.80, "weight": 0.8}
    ]'::jsonb,
    '[
      {"tier": "gold", "direction": "up", "confidence": 0.88, "model": "claude-sonnet-4-20250514"},
      {"tier": "silver", "direction": "up", "confidence": 0.82, "model": "claude-3-5-haiku-20241022"}
    ]'::jsonb,
    'active',
    true
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Created predictions for AAPL, NVDA, BTC';
END $$;

-- =====================================================================================
-- SECTION 8: REVIEW QUEUE
-- =====================================================================================

DO $$
DECLARE
  v_target_id UUID;
  v_source_id UUID;
  v_signal_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Get T_GOOGL target
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_GOOGL' LIMIT 1;
  SELECT id INTO v_source_id FROM prediction.sources WHERE domain = 'stocks' LIMIT 1;

  -- Create a signal that needs review (moderate confidence)
  INSERT INTO prediction.signals (
    target_id, source_id, content, direction, detected_at, url, disposition, urgency,
    evaluation_result, is_test_data, metadata
  ) VALUES (
    v_target_id, v_source_id,
    'Google faces antitrust ruling requiring search data sharing with competitors',
    'bearish',
    v_now - INTERVAL '6 hours',
    'https://example.com/google-antitrust',
    'review_pending',
    NULL,
    '{"confidence": 0.55, "analyst_slug": "fundamental-fred", "reasoning": "Regulatory impact unclear, needs human review"}'::jsonb,
    true,
    '{"source_type": "regulatory", "reliability": "high"}'::jsonb
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_signal_id;

  -- Create review queue item
  IF v_signal_id IS NOT NULL THEN
    INSERT INTO prediction.review_queue (
      signal_id, original_direction, original_confidence, original_reasoning,
      status, is_test_data
    ) VALUES (
      v_signal_id, 'bearish', 0.55,
      'DOJ antitrust ruling may require Google to share search data. Impact on revenue uncertain - could be 10-20% of search revenue at risk, but implementation timeline and appeal options unclear.',
      'pending',
      true
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Create another signal needing review for T_MSFT
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_MSFT' LIMIT 1;

  INSERT INTO prediction.signals (
    target_id, source_id, content, direction, detected_at, url, disposition, urgency,
    evaluation_result, is_test_data, metadata
  ) VALUES (
    v_target_id, v_source_id,
    'Microsoft Azure growth slows to 26% but AI revenue surges 150%',
    'neutral',
    v_now - INTERVAL '5 hours',
    'https://example.com/msft-mixed',
    'review_pending',
    NULL,
    '{"confidence": 0.50, "analyst_slug": "fundamental-fred", "reasoning": "Mixed signals require human judgment"}'::jsonb,
    true,
    '{"source_type": "earnings", "reliability": "high"}'::jsonb
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_signal_id;

  IF v_signal_id IS NOT NULL THEN
    INSERT INTO prediction.review_queue (
      signal_id, original_direction, original_confidence, original_reasoning,
      status, is_test_data
    ) VALUES (
      v_signal_id, 'neutral', 0.50,
      'Azure cloud growth deceleration (26% vs 28% expected) offset by AI revenue surge (150%). Net impact on stock unclear - could go either way depending on market focus.',
      'pending',
      true
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE 'Created 2 review queue items';
END $$;

-- =====================================================================================
-- SECTION 9: LEARNINGS
-- =====================================================================================

DO $$
DECLARE
  v_universe_id UUID;
  v_target_id UUID;
  v_analyst_id UUID;
BEGIN
  -- Get universe and target IDs
  SELECT id INTO v_universe_id FROM prediction.universes WHERE name = 'US Tech Stocks 2025' LIMIT 1;
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_NVDA' LIMIT 1;
  SELECT id INTO v_analyst_id FROM prediction.analysts WHERE slug = 'fundamental-fred' LIMIT 1;

  -- Learning 1: Domain-level rule for tech stocks
  INSERT INTO prediction.learnings (
    scope_level, domain, learning_type, title, description, config,
    source_type, status, times_applied, times_helpful, is_test_data
  ) VALUES (
    'domain', 'stocks', 'rule',
    'Earnings Beat Amplification',
    'When a major tech company beats earnings expectations by >10%, increase bullish confidence by 0.1 for 48 hours',
    '{"trigger_condition": "earnings_beat_pct > 10", "action": "confidence_boost", "boost_amount": 0.1, "duration_hours": 48}'::jsonb,
    'human',
    'active',
    15, 12,
    true
  )
  ON CONFLICT DO NOTHING;

  -- Learning 2: Target-specific pattern for NVDA
  INSERT INTO prediction.learnings (
    scope_level, domain, universe_id, target_id, learning_type, title, description, config,
    source_type, status, times_applied, times_helpful, is_test_data
  ) VALUES (
    'target', 'stocks', v_universe_id, v_target_id, 'pattern',
    'NVDA Supply Constraint Signal',
    'When NVDA reports supply constraints exceeding 200% demand, stock typically rises 8-12% within 2 weeks',
    '{"indicators": ["supply_constraint", "cloud_orders"], "success_rate": 0.83, "typical_move_pct": 10, "timeframe_days": 14}'::jsonb,
    'ai_approved',
    'active',
    8, 7,
    true
  )
  ON CONFLICT DO NOTHING;

  -- Learning 3: Weight adjustment for technical analyst
  INSERT INTO prediction.learnings (
    scope_level, domain, universe_id, analyst_id, learning_type, title, description, config,
    source_type, status, times_applied, times_helpful, is_test_data
  ) VALUES (
    'universe', 'stocks', v_universe_id, v_analyst_id, 'weight_adjustment',
    'Reduce Technical Weight During Earnings',
    'Technical analysis less reliable during earnings weeks - reduce weight by 0.2',
    '{"analyst_slug": "technical-tina", "adjustment": -0.2, "condition": "earnings_week"}'::jsonb,
    'human',
    'active',
    20, 16,
    true
  )
  ON CONFLICT DO NOTHING;

  -- Learning 4: Runner-level threshold
  INSERT INTO prediction.learnings (
    scope_level, learning_type, title, description, config,
    source_type, status, times_applied, times_helpful, is_test_data
  ) VALUES (
    'runner', 'threshold',
    'Increase Min Predictors During High Volatility',
    'When VIX > 25, require 4 predictors instead of 3 for prediction generation',
    '{"condition": "vix > 25", "min_predictors": 4, "default_min_predictors": 3}'::jsonb,
    'human',
    'active',
    5, 4,
    true
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Created 4 learnings';
END $$;

-- =====================================================================================
-- SECTION 10: LEARNING QUEUE
-- =====================================================================================

DO $$
DECLARE
  v_universe_id UUID;
  v_target_id UUID;
BEGIN
  SELECT id INTO v_universe_id FROM prediction.universes WHERE name = 'US Tech Stocks 2025' LIMIT 1;
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_AAPL' LIMIT 1;

  -- Learning suggestion 1: From AI analysis
  INSERT INTO prediction.learning_queue (
    suggested_scope_level, suggested_domain, suggested_universe_id, suggested_target_id,
    suggested_learning_type, suggested_title, suggested_description, suggested_config,
    ai_reasoning, ai_confidence, status, is_test_data
  ) VALUES (
    'target', 'stocks', v_universe_id, v_target_id,
    'pattern',
    'AAPL China Sales Correlation',
    'Apple stock shows 85% correlation with China iPhone shipment data releases',
    '{"indicators": ["china_shipments", "apple_guidance"], "correlation": 0.85, "lead_time_days": 3}'::jsonb,
    'Analysis of 24 months of data shows consistent pattern where positive China shipment reports precede AAPL price increases. Correlation is strongest when reports exceed consensus.',
    0.78,
    'pending',
    true
  )
  ON CONFLICT DO NOTHING;

  -- Learning suggestion 2: Threshold adjustment
  INSERT INTO prediction.learning_queue (
    suggested_scope_level, suggested_domain,
    suggested_learning_type, suggested_title, suggested_description, suggested_config,
    ai_reasoning, ai_confidence, status, is_test_data
  ) VALUES (
    'domain', 'stocks',
    'threshold',
    'Lower Consensus Threshold for Mega-Cap',
    'For mega-cap stocks (>$1T market cap), lower direction consensus requirement to 0.65',
    '{"condition": "market_cap > 1000000000000", "min_direction_consensus": 0.65, "default_consensus": 0.70}'::jsonb,
    'Mega-cap stocks show more predictable behavior with slightly lower consensus. Backtesting shows 12% improvement in prediction accuracy with adjusted threshold.',
    0.72,
    'pending',
    true
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Created 2 learning queue items';
END $$;

-- =====================================================================================
-- SECTION 11: MISSED OPPORTUNITIES
-- =====================================================================================

DO $$
DECLARE
  v_target_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Get T_SOL target
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_SOL' LIMIT 1;

  -- Missed opportunity 1: SOL breakout
  INSERT INTO prediction.missed_opportunities (
    target_id, move_type, move_start_at, move_end_at, start_value, end_value, percent_change,
    detected_at, detection_method, analysis_status,
    discovered_drivers, signals_we_had, signals_we_missed, source_gaps, suggested_learnings,
    is_test_data
  ) VALUES (
    v_target_id,
    'significant_up',
    v_now - INTERVAL '5 days',
    v_now - INTERVAL '3 days',
    155.00, 195.00, 25.81,
    v_now - INTERVAL '2 days',
    'threshold',
    'complete',
    '[
      {"driver": "Meme coin activity surge on Solana", "confidence": 0.85},
      {"driver": "Jupiter DEX token launch announcement", "confidence": 0.75},
      {"driver": "Retail FOMO from social media", "confidence": 0.70}
    ]'::jsonb,
    '[
      {"signal": "DEX volume increase", "why_not_acted": "Below threshold", "strength": 0.55}
    ]'::jsonb,
    '[
      {"signal": "Jupiter insider buying", "source": "On-chain analytics"},
      {"signal": "Influencer coordination", "source": "Twitter/X"}
    ]'::jsonb,
    '[
      {"gap": "Real-time DEX analytics feed", "priority": "high"},
      {"gap": "Crypto Twitter sentiment tracker", "priority": "medium"}
    ]'::jsonb,
    '[
      {"learning": "Lower threshold for Solana DEX signals", "confidence": 0.75},
      {"learning": "Add memecoin activity as trigger", "confidence": 0.70}
    ]'::jsonb,
    true
  )
  ON CONFLICT DO NOTHING;

  -- Get T_GOOGL target
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_GOOGL' LIMIT 1;

  -- Missed opportunity 2: GOOGL drop
  INSERT INTO prediction.missed_opportunities (
    target_id, move_type, move_start_at, move_end_at, start_value, end_value, percent_change,
    detected_at, detection_method, analysis_status,
    discovered_drivers, signals_we_had, signals_we_missed, source_gaps, suggested_learnings,
    is_test_data
  ) VALUES (
    v_target_id,
    'significant_down',
    v_now - INTERVAL '10 days',
    v_now - INTERVAL '8 days',
    182.00, 168.00, -7.69,
    v_now - INTERVAL '7 days',
    'threshold',
    'complete',
    '[
      {"driver": "DOJ antitrust ruling preview leak", "confidence": 0.90},
      {"driver": "EU competition fine speculation", "confidence": 0.60}
    ]'::jsonb,
    '[
      {"signal": "Unusual options activity", "why_not_acted": "Flagged for review, not acted on in time", "strength": 0.72}
    ]'::jsonb,
    '[
      {"signal": "DC insider reports", "source": "Political intelligence"},
      {"signal": "Court document analysis", "source": "Legal filings tracker"}
    ]'::jsonb,
    '[
      {"gap": "Regulatory intelligence feed", "priority": "high"},
      {"gap": "Options flow analytics", "priority": "high"}
    ]'::jsonb,
    '[
      {"learning": "Escalate unusual options activity immediately", "confidence": 0.85},
      {"learning": "Add regulatory calendar tracking", "confidence": 0.80}
    ]'::jsonb,
    true
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Created 2 missed opportunities';
END $$;

-- =====================================================================================
-- SECTION 12: EVALUATIONS
-- =====================================================================================

DO $$
DECLARE
  v_prediction_id UUID;
  v_target_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Create a resolved prediction for evaluation
  SELECT id INTO v_target_id FROM prediction.targets WHERE symbol = 'T_AAPL' LIMIT 1;

  -- First create a historical resolved prediction
  INSERT INTO prediction.predictions (
    target_id, direction, confidence, magnitude, reasoning, timeframe_hours,
    predicted_at, expires_at, entry_price, target_price, stop_loss,
    analyst_ensemble, llm_ensemble, status, outcome_value, outcome_captured_at, resolution_notes,
    is_test_data
  ) VALUES (
    v_target_id, 'up', 0.78, 'small',
    'Positive iPhone 15 reception and strong services growth support near-term upside.',
    48,
    v_now - INTERVAL '4 days',
    v_now - INTERVAL '2 days',
    172.00, 180.00, 168.00,
    '[
      {"analyst_slug": "fundamental-fred", "direction": "bullish", "confidence": 0.80, "weight": 1.0},
      {"analyst_slug": "technical-tina", "direction": "bullish", "confidence": 0.75, "weight": 1.0}
    ]'::jsonb,
    '[
      {"tier": "gold", "direction": "up", "confidence": 0.78, "model": "claude-sonnet-4-20250514"}
    ]'::jsonb,
    'resolved',
    178.50,
    v_now - INTERVAL '2 days',
    'Prediction correct. Price moved from $172 to $178.50 (3.8% gain). Target partially reached.',
    true
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_prediction_id;

  -- Create evaluation for the prediction
  IF v_prediction_id IS NOT NULL THEN
    INSERT INTO prediction.evaluations (
      prediction_id, direction_correct, direction_score, magnitude_accuracy, actual_magnitude,
      timing_score, analyst_scores, llm_tier_scores, overall_score, analysis, suggested_learnings,
      is_test_data
    ) VALUES (
      v_prediction_id,
      true, 0.85,
      0.70, 'small',
      0.90,
      '{
        "fundamental-fred": {"direction_correct": true, "score": 0.88},
        "technical-tina": {"direction_correct": true, "score": 0.82}
      }'::jsonb,
      '{"gold": 0.85, "silver": 0.80}'::jsonb,
      0.83,
      'Prediction was correct on direction with good timing. Entry at $172, target was $180, actual reached $178.50. The 3.8% gain represents successful execution, though magnitude was slightly less than predicted large move.',
      '[
        {"learning": "iPhone launch reactions tend to be front-loaded", "confidence": 0.72}
      ]'::jsonb,
      true
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE 'Created evaluation for historical AAPL prediction';
END $$;

-- =====================================================================================
-- VERIFICATION
-- =====================================================================================

DO $$
BEGIN
  RAISE NOTICE '========== SEED DATA VERIFICATION ==========';
  RAISE NOTICE 'Universes: %', (SELECT COUNT(*) FROM prediction.universes WHERE organization_slug = 'finance');
  RAISE NOTICE 'Targets: %', (SELECT COUNT(*) FROM prediction.targets WHERE symbol LIKE 'T_%');
  RAISE NOTICE 'Test Scenarios: %', (SELECT COUNT(*) FROM prediction.test_scenarios WHERE organization_slug = 'finance');
  RAISE NOTICE 'Test Articles: %', (SELECT COUNT(*) FROM prediction.test_articles WHERE organization_slug = 'finance');
  RAISE NOTICE 'Test Price Data: %', (SELECT COUNT(*) FROM prediction.test_price_data WHERE organization_slug = 'finance');
  RAISE NOTICE 'Signals: %', (SELECT COUNT(*) FROM prediction.signals WHERE is_test_data = true);
  RAISE NOTICE 'Predictors: %', (SELECT COUNT(*) FROM prediction.predictors WHERE is_test_data = true);
  RAISE NOTICE 'Predictions: %', (SELECT COUNT(*) FROM prediction.predictions WHERE is_test_data = true);
  RAISE NOTICE 'Review Queue: %', (SELECT COUNT(*) FROM prediction.review_queue WHERE is_test_data = true);
  RAISE NOTICE 'Learnings: %', (SELECT COUNT(*) FROM prediction.learnings WHERE is_test_data = true);
  RAISE NOTICE 'Learning Queue: %', (SELECT COUNT(*) FROM prediction.learning_queue WHERE is_test_data = true);
  RAISE NOTICE 'Missed Opportunities: %', (SELECT COUNT(*) FROM prediction.missed_opportunities WHERE is_test_data = true);
  RAISE NOTICE 'Evaluations: %', (SELECT COUNT(*) FROM prediction.evaluations WHERE is_test_data = true);
  RAISE NOTICE '============================================';
END $$;

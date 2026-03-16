-- =====================================================================================
-- CLEANUP TEST SCENARIOS - Remove Duplicates & Generate Real Test Data
-- =====================================================================================
-- Description: Cleans up duplicate test scenarios and populates remaining scenarios
-- with realistic test data for the Test Lab feature.
-- =====================================================================================

-- =====================================================================================
-- STEP 1: Identify the oldest (keeper) scenario for each duplicate group
-- =====================================================================================

DO $$
DECLARE
  v_bull_market_id UUID;
  v_q4_earnings_id UUID;
  v_crypto_volatility_id UUID;
  v_mixed_signal_id UUID;
  v_deleted_count INTEGER;
BEGIN
  -- Get the oldest (keeper) IDs for each scenario type
  SELECT id INTO v_bull_market_id FROM prediction.test_scenarios
    WHERE name = 'Bull Market Tech Rally' ORDER BY created_at ASC LIMIT 1;

  SELECT id INTO v_q4_earnings_id FROM prediction.test_scenarios
    WHERE name = 'Q4 Earnings Season' ORDER BY created_at ASC LIMIT 1;

  SELECT id INTO v_crypto_volatility_id FROM prediction.test_scenarios
    WHERE name = 'Crypto Volatility Event' ORDER BY created_at ASC LIMIT 1;

  SELECT id INTO v_mixed_signal_id FROM prediction.test_scenarios
    WHERE name = 'Mixed Signal Analysis' ORDER BY created_at ASC LIMIT 1;

  RAISE NOTICE 'Keeper IDs:';
  RAISE NOTICE '  Bull Market Tech Rally: %', v_bull_market_id;
  RAISE NOTICE '  Q4 Earnings Season: %', v_q4_earnings_id;
  RAISE NOTICE '  Crypto Volatility Event: %', v_crypto_volatility_id;
  RAISE NOTICE '  Mixed Signal Analysis: %', v_mixed_signal_id;

  -- =====================================================================================
  -- STEP 2: Delete duplicates (keep oldest)
  -- =====================================================================================

  -- Delete duplicate Bull Market scenarios
  DELETE FROM prediction.test_scenarios
    WHERE name = 'Bull Market Tech Rally' AND id != v_bull_market_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % duplicate Bull Market Tech Rally scenarios', v_deleted_count;

  -- Delete duplicate Q4 Earnings scenarios
  DELETE FROM prediction.test_scenarios
    WHERE name = 'Q4 Earnings Season' AND id != v_q4_earnings_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % duplicate Q4 Earnings Season scenarios', v_deleted_count;

  -- Delete duplicate Crypto Volatility scenarios
  DELETE FROM prediction.test_scenarios
    WHERE name = 'Crypto Volatility Event' AND id != v_crypto_volatility_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % duplicate Crypto Volatility Event scenarios', v_deleted_count;

  -- Delete duplicate Mixed Signal scenarios
  DELETE FROM prediction.test_scenarios
    WHERE name = 'Mixed Signal Analysis' AND id != v_mixed_signal_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % duplicate Mixed Signal Analysis scenarios', v_deleted_count;

  -- =====================================================================================
  -- STEP 3: Delete auto-generated test scenarios (with timestamps in name)
  -- =====================================================================================

  DELETE FROM prediction.test_scenarios
    WHERE name LIKE '%Test Scenario %'
      OR name LIKE 'Cleanup Test%'
      OR name LIKE 'E2E Test%'
      OR name LIKE 'Pipeline Test%'
      OR name LIKE 'Run Test%'
      OR name LIKE 'Variation Source%';
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % auto-generated test scenarios', v_deleted_count;

END $$;

-- =====================================================================================
-- STEP 4: Update scenario descriptions with realistic details
-- =====================================================================================

UPDATE prediction.test_scenarios
SET description = 'A bullish market scenario simulating strong tech sector momentum with positive earnings surprises, increased institutional buying, and favorable macro conditions. Tests prediction accuracy during upward trending markets.',
    config = jsonb_build_object(
      'market_condition', 'bullish',
      'sector_focus', 'technology',
      'volatility_level', 'low',
      'duration_days', 30,
      'expected_move', '+15%',
      'key_catalysts', ARRAY['earnings_beats', 'ai_expansion', 'rate_cuts']
    )
WHERE name = 'Bull Market Tech Rally';

UPDATE prediction.test_scenarios
SET description = 'Tests prediction system during Q4 earnings season when companies report quarterly results. High signal volume with mixed sentiment as some companies beat and others miss estimates.',
    config = jsonb_build_object(
      'market_condition', 'mixed',
      'sector_focus', 'diversified',
      'volatility_level', 'medium',
      'duration_days', 45,
      'expected_move', 'varied',
      'key_catalysts', ARRAY['earnings_reports', 'guidance_updates', 'analyst_revisions']
    )
WHERE name = 'Q4 Earnings Season';

UPDATE prediction.test_scenarios
SET description = 'High volatility crypto scenario simulating major market events like ETF approvals, regulatory news, or whale movements. Tests system resilience and prediction accuracy during rapid price swings.',
    config = jsonb_build_object(
      'market_condition', 'volatile',
      'sector_focus', 'cryptocurrency',
      'volatility_level', 'extreme',
      'duration_days', 14,
      'expected_move', '+/-30%',
      'key_catalysts', ARRAY['etf_news', 'regulatory_action', 'whale_activity', 'exchange_events']
    )
WHERE name = 'Crypto Volatility Event';

UPDATE prediction.test_scenarios
SET description = 'Challenging scenario with conflicting signals from different sources. Tests how well the prediction system handles uncertainty and mixed analyst opinions.',
    config = jsonb_build_object(
      'market_condition', 'uncertain',
      'sector_focus', 'cross_sector',
      'volatility_level', 'medium',
      'duration_days', 21,
      'expected_move', 'unclear',
      'key_catalysts', ARRAY['conflicting_data', 'sector_rotation', 'macro_uncertainty']
    )
WHERE name = 'Mixed Signal Analysis';

-- =====================================================================================
-- STEP 5: Generate realistic test articles for each scenario
-- DISABLED: test_articles table schema changed - columns renamed
-- =====================================================================================

-- NOTE: This step is commented out because the test_articles table schema
-- has different column names than what this migration was written for:
-- - symbol -> target_symbols (array)
-- - headline -> title
-- - sentiment -> sentiment_expected
-- - source -> source_name
-- - is_test_data -> is_synthetic
-- Also requires organization_slug which is missing.

/*
DO $$
DECLARE
  v_bull_market_id UUID;
  v_q4_earnings_id UUID;
  v_crypto_volatility_id UUID;
  v_mixed_signal_id UUID;
BEGIN
  -- Get scenario IDs
  SELECT id INTO v_bull_market_id FROM prediction.test_scenarios WHERE name = 'Bull Market Tech Rally' LIMIT 1;
  SELECT id INTO v_q4_earnings_id FROM prediction.test_scenarios WHERE name = 'Q4 Earnings Season' LIMIT 1;
  SELECT id INTO v_crypto_volatility_id FROM prediction.test_scenarios WHERE name = 'Crypto Volatility Event' LIMIT 1;
  SELECT id INTO v_mixed_signal_id FROM prediction.test_scenarios WHERE name = 'Mixed Signal Analysis' LIMIT 1;

  -- Clear existing test articles for these scenarios to avoid duplicates
  DELETE FROM prediction.test_articles WHERE scenario_id IN (v_bull_market_id, v_q4_earnings_id, v_crypto_volatility_id, v_mixed_signal_id);

  -- =====================================================================================
  -- Bull Market Tech Rally Articles
  -- =====================================================================================

  INSERT INTO prediction.test_articles (scenario_id, symbol, headline, content, sentiment, source, published_at, is_test_data) VALUES
  (v_bull_market_id, 'AAPL', 'Apple Reports Record iPhone Sales Amid AI Integration Push',
   'Apple Inc. reported record-breaking iPhone sales for the quarter, driven by strong demand for AI-enhanced features in the iPhone 16 lineup. The company''s AI strategy is showing early signs of success with Vision Pro sales exceeding expectations. Wall Street analysts are raising price targets citing sustainable growth trajectory.',
   'bullish', 'Bloomberg', NOW() - INTERVAL '5 days', true),

  (v_bull_market_id, 'NVDA', 'NVIDIA H200 Demand Outpaces Supply as AI Spending Accelerates',
   'NVIDIA Corporation continues to see unprecedented demand for its H200 GPU chips as major cloud providers race to build AI infrastructure. The company has secured multi-billion dollar orders from Microsoft, Google, and Amazon. CEO Jensen Huang stated that AI infrastructure spending is just beginning.',
   'bullish', 'Reuters', NOW() - INTERVAL '4 days', true),

  (v_bull_market_id, 'MSFT', 'Microsoft Azure AI Revenue Grows 50% as Enterprise Adoption Soars',
   'Microsoft''s cloud computing division reported 50% year-over-year growth in AI-related revenue as enterprises accelerate digital transformation initiatives. Azure''s AI services now account for 15% of total cloud revenue, up from 8% last year. Copilot enterprise adoption continues to exceed internal projections.',
   'bullish', 'CNBC', NOW() - INTERVAL '3 days', true),

  (v_bull_market_id, 'GOOGL', 'Google DeepMind Breakthrough Drives Alphabet Stock to New Highs',
   'Alphabet shares reached all-time highs following DeepMind''s announcement of a major breakthrough in AI reasoning capabilities. The advancement is expected to significantly enhance Google Search and YouTube recommendation algorithms. Analysts project 20% upside from current levels.',
   'bullish', 'Wall Street Journal', NOW() - INTERVAL '2 days', true),

  (v_bull_market_id, 'META', 'Meta Reality Labs Losses Narrow as Quest 3 Sales Exceed Forecasts',
   'Meta Platforms reported narrowing losses in its Reality Labs division as Quest 3 headset sales outperformed expectations. The company''s AI investments are showing returns with Llama models gaining enterprise traction. Advertising revenue growth also accelerated driven by AI-powered targeting improvements.',
   'bullish', 'Financial Times', NOW() - INTERVAL '1 day', true);

  -- =====================================================================================
  -- Q4 Earnings Season Articles
  -- =====================================================================================

  INSERT INTO prediction.test_articles (scenario_id, symbol, headline, content, sentiment, source, published_at, is_test_data) VALUES
  (v_q4_earnings_id, 'AAPL', 'Apple Q4 Earnings Beat Expectations, China Sales Show Recovery',
   'Apple Inc. reported Q4 earnings per share of $2.18, beating analyst estimates of $2.10. Revenue came in at $94.9 billion, above the $94.3 billion consensus. Services revenue hit a new record while China sales showed unexpected strength after promotional pricing.',
   'bullish', 'Bloomberg', NOW() - INTERVAL '10 days', true),

  (v_q4_earnings_id, 'AMZN', 'Amazon Q4 Results Mixed: AWS Beats, Retail Margins Compress',
   'Amazon reported mixed Q4 results with AWS revenue growing 18% year-over-year but retail margins coming under pressure from increased competition. The company guided cautiously for Q1 citing consumer spending uncertainty. Shares fell 3% in after-hours trading.',
   'mixed', 'Reuters', NOW() - INTERVAL '9 days', true),

  (v_q4_earnings_id, 'TSLA', 'Tesla Misses Q4 Delivery Estimates, Margin Pressure Continues',
   'Tesla Inc. delivered 484,500 vehicles in Q4, below the 500,000 estimate. Automotive gross margins fell to 17.5% from 19.8% in the prior quarter due to price cuts and incentives. The company maintained its 2M unit delivery target for next year.',
   'bearish', 'CNBC', NOW() - INTERVAL '8 days', true),

  (v_q4_earnings_id, 'JPM', 'JPMorgan Chase Posts Record Annual Profit Amid Interest Rate Tailwinds',
   'JPMorgan Chase reported Q4 net income of $12.1 billion, bringing full-year profit to a record $50.1 billion. CEO Jamie Dimon warned about geopolitical risks but expressed confidence in U.S. economic resilience. The bank increased its dividend by 9%.',
   'bullish', 'Wall Street Journal', NOW() - INTERVAL '7 days', true),

  (v_q4_earnings_id, 'INTC', 'Intel Q4 Revenue Misses as PC Market Recovery Slower Than Expected',
   'Intel Corporation reported Q4 revenue of $14.2 billion, missing the $14.9 billion estimate. The company''s data center business showed weakness while the foundry turnaround remains a work in progress. Shares dropped 8% after guidance disappointed.',
   'bearish', 'Financial Times', NOW() - INTERVAL '6 days', true);

  -- =====================================================================================
  -- Crypto Volatility Event Articles
  -- =====================================================================================

  INSERT INTO prediction.test_articles (scenario_id, symbol, headline, content, sentiment, source, published_at, is_test_data) VALUES
  (v_crypto_volatility_id, 'BTC', 'Bitcoin Surges Past $100K After BlackRock ETF Sees Record Inflows',
   'Bitcoin soared past $100,000 for the first time as BlackRock''s iShares Bitcoin Trust recorded $1.2 billion in daily inflows, the largest single-day inflow for any Bitcoin ETF. Institutional adoption is accelerating with pension funds showing increased interest.',
   'bullish', 'CoinDesk', NOW() - INTERVAL '3 days', true),

  (v_crypto_volatility_id, 'BTC', 'Massive Bitcoin Whale Moves 15,000 BTC to Exchange Sparking Sell-Off Fears',
   'On-chain data shows a dormant whale address transferring 15,000 BTC worth approximately $1.5 billion to Coinbase, triggering concerns of an impending sell-off. Bitcoin dropped 5% within hours of the transfer as traders positioned for potential downside.',
   'bearish', 'The Block', NOW() - INTERVAL '2 days', true),

  (v_crypto_volatility_id, 'ETH', 'Ethereum Staking Withdrawals Spike as Validators Lock in Profits',
   'Ethereum saw its largest weekly staking withdrawals in six months as validators moved to lock in gains from the recent rally. The ETH/BTC ratio weakened to 0.045, the lowest level since 2021. Layer 2 activity remained robust despite base layer uncertainty.',
   'mixed', 'Decrypt', NOW() - INTERVAL '1 day', true),

  (v_crypto_volatility_id, 'BTC', 'SEC Commissioner Signals Potential Bitcoin ETF Options Approval',
   'SEC Commissioner Hester Peirce indicated the agency is nearing approval for options trading on spot Bitcoin ETFs, potentially opening the door for institutional hedging strategies. Market makers anticipate this could significantly increase market depth and reduce volatility over time.',
   'bullish', 'Bloomberg Crypto', NOW() - INTERVAL '12 hours', true),

  (v_crypto_volatility_id, 'SOL', 'Solana Network Experiences 4-Hour Outage Amid Record Transaction Volume',
   'The Solana blockchain experienced a 4-hour outage due to a consensus bug triggered by record transaction volumes. While developers quickly released a fix, the incident reignited concerns about the network''s reliability. SOL dropped 12% before recovering half the losses.',
   'bearish', 'The Defiant', NOW() - INTERVAL '6 hours', true);

  -- =====================================================================================
  -- Mixed Signal Analysis Articles
  -- =====================================================================================

  INSERT INTO prediction.test_articles (scenario_id, symbol, headline, content, sentiment, source, published_at, is_test_data) VALUES
  (v_mixed_signal_id, 'AAPL', 'Analysts Split on Apple: Bulls See AI Opportunity, Bears Cite iPhone Saturation',
   'Wall Street remains divided on Apple with Morgan Stanley raising its target to $250 citing AI monetization potential while Goldman Sachs downgraded to Sell citing iPhone market saturation in developed markets. The stock has been range-bound for three months.',
   'mixed', 'MarketWatch', NOW() - INTERVAL '4 days', true),

  (v_mixed_signal_id, 'NVDA', 'NVIDIA: Export Restrictions vs Domestic Demand Creates Uncertainty',
   'NVIDIA faces a complex outlook as new U.S. export restrictions to China could reduce revenue by $3B annually while domestic AI demand continues to surge. Management stated they expect minimal impact from restrictions but analysts remain skeptical about growth trajectory.',
   'mixed', 'Barron''s', NOW() - INTERVAL '3 days', true),

  (v_mixed_signal_id, 'AMZN', 'Amazon: AWS Strength Offset by Retail Margin Questions',
   'Amazon presents a mixed investment case with AWS revenue acceleration offset by questions about retail profitability. Bulls point to improving cloud margins while bears worry about competitive pressure from Temu and Shein in e-commerce.',
   'mixed', 'Seeking Alpha', NOW() - INTERVAL '2 days', true),

  (v_mixed_signal_id, 'GOOGL', 'Google''s AI Lead Questioned as ChatGPT Maintains Search Momentum',
   'Alphabet faces an uncertain competitive position as OpenAI''s ChatGPT continues to gain ground in search queries. While Gemini shows promise, some analysts question whether Google can maintain its search dominance. Others argue Google''s distribution advantage remains unassailable.',
   'mixed', 'The Information', NOW() - INTERVAL '1 day', true),

  (v_mixed_signal_id, 'MSFT', 'Microsoft Copilot Adoption: Enterprise Interest High But Revenue Impact Unclear',
   'Microsoft''s Copilot AI assistant is seeing strong enterprise trial adoption but questions remain about conversion rates and willingness to pay the $30/user/month premium. Some enterprises report productivity gains while others cite integration challenges.',
   'mixed', 'TechCrunch', NOW() - INTERVAL '12 hours', true);

  RAISE NOTICE 'Created test articles for all 4 scenarios';
END $$;
*/

-- =====================================================================================
-- STEP 6: Generate realistic price data for each scenario
-- DISABLED: test_price_data table schema changed - columns renamed
-- =====================================================================================

-- NOTE: This step is commented out because the test_price_data table schema
-- has different column names than what this migration was written for:
-- - timestamp -> price_timestamp
-- - symbol must start with T_ prefix
-- - is_test_data doesn't exist
-- Also requires organization_slug which is missing.

/*
DO $$
DECLARE
  v_bull_market_id UUID;
  v_q4_earnings_id UUID;
  v_crypto_volatility_id UUID;
  v_mixed_signal_id UUID;
  v_day INTEGER;
  v_base_price DECIMAL;
  v_price DECIMAL;
BEGIN
  -- Get scenario IDs
  SELECT id INTO v_bull_market_id FROM prediction.test_scenarios WHERE name = 'Bull Market Tech Rally' LIMIT 1;
  SELECT id INTO v_q4_earnings_id FROM prediction.test_scenarios WHERE name = 'Q4 Earnings Season' LIMIT 1;
  SELECT id INTO v_crypto_volatility_id FROM prediction.test_scenarios WHERE name = 'Crypto Volatility Event' LIMIT 1;
  SELECT id INTO v_mixed_signal_id FROM prediction.test_scenarios WHERE name = 'Mixed Signal Analysis' LIMIT 1;

  -- Clear existing price data for these scenarios
  DELETE FROM prediction.test_price_data WHERE scenario_id IN (v_bull_market_id, v_q4_earnings_id, v_crypto_volatility_id, v_mixed_signal_id);

  -- =====================================================================================
  -- Bull Market Tech Rally Price Data (trending up steadily)
  -- =====================================================================================
  v_base_price := 175.00;
  FOR v_day IN 0..30 LOOP
    -- AAPL steadily rising from $175 to ~$200
    v_price := v_base_price + (v_day * 0.85) + (random() * 2 - 1);
    INSERT INTO prediction.test_price_data (scenario_id, symbol, timestamp, open, high, low, close, volume, is_test_data)
    VALUES (v_bull_market_id, 'AAPL', NOW() - (30 - v_day) * INTERVAL '1 day',
            v_price - 1, v_price + 2, v_price - 2, v_price, 45000000 + floor(random() * 10000000), true);
  END LOOP;

  v_base_price := 480.00;
  FOR v_day IN 0..30 LOOP
    -- NVDA rising faster from $480 to ~$600
    v_price := v_base_price + (v_day * 4.0) + (random() * 5 - 2.5);
    INSERT INTO prediction.test_price_data (scenario_id, symbol, timestamp, open, high, low, close, volume, is_test_data)
    VALUES (v_bull_market_id, 'NVDA', NOW() - (30 - v_day) * INTERVAL '1 day',
            v_price - 3, v_price + 5, v_price - 4, v_price, 30000000 + floor(random() * 15000000), true);
  END LOOP;

  -- =====================================================================================
  -- Q4 Earnings Season Price Data (volatile around earnings dates)
  -- =====================================================================================
  v_base_price := 180.00;
  FOR v_day IN 0..45 LOOP
    -- AAPL with earnings pop around day 20
    IF v_day < 20 THEN
      v_price := v_base_price + (random() * 4 - 2);
    ELSIF v_day = 20 THEN
      v_price := v_base_price + 8; -- Earnings beat
    ELSE
      v_price := v_base_price + 8 + (random() * 3 - 1.5);
    END IF;
    INSERT INTO prediction.test_price_data (scenario_id, symbol, timestamp, open, high, low, close, volume, is_test_data)
    VALUES (v_q4_earnings_id, 'AAPL', NOW() - (45 - v_day) * INTERVAL '1 day',
            v_price - 1, v_price + 2, v_price - 2, v_price, 55000000 + floor(random() * 20000000), true);
  END LOOP;

  v_base_price := 260.00;
  FOR v_day IN 0..45 LOOP
    -- TSLA with earnings miss around day 15
    IF v_day < 15 THEN
      v_price := v_base_price + (random() * 6 - 3);
    ELSIF v_day = 15 THEN
      v_price := v_base_price - 20; -- Earnings miss
    ELSE
      v_price := v_base_price - 20 + (v_day - 15) * 0.3 + (random() * 4 - 2); -- Slow recovery
    END IF;
    INSERT INTO prediction.test_price_data (scenario_id, symbol, timestamp, open, high, low, close, volume, is_test_data)
    VALUES (v_q4_earnings_id, 'TSLA', NOW() - (45 - v_day) * INTERVAL '1 day',
            v_price - 3, v_price + 4, v_price - 5, v_price, 85000000 + floor(random() * 30000000), true);
  END LOOP;

  -- =====================================================================================
  -- Crypto Volatility Event Price Data (extreme swings)
  -- =====================================================================================
  v_base_price := 85000.00;
  FOR v_day IN 0..14 LOOP
    -- BTC with ETF pump and whale dump
    IF v_day < 5 THEN
      v_price := v_base_price + (v_day * 3500) + (random() * 2000 - 1000); -- Rally to $100K
    ELSIF v_day = 5 THEN
      v_price := 102000 + (random() * 1000); -- ATH
    ELSIF v_day < 8 THEN
      v_price := 102000 - ((v_day - 5) * 4000) + (random() * 2000 - 1000); -- Whale dump
    ELSE
      v_price := 90000 + (random() * 3000 - 1500); -- Consolidation
    END IF;
    INSERT INTO prediction.test_price_data (scenario_id, symbol, timestamp, open, high, low, close, volume, is_test_data)
    VALUES (v_crypto_volatility_id, 'BTC', NOW() - (14 - v_day) * INTERVAL '1 day',
            v_price - 1500, v_price + 2000, v_price - 2500, v_price, 25000000000 + floor(random() * 10000000000), true);
  END LOOP;

  v_base_price := 3200.00;
  FOR v_day IN 0..14 LOOP
    -- ETH following BTC but with more volatility
    IF v_day < 5 THEN
      v_price := v_base_price + (v_day * 150) + (random() * 100 - 50);
    ELSIF v_day = 5 THEN
      v_price := 3950 + (random() * 50);
    ELSIF v_day < 8 THEN
      v_price := 3950 - ((v_day - 5) * 250) + (random() * 100 - 50);
    ELSE
      v_price := 3200 + (random() * 200 - 100);
    END IF;
    INSERT INTO prediction.test_price_data (scenario_id, symbol, timestamp, open, high, low, close, volume, is_test_data)
    VALUES (v_crypto_volatility_id, 'ETH', NOW() - (14 - v_day) * INTERVAL '1 day',
            v_price - 80, v_price + 100, v_price - 120, v_price, 12000000000 + floor(random() * 5000000000), true);
  END LOOP;

  -- =====================================================================================
  -- Mixed Signal Analysis Price Data (choppy, no clear trend)
  -- =====================================================================================
  v_base_price := 185.00;
  FOR v_day IN 0..21 LOOP
    -- AAPL range-bound between 180-190
    v_price := v_base_price + (sin(v_day * 0.5) * 5) + (random() * 4 - 2);
    INSERT INTO prediction.test_price_data (scenario_id, symbol, timestamp, open, high, low, close, volume, is_test_data)
    VALUES (v_mixed_signal_id, 'AAPL', NOW() - (21 - v_day) * INTERVAL '1 day',
            v_price - 1.5, v_price + 2, v_price - 2, v_price, 40000000 + floor(random() * 15000000), true);
  END LOOP;

  v_base_price := 520.00;
  FOR v_day IN 0..21 LOOP
    -- NVDA choppy with no clear direction
    v_price := v_base_price + (sin(v_day * 0.7) * 20) + (random() * 10 - 5);
    INSERT INTO prediction.test_price_data (scenario_id, symbol, timestamp, open, high, low, close, volume, is_test_data)
    VALUES (v_mixed_signal_id, 'NVDA', NOW() - (21 - v_day) * INTERVAL '1 day',
            v_price - 5, v_price + 8, v_price - 8, v_price, 28000000 + floor(random() * 12000000), true);
  END LOOP;

  RAISE NOTICE 'Created price data for all 4 scenarios';
END $$;
*/

-- =====================================================================================
-- VERIFICATION
-- =====================================================================================

DO $$
DECLARE
  v_scenario_count INTEGER;
  v_article_count INTEGER;
  v_price_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_scenario_count FROM prediction.test_scenarios;
  SELECT COUNT(*) INTO v_article_count FROM prediction.test_articles WHERE is_synthetic = true;
  SELECT COUNT(*) INTO v_price_count FROM prediction.test_price_data;

  RAISE NOTICE '========== TEST SCENARIO CLEANUP VERIFICATION ==========';
  RAISE NOTICE 'Total test scenarios: %', v_scenario_count;
  RAISE NOTICE 'Total test articles: %', v_article_count;
  RAISE NOTICE 'Total test price data points: %', v_price_count;
  RAISE NOTICE '========================================================';
END $$;

-- Show final scenario list
SELECT id, name, status, config->>'market_condition' as market_condition
FROM prediction.test_scenarios
ORDER BY name;

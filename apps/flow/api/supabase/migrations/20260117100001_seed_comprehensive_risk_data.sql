-- =============================================================================
-- SEED COMPREHENSIVE RISK DATA
-- =============================================================================
-- Adds:
-- 1. New investment subjects matching predictions module (GOOGL, NVDA, BTC, ETH, SOL, AVAX)
-- 2. Assessments for all subjects across all 6 dimensions
-- 3. Historical composite scores (30+ days) for Score History chart
-- 4. Sample data sources for Live Data Integration feature
-- =============================================================================

DO $$
DECLARE
    v_scope_id UUID;
    v_dim_credit UUID;
    v_dim_market UUID;
    v_dim_liquidity UUID;
    v_dim_regulatory UUID;
    v_dim_operational UUID;
    v_dim_concentration UUID;

    -- New subject IDs
    v_googl_id UUID;
    v_nvda_id UUID;
    v_btc_id UUID;
    v_eth_id UUID;
    v_sol_id UUID;
    v_avax_id UUID;

    -- Existing subject IDs
    v_msft_id UUID;
    v_aapl_id UUID;
    v_tsla_id UUID;

    -- Loop variables
    v_day_offset INTEGER;
    v_score_variation NUMERIC;
BEGIN
    -- Get the investment scope
    SELECT id INTO v_scope_id FROM risk.scopes WHERE domain = 'investment' LIMIT 1;

    IF v_scope_id IS NULL THEN
        RAISE NOTICE 'No investment scope found - creating one';
        INSERT INTO risk.scopes (organization_slug, agent_slug, name, description, domain)
        VALUES ('demo', 'risk-agent', 'Investment Portfolio Risk', 'Risk analysis for investment portfolio', 'investment')
        RETURNING id INTO v_scope_id;
    END IF;

    -- Get dimension IDs
    SELECT id INTO v_dim_credit FROM risk.dimensions WHERE slug = 'credit-risk' AND scope_id = v_scope_id;
    SELECT id INTO v_dim_market FROM risk.dimensions WHERE slug = 'market-risk' AND scope_id = v_scope_id;
    SELECT id INTO v_dim_liquidity FROM risk.dimensions WHERE slug = 'liquidity-risk' AND scope_id = v_scope_id;
    SELECT id INTO v_dim_regulatory FROM risk.dimensions WHERE slug = 'regulatory-risk' AND scope_id = v_scope_id;
    SELECT id INTO v_dim_operational FROM risk.dimensions WHERE slug = 'operational-risk' AND scope_id = v_scope_id;
    SELECT id INTO v_dim_concentration FROM risk.dimensions WHERE slug = 'concentration-risk' AND scope_id = v_scope_id;

    -- Get existing subject IDs
    SELECT id INTO v_msft_id FROM risk.subjects WHERE identifier = 'MSFT' AND scope_id = v_scope_id;
    SELECT id INTO v_aapl_id FROM risk.subjects WHERE identifier = 'AAPL' AND scope_id = v_scope_id;
    SELECT id INTO v_tsla_id FROM risk.subjects WHERE identifier = 'TSLA' AND scope_id = v_scope_id;

    -- =============================================================================
    -- CREATE NEW SUBJECTS
    -- =============================================================================

    RAISE NOTICE 'Creating new investment subjects...';

    -- GOOGL - Google/Alphabet (Low-Medium Risk)
    INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
    VALUES (v_scope_id, 'GOOGL', 'Alphabet Inc.', 'stock',
            '{"sector": "Technology", "industry": "Internet Services", "marketCap": "1.9T", "exchange": "NASDAQ"}'::JSONB)
    ON CONFLICT (scope_id, identifier) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_googl_id;

    -- NVDA - NVIDIA (Medium-High Risk due to AI boom volatility)
    INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
    VALUES (v_scope_id, 'NVDA', 'NVIDIA Corporation', 'stock',
            '{"sector": "Technology", "industry": "Semiconductors", "marketCap": "3.2T", "exchange": "NASDAQ"}'::JSONB)
    ON CONFLICT (scope_id, identifier) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_nvda_id;

    -- BTC - Bitcoin (High Risk - Crypto)
    INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
    VALUES (v_scope_id, 'BTC', 'Bitcoin', 'crypto',
            '{"type": "Cryptocurrency", "category": "Layer 1", "marketCap": "1.8T"}'::JSONB)
    ON CONFLICT (scope_id, identifier) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_btc_id;

    -- ETH - Ethereum (Medium-High Risk - Crypto)
    INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
    VALUES (v_scope_id, 'ETH', 'Ethereum', 'crypto',
            '{"type": "Cryptocurrency", "category": "Layer 1", "marketCap": "400B"}'::JSONB)
    ON CONFLICT (scope_id, identifier) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_eth_id;

    -- SOL - Solana (High Risk - Crypto)
    INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
    VALUES (v_scope_id, 'SOL', 'Solana', 'crypto',
            '{"type": "Cryptocurrency", "category": "Layer 1", "marketCap": "90B"}'::JSONB)
    ON CONFLICT (scope_id, identifier) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_sol_id;

    -- AVAX - Avalanche (High Risk - Crypto)
    INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
    VALUES (v_scope_id, 'AVAX', 'Avalanche', 'crypto',
            '{"type": "Cryptocurrency", "category": "Layer 1", "marketCap": "15B"}'::JSONB)
    ON CONFLICT (scope_id, identifier) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_avax_id;

    -- AAPL - Apple (Medium Risk)
    INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
    VALUES (v_scope_id, 'AAPL', 'Apple Inc.', 'stock',
            '{"sector": "Technology", "industry": "Consumer Electronics", "marketCap": "3.4T", "exchange": "NASDAQ"}'::JSONB)
    ON CONFLICT (scope_id, identifier) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_aapl_id;

    -- AMZN - Amazon (Medium Risk)
    INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
    VALUES (v_scope_id, 'AMZN', 'Amazon.com Inc.', 'stock',
            '{"sector": "Technology", "industry": "Internet Retail", "marketCap": "2.3T", "exchange": "NASDAQ"}'::JSONB)
    ON CONFLICT (scope_id, identifier) DO UPDATE SET name = EXCLUDED.name;

    -- META - Meta Platforms (Medium Risk)
    INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
    VALUES (v_scope_id, 'META', 'Meta Platforms Inc.', 'stock',
            '{"sector": "Technology", "industry": "Social Media", "marketCap": "1.6T", "exchange": "NASDAQ"}'::JSONB)
    ON CONFLICT (scope_id, identifier) DO UPDATE SET name = EXCLUDED.name;

    -- MSFT - Microsoft (Low Risk)
    INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
    VALUES (v_scope_id, 'MSFT', 'Microsoft Corporation', 'stock',
            '{"sector": "Technology", "industry": "Software", "marketCap": "3.1T", "exchange": "NASDAQ"}'::JSONB)
    ON CONFLICT (scope_id, identifier) DO UPDATE SET name = EXCLUDED.name;

    -- TSLA - Tesla (High Risk)
    INSERT INTO risk.subjects (scope_id, identifier, name, subject_type, metadata)
    VALUES (v_scope_id, 'TSLA', 'Tesla Inc.', 'stock',
            '{"sector": "Consumer Cyclical", "industry": "Auto Manufacturers", "marketCap": "1.1T", "exchange": "NASDAQ"}'::JSONB)
    ON CONFLICT (scope_id, identifier) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_tsla_id;

    RAISE NOTICE 'Created subjects: AAPL=%, GOOGL=%, NVDA=%, TSLA=%, BTC=%, ETH=%, SOL=%, AVAX=% (+ AMZN, META, MSFT)',
                 v_aapl_id, v_googl_id, v_nvda_id, v_tsla_id, v_btc_id, v_eth_id, v_sol_id, v_avax_id;

    -- =============================================================================
    -- CREATE ASSESSMENTS FOR NEW SUBJECTS
    -- =============================================================================

    RAISE NOTICE 'Creating assessments for new subjects...';

    -- GOOGL Assessments (Overall: 48% - Low-Medium Risk)
    INSERT INTO risk.assessments (subject_id, dimension_id, score, confidence, reasoning) VALUES
    (v_googl_id, v_dim_credit, 32, 0.90, 'Exceptional credit profile with AAA-equivalent rating, minimal debt relative to cash position, and strong free cash flow generation.'),
    (v_googl_id, v_dim_market, 52, 0.82, 'Moderate market risk from advertising revenue cyclicality and increasing competition in AI/cloud markets.'),
    (v_googl_id, v_dim_liquidity, 22, 0.95, 'Outstanding liquidity with $100B+ in cash and marketable securities, minimal working capital needs.'),
    (v_googl_id, v_dim_regulatory, 68, 0.75, 'Elevated regulatory risk from ongoing antitrust cases in US, EU, and DOJ pursuit of company breakup.'),
    (v_googl_id, v_dim_operational, 45, 0.80, 'Generally strong operations but facing challenges with AI integration and recent workforce reductions.'),
    (v_googl_id, v_dim_concentration, 70, 0.78, 'High concentration in advertising revenue (80%+), though cloud segment growing.')
    ON CONFLICT DO NOTHING;

    -- NVDA Assessments (Overall: 62% - Medium-High Risk)
    INSERT INTO risk.assessments (subject_id, dimension_id, score, confidence, reasoning) VALUES
    (v_nvda_id, v_dim_credit, 42, 0.85, 'Strong credit profile with growing cash reserves, though AI capex requirements increasing.'),
    (v_nvda_id, v_dim_market, 78, 0.72, 'Very high market risk from extreme valuation multiples and potential AI bubble dynamics.'),
    (v_nvda_id, v_dim_liquidity, 35, 0.88, 'Good liquidity but inventory management challenges with rapid product cycles.'),
    (v_nvda_id, v_dim_regulatory, 62, 0.70, 'Elevated regulatory risk from China export restrictions and potential AI regulation.'),
    (v_nvda_id, v_dim_operational, 55, 0.75, 'Supply chain constraints and key person dependency on CEO Jensen Huang.'),
    (v_nvda_id, v_dim_concentration, 82, 0.80, 'Extreme concentration in AI/datacenter chips, gaming declining as percentage.')
    ON CONFLICT DO NOTHING;

    -- BTC Assessments (Overall: 72% - High Risk)
    INSERT INTO risk.assessments (subject_id, dimension_id, score, confidence, reasoning) VALUES
    (v_btc_id, v_dim_credit, 58, 0.65, 'N/A for cryptocurrency - score reflects systemic counterparty risks in crypto ecosystem.'),
    (v_btc_id, v_dim_market, 85, 0.70, 'Extreme volatility with 30-50% drawdowns common, highly correlated with risk sentiment.'),
    (v_btc_id, v_dim_liquidity, 45, 0.80, 'Generally liquid on major exchanges but can become illiquid during market stress.'),
    (v_btc_id, v_dim_regulatory, 82, 0.68, 'High regulatory uncertainty globally, potential for adverse regulation in major markets.'),
    (v_btc_id, v_dim_operational, 68, 0.72, 'Network operational risk from mining concentration and potential protocol changes.'),
    (v_btc_id, v_dim_concentration, 78, 0.75, 'Whale concentration risk with large holders able to move markets.')
    ON CONFLICT DO NOTHING;

    -- ETH Assessments (Overall: 68% - Medium-High Risk)
    INSERT INTO risk.assessments (subject_id, dimension_id, score, confidence, reasoning) VALUES
    (v_eth_id, v_dim_credit, 55, 0.65, 'N/A for cryptocurrency - reflects DeFi counterparty and smart contract risks.'),
    (v_eth_id, v_dim_market, 78, 0.72, 'High volatility similar to BTC but with additional Layer 2 competition pressure.'),
    (v_eth_id, v_dim_liquidity, 42, 0.82, 'Strong liquidity across DeFi ecosystem but gas fee spikes can impact usability.'),
    (v_eth_id, v_dim_regulatory, 75, 0.70, 'Regulatory risk from SEC scrutiny of staking and potential securities classification.'),
    (v_eth_id, v_dim_operational, 62, 0.75, 'Proven network stability post-merge but scaling challenges remain.'),
    (v_eth_id, v_dim_concentration, 72, 0.78, 'Staking concentration among major validators like Lido.')
    ON CONFLICT DO NOTHING;

    -- SOL Assessments (Overall: 76% - High Risk)
    INSERT INTO risk.assessments (subject_id, dimension_id, score, confidence, reasoning) VALUES
    (v_sol_id, v_dim_credit, 62, 0.60, 'N/A for cryptocurrency - reflects ecosystem maturity and VC unlock risks.'),
    (v_sol_id, v_dim_market, 88, 0.68, 'Extreme volatility with history of 90%+ drawdowns, highly speculative.'),
    (v_sol_id, v_dim_liquidity, 55, 0.75, 'Good liquidity on centralized exchanges but thinner on-chain markets.'),
    (v_sol_id, v_dim_regulatory, 78, 0.65, 'High regulatory risk with potential securities classification and FTX association.'),
    (v_sol_id, v_dim_operational, 82, 0.70, 'History of network outages (7+ in 2022), though improving recently.'),
    (v_sol_id, v_dim_concentration, 85, 0.72, 'High concentration among early investors and Solana Labs.')
    ON CONFLICT DO NOTHING;

    -- AVAX Assessments (Overall: 74% - High Risk)
    INSERT INTO risk.assessments (subject_id, dimension_id, score, confidence, reasoning) VALUES
    (v_avax_id, v_dim_credit, 65, 0.58, 'N/A for cryptocurrency - reflects smaller ecosystem and TVL concerns.'),
    (v_avax_id, v_dim_market, 85, 0.65, 'Very high volatility with significant correlation to broader crypto market.'),
    (v_avax_id, v_dim_liquidity, 62, 0.72, 'Moderate liquidity, thinner than BTC/ETH, more susceptible to slippage.'),
    (v_avax_id, v_dim_regulatory, 75, 0.65, 'Similar regulatory risks to other L1 chains.'),
    (v_avax_id, v_dim_operational, 70, 0.70, 'Subnet architecture adds complexity, network has been stable recently.'),
    (v_avax_id, v_dim_concentration, 82, 0.70, 'High validator concentration and Ava Labs dominance.')
    ON CONFLICT DO NOTHING;

    -- =============================================================================
    -- CREATE COMPOSITE SCORES WITH HISTORICAL DATA (30 days)
    -- =============================================================================

    RAISE NOTICE 'Creating historical composite scores for Score History chart...';

    -- Mark any existing active scores as superseded
    UPDATE risk.composite_scores SET status = 'superseded'
    WHERE subject_id IN (v_googl_id, v_nvda_id, v_btc_id, v_eth_id, v_sol_id, v_avax_id)
    AND status = 'active';

    -- Create 30 days of historical scores for each new subject
    FOR v_day_offset IN 0..30 LOOP
        -- GOOGL historical scores (trending: 52 -> 48, slight improvement)
        v_score_variation := (random() * 6 - 3)::INTEGER;
        INSERT INTO risk.composite_scores (subject_id, overall_score, confidence, dimension_scores, status, created_at)
        VALUES (
            v_googl_id,
            LEAST(GREATEST(52 - (v_day_offset * 0.13)::INTEGER + v_score_variation, 35), 58)::INTEGER,
            0.82 + (random() * 0.1 - 0.05),
            jsonb_build_object(
                'credit-risk', 32 + (random() * 4 - 2)::INTEGER,
                'market-risk', 52 + (random() * 6 - 3)::INTEGER,
                'liquidity-risk', 22 + (random() * 4 - 2)::INTEGER,
                'regulatory-risk', 68 + (random() * 6 - 3)::INTEGER,
                'operational-risk', 45 + (random() * 5 - 2.5)::INTEGER,
                'concentration-risk', 70 + (random() * 5 - 2.5)::INTEGER
            ),
            CASE WHEN v_day_offset = 0 THEN 'active' ELSE 'superseded' END,
            NOW() - (v_day_offset || ' days')::INTERVAL
        );

        -- NVDA historical scores (trending: 55 -> 62, increasing risk from AI hype)
        v_score_variation := (random() * 8 - 4)::INTEGER;
        INSERT INTO risk.composite_scores (subject_id, overall_score, confidence, dimension_scores, status, created_at)
        VALUES (
            v_nvda_id,
            LEAST(GREATEST(55 + (v_day_offset * 0.23)::INTEGER + v_score_variation, 48), 70)::INTEGER,
            0.75 + (random() * 0.1 - 0.05),
            jsonb_build_object(
                'credit-risk', 42 + (random() * 5 - 2.5)::INTEGER,
                'market-risk', 70 + (v_day_offset * 0.27)::INTEGER + (random() * 8 - 4)::INTEGER,
                'liquidity-risk', 35 + (random() * 4 - 2)::INTEGER,
                'regulatory-risk', 62 + (random() * 6 - 3)::INTEGER,
                'operational-risk', 55 + (random() * 5 - 2.5)::INTEGER,
                'concentration-risk', 82 + (random() * 4 - 2)::INTEGER
            ),
            CASE WHEN v_day_offset = 0 THEN 'active' ELSE 'superseded' END,
            NOW() - (v_day_offset || ' days')::INTERVAL
        );

        -- BTC historical scores (volatile: 65-78 range, currently 72)
        v_score_variation := (random() * 12 - 6)::INTEGER;
        INSERT INTO risk.composite_scores (subject_id, overall_score, confidence, dimension_scores, status, created_at)
        VALUES (
            v_btc_id,
            LEAST(GREATEST(70 + v_score_variation + SIN(v_day_offset * 0.3)::INTEGER * 3, 62), 82)::INTEGER,
            0.68 + (random() * 0.12 - 0.06),
            jsonb_build_object(
                'credit-risk', 58 + (random() * 6 - 3)::INTEGER,
                'market-risk', 85 + (random() * 10 - 5)::INTEGER,
                'liquidity-risk', 45 + (random() * 8 - 4)::INTEGER,
                'regulatory-risk', 82 + (random() * 6 - 3)::INTEGER,
                'operational-risk', 68 + (random() * 6 - 3)::INTEGER,
                'concentration-risk', 78 + (random() * 6 - 3)::INTEGER
            ),
            CASE WHEN v_day_offset = 0 THEN 'active' ELSE 'superseded' END,
            NOW() - (v_day_offset || ' days')::INTERVAL
        );

        -- ETH historical scores (volatile: 62-75 range, currently 68)
        v_score_variation := (random() * 10 - 5)::INTEGER;
        INSERT INTO risk.composite_scores (subject_id, overall_score, confidence, dimension_scores, status, created_at)
        VALUES (
            v_eth_id,
            LEAST(GREATEST(66 + v_score_variation + SIN(v_day_offset * 0.25)::INTEGER * 2, 58), 78)::INTEGER,
            0.70 + (random() * 0.1 - 0.05),
            jsonb_build_object(
                'credit-risk', 55 + (random() * 6 - 3)::INTEGER,
                'market-risk', 78 + (random() * 8 - 4)::INTEGER,
                'liquidity-risk', 42 + (random() * 6 - 3)::INTEGER,
                'regulatory-risk', 75 + (random() * 6 - 3)::INTEGER,
                'operational-risk', 62 + (random() * 5 - 2.5)::INTEGER,
                'concentration-risk', 72 + (random() * 5 - 2.5)::INTEGER
            ),
            CASE WHEN v_day_offset = 0 THEN 'active' ELSE 'superseded' END,
            NOW() - (v_day_offset || ' days')::INTERVAL
        );

        -- SOL historical scores (very volatile: 68-85, currently 76)
        v_score_variation := (random() * 14 - 7)::INTEGER;
        INSERT INTO risk.composite_scores (subject_id, overall_score, confidence, dimension_scores, status, created_at)
        VALUES (
            v_sol_id,
            LEAST(GREATEST(74 + v_score_variation + SIN(v_day_offset * 0.4)::INTEGER * 4, 65), 88)::INTEGER,
            0.65 + (random() * 0.12 - 0.06),
            jsonb_build_object(
                'credit-risk', 62 + (random() * 6 - 3)::INTEGER,
                'market-risk', 88 + (random() * 8 - 4)::INTEGER,
                'liquidity-risk', 55 + (random() * 8 - 4)::INTEGER,
                'regulatory-risk', 78 + (random() * 6 - 3)::INTEGER,
                'operational-risk', 82 + (random() * 8 - 4)::INTEGER,
                'concentration-risk', 85 + (random() * 5 - 2.5)::INTEGER
            ),
            CASE WHEN v_day_offset = 0 THEN 'active' ELSE 'superseded' END,
            NOW() - (v_day_offset || ' days')::INTERVAL
        );

        -- AVAX historical scores (volatile: 68-82, currently 74)
        v_score_variation := (random() * 12 - 6)::INTEGER;
        INSERT INTO risk.composite_scores (subject_id, overall_score, confidence, dimension_scores, status, created_at)
        VALUES (
            v_avax_id,
            LEAST(GREATEST(72 + v_score_variation + SIN(v_day_offset * 0.35)::INTEGER * 3, 62), 85)::INTEGER,
            0.65 + (random() * 0.1 - 0.05),
            jsonb_build_object(
                'credit-risk', 65 + (random() * 6 - 3)::INTEGER,
                'market-risk', 85 + (random() * 8 - 4)::INTEGER,
                'liquidity-risk', 62 + (random() * 6 - 3)::INTEGER,
                'regulatory-risk', 75 + (random() * 6 - 3)::INTEGER,
                'operational-risk', 70 + (random() * 6 - 3)::INTEGER,
                'concentration-risk', 82 + (random() * 5 - 2.5)::INTEGER
            ),
            CASE WHEN v_day_offset = 0 THEN 'active' ELSE 'superseded' END,
            NOW() - (v_day_offset || ' days')::INTERVAL
        );
    END LOOP;

    -- Also create historical scores for existing subjects (MSFT, AAPL, TSLA)
    IF v_msft_id IS NOT NULL THEN
        FOR v_day_offset IN 1..30 LOOP
            v_score_variation := (random() * 6 - 3)::INTEGER;
            INSERT INTO risk.composite_scores (subject_id, overall_score, confidence, dimension_scores, status, created_at)
            VALUES (
                v_msft_id,
                LEAST(GREATEST(45 + v_score_variation, 38), 52)::INTEGER,
                0.82 + (random() * 0.08 - 0.04),
                jsonb_build_object(
                    'credit-risk', 35 + (random() * 4 - 2)::INTEGER,
                    'market-risk', 48 + (random() * 6 - 3)::INTEGER,
                    'liquidity-risk', 25 + (random() * 4 - 2)::INTEGER,
                    'regulatory-risk', 55 + (random() * 5 - 2.5)::INTEGER,
                    'operational-risk', 42 + (random() * 4 - 2)::INTEGER,
                    'concentration-risk', 65 + (random() * 5 - 2.5)::INTEGER
                ),
                'superseded',
                NOW() - (v_day_offset || ' days')::INTERVAL
            );
        END LOOP;
    END IF;

    IF v_aapl_id IS NOT NULL THEN
        FOR v_day_offset IN 1..30 LOOP
            v_score_variation := (random() * 8 - 4)::INTEGER;
            INSERT INTO risk.composite_scores (subject_id, overall_score, confidence, dimension_scores, status, created_at)
            VALUES (
                v_aapl_id,
                LEAST(GREATEST(65 + v_score_variation, 58), 72)::INTEGER,
                0.76 + (random() * 0.08 - 0.04),
                jsonb_build_object(
                    'credit-risk', 55 + (random() * 5 - 2.5)::INTEGER,
                    'market-risk', 72 + (random() * 6 - 3)::INTEGER,
                    'liquidity-risk', 48 + (random() * 5 - 2.5)::INTEGER,
                    'regulatory-risk', 68 + (random() * 6 - 3)::INTEGER,
                    'operational-risk', 75 + (random() * 5 - 2.5)::INTEGER,
                    'concentration-risk', 72 + (random() * 5 - 2.5)::INTEGER
                ),
                'superseded',
                NOW() - (v_day_offset || ' days')::INTERVAL
            );
        END LOOP;
    END IF;

    IF v_tsla_id IS NOT NULL THEN
        FOR v_day_offset IN 1..30 LOOP
            v_score_variation := (random() * 10 - 5)::INTEGER;
            INSERT INTO risk.composite_scores (subject_id, overall_score, confidence, dimension_scores, status, created_at)
            VALUES (
                v_tsla_id,
                LEAST(GREATEST(78 + v_score_variation, 70), 88)::INTEGER,
                0.70 + (random() * 0.08 - 0.04),
                jsonb_build_object(
                    'credit-risk', 82 + (random() * 6 - 3)::INTEGER,
                    'market-risk', 88 + (random() * 8 - 4)::INTEGER,
                    'liquidity-risk', 65 + (random() * 6 - 3)::INTEGER,
                    'regulatory-risk', 75 + (random() * 5 - 2.5)::INTEGER,
                    'operational-risk', 85 + (random() * 6 - 3)::INTEGER,
                    'concentration-risk', 73 + (random() * 5 - 2.5)::INTEGER
                ),
                'superseded',
                NOW() - (v_day_offset || ' days')::INTERVAL
            );
        END LOOP;
    END IF;

    RAISE NOTICE 'Created historical composite scores for all subjects';

    -- =============================================================================
    -- CREATE SAMPLE DATA SOURCES
    -- =============================================================================

    RAISE NOTICE 'Creating sample data sources for Live Data Integration...';

    -- CoinGecko API for Crypto assets
    INSERT INTO risk.data_sources (scope_id, name, description, source_type, config, schedule, dimension_mapping, subject_filter, status, last_fetch_at, last_fetch_status, next_fetch_at)
    VALUES (
        v_scope_id,
        'CoinGecko Market Data',
        'Real-time cryptocurrency market data from CoinGecko API including prices, volumes, and market caps.',
        'api',
        '{
            "endpoint": "https://api.coingecko.com/api/v3/coins/markets",
            "method": "GET",
            "params": {
                "vs_currency": "usd",
                "ids": "bitcoin,ethereum,solana,avalanche-2",
                "order": "market_cap_desc",
                "sparkline": false,
                "price_change_percentage": "24h,7d,30d"
            },
            "responseMapping": {
                "price": "$.current_price",
                "volume": "$.total_volume",
                "marketCap": "$.market_cap",
                "priceChange24h": "$.price_change_percentage_24h",
                "priceChange7d": "$.price_change_percentage_7d"
            }
        }'::JSONB,
        'hourly',
        '{
            "market-risk": {
                "sourceField": "priceChange24h",
                "transform": "volatility_score",
                "threshold": 0.1,
                "weight": 1.2
            },
            "liquidity-risk": {
                "sourceField": "volume",
                "transform": "inverse_normalize",
                "threshold": 0.15,
                "weight": 0.8
            }
        }'::JSONB,
        '{"subjectTypes": ["crypto"]}'::JSONB,
        'active',
        NOW() - INTERVAL '45 minutes',
        'success',
        NOW() + INTERVAL '15 minutes'
    )
    ON CONFLICT DO NOTHING;

    -- Yahoo Finance API for Stocks
    INSERT INTO risk.data_sources (scope_id, name, description, source_type, config, schedule, dimension_mapping, subject_filter, status, last_fetch_at, last_fetch_status, next_fetch_at)
    VALUES (
        v_scope_id,
        'Yahoo Finance Stock Data',
        'Stock market data from Yahoo Finance including prices, P/E ratios, and analyst ratings.',
        'api',
        '{
            "endpoint": "https://query1.finance.yahoo.com/v7/finance/quote",
            "method": "GET",
            "params": {
                "symbols": "MSFT,AAPL,GOOGL,NVDA,TSLA"
            },
            "responseMapping": {
                "price": "$.regularMarketPrice",
                "volume": "$.regularMarketVolume",
                "peRatio": "$.trailingPE",
                "priceChange": "$.regularMarketChangePercent",
                "fiftyTwoWeekHigh": "$.fiftyTwoWeekHigh",
                "fiftyTwoWeekLow": "$.fiftyTwoWeekLow"
            }
        }'::JSONB,
        'daily',
        '{
            "market-risk": {
                "sourceField": "priceChange",
                "transform": "volatility_score",
                "threshold": 0.05,
                "weight": 1.0
            },
            "liquidity-risk": {
                "sourceField": "volume",
                "transform": "inverse_normalize",
                "threshold": 0.2,
                "weight": 0.9
            }
        }'::JSONB,
        '{"subjectTypes": ["stock"]}'::JSONB,
        'active',
        NOW() - INTERVAL '2 hours',
        'success',
        NOW() + INTERVAL '22 hours'
    )
    ON CONFLICT DO NOTHING;

    -- SEC Edgar RSS for Regulatory News
    INSERT INTO risk.data_sources (scope_id, name, description, source_type, config, schedule, dimension_mapping, subject_filter, status, last_fetch_at, last_fetch_status, next_fetch_at)
    VALUES (
        v_scope_id,
        'SEC EDGAR Filings',
        'SEC regulatory filings and disclosures for tracking compliance and regulatory risk.',
        'rss',
        '{
            "feedUrl": "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=10-K&company=&dateb=&owner=include&count=100&output=atom",
            "relevantCategories": ["10-K", "10-Q", "8-K", "DEF 14A"],
            "keywords": ["risk", "litigation", "regulatory", "compliance"],
            "sentimentAnalysis": true
        }'::JSONB,
        'daily',
        '{
            "regulatory-risk": {
                "sourceField": "sentimentScore",
                "transform": "sentiment_to_risk",
                "threshold": 0.2,
                "weight": 1.0
            }
        }'::JSONB,
        '{"subjectTypes": ["stock"]}'::JSONB,
        'active',
        NOW() - INTERVAL '6 hours',
        'success',
        NOW() + INTERVAL '18 hours'
    )
    ON CONFLICT DO NOTHING;

    -- Firecrawl for Crypto News
    INSERT INTO risk.data_sources (scope_id, name, description, source_type, config, schedule, dimension_mapping, subject_filter, status, last_fetch_at, last_fetch_status, next_fetch_at)
    VALUES (
        v_scope_id,
        'CoinDesk News Scraper',
        'Web scraper for cryptocurrency news and sentiment from CoinDesk.',
        'firecrawl',
        '{
            "url": "https://www.coindesk.com/markets/",
            "selector": "article.article-card",
            "extractFields": ["title", "summary", "category", "timestamp"],
            "maxPages": 3,
            "sentimentAnalysis": true
        }'::JSONB,
        'hourly',
        '{
            "market-risk": {
                "sourceField": "sentimentScore",
                "transform": "sentiment_to_risk",
                "threshold": 0.15,
                "weight": 0.7
            },
            "regulatory-risk": {
                "sourceField": "regulatoryMentions",
                "transform": "count_to_risk",
                "threshold": 0.2,
                "weight": 0.8
            }
        }'::JSONB,
        '{"subjectTypes": ["crypto"]}'::JSONB,
        'active',
        NOW() - INTERVAL '30 minutes',
        'success',
        NOW() + INTERVAL '30 minutes'
    )
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Created 4 sample data sources';

    -- =============================================================================
    -- CREATE ADDITIONAL ALERTS FOR NEW HIGH-RISK SUBJECTS
    -- =============================================================================

    RAISE NOTICE 'Creating alerts for high-risk subjects...';

    -- Alert for SOL network stability
    INSERT INTO risk.alerts (subject_id, alert_type, severity, title, message, triggered_value, threshold_value, is_acknowledged, is_test)
    SELECT
        v_sol_id,
        'dimension_spike',
        'warning',
        'Solana Operational Risk Elevated',
        'Solana''s operational risk score of 82% is significantly elevated due to historical network outages. Monitor closely for any network instability.',
        82,
        70,
        FALSE,
        FALSE
    WHERE v_sol_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    -- Alert for NVDA concentration risk
    INSERT INTO risk.alerts (subject_id, alert_type, severity, title, message, triggered_value, threshold_value, is_acknowledged, is_test)
    SELECT
        v_nvda_id,
        'threshold_breach',
        'warning',
        'NVIDIA Concentration Risk High',
        'NVIDIA''s concentration risk score of 82% exceeds the warning threshold. Revenue heavily dependent on AI/datacenter segment.',
        82,
        80,
        FALSE,
        FALSE
    WHERE v_nvda_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    -- Alert for BTC market volatility
    INSERT INTO risk.alerts (subject_id, alert_type, severity, title, message, triggered_value, threshold_value, is_acknowledged, is_test)
    SELECT
        v_btc_id,
        'dimension_spike',
        'critical',
        'Bitcoin Market Risk Critical',
        'Bitcoin''s market risk score of 85% is at critical levels due to extreme volatility and correlation with risk sentiment.',
        85,
        80,
        FALSE,
        FALSE
    WHERE v_btc_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    -- =============================================================================
    -- CREATE SAMPLE DEBATE FOR HIGH-RISK CRYPTO
    -- =============================================================================

    RAISE NOTICE 'Creating sample debate for Bitcoin...';

    INSERT INTO risk.debates (subject_id, original_score, final_score, score_adjustment, status, blue_assessment, red_challenges, arbiter_synthesis, transcript, completed_at, is_test)
    SELECT
        v_btc_id,
        72,
        75,
        3,
        'completed',
        '{
            "summary": "Bitcoin maintains strong network security and first-mover advantage. Recent institutional adoption through ETFs provides price stability floor.",
            "keyPoints": [
                "Network hash rate at all-time highs, extremely secure",
                "Institutional adoption via spot ETFs accelerating",
                "Supply dynamics favor long-term appreciation",
                "Regulatory clarity improving in major jurisdictions"
            ],
            "confidence": 0.72
        }'::JSONB,
        '{
            "challenges": [
                {
                    "area": "Market Risk",
                    "challenge": "30-50% drawdowns remain common even in bull markets. Recent ETF flows are retail-driven and could reverse rapidly.",
                    "severity": "high"
                },
                {
                    "area": "Regulatory Risk",
                    "challenge": "Global CBDC development could pose existential threat. Increasing energy consumption criticism from regulators.",
                    "severity": "medium"
                },
                {
                    "area": "Concentration Risk",
                    "challenge": "Whale concentration remains significant. Top 100 addresses hold >15% of supply.",
                    "severity": "medium"
                }
            ],
            "recommendedAdjustment": 5,
            "confidence": 0.68
        }'::JSONB,
        '{
            "finalAssessment": "Red Team raises valid concerns about volatility and concentration risks that warrant a modest upward adjustment to risk score.",
            "adjustmentRationale": "The +3 adjustment reflects legitimate concerns about market volatility and whale concentration while acknowledging the improving institutional adoption narrative.",
            "keyInsights": [
                "ETF narrative is positive but execution risk remains",
                "Regulatory trajectory improving but not resolved",
                "Volatility is structural feature, not temporary"
            ],
            "finalScore": 75,
            "confidence": 0.70
        }'::JSONB,
        '[
            {"role": "blue", "content": "Bitcoin network fundamentals remain strong with hash rate at ATH...", "timestamp": "2026-01-15T10:00:00Z"},
            {"role": "red", "content": "While fundamentals are strong, we must address the persistent 30-50% drawdown risk...", "timestamp": "2026-01-15T10:02:00Z"},
            {"role": "blue", "content": "Historical volatility is being mitigated by institutional participation...", "timestamp": "2026-01-15T10:04:00Z"},
            {"role": "red", "content": "Institutional flows can reverse rapidly. The 2022 Luna crash showed systemic risks...", "timestamp": "2026-01-15T10:06:00Z"},
            {"role": "arbiter", "content": "Both teams raise valid points. Adjusting risk score upward by 3 points...", "timestamp": "2026-01-15T10:08:00Z"}
        ]'::JSONB,
        NOW() - INTERVAL '1 day',
        FALSE
    WHERE v_btc_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '================================================';
    RAISE NOTICE 'COMPREHENSIVE RISK DATA SEED COMPLETE';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Created/Updated:';
    RAISE NOTICE '  - 11 subjects (AAPL, AMZN, GOOGL, META, MSFT, NVDA, TSLA, BTC, ETH, SOL, AVAX)';
    RAISE NOTICE '  - Assessments for all subjects (6 dimensions each)';
    RAISE NOTICE '  - 30+ days of historical scores for Score History';
    RAISE NOTICE '  - 4 data sources (CoinGecko, Yahoo, SEC, CoinDesk)';
    RAISE NOTICE '  - 3 new alerts for high-risk subjects';
    RAISE NOTICE '  - 1 sample debate for Bitcoin';
    RAISE NOTICE '================================================';
END $$;

-- =============================================================================
-- ADD triggered_value AND threshold_value COLUMNS IF NOT EXISTS
-- =============================================================================
-- These columns are used by the seed data but may not exist yet

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'risk' AND table_name = 'alerts' AND column_name = 'triggered_value') THEN
        ALTER TABLE risk.alerts ADD COLUMN triggered_value NUMERIC;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'risk' AND table_name = 'alerts' AND column_name = 'threshold_value') THEN
        ALTER TABLE risk.alerts ADD COLUMN threshold_value NUMERIC;
    END IF;
END $$;

-- =============================================================================
-- VERIFICATION QUERY
-- =============================================================================

DO $$
DECLARE
    v_subject_count INTEGER;
    v_score_count INTEGER;
    v_assessment_count INTEGER;
    v_data_source_count INTEGER;
    v_alert_count INTEGER;
    v_debate_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_subject_count FROM risk.subjects WHERE is_test = false;
    SELECT COUNT(*) INTO v_score_count FROM risk.composite_scores WHERE is_test = false;
    SELECT COUNT(*) INTO v_assessment_count FROM risk.assessments WHERE is_test = false;
    SELECT COUNT(*) INTO v_data_source_count FROM risk.data_sources;
    SELECT COUNT(*) INTO v_alert_count FROM risk.alerts WHERE is_test = false;
    SELECT COUNT(*) INTO v_debate_count FROM risk.debates WHERE is_test = false;

    RAISE NOTICE '';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'VERIFICATION SUMMARY';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Subjects: %', v_subject_count;
    RAISE NOTICE 'Composite Scores: %', v_score_count;
    RAISE NOTICE 'Assessments: %', v_assessment_count;
    RAISE NOTICE 'Data Sources: %', v_data_source_count;
    RAISE NOTICE 'Alerts: %', v_alert_count;
    RAISE NOTICE 'Debates: %', v_debate_count;
    RAISE NOTICE '================================================';
END $$;

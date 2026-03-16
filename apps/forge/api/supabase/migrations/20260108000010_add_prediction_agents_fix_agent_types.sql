-- =============================================================================
-- ADD PREDICTION AGENTS AND FIX AGENT TYPES
-- =============================================================================
-- This migration:
-- 1. Adds three prediction agents (stock, crypto, polymarket)
-- 2. Removes the deprecated finance-research agent
-- 3. Fixes CAD agent and marketing-swarm to be conversation agents (not dashboard)
-- Created: 2026-01-08
-- =============================================================================

-- =============================================================================
-- PREREQUISITE: Create finance organization if it doesn't exist
-- =============================================================================
INSERT INTO public.organizations (slug, name, description)
VALUES ('finance', 'Finance', 'Financial services and prediction agents')
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- STEP 1: Remove deprecated finance-research agent (if exists)
-- =============================================================================
DELETE FROM public.agents WHERE slug = 'finance-research';

-- =============================================================================
-- STEP 2: Fix CAD Agent - change from dashboard to conversation agent
-- =============================================================================
UPDATE public.agents
SET
    metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{executionCapabilities}',
        '{"canConverse": true, "canPlan": false, "canBuild": true, "requiresHumanGate": false}'::jsonb
    ),
    updated_at = NOW()
WHERE slug = 'cad-agent';

-- =============================================================================
-- STEP 3: Fix Marketing Swarm - ensure it's a conversation agent (not dashboard)
-- =============================================================================
UPDATE public.agents
SET
    metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{executionCapabilities}',
        '{"canConverse": true, "canPlan": true, "canBuild": true, "requiresHumanGate": false}'::jsonb
    ),
    updated_at = NOW()
WHERE slug = 'marketing-swarm';

-- =============================================================================
-- STEP 4: Add US Tech Stocks Predictor Agent
-- =============================================================================
INSERT INTO public.agents (
    slug,
    organization_slug,
    name,
    description,
    version,
    agent_type,
    department,
    tags,
    io_schema,
    capabilities,
    context,
    endpoint,
    llm_config,
    metadata,
    created_at,
    updated_at
)
VALUES (
    'us-tech-stocks-2025',
    ARRAY['finance']::TEXT[],
    'US Tech Stocks Predictor',
    'Ambient prediction agent that continuously monitors major US technology stocks (AAPL, MSFT, GOOGL, NVDA, META, AMZN, TSLA) and generates trading recommendations based on technical and fundamental analysis.',
    '1.0.0',
    'api',
    'finance',
    ARRAY['stocks', 'prediction', 'tech', 'ambient-agent', 'trading', 'market-analysis']::TEXT[],
    '{
        "input": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "enum": ["start", "stop", "pause", "resume", "poll_now", "status"],
                    "description": "Lifecycle command for the ambient agent"
                }
            }
        },
        "output": {
            "type": "object",
            "properties": {
                "success": { "type": "boolean" },
                "status": { "type": "object" },
                "recommendations": { "type": "array" }
            }
        }
    }'::JSONB,
    ARRAY['stock-prediction', 'technical-analysis', 'fundamental-analysis', 'sentiment-analysis', 'ambient-monitoring', 'learning-loop']::TEXT[],
    '{"markdown": "# US Tech Stocks Predictor\n\nAn ambient prediction agent that continuously monitors major US technology stocks and generates trading recommendations.\n\n## Tracked Instruments\n- AAPL (Apple Inc.)\n- MSFT (Microsoft Corporation)\n- GOOGL (Alphabet Inc.)\n- NVDA (NVIDIA Corporation)\n- META (Meta Platforms)\n- AMZN (Amazon)\n- TSLA (Tesla)\n\n## Risk Profiles\n- Conservative: Smaller positions, higher confidence threshold\n- Moderate (default): Balanced risk-reward\n- Aggressive: Larger positions, lower confidence threshold"}'::JSONB,
    '{"url": "http://localhost:3000/api/v1/predictions/agents/us-tech-stocks-2025"}'::JSONB,
    '{"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.3}'::JSONB,
    '{
        "runner": "stock-predictor",
        "hasCustomUI": true,
        "customUIComponent": "prediction-dashboard",
        "executionCapabilities": {
            "canConverse": false,
            "canPlan": false,
            "canBuild": false,
            "requiresHumanGate": false,
            "isDashboard": true
        },
        "runnerConfig": {
            "runner": "stock-predictor",
            "instruments": ["AAPL", "MSFT", "GOOGL", "NVDA", "META", "AMZN", "TSLA"],
            "riskProfile": "moderate",
            "pollIntervalMs": 60000
        }
    }'::JSONB,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- STEP 5: Add Crypto Majors Predictor Agent
-- =============================================================================
INSERT INTO public.agents (
    slug,
    organization_slug,
    name,
    description,
    version,
    agent_type,
    department,
    tags,
    io_schema,
    capabilities,
    context,
    endpoint,
    llm_config,
    metadata,
    created_at,
    updated_at
)
VALUES (
    'crypto-majors-2025',
    ARRAY['finance']::TEXT[],
    'Crypto Majors Predictor',
    'Ambient prediction agent that continuously monitors major cryptocurrencies (BTC, ETH, SOL, AVAX, LINK) and generates trading recommendations based on on-chain analysis, DeFi metrics, and market sentiment.',
    '1.0.0',
    'api',
    'finance',
    ARRAY['crypto', 'prediction', 'defi', 'ambient-agent', 'trading', 'on-chain']::TEXT[],
    '{
        "input": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "enum": ["start", "stop", "pause", "resume", "poll_now", "status"],
                    "description": "Lifecycle command for the ambient agent"
                }
            }
        },
        "output": {
            "type": "object",
            "properties": {
                "success": { "type": "boolean" },
                "status": { "type": "object" },
                "recommendations": { "type": "array" }
            }
        }
    }'::JSONB,
    ARRAY['crypto-prediction', 'on-chain-analysis', 'defi-analysis', 'sentiment-analysis', 'ambient-monitoring', 'learning-loop']::TEXT[],
    '{"markdown": "# Crypto Majors Predictor\n\nAn ambient prediction agent that continuously monitors major cryptocurrencies and generates trading recommendations.\n\n## Tracked Instruments\n- BTC (Bitcoin)\n- ETH (Ethereum)\n- SOL (Solana)\n- AVAX (Avalanche)\n- LINK (Chainlink)\n\n## Risk Profiles\n- Hodler: Long-term focus, high confidence threshold\n- Trader: Active trading, balanced risk-reward\n- Degen: Higher risk tolerance, lower confidence threshold"}'::JSONB,
    '{"url": "http://localhost:3000/api/v1/predictions/agents/crypto-majors-2025"}'::JSONB,
    '{"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.3}'::JSONB,
    '{
        "runner": "crypto-predictor",
        "hasCustomUI": true,
        "customUIComponent": "prediction-dashboard",
        "executionCapabilities": {
            "canConverse": false,
            "canPlan": false,
            "canBuild": false,
            "requiresHumanGate": false,
            "isDashboard": true
        },
        "runnerConfig": {
            "runner": "crypto-predictor",
            "instruments": ["BTC", "ETH", "SOL", "AVAX", "LINK"],
            "riskProfile": "trader",
            "pollIntervalMs": 30000
        }
    }'::JSONB,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- STEP 6: Add Polymarket Politics Predictor Agent
-- =============================================================================
INSERT INTO public.agents (
    slug,
    organization_slug,
    name,
    description,
    version,
    agent_type,
    department,
    tags,
    io_schema,
    capabilities,
    context,
    endpoint,
    llm_config,
    metadata,
    created_at,
    updated_at
)
VALUES (
    'polymarket-politics-2025',
    ARRAY['finance']::TEXT[],
    'Polymarket Predictor',
    'Ambient prediction agent that continuously monitors prediction markets on Polymarket and generates betting recommendations based on odds movements, news events, and market analysis.',
    '1.0.0',
    'api',
    'finance',
    ARRAY['polymarket', 'prediction', 'politics', 'ambient-agent', 'betting', 'prediction-markets']::TEXT[],
    '{
        "input": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "enum": ["start", "stop", "pause", "resume", "poll_now", "status"],
                    "description": "Lifecycle command for the ambient agent"
                }
            }
        },
        "output": {
            "type": "object",
            "properties": {
                "success": { "type": "boolean" },
                "status": { "type": "object" },
                "recommendations": { "type": "array" }
            }
        }
    }'::JSONB,
    ARRAY['market-prediction', 'odds-analysis', 'event-tracking', 'news-analysis', 'ambient-monitoring', 'learning-loop']::TEXT[],
    '{"markdown": "# Polymarket Predictor\n\nAn ambient prediction agent that monitors prediction markets on Polymarket and generates betting recommendations.\n\n## Tracked Markets\nMarkets are specified by their Polymarket condition IDs. The agent tracks high-volume political and finance markets.\n\n## Risk Profiles\n- Researcher: Conservative, focus on high-confidence opportunities\n- Speculator: Higher risk tolerance, willing to bet on edge cases"}'::JSONB,
    '{"url": "http://localhost:3000/api/v1/predictions/agents/polymarket-politics-2025"}'::JSONB,
    '{"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.3}'::JSONB,
    '{
        "runner": "market-predictor",
        "hasCustomUI": true,
        "customUIComponent": "prediction-dashboard",
        "executionCapabilities": {
            "canConverse": false,
            "canPlan": false,
            "canBuild": false,
            "requiresHumanGate": false,
            "isDashboard": true
        },
        "runnerConfig": {
            "runner": "market-predictor",
            "instruments": [],
            "riskProfile": "researcher",
            "pollIntervalMs": 60000
        }
    }'::JSONB,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- STEP 7: Add prediction agent configurations to predictions schema
-- =============================================================================

-- Stock predictor config
INSERT INTO predictions.prediction_agents (
    agent_slug,
    org_slug,
    runner_type,
    instruments,
    risk_profile,
    poll_interval_ms,
    pre_filter_thresholds,
    model_config,
    learning_config,
    lifecycle_state,
    auto_start
)
VALUES (
    'us-tech-stocks-2025',
    'finance',
    'stock-predictor',
    ARRAY['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META', 'AMZN', 'TSLA']::TEXT[],
    'moderate',
    60000,
    '{"minPriceChangePercent": 2, "minSentimentShift": 0.2, "minSignificanceScore": 0.3}'::JSONB,
    '{"triage": {"provider": "anthropic", "model": "claude-3-5-haiku-20241022", "temperature": 0.2}, "specialists": {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.3}, "evaluators": {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.4}, "learning": {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.5}}'::JSONB,
    '{"autoPostmortem": true, "detectMissedOpportunities": true, "contextLookbackHours": 24, "maxPostmortemsInContext": 10, "maxSpecialistStats": 5}'::JSONB,
    'stopped',
    false
)
ON CONFLICT (agent_slug) DO UPDATE SET
    instruments = EXCLUDED.instruments,
    risk_profile = EXCLUDED.risk_profile,
    poll_interval_ms = EXCLUDED.poll_interval_ms,
    updated_at = NOW();

-- Crypto predictor config
INSERT INTO predictions.prediction_agents (
    agent_slug,
    org_slug,
    runner_type,
    instruments,
    risk_profile,
    poll_interval_ms,
    pre_filter_thresholds,
    model_config,
    learning_config,
    lifecycle_state,
    auto_start
)
VALUES (
    'crypto-majors-2025',
    'finance',
    'crypto-predictor',
    ARRAY['BTC', 'ETH', 'SOL', 'AVAX', 'LINK']::TEXT[],
    'trader',
    30000,
    '{"minPriceChangePercent": 5, "minSentimentShift": 0.3, "minSignificanceScore": 0.4}'::JSONB,
    '{"triage": {"provider": "anthropic", "model": "claude-3-5-haiku-20241022", "temperature": 0.2}, "specialists": {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.3}, "evaluators": {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.4}, "learning": {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.5}}'::JSONB,
    '{"autoPostmortem": true, "detectMissedOpportunities": true, "contextLookbackHours": 12, "maxPostmortemsInContext": 15, "maxSpecialistStats": 5}'::JSONB,
    'stopped',
    false
)
ON CONFLICT (agent_slug) DO UPDATE SET
    instruments = EXCLUDED.instruments,
    risk_profile = EXCLUDED.risk_profile,
    poll_interval_ms = EXCLUDED.poll_interval_ms,
    updated_at = NOW();

-- Polymarket predictor config
INSERT INTO predictions.prediction_agents (
    agent_slug,
    org_slug,
    runner_type,
    instruments,
    risk_profile,
    poll_interval_ms,
    pre_filter_thresholds,
    model_config,
    learning_config,
    lifecycle_state,
    auto_start
)
VALUES (
    'polymarket-politics-2025',
    'finance',
    'market-predictor',
    ARRAY[]::TEXT[],  -- Markets are dynamic, added via UI
    'researcher',
    60000,
    '{"minPriceChangePercent": 5, "minSentimentShift": 0.3, "minSignificanceScore": 0.4}'::JSONB,
    '{"triage": {"provider": "anthropic", "model": "claude-3-5-haiku-20241022", "temperature": 0.2}, "specialists": {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.3}, "evaluators": {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.4}, "learning": {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.5}}'::JSONB,
    '{"autoPostmortem": true, "detectMissedOpportunities": true, "contextLookbackHours": 48, "maxPostmortemsInContext": 10, "maxSpecialistStats": 5}'::JSONB,
    'stopped',
    false
)
ON CONFLICT (agent_slug) DO UPDATE SET
    instruments = EXCLUDED.instruments,
    risk_profile = EXCLUDED.risk_profile,
    poll_interval_ms = EXCLUDED.poll_interval_ms,
    updated_at = NOW();

-- =============================================================================
-- Verification
-- =============================================================================
DO $$
DECLARE
    stock_exists BOOLEAN;
    crypto_exists BOOLEAN;
    polymarket_exists BOOLEAN;
    finance_removed BOOLEAN;
BEGIN
    -- Check prediction agents exist
    SELECT EXISTS(SELECT 1 FROM public.agents WHERE slug = 'us-tech-stocks-2025') INTO stock_exists;
    SELECT EXISTS(SELECT 1 FROM public.agents WHERE slug = 'crypto-majors-2025') INTO crypto_exists;
    SELECT EXISTS(SELECT 1 FROM public.agents WHERE slug = 'polymarket-politics-2025') INTO polymarket_exists;
    SELECT NOT EXISTS(SELECT 1 FROM public.agents WHERE slug = 'finance-research') INTO finance_removed;

    IF NOT stock_exists THEN
        RAISE EXCEPTION 'US Tech Stocks Predictor agent was not created';
    END IF;

    IF NOT crypto_exists THEN
        RAISE EXCEPTION 'Crypto Majors Predictor agent was not created';
    END IF;

    IF NOT polymarket_exists THEN
        RAISE EXCEPTION 'Polymarket Predictor agent was not created';
    END IF;

    IF NOT finance_removed THEN
        RAISE WARNING 'finance-research agent still exists (may not have existed before)';
    END IF;

    RAISE NOTICE '================================================';
    RAISE NOTICE 'Migration completed successfully';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Added: us-tech-stocks-2025 (Stock Predictor)';
    RAISE NOTICE 'Added: crypto-majors-2025 (Crypto Predictor)';
    RAISE NOTICE 'Added: polymarket-politics-2025 (Polymarket Predictor)';
    RAISE NOTICE 'Removed: finance-research (deprecated)';
    RAISE NOTICE 'Fixed: cad-agent (conversation agent)';
    RAISE NOTICE 'Fixed: marketing-swarm (conversation agent)';
    RAISE NOTICE '================================================';
END $$;

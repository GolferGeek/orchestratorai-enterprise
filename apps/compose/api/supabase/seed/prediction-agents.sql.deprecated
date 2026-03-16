-- =============================================================================
-- PREDICTION AGENTS SEED DATA
-- =============================================================================
-- Seed data for prediction agents.
-- These agents use the prediction runner framework with embedded LangGraph.
--
-- NOTE: Run this after the predictions schema migrations.
-- Created: 2026-01-08
-- =============================================================================

-- =============================================================================
-- US TECH STOCKS PREDICTOR AGENT
-- =============================================================================
-- Stock prediction agent tracking major US tech stocks
-- Uses stock-predictor runner with Yahoo Finance + optional Alpha Vantage
-- =============================================================================

-- First, insert the base agent into public.agents
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
    'Ambient prediction agent that continuously monitors major US technology stocks (AAPL, MSFT, GOOGL, NVDA) and generates trading recommendations based on technical and fundamental analysis.',
    '1.0.0',
    'api',
    'finance',
    ARRAY['stocks', 'prediction', 'tech', 'ambient-agent', 'trading', 'market-analysis']::TEXT[],

    -- Input/Output Schema
    '{
        "input": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "enum": ["start", "stop", "pause", "resume", "poll_now", "status"],
                    "description": "Lifecycle command for the ambient agent"
                },
                "instrumentsOverride": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional override of instruments to poll (for testing)"
                }
            }
        },
        "output": {
            "type": "object",
            "properties": {
                "success": { "type": "boolean" },
                "status": {
                    "type": "object",
                    "properties": {
                        "state": { "type": "string", "enum": ["stopped", "starting", "running", "paused", "stopping", "error"] },
                        "lastPollAt": { "type": "string", "format": "date-time" },
                        "nextPollAt": { "type": "string", "format": "date-time" },
                        "pollCount": { "type": "number" },
                        "recommendationCount": { "type": "number" }
                    }
                },
                "recommendations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string", "format": "uuid" },
                            "instrument": { "type": "string" },
                            "action": { "type": "string" },
                            "confidence": { "type": "number" },
                            "rationale": { "type": "string" }
                        }
                    }
                }
            }
        }
    }'::JSONB,

    -- Capabilities
    ARRAY['stock-prediction', 'technical-analysis', 'fundamental-analysis', 'sentiment-analysis', 'ambient-monitoring', 'learning-loop']::TEXT[],

    -- Context (system prompt for specialists)
    '{
        "markdown": "# US Tech Stocks Predictor\n\nAn ambient prediction agent that continuously monitors major US technology stocks and generates trading recommendations.\n\n## Tracked Instruments\n- AAPL (Apple Inc.)\n- MSFT (Microsoft Corporation)\n- GOOGL (Alphabet Inc.)\n- NVDA (NVIDIA Corporation)\n\n## Analysis Pipeline\n1. **Data Collection**: Yahoo Finance for real-time quotes, optional Alpha Vantage for additional data\n2. **Pre-Filter**: 2% price change threshold triggers deeper analysis\n3. **Triage**: Rule-based and LLM-based assessment of opportunity/risk\n4. **Specialists**: Technical, Fundamental, Sentiment, and News analysts\n5. **Evaluators**: Contrarian, Risk Assessment, Historical Pattern red-teaming\n6. **Packaging**: Risk-adjusted recommendations based on profile\n\n## Risk Profiles\n- Conservative: Smaller positions, higher confidence threshold\n- Moderate (default): Balanced risk-reward\n- Aggressive: Larger positions, lower confidence threshold\n\n## Learning Loop\n- Tracks recommendation outcomes\n- Generates postmortems for incorrect predictions\n- Feeds lessons back into context"
    }'::JSONB,

    -- Endpoint (prediction agents run via runner, but expose an API for lifecycle control)
    '{
        "url": "http://localhost:3000/api/v1/predictions/agents/us-tech-stocks-2025"
    }'::JSONB,

    -- LLM config (for specialist analysis - uses default from org if not specified)
    '{
        "provider": "anthropic",
        "model": "claude-sonnet-4-20250514",
        "temperature": 0.3
    }'::JSONB,

    -- Metadata with runner config
    '{
        "runner": "stock-predictor",
        "hasCustomUI": true,
        "customUIComponent": "prediction-dashboard",
        "runnerConfig": {
            "runner": "stock-predictor",
            "instruments": ["AAPL", "MSFT", "GOOGL", "NVDA"],
            "riskProfile": "moderate",
            "pollIntervalMs": 60000,
            "preFilterThresholds": {
                "minPriceChangePercent": 2,
                "minSentimentShift": 0.2,
                "minSignificanceScore": 0.3
            },
            "modelConfig": {
                "triage": {
                    "provider": "anthropic",
                    "model": "claude-3-5-haiku-20241022",
                    "temperature": 0.2
                },
                "specialists": {
                    "provider": "anthropic",
                    "model": "claude-sonnet-4-20250514",
                    "temperature": 0.3
                },
                "evaluators": {
                    "provider": "anthropic",
                    "model": "claude-sonnet-4-20250514",
                    "temperature": 0.4
                },
                "learning": {
                    "provider": "anthropic",
                    "model": "claude-sonnet-4-20250514",
                    "temperature": 0.5
                }
            },
            "learningConfig": {
                "autoPostmortem": true,
                "detectMissedOpportunities": true,
                "contextLookbackHours": 24,
                "maxPostmortemsInContext": 10,
                "maxSpecialistStats": 5
            }
        }
    }'::JSONB,

    NOW(),
    NOW()
)
ON CONFLICT (slug, organization_slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    version = EXCLUDED.version,
    io_schema = EXCLUDED.io_schema,
    capabilities = EXCLUDED.capabilities,
    context = EXCLUDED.context,
    endpoint = EXCLUDED.endpoint,
    llm_config = EXCLUDED.llm_config,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- Then, insert the prediction agent configuration
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
    ARRAY['AAPL', 'MSFT', 'GOOGL', 'NVDA']::TEXT[],
    'moderate',
    60000,
    '{
        "minPriceChangePercent": 2,
        "minSentimentShift": 0.2,
        "minSignificanceScore": 0.3
    }'::JSONB,
    '{
        "triage": {
            "provider": "anthropic",
            "model": "claude-3-5-haiku-20241022",
            "temperature": 0.2
        },
        "specialists": {
            "provider": "anthropic",
            "model": "claude-sonnet-4-20250514",
            "temperature": 0.3
        },
        "evaluators": {
            "provider": "anthropic",
            "model": "claude-sonnet-4-20250514",
            "temperature": 0.4
        },
        "learning": {
            "provider": "anthropic",
            "model": "claude-sonnet-4-20250514",
            "temperature": 0.5
        }
    }'::JSONB,
    '{
        "autoPostmortem": true,
        "detectMissedOpportunities": true,
        "contextLookbackHours": 24,
        "maxPostmortemsInContext": 10,
        "maxSpecialistStats": 5
    }'::JSONB,
    'stopped',
    false  -- Don't auto-start initially
)
ON CONFLICT (agent_slug) DO UPDATE SET
    instruments = EXCLUDED.instruments,
    risk_profile = EXCLUDED.risk_profile,
    poll_interval_ms = EXCLUDED.poll_interval_ms,
    pre_filter_thresholds = EXCLUDED.pre_filter_thresholds,
    model_config = EXCLUDED.model_config,
    learning_config = EXCLUDED.learning_config,
    updated_at = NOW();

-- =============================================================================
-- CRYPTO PREDICTOR AGENT
-- =============================================================================
-- Cryptocurrency prediction agent tracking major crypto assets
-- Uses crypto-predictor runner with Binance, CoinGecko, DefiLlama
-- =============================================================================

-- Insert the base agent into public.agents
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
    'Ambient prediction agent that continuously monitors major cryptocurrencies (BTC, ETH, SOL, AVAX) and generates trading recommendations based on on-chain analysis, DeFi metrics, and market sentiment.',
    '1.0.0',
    'api',
    'finance',
    ARRAY['crypto', 'prediction', 'defi', 'ambient-agent', 'trading', 'on-chain']::TEXT[],

    -- Input/Output Schema
    '{
        "input": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "enum": ["start", "stop", "pause", "resume", "poll_now", "status"],
                    "description": "Lifecycle command for the ambient agent"
                },
                "instrumentsOverride": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional override of instruments to poll (for testing)"
                }
            }
        },
        "output": {
            "type": "object",
            "properties": {
                "success": { "type": "boolean" },
                "status": {
                    "type": "object",
                    "properties": {
                        "state": { "type": "string", "enum": ["stopped", "starting", "running", "paused", "stopping", "error"] },
                        "lastPollAt": { "type": "string", "format": "date-time" },
                        "nextPollAt": { "type": "string", "format": "date-time" },
                        "pollCount": { "type": "number" },
                        "recommendationCount": { "type": "number" }
                    }
                },
                "recommendations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string", "format": "uuid" },
                            "instrument": { "type": "string" },
                            "action": { "type": "string" },
                            "confidence": { "type": "number" },
                            "rationale": { "type": "string" }
                        }
                    }
                }
            }
        }
    }'::JSONB,

    -- Capabilities
    ARRAY['crypto-prediction', 'on-chain-analysis', 'defi-analysis', 'sentiment-analysis', 'ambient-monitoring', 'learning-loop']::TEXT[],

    -- Context (system prompt for specialists)
    '{
        "markdown": "# Crypto Majors Predictor\n\nAn ambient prediction agent that continuously monitors major cryptocurrencies and generates trading recommendations.\n\n## Tracked Instruments\n- BTC (Bitcoin)\n- ETH (Ethereum)\n- SOL (Solana)\n- AVAX (Avalanche)\n\n## Analysis Pipeline\n1. **Data Collection**: Binance for prices, CoinGecko for market data, DefiLlama for TVL\n2. **Pre-Filter**: 5% price change threshold triggers deeper analysis (crypto is more volatile)\n3. **Triage**: Rule-based and LLM-based assessment of opportunity/risk\n4. **Specialists**: OnChain, DeFi, Sentiment, and Technical analysts\n5. **Evaluators**: Contrarian, Risk Assessment, Whale Movement red-teaming\n6. **Packaging**: Risk-adjusted recommendations based on profile\n\n## Risk Profiles\n- Hodler: Long-term focus, high confidence threshold, larger moves only\n- Trader: Active trading, balanced risk-reward\n- Degen: Higher risk tolerance, lower confidence threshold\n\n## Learning Loop\n- Tracks recommendation outcomes\n- Generates postmortems for incorrect predictions\n- Monitors whale movements that were missed"
    }'::JSONB,

    -- Endpoint
    '{
        "url": "http://localhost:3000/api/v1/predictions/agents/crypto-majors-2025"
    }'::JSONB,

    -- LLM config
    '{
        "provider": "anthropic",
        "model": "claude-sonnet-4-20250514",
        "temperature": 0.3
    }'::JSONB,

    -- Metadata with runner config
    '{
        "runner": "crypto-predictor",
        "hasCustomUI": true,
        "customUIComponent": "prediction-dashboard",
        "runnerConfig": {
            "runner": "crypto-predictor",
            "instruments": ["BTC", "ETH", "SOL", "AVAX"],
            "riskProfile": "trader",
            "pollIntervalMs": 30000,
            "preFilterThresholds": {
                "minPriceChangePercent": 5,
                "minSentimentShift": 0.3,
                "minSignificanceScore": 0.4
            },
            "modelConfig": {
                "triage": {
                    "provider": "anthropic",
                    "model": "claude-3-5-haiku-20241022",
                    "temperature": 0.2
                },
                "specialists": {
                    "provider": "anthropic",
                    "model": "claude-sonnet-4-20250514",
                    "temperature": 0.3
                },
                "evaluators": {
                    "provider": "anthropic",
                    "model": "claude-sonnet-4-20250514",
                    "temperature": 0.4
                },
                "learning": {
                    "provider": "anthropic",
                    "model": "claude-sonnet-4-20250514",
                    "temperature": 0.5
                }
            },
            "learningConfig": {
                "autoPostmortem": true,
                "detectMissedOpportunities": true,
                "contextLookbackHours": 12,
                "maxPostmortemsInContext": 15,
                "maxSpecialistStats": 5
            }
        }
    }'::JSONB,

    NOW(),
    NOW()
)
ON CONFLICT (slug, organization_slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    version = EXCLUDED.version,
    io_schema = EXCLUDED.io_schema,
    capabilities = EXCLUDED.capabilities,
    context = EXCLUDED.context,
    endpoint = EXCLUDED.endpoint,
    llm_config = EXCLUDED.llm_config,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- Insert crypto prediction agent configuration
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
    ARRAY['BTC', 'ETH', 'SOL', 'AVAX']::TEXT[],
    'trader',
    30000,
    '{
        "minPriceChangePercent": 5,
        "minSentimentShift": 0.3,
        "minSignificanceScore": 0.4
    }'::JSONB,
    '{
        "triage": {
            "provider": "anthropic",
            "model": "claude-3-5-haiku-20241022",
            "temperature": 0.2
        },
        "specialists": {
            "provider": "anthropic",
            "model": "claude-sonnet-4-20250514",
            "temperature": 0.3
        },
        "evaluators": {
            "provider": "anthropic",
            "model": "claude-sonnet-4-20250514",
            "temperature": 0.4
        },
        "learning": {
            "provider": "anthropic",
            "model": "claude-sonnet-4-20250514",
            "temperature": 0.5
        }
    }'::JSONB,
    '{
        "autoPostmortem": true,
        "detectMissedOpportunities": true,
        "contextLookbackHours": 12,
        "maxPostmortemsInContext": 15,
        "maxSpecialistStats": 5
    }'::JSONB,
    'stopped',
    false
)
ON CONFLICT (agent_slug) DO UPDATE SET
    instruments = EXCLUDED.instruments,
    risk_profile = EXCLUDED.risk_profile,
    poll_interval_ms = EXCLUDED.poll_interval_ms,
    pre_filter_thresholds = EXCLUDED.pre_filter_thresholds,
    model_config = EXCLUDED.model_config,
    learning_config = EXCLUDED.learning_config,
    updated_at = NOW();

-- =============================================================================
-- POLYMARKET PREDICTOR AGENT
-- =============================================================================
-- Prediction market agent tracking Polymarket markets
-- Uses market-predictor runner with Polymarket CLOB, Gamma API
-- =============================================================================

-- Insert the base agent into public.agents
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
    'Polymarket Politics Predictor',
    'Ambient prediction agent that continuously monitors political prediction markets on Polymarket and generates betting recommendations based on odds movements, news events, and market analysis.',
    '1.0.0',
    'api',
    'finance',
    ARRAY['polymarket', 'prediction', 'politics', 'ambient-agent', 'betting', 'prediction-markets']::TEXT[],

    -- Input/Output Schema
    '{
        "input": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "enum": ["start", "stop", "pause", "resume", "poll_now", "status"],
                    "description": "Lifecycle command for the ambient agent"
                },
                "instrumentsOverride": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional override of market condition IDs to poll (for testing)"
                }
            }
        },
        "output": {
            "type": "object",
            "properties": {
                "success": { "type": "boolean" },
                "status": {
                    "type": "object",
                    "properties": {
                        "state": { "type": "string", "enum": ["stopped", "starting", "running", "paused", "stopping", "error"] },
                        "lastPollAt": { "type": "string", "format": "date-time" },
                        "nextPollAt": { "type": "string", "format": "date-time" },
                        "pollCount": { "type": "number" },
                        "recommendationCount": { "type": "number" }
                    }
                },
                "recommendations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string", "format": "uuid" },
                            "instrument": { "type": "string" },
                            "action": { "type": "string", "enum": ["bet_yes", "bet_no", "wait"] },
                            "confidence": { "type": "number" },
                            "rationale": { "type": "string" }
                        }
                    }
                }
            }
        }
    }'::JSONB,

    -- Capabilities
    ARRAY['market-prediction', 'odds-analysis', 'event-tracking', 'news-analysis', 'ambient-monitoring', 'learning-loop']::TEXT[],

    -- Context (system prompt for specialists)
    '{
        "markdown": "# Polymarket Politics Predictor\n\nAn ambient prediction agent that monitors political prediction markets on Polymarket and generates betting recommendations.\n\n## Tracked Markets\nMarkets are specified by their Polymarket condition IDs. The agent tracks high-volume political markets.\n\n## Analysis Pipeline\n1. **Data Collection**: Polymarket CLOB for odds, Gamma API for detailed data, NewsAPI for events\n2. **Pre-Filter**: 5% odds shift threshold triggers deeper analysis\n3. **Triage**: Rule-based and LLM-based assessment of betting opportunity\n4. **Specialists**: Market, Event, Info, and Contrarian analysts\n5. **Evaluators**: Risk Assessment, Information Quality, Historical Accuracy\n6. **Packaging**: Risk-adjusted recommendations based on profile\n\n## Risk Profiles\n- Researcher: Conservative, focus on high-confidence opportunities\n- Speculator: Higher risk tolerance, willing to bet on edge cases\n\n## Learning Loop\n- Tracks betting outcomes after market resolution\n- Generates postmortems for incorrect predictions\n- Learns from missed mispricing opportunities"
    }'::JSONB,

    -- Endpoint
    '{
        "url": "http://localhost:3000/api/v1/predictions/agents/polymarket-politics-2025"
    }'::JSONB,

    -- LLM config
    '{
        "provider": "anthropic",
        "model": "claude-sonnet-4-20250514",
        "temperature": 0.3
    }'::JSONB,

    -- Metadata with runner config
    '{
        "runner": "market-predictor",
        "hasCustomUI": true,
        "customUIComponent": "prediction-dashboard",
        "runnerConfig": {
            "runner": "market-predictor",
            "instruments": [],
            "riskProfile": "researcher",
            "pollIntervalMs": 60000,
            "preFilterThresholds": {
                "minPriceChangePercent": 5,
                "minSentimentShift": 0.3,
                "minSignificanceScore": 0.4
            },
            "modelConfig": {
                "triage": {
                    "provider": "anthropic",
                    "model": "claude-3-5-haiku-20241022",
                    "temperature": 0.2
                },
                "specialists": {
                    "provider": "anthropic",
                    "model": "claude-sonnet-4-20250514",
                    "temperature": 0.3
                },
                "evaluators": {
                    "provider": "anthropic",
                    "model": "claude-sonnet-4-20250514",
                    "temperature": 0.4
                },
                "learning": {
                    "provider": "anthropic",
                    "model": "claude-sonnet-4-20250514",
                    "temperature": 0.5
                }
            },
            "learningConfig": {
                "autoPostmortem": true,
                "detectMissedOpportunities": true,
                "contextLookbackHours": 48,
                "maxPostmortemsInContext": 10,
                "maxSpecialistStats": 5
            }
        }
    }'::JSONB,

    NOW(),
    NOW()
)
ON CONFLICT (slug, organization_slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    version = EXCLUDED.version,
    io_schema = EXCLUDED.io_schema,
    capabilities = EXCLUDED.capabilities,
    context = EXCLUDED.context,
    endpoint = EXCLUDED.endpoint,
    llm_config = EXCLUDED.llm_config,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- Insert market prediction agent configuration
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
    '{
        "minPriceChangePercent": 5,
        "minSentimentShift": 0.3,
        "minSignificanceScore": 0.4
    }'::JSONB,
    '{
        "triage": {
            "provider": "anthropic",
            "model": "claude-3-5-haiku-20241022",
            "temperature": 0.2
        },
        "specialists": {
            "provider": "anthropic",
            "model": "claude-sonnet-4-20250514",
            "temperature": 0.3
        },
        "evaluators": {
            "provider": "anthropic",
            "model": "claude-sonnet-4-20250514",
            "temperature": 0.4
        },
        "learning": {
            "provider": "anthropic",
            "model": "claude-sonnet-4-20250514",
            "temperature": 0.5
        }
    }'::JSONB,
    '{
        "autoPostmortem": true,
        "detectMissedOpportunities": true,
        "contextLookbackHours": 48,
        "maxPostmortemsInContext": 10,
        "maxSpecialistStats": 5
    }'::JSONB,
    'stopped',
    false
)
ON CONFLICT (agent_slug) DO UPDATE SET
    instruments = EXCLUDED.instruments,
    risk_profile = EXCLUDED.risk_profile,
    poll_interval_ms = EXCLUDED.poll_interval_ms,
    pre_filter_thresholds = EXCLUDED.pre_filter_thresholds,
    model_config = EXCLUDED.model_config,
    learning_config = EXCLUDED.learning_config,
    updated_at = NOW();

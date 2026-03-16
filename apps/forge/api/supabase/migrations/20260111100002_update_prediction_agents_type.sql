-- =============================================================================
-- UPDATE PREDICTION AGENTS TO USE PREDICTION RUNNER TYPE
-- =============================================================================
-- Updates the prediction agents (us-tech-stocks-2025, crypto-majors-2025,
-- polymarket-politics-2025) to use agent_type = 'prediction' so they route
-- through PredictionAgentRunnerService.
--
-- Also ensures they're registered in the new prediction.universes table.
--
-- Created: 2026-01-11
-- =============================================================================

-- =============================================================================
-- STEP 0: Add 'prediction' to allowed agent_type values
-- =============================================================================
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_agent_type_check
  CHECK (agent_type = ANY (ARRAY['context', 'api', 'external', 'rag-runner', 'orchestrator', 'media', 'langgraph', 'prediction']::text[]));

-- =============================================================================
-- STEP 1: Update agent_type to 'prediction' for all prediction agents
-- =============================================================================
UPDATE public.agents
SET
  agent_type = 'prediction',
  updated_at = NOW()
WHERE slug IN ('us-tech-stocks-2025', 'crypto-majors-2025', 'polymarket-politics-2025');

-- =============================================================================
-- STEP 2: Create default universes for each prediction agent
-- =============================================================================

-- US Tech Stocks Universe
INSERT INTO prediction.universes (
  organization_slug,
  agent_slug,
  name,
  domain,
  description,
  llm_config,
  is_active
)
VALUES (
  'finance',
  'us-tech-stocks-2025',
  'US Tech Stocks 2025',
  'stocks',
  'Universe tracking major US technology stocks including AAPL, MSFT, GOOGL, NVDA, META, AMZN, TSLA',
  '{"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.3}'::jsonb,
  true
)
ON CONFLICT (organization_slug, agent_slug, name) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

-- Crypto Majors Universe
INSERT INTO prediction.universes (
  organization_slug,
  agent_slug,
  name,
  domain,
  description,
  llm_config,
  is_active
)
VALUES (
  'finance',
  'crypto-majors-2025',
  'Crypto Majors 2025',
  'crypto',
  'Universe tracking major cryptocurrencies including BTC, ETH, SOL, AVAX, LINK',
  '{"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.3}'::jsonb,
  true
)
ON CONFLICT (organization_slug, agent_slug, name) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

-- Polymarket Universe
INSERT INTO prediction.universes (
  organization_slug,
  agent_slug,
  name,
  domain,
  description,
  llm_config,
  is_active
)
VALUES (
  'finance',
  'polymarket-politics-2025',
  'Polymarket Politics 2025',
  'polymarket',
  'Universe tracking prediction markets on Polymarket',
  '{"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.3}'::jsonb,
  true
)
ON CONFLICT (organization_slug, agent_slug, name) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

-- =============================================================================
-- STEP 3: Create targets for US Tech Stocks
-- =============================================================================

-- Get the universe ID for stock targets
DO $$
DECLARE
  v_universe_id UUID;
BEGIN
  SELECT id INTO v_universe_id FROM prediction.universes
  WHERE agent_slug = 'us-tech-stocks-2025' AND organization_slug = 'finance';

  IF v_universe_id IS NOT NULL THEN
    -- Insert stock targets
    INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context)
    VALUES
      (v_universe_id, 'AAPL', 'Apple Inc.', 'stock', 'Technology company specializing in consumer electronics, software, and services. Known for iPhone, Mac, iPad.'),
      (v_universe_id, 'MSFT', 'Microsoft Corporation', 'stock', 'Technology company. Cloud computing (Azure), Windows, Office 365, Xbox.'),
      (v_universe_id, 'GOOGL', 'Alphabet Inc.', 'stock', 'Parent company of Google. Search, advertising, cloud computing, AI/ML.'),
      (v_universe_id, 'NVDA', 'NVIDIA Corporation', 'stock', 'Semiconductor company. GPUs for gaming and data centers. AI chip leader.'),
      (v_universe_id, 'META', 'Meta Platforms Inc.', 'stock', 'Social media company. Facebook, Instagram, WhatsApp, Quest VR.'),
      (v_universe_id, 'AMZN', 'Amazon.com Inc.', 'stock', 'E-commerce and cloud computing (AWS). Retail, streaming, advertising.'),
      (v_universe_id, 'TSLA', 'Tesla Inc.', 'stock', 'Electric vehicle manufacturer. Energy storage, solar panels, FSD.')
    ON CONFLICT (universe_id, symbol) DO UPDATE SET
      name = EXCLUDED.name,
      context = EXCLUDED.context,
      updated_at = NOW();

    RAISE NOTICE 'Created stock targets for us-tech-stocks-2025';
  END IF;
END $$;

-- =============================================================================
-- STEP 4: Create targets for Crypto Majors
-- =============================================================================

DO $$
DECLARE
  v_universe_id UUID;
BEGIN
  SELECT id INTO v_universe_id FROM prediction.universes
  WHERE agent_slug = 'crypto-majors-2025' AND organization_slug = 'finance';

  IF v_universe_id IS NOT NULL THEN
    INSERT INTO prediction.targets (universe_id, symbol, name, target_type, context)
    VALUES
      (v_universe_id, 'BTC', 'Bitcoin', 'crypto', 'Original cryptocurrency. Digital gold, store of value. Limited supply (21M).'),
      (v_universe_id, 'ETH', 'Ethereum', 'crypto', 'Smart contract platform. DeFi, NFTs, Layer 2 scaling. Proof of Stake.'),
      (v_universe_id, 'SOL', 'Solana', 'crypto', 'High-performance blockchain. Fast transactions, low fees. DeFi, NFTs.'),
      (v_universe_id, 'AVAX', 'Avalanche', 'crypto', 'Layer 1 platform. Subnets architecture. Institutional DeFi focus.'),
      (v_universe_id, 'LINK', 'Chainlink', 'crypto', 'Decentralized oracle network. Connects smart contracts to real-world data.')
    ON CONFLICT (universe_id, symbol) DO UPDATE SET
      name = EXCLUDED.name,
      context = EXCLUDED.context,
      updated_at = NOW();

    RAISE NOTICE 'Created crypto targets for crypto-majors-2025';
  END IF;
END $$;

-- =============================================================================
-- Verification
-- =============================================================================
DO $$
DECLARE
  v_agent_count INTEGER;
  v_universe_count INTEGER;
  v_target_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_agent_count
  FROM public.agents
  WHERE agent_type = 'prediction';

  SELECT COUNT(*) INTO v_universe_count
  FROM prediction.universes
  WHERE organization_slug = 'finance';

  SELECT COUNT(*) INTO v_target_count
  FROM prediction.targets t
  JOIN prediction.universes u ON t.universe_id = u.id
  WHERE u.organization_slug = 'finance';

  RAISE NOTICE '================================================';
  RAISE NOTICE 'Migration completed successfully';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Prediction agents updated: %', v_agent_count;
  RAISE NOTICE 'Universes created: %', v_universe_count;
  RAISE NOTICE 'Targets created: %', v_target_count;
  RAISE NOTICE '================================================';
END $$;

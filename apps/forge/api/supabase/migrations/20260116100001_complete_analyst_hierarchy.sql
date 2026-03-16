-- =====================================================================================
-- PREDICTION SYSTEM - COMPLETE ANALYST HIERARCHY
-- =====================================================================================
-- Description: Enables all analysts and adds universe/target-level analysts
-- for US Tech Stocks prediction system
-- Dependencies: prediction.analysts, prediction.universes, prediction.targets
-- =====================================================================================

-- =====================================================================================
-- STEP 1: ENABLE ALL EXISTING ANALYSTS
-- =====================================================================================

UPDATE prediction.analysts SET is_enabled = true WHERE is_enabled = false;

-- =====================================================================================
-- STEP 2: UNIVERSE-LEVEL ANALYSTS (US Tech Stocks 2025)
-- =====================================================================================
-- These analysts specialize in the US Tech market segment

-- Tech Sector Specialist
INSERT INTO prediction.analysts (
  scope_level, domain, universe_id, slug, name, perspective, tier_instructions, default_weight, is_enabled
)
SELECT
  'universe',
  'stocks',
  u.id,
  'tech-sector-specialist',
  'Tech Sector Specialist',
  'Deep expertise in technology sector dynamics: semiconductor cycles, cloud growth, AI adoption, enterprise software trends, consumer tech patterns',
  '{
    "gold": "Analyze the tech sector comprehensively: semiconductor cycle position and supply chain dynamics, cloud infrastructure spending trends (AWS, Azure, GCP growth rates), AI/ML adoption curve and impact on various sub-sectors, enterprise software spending patterns, consumer tech demand cycles, tech M&A activity, regulatory environment (antitrust, data privacy), and sector rotation dynamics. Consider macro factors affecting tech multiples (interest rates, risk appetite).",
    "silver": "Review key tech sector indicators: semiconductor demand/supply, cloud growth rates, AI investment trends, enterprise IT spending, and consumer sentiment. Identify sector headwinds and tailwinds affecting the portfolio.",
    "bronze": "Quick tech sector read: overall sector momentum, key narratives (AI, cloud, semis), and whether tech is in favor or out of favor. State sector bias."
  }'::jsonb,
  1.00,
  true
FROM prediction.universes u
WHERE u.name = 'US Tech Stocks 2025'
ON CONFLICT DO NOTHING;

-- Macro-Tech Correlation Analyst
INSERT INTO prediction.analysts (
  scope_level, domain, universe_id, slug, name, perspective, tier_instructions, default_weight, is_enabled
)
SELECT
  'universe',
  'stocks',
  u.id,
  'macro-tech-analyst',
  'Macro-Tech Analyst',
  'Focus on macro factors affecting tech stocks: interest rates, dollar strength, risk appetite, liquidity conditions, growth vs value rotation',
  '{
    "gold": "Analyze macro-tech relationships deeply: interest rate expectations and impact on growth stock valuations, real rates and duration risk for tech, dollar strength and earnings translation effects, liquidity conditions (QT/QE, bank reserves, credit spreads), risk appetite indicators (VIX, put/call ratios), growth vs value rotation signals, and cross-asset correlations. Assess if macro environment is supportive for tech multiples.",
    "silver": "Review key macro factors: Fed policy stance, rate expectations, dollar trend, and risk appetite. Identify if macro environment favors or pressures tech valuations. Note any regime changes.",
    "bronze": "Quick macro check: rates rising/falling, dollar direction, risk-on/risk-off. State if macro is bullish or bearish for tech."
  }'::jsonb,
  0.90,
  true
FROM prediction.universes u
WHERE u.name = 'US Tech Stocks 2025'
ON CONFLICT DO NOTHING;

-- Earnings Quality Analyst
INSERT INTO prediction.analysts (
  scope_level, domain, universe_id, slug, name, perspective, tier_instructions, default_weight, is_enabled
)
SELECT
  'universe',
  'stocks',
  u.id,
  'earnings-quality-analyst',
  'Earnings Quality Analyst',
  'Specialize in earnings analysis: beat/miss patterns, guidance trends, estimate revisions, earnings quality metrics',
  '{
    "gold": "Perform deep earnings analysis: historical beat/miss patterns by company, guidance philosophy and reliability, estimate revision trends (EPS, revenue), earnings quality metrics (accruals, cash flow conversion), margin trajectory, and earnings surprise drivers. Analyze management credibility and guidance accuracy. Identify companies with strong earnings momentum vs deteriorating fundamentals.",
    "silver": "Review earnings indicators: recent beat/miss vs expectations, guidance changes, analyst estimate revisions, and earnings quality flags. Assess which companies have positive vs negative earnings momentum.",
    "bronze": "Quick earnings check: recent earnings results, guidance direction, and estimate trend. State if earnings momentum is positive or negative."
  }'::jsonb,
  0.85,
  true
FROM prediction.universes u
WHERE u.name = 'US Tech Stocks 2025'
ON CONFLICT DO NOTHING;

-- =====================================================================================
-- STEP 3: TARGET-LEVEL ANALYSTS (Key Tech Stocks)
-- =====================================================================================
-- These analysts have deep knowledge of specific companies

-- AAPL Specialist
INSERT INTO prediction.analysts (
  scope_level, domain, universe_id, target_id, slug, name, perspective, tier_instructions, default_weight, is_enabled
)
SELECT
  'target',
  'stocks',
  t.universe_id,
  t.id,
  'aapl-specialist',
  'AAPL Specialist',
  'Deep Apple expertise: iPhone cycles, Services growth, China exposure, supply chain, product launches, ecosystem dynamics',
  '{
    "gold": "Analyze Apple comprehensively: iPhone cycle dynamics (supercycles, replacement rates, ASP trends), Services growth trajectory and margin expansion, China market dynamics and regulatory risks, supply chain dependencies (TSMC, Foxconn), product launch patterns and reception, wearables/accessories growth, Vision Pro potential, capital allocation (buybacks, dividends), and ecosystem stickiness. Consider Apple-specific indicators like app store trends and developer sentiment.",
    "silver": "Review key Apple metrics: iPhone demand signals (carrier checks, supply chain), Services growth rate, China sales trend, and product cycle timing. Assess near-term catalysts and risks.",
    "bronze": "Quick Apple check: iPhone momentum, Services trend, China headlines. State if AAPL-specific factors are bullish or bearish."
  }'::jsonb,
  1.00,
  true
FROM prediction.targets t
WHERE t.symbol = 'AAPL'
ON CONFLICT DO NOTHING;

-- MSFT Specialist
INSERT INTO prediction.analysts (
  scope_level, domain, universe_id, target_id, slug, name, perspective, tier_instructions, default_weight, is_enabled
)
SELECT
  'target',
  'stocks',
  t.universe_id,
  t.id,
  'msft-specialist',
  'MSFT Specialist',
  'Deep Microsoft expertise: Azure growth, AI integration (Copilot), Office 365, gaming (Xbox/Activision), enterprise relationships',
  '{
    "gold": "Analyze Microsoft comprehensively: Azure growth rate and market share vs AWS/GCP, AI integration across products (Copilot adoption, pricing power), Office 365 seat growth and ARPU expansion, LinkedIn performance, gaming segment (Xbox, Game Pass, Activision synergies), enterprise relationship depth, and capital allocation. Consider Microsoft-specific indicators like Azure consumption patterns and enterprise IT spending surveys.",
    "silver": "Review key Microsoft metrics: Azure growth rate, Copilot adoption signals, Office 365 trends, and gaming performance. Assess AI monetization progress and competitive position.",
    "bronze": "Quick Microsoft check: Azure momentum, AI/Copilot headlines, enterprise demand. State if MSFT-specific factors are bullish or bearish."
  }'::jsonb,
  1.00,
  true
FROM prediction.targets t
WHERE t.symbol = 'MSFT'
ON CONFLICT DO NOTHING;

-- NVDA Specialist
INSERT INTO prediction.analysts (
  scope_level, domain, universe_id, target_id, slug, name, perspective, tier_instructions, default_weight, is_enabled
)
SELECT
  'target',
  'stocks',
  t.universe_id,
  t.id,
  'nvda-specialist',
  'NVDA Specialist',
  'Deep NVIDIA expertise: data center demand, AI training/inference chips, gaming GPUs, automotive, supply constraints, competition',
  '{
    "gold": "Analyze NVIDIA comprehensively: data center GPU demand (hyperscaler capex, enterprise AI adoption), AI chip competitive landscape (AMD MI300, custom silicon from Google/Amazon), gaming GPU cycle, automotive and robotics growth, supply chain constraints (CoWoS packaging, HBM), China export restrictions impact, and software moat (CUDA ecosystem). Track hyperscaler capex announcements and AI model training compute trends.",
    "silver": "Review key NVIDIA metrics: data center revenue growth, hyperscaler demand signals, gaming inventory levels, and competitive threats. Assess if AI demand is accelerating or moderating.",
    "bronze": "Quick NVIDIA check: AI demand momentum, supply situation, competitive headlines. State if NVDA-specific factors are bullish or bearish."
  }'::jsonb,
  1.20,
  true
FROM prediction.targets t
WHERE t.symbol = 'NVDA'
ON CONFLICT DO NOTHING;

-- GOOGL Specialist
INSERT INTO prediction.analysts (
  scope_level, domain, universe_id, target_id, slug, name, perspective, tier_instructions, default_weight, is_enabled
)
SELECT
  'target',
  'stocks',
  t.universe_id,
  t.id,
  'googl-specialist',
  'GOOGL Specialist',
  'Deep Alphabet expertise: Search dominance vs AI disruption, YouTube growth, Cloud, regulatory/antitrust, Waymo, cost efficiency',
  '{
    "gold": "Analyze Alphabet comprehensively: Search market share and AI disruption risk (ChatGPT, Perplexity), YouTube advertising and Shorts monetization, Google Cloud growth vs AWS/Azure, AI model development (Gemini competitiveness), antitrust risks and potential remedies, Waymo commercialization, cost structure and efficiency gains, and Other Bets optionality. Monitor search query trends and AI assistant adoption.",
    "silver": "Review key Alphabet metrics: Search ad revenue trends, YouTube growth, Cloud market share, and AI competitive position. Assess regulatory risk timeline and potential impact.",
    "bronze": "Quick Alphabet check: Search/AI competitive position, YouTube momentum, regulatory headlines. State if GOOGL-specific factors are bullish or bearish."
  }'::jsonb,
  1.00,
  true
FROM prediction.targets t
WHERE t.symbol = 'GOOGL'
ON CONFLICT DO NOTHING;

-- TSLA Specialist
INSERT INTO prediction.analysts (
  scope_level, domain, universe_id, target_id, slug, name, perspective, tier_instructions, default_weight, is_enabled
)
SELECT
  'target',
  'stocks',
  t.universe_id,
  t.id,
  'tsla-specialist',
  'TSLA Specialist',
  'Deep Tesla expertise: EV demand, production ramps, FSD progress, energy business, China competition, Elon factor',
  '{
    "gold": "Analyze Tesla comprehensively: EV demand trends and market share vs competition (BYD, legacy OEMs), production and delivery trajectory, gross margin pressures from price cuts, FSD progress and robotaxi timeline, energy storage business growth, China market dynamics and local competition, new model launches (Cybertruck, next-gen vehicle), and Elon Musk impact on sentiment and execution. Track EV industry data and China sales figures.",
    "silver": "Review key Tesla metrics: delivery numbers vs expectations, pricing actions, FSD updates, and China performance. Assess margin trajectory and competitive positioning.",
    "bronze": "Quick Tesla check: delivery momentum, pricing/margin headlines, FSD news. State if TSLA-specific factors are bullish or bearish."
  }'::jsonb,
  1.00,
  true
FROM prediction.targets t
WHERE t.symbol = 'TSLA'
ON CONFLICT DO NOTHING;

-- META Specialist
INSERT INTO prediction.analysts (
  scope_level, domain, universe_id, target_id, slug, name, perspective, tier_instructions, default_weight, is_enabled
)
SELECT
  'target',
  'stocks',
  t.universe_id,
  t.id,
  'meta-specialist',
  'META Specialist',
  'Deep Meta expertise: Reels monetization, advertising efficiency, Reality Labs, AI integration, regulatory risks, user trends',
  '{
    "gold": "Analyze Meta comprehensively: core Family of Apps performance (FB, Instagram, WhatsApp engagement), Reels monetization progress vs TikTok, advertising demand and efficiency (ATT recovery), Reality Labs investment and Quest/metaverse progress, AI integration across products, regulatory environment (FTC, international), user growth trends by region, and capital allocation (buybacks, dividends). Monitor app download trends and advertiser sentiment.",
    "silver": "Review key Meta metrics: user engagement trends, ad revenue growth, Reels adoption, and Reality Labs losses. Assess advertising market health and competitive position.",
    "bronze": "Quick Meta check: engagement trends, ad demand, Reality Labs headlines. State if META-specific factors are bullish or bearish."
  }'::jsonb,
  1.00,
  true
FROM prediction.targets t
WHERE t.symbol = 'META'
ON CONFLICT DO NOTHING;

-- AMZN Specialist
INSERT INTO prediction.analysts (
  scope_level, domain, universe_id, target_id, slug, name, perspective, tier_instructions, default_weight, is_enabled
)
SELECT
  'target',
  'stocks',
  t.universe_id,
  t.id,
  'amzn-specialist',
  'AMZN Specialist',
  'Deep Amazon expertise: AWS growth, e-commerce margins, Prime ecosystem, advertising, logistics, AI/ML services',
  '{
    "gold": "Analyze Amazon comprehensively: AWS growth rate and competitive position vs Azure/GCP, e-commerce revenue and profitability (North America vs International), Prime membership trends and engagement, advertising business growth, logistics network efficiency and delivery speed, AI/ML services (Bedrock, SageMaker), and capital allocation. Consider retail industry trends and cloud spending patterns.",
    "silver": "Review key Amazon metrics: AWS growth, e-commerce margins, Prime engagement, and advertising revenue. Assess operating efficiency improvements and competitive dynamics.",
    "bronze": "Quick Amazon check: AWS momentum, retail margins, advertising growth. State if AMZN-specific factors are bullish or bearish."
  }'::jsonb,
  1.00,
  true
FROM prediction.targets t
WHERE t.symbol = 'AMZN'
ON CONFLICT DO NOTHING;

-- =====================================================================================
-- VERIFICATION
-- =====================================================================================

DO $$
DECLARE
  v_total INTEGER;
  v_runner INTEGER;
  v_domain INTEGER;
  v_universe INTEGER;
  v_target INTEGER;
  v_enabled INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM prediction.analysts;
  SELECT COUNT(*) INTO v_runner FROM prediction.analysts WHERE scope_level = 'runner';
  SELECT COUNT(*) INTO v_domain FROM prediction.analysts WHERE scope_level = 'domain';
  SELECT COUNT(*) INTO v_universe FROM prediction.analysts WHERE scope_level = 'universe';
  SELECT COUNT(*) INTO v_target FROM prediction.analysts WHERE scope_level = 'target';
  SELECT COUNT(*) INTO v_enabled FROM prediction.analysts WHERE is_enabled = true;

  RAISE NOTICE '=== ANALYST HIERARCHY COMPLETE ===';
  RAISE NOTICE 'Total analysts: %', v_total;
  RAISE NOTICE 'Runner-level (global): %', v_runner;
  RAISE NOTICE 'Domain-level: %', v_domain;
  RAISE NOTICE 'Universe-level (US Tech): %', v_universe;
  RAISE NOTICE 'Target-level (individual stocks): %', v_target;
  RAISE NOTICE 'Enabled analysts: %', v_enabled;
  RAISE NOTICE '==================================';
END $$;

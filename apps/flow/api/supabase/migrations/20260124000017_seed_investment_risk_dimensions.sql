-- =============================================================================
-- SEED INVESTMENT RISK DIMENSIONS
-- =============================================================================
-- Creates the comprehensive investment risk dimensions with detailed analysis
-- context for LLM-based risk scoring. This migration is idempotent.
-- =============================================================================

-- First, ensure the investment risk scope exists
-- This scope is required for the dimensions to reference
INSERT INTO risk.scopes (
  id,
  organization_slug,
  agent_slug,
  name,
  description,
  domain,
  is_active
)
VALUES (
  '1b59081a-04e7-45d5-a4da-3edd5bae93da',
  'gg',
  'risk-agent',
  'Investment Risk Analysis',
  'Comprehensive multi-factor risk analysis for investment decisions',
  'investment',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = NOW();

-- =============================================================================
-- INVESTMENT RISK DIMENSIONS
-- =============================================================================
-- 12 comprehensive dimensions for investment risk analysis
-- Each dimension includes detailed analysis context for LLM scoring

-- 1. Market Volatility (15% weight)
INSERT INTO risk.dimensions (
  id, scope_id, slug, name, description, weight, display_order, is_active, display_name, icon, color
)
VALUES (
  '765b43ba-f17c-481a-8d67-9b679ddcd1c0',
  '1b59081a-04e7-45d5-a4da-3edd5bae93da',
  'market-volatility',
  'Market Volatility',
  'Analyze price volatility using: (1) Historical volatility - standard deviation of daily returns over 30/60/90 days, (2) Beta coefficient vs S&P 500, (3) Average True Range (ATR), (4) Maximum drawdown history, (5) VIX correlation. Consider earnings announcement volatility spikes, sector-specific volatility patterns, and compare to peer group. Higher volatility = higher risk score. Score 0-100 where >80 is extreme volatility, 60-80 high, 40-60 moderate, <40 low.',
  0.15,
  1,
  true,
  'Volatility',
  'trending_up',
  '#ef4444'
)
ON CONFLICT (scope_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  display_order = EXCLUDED.display_order,
  display_name = EXCLUDED.display_name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  updated_at = NOW();

-- 2. Liquidity Risk (10% weight)
INSERT INTO risk.dimensions (
  id, scope_id, slug, name, description, weight, display_order, is_active, display_name, icon, color
)
VALUES (
  '8f21dd3f-5e00-4358-a119-24cbc6eaad5d',
  '1b59081a-04e7-45d5-a4da-3edd5bae93da',
  'liquidity',
  'Liquidity Risk',
  'Assess liquidity risk through: (1) Average daily trading volume vs shares outstanding, (2) Bid-ask spread analysis, (3) Market depth at various price levels, (4) Days to liquidate position calculations, (5) Volume volatility patterns. Consider market cap tier (mega/large/mid/small/micro), exchange listing quality, institutional ownership percentage, and after-hours liquidity. Illiquid assets that are hard to exit = higher risk. Score 0-100 where >80 is highly illiquid.',
  0.10,
  2,
  true,
  'Liquidity',
  'water_drop',
  '#3b82f6'
)
ON CONFLICT (scope_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  display_order = EXCLUDED.display_order,
  display_name = EXCLUDED.display_name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  updated_at = NOW();

-- 3. Correlation Risk (8% weight)
INSERT INTO risk.dimensions (
  id, scope_id, slug, name, description, weight, display_order, is_active, display_name, icon, color
)
VALUES (
  'a4f7ac8e-f02a-4c82-a454-1336565e4d58',
  '1b59081a-04e7-45d5-a4da-3edd5bae93da',
  'correlation',
  'Correlation Risk',
  'Evaluate correlation risk by analyzing: (1) Rolling correlation with S&P 500, NASDAQ, and sector ETFs, (2) Beta stability over time, (3) Correlation during market stress periods (2008, 2020, 2022), (4) Factor exposures (value, growth, momentum, quality), (5) Sector and geographic concentration. High correlation reduces diversification benefits. Assets that move lockstep with market during downturns = higher risk. Score 0-100 where >80 indicates extreme market correlation.',
  0.08,
  3,
  true,
  'Correlation',
  'link',
  '#8b5cf6'
)
ON CONFLICT (scope_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  display_order = EXCLUDED.display_order,
  display_name = EXCLUDED.display_name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  updated_at = NOW();

-- 4. Financial Health (15% weight)
INSERT INTO risk.dimensions (
  id, scope_id, slug, name, description, weight, display_order, is_active, display_name, icon, color
)
VALUES (
  'fcda9b7b-2a52-40b1-816d-e3266ae5a584',
  '1b59081a-04e7-45d5-a4da-3edd5bae93da',
  'financial-health',
  'Financial Health',
  'Analyze financial health using: (1) Debt metrics - Debt/Equity, Debt/EBITDA, Interest Coverage Ratio, (2) Profitability - ROE, ROA, Net Margin trends, (3) Cash flow - Free Cash Flow, Operating Cash Flow vs Net Income, (4) Balance sheet - Current Ratio, Quick Ratio, Working Capital, (5) Altman Z-Score or similar bankruptcy predictors. Compare to industry peers and historical trends. Weak financials with high debt and poor cash flow = higher risk. Score 0-100 where >80 indicates severe financial distress.',
  0.15,
  4,
  true,
  'Financials',
  'account_balance',
  '#10b981'
)
ON CONFLICT (scope_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  display_order = EXCLUDED.display_order,
  display_name = EXCLUDED.display_name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  updated_at = NOW();

-- 5. Valuation Risk (12% weight)
INSERT INTO risk.dimensions (
  id, scope_id, slug, name, description, weight, display_order, is_active, display_name, icon, color
)
VALUES (
  '28686833-98f3-49f6-866e-034b5115d953',
  '1b59081a-04e7-45d5-a4da-3edd5bae93da',
  'valuation',
  'Valuation Risk',
  'Assess valuation risk through: (1) P/E ratio vs historical average and peers, (2) P/B, P/S, EV/EBITDA multiples, (3) PEG ratio for growth-adjusted valuation, (4) DCF analysis - implied growth rate vs realistic expectations, (5) Earnings yield vs bond yields. Consider market cycle position, sector rotation patterns, and speculative premium. Extreme overvaluation increases downside risk. Score 0-100 where >80 indicates severe overvaluation relative to fundamentals.',
  0.12,
  5,
  true,
  'Valuation',
  'calculate',
  '#f59e0b'
)
ON CONFLICT (scope_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  display_order = EXCLUDED.display_order,
  display_name = EXCLUDED.display_name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  updated_at = NOW();

-- 6. Growth Sustainability (8% weight)
INSERT INTO risk.dimensions (
  id, scope_id, slug, name, description, weight, display_order, is_active, display_name, icon, color
)
VALUES (
  'deb761cc-04eb-46c5-b3e2-71b005402da8',
  '1b59081a-04e7-45d5-a4da-3edd5bae93da',
  'growth-sustainability',
  'Growth Sustainability',
  'Evaluate growth sustainability by examining: (1) Revenue growth rate trends - acceleration/deceleration, (2) Earnings quality - recurring vs one-time, (3) Market share trajectory, (4) Total Addressable Market (TAM) saturation, (5) R&D investment and innovation pipeline. Consider competitive moat durability, customer concentration, and secular vs cyclical growth drivers. Unsustainable growth expectations = higher risk. Score 0-100 where >80 indicates growth is likely to disappoint significantly.',
  0.08,
  6,
  true,
  'Growth',
  'show_chart',
  '#06b6d4'
)
ON CONFLICT (scope_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  display_order = EXCLUDED.display_order,
  display_name = EXCLUDED.display_name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  updated_at = NOW();

-- 7. Regulatory Risk (8% weight)
INSERT INTO risk.dimensions (
  id, scope_id, slug, name, description, weight, display_order, is_active, display_name, icon, color
)
VALUES (
  '43835b95-d11a-4aeb-9eb0-e06cee17321f',
  '1b59081a-04e7-45d5-a4da-3edd5bae93da',
  'regulatory',
  'Regulatory Risk',
  'Analyze regulatory risk including: (1) Industry-specific regulations (FDA, FCC, EPA, SEC), (2) Antitrust/monopoly concerns, (3) Data privacy regulations (GDPR, CCPA), (4) Environmental regulations and carbon exposure, (5) Labor and employment law changes. Consider pending legislation, regulatory agency focus areas, litigation history, and lobbying effectiveness. Heavy regulatory burden or pending adverse rulings = higher risk. Score 0-100 where >80 indicates severe regulatory threat.',
  0.08,
  7,
  true,
  'Regulatory',
  'gavel',
  '#64748b'
)
ON CONFLICT (scope_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  display_order = EXCLUDED.display_order,
  display_name = EXCLUDED.display_name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  updated_at = NOW();

-- 8. Geopolitical Risk (6% weight)
INSERT INTO risk.dimensions (
  id, scope_id, slug, name, description, weight, display_order, is_active, display_name, icon, color
)
VALUES (
  'ebb58ccf-0244-45fa-bb8a-b9f1df661ca5',
  '1b59081a-04e7-45d5-a4da-3edd5bae93da',
  'geopolitical',
  'Geopolitical Risk',
  'Assess geopolitical risk through: (1) Trade policy exposure - tariffs, sanctions, export controls especially Trump administration policies, (2) Supply chain geographic concentration (China, Taiwan, etc.), (3) Revenue exposure to politically unstable regions, (4) Currency/FX policy risks, (5) Globalism vs nationalism trend impacts. Consider US-China tensions, EU relations, emerging market exposure, and reshoring/nearshoring trends. High exposure to trade wars or political instability = higher risk. Score 0-100 where >80 indicates severe geopolitical vulnerability.',
  0.06,
  8,
  true,
  'Geopolitical',
  'public',
  '#dc2626'
)
ON CONFLICT (scope_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  display_order = EXCLUDED.display_order,
  display_name = EXCLUDED.display_name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  updated_at = NOW();

-- 9. Sector Concentration (6% weight)
INSERT INTO risk.dimensions (
  id, scope_id, slug, name, description, weight, display_order, is_active, display_name, icon, color
)
VALUES (
  'd5b3529c-5ac6-456b-8039-e8fb016d6c12',
  '1b59081a-04e7-45d5-a4da-3edd5bae93da',
  'sector-concentration',
  'Sector Concentration',
  'Evaluate sector concentration risk by analyzing: (1) Revenue concentration in single industry, (2) Sector cyclicality and current cycle position, (3) Sector-specific headwinds (disruption, commoditization), (4) Competitive intensity and margin pressure, (5) Sector correlation with macro factors (rates, commodities, consumer). Consider sector rotation patterns, ETF flow impacts, and thematic investing trends. Heavy concentration in troubled sector = higher risk. Score 0-100 where >80 indicates extreme sector vulnerability.',
  0.06,
  9,
  true,
  'Sector',
  'category',
  '#a855f7'
)
ON CONFLICT (scope_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  display_order = EXCLUDED.display_order,
  display_name = EXCLUDED.display_name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  updated_at = NOW();

-- 10. Market Sentiment (5% weight)
INSERT INTO risk.dimensions (
  id, scope_id, slug, name, description, weight, display_order, is_active, display_name, icon, color
)
VALUES (
  '030d930e-9626-4443-86ee-928013cab24d',
  '1b59081a-04e7-45d5-a4da-3edd5bae93da',
  'sentiment',
  'Market Sentiment',
  'Analyze market sentiment using: (1) Analyst ratings distribution and changes, (2) Short interest and days to cover, (3) Options market sentiment (put/call ratios, skew), (4) Social media sentiment analysis, (5) Institutional vs retail flow patterns. Consider earnings surprise history, guidance credibility, and management communication quality. Extremely negative or irrationally positive sentiment = higher risk. Score 0-100 where >80 indicates dangerous sentiment extremes.',
  0.05,
  10,
  true,
  'Sentiment',
  'sentiment_satisfied',
  '#f472b6'
)
ON CONFLICT (scope_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  display_order = EXCLUDED.display_order,
  display_name = EXCLUDED.display_name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  updated_at = NOW();

-- 11. Price Momentum (5% weight)
INSERT INTO risk.dimensions (
  id, scope_id, slug, name, description, weight, display_order, is_active, display_name, icon, color
)
VALUES (
  '3b72f925-8982-4e0f-8867-3c510f054efd',
  '1b59081a-04e7-45d5-a4da-3edd5bae93da',
  'momentum',
  'Price Momentum',
  'Evaluate price momentum through: (1) Relative Strength Index (RSI) and overbought/oversold conditions, (2) Moving average relationships (50/200 day, death/golden cross), (3) Price vs 52-week high/low, (4) Volume-price trend confirmation, (5) Sector relative performance. Consider mean reversion risk, trend exhaustion signals, and support/resistance levels. Extreme momentum (positive or negative) often precedes reversal = higher risk at extremes. Score 0-100 where >80 indicates momentum exhaustion risk.',
  0.05,
  11,
  true,
  'Momentum',
  'speed',
  '#22c55e'
)
ON CONFLICT (scope_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  display_order = EXCLUDED.display_order,
  display_name = EXCLUDED.display_name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  updated_at = NOW();

-- 12. Credit Risk (2% weight)
INSERT INTO risk.dimensions (
  id, scope_id, slug, name, description, weight, display_order, is_active, display_name, icon, color
)
VALUES (
  '3f6f288f-9a74-4ce1-ab1d-e9b7f35f0928',
  '1b59081a-04e7-45d5-a4da-3edd5bae93da',
  'credit',
  'Credit Risk',
  'Assess credit risk for fixed income exposure: (1) Credit ratings from Moody''s, S&P, Fitch, (2) Credit Default Swap (CDS) spreads, (3) Bond yield spreads vs treasuries, (4) Debt maturity schedule and refinancing risk, (5) Recovery rate estimates. For equities, consider corporate bond ratings of the company. Higher default probability = higher risk. Score 0-100 where >80 indicates high probability of credit event or default.',
  0.02,
  12,
  true,
  'Credit',
  'credit_score',
  '#eab308'
)
ON CONFLICT (scope_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  display_order = EXCLUDED.display_order,
  display_name = EXCLUDED.display_name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  updated_at = NOW();

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  dimension_count INTEGER;
  total_weight NUMERIC;
BEGIN
  SELECT COUNT(*), SUM(weight)
  INTO dimension_count, total_weight
  FROM risk.dimensions
  WHERE scope_id = '1b59081a-04e7-45d5-a4da-3edd5bae93da';

  RAISE NOTICE '================================================';
  RAISE NOTICE 'Investment Risk Dimensions Seeded Successfully';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Dimensions created: %', dimension_count;
  RAISE NOTICE 'Total weight: % (should be 1.00)', total_weight;
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Dimensions:';
  RAISE NOTICE '  1. Market Volatility (15%%)';
  RAISE NOTICE '  2. Liquidity Risk (10%%)';
  RAISE NOTICE '  3. Correlation Risk (8%%)';
  RAISE NOTICE '  4. Financial Health (15%%)';
  RAISE NOTICE '  5. Valuation Risk (12%%)';
  RAISE NOTICE '  6. Growth Sustainability (8%%)';
  RAISE NOTICE '  7. Regulatory Risk (8%%)';
  RAISE NOTICE '  8. Geopolitical Risk (6%%)';
  RAISE NOTICE '  9. Sector Concentration (6%%)';
  RAISE NOTICE ' 10. Market Sentiment (5%%)';
  RAISE NOTICE ' 11. Price Momentum (5%%)';
  RAISE NOTICE ' 12. Credit Risk (2%%)';
  RAISE NOTICE '================================================';
END $$;

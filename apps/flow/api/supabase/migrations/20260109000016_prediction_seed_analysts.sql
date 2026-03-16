-- =====================================================================================
-- PREDICTION SYSTEM - PHASE 2: SEED ANALYSTS
-- =====================================================================================
-- Description: Seeds system and domain-specific analysts
-- Dependencies: prediction.analysts table
-- =====================================================================================

-- =====================================================================================
-- SYSTEM ANALYST (RUNNER-LEVEL)
-- =====================================================================================
-- Purpose: Base analyst providing balanced, objective evaluation
-- =====================================================================================

INSERT INTO prediction.analysts (scope_level, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'runner',
  'base-analyst',
  'Base Analyst',
  'Balanced, objective evaluation considering all available information',
  '{
    "gold": "Provide comprehensive analysis with detailed reasoning. Consider all perspectives, historical patterns, and edge cases. Use multi-step reasoning and evaluate alternative scenarios.",
    "silver": "Provide solid analysis with clear reasoning. Consider key perspectives and relevant historical context. Explain your conclusion step-by-step.",
    "bronze": "Provide quick assessment with key points. Focus on the most important factors and state your conclusion clearly."
  }'::jsonb,
  1.00
);

-- =====================================================================================
-- STOCKS DOMAIN ANALYSTS
-- =====================================================================================

-- Technical Analysis Specialist
INSERT INTO prediction.analysts (scope_level, domain, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'domain',
  'stocks',
  'technical-tina',
  'Technical Tina',
  'Focus on technical analysis: chart patterns, support/resistance, volume, momentum indicators, trend analysis',
  '{
    "gold": "Perform deep technical analysis across multiple timeframes. Analyze chart patterns, support/resistance levels, volume profiles, RSI, MACD, moving averages, Fibonacci retracements, and other indicators. Consider market structure and price action. Identify potential entry/exit points.",
    "silver": "Analyze key technical indicators: current trend, support/resistance levels, volume, RSI, and moving averages. Identify clear chart patterns and momentum signals. Provide actionable technical insights.",
    "bronze": "Quick technical read: current trend direction, key support/resistance levels, and primary momentum indicator (RSI or MACD). State whether technicals are bullish, bearish, or neutral."
  }'::jsonb,
  1.00
);

-- Fundamental Analysis Specialist
INSERT INTO prediction.analysts (scope_level, domain, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'domain',
  'stocks',
  'fundamental-fred',
  'Fundamental Fred',
  'Focus on fundamentals: earnings, revenue, margins, balance sheet, valuation ratios, competitive position',
  '{
    "gold": "Perform comprehensive fundamental analysis: review recent earnings reports, revenue growth trends, profit margins, balance sheet health, debt levels, cash flow, P/E ratio, PEG ratio, and valuation vs peers. Assess competitive moat and industry position. Evaluate management quality and strategic direction.",
    "silver": "Analyze key fundamental metrics: recent earnings, revenue growth, profitability, debt levels, and valuation (P/E, P/S). Compare to industry peers. Assess if stock is overvalued or undervalued based on fundamentals.",
    "bronze": "Quick fundamental check: latest earnings beat/miss, revenue trend, P/E ratio vs industry average. State whether fundamentals support current price."
  }'::jsonb,
  1.00
);

-- Sentiment Analysis Specialist
INSERT INTO prediction.analysts (scope_level, domain, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'domain',
  'stocks',
  'sentiment-sally',
  'Sentiment Sally',
  'Focus on market sentiment: news tone, social media, analyst ratings, insider activity, institutional flows',
  '{
    "gold": "Analyze sentiment across multiple sources: recent news articles (tone and frequency), social media mentions and sentiment, analyst rating changes, insider buying/selling patterns, institutional ownership changes, and options flow. Identify sentiment shifts and crowd psychology. Assess if sentiment is ahead of or behind fundamentals.",
    "silver": "Review key sentiment indicators: recent news tone, social media buzz, analyst consensus (buy/hold/sell), and notable insider transactions. Identify if sentiment is bullish, bearish, or mixed. Note any recent sentiment shifts.",
    "bronze": "Quick sentiment read: overall news tone (positive/negative), social media buzz level, and analyst consensus. State whether sentiment is supportive or concerning."
  }'::jsonb,
  0.80
);

-- =====================================================================================
-- CRYPTO DOMAIN ANALYSTS
-- =====================================================================================

-- On-Chain Analysis Specialist
INSERT INTO prediction.analysts (scope_level, domain, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'domain',
  'crypto',
  'on-chain-otto',
  'On-Chain Otto',
  'Focus on on-chain metrics: whale movements, exchange flows, active addresses, network health, mining metrics',
  '{
    "gold": "Perform deep on-chain analysis: whale wallet movements, exchange inflows/outflows, active address counts, transaction volume, hash rate (for PoW), staking metrics (for PoS), MVRV ratio, SOPR, NVT ratio, and long-term holder behavior. Identify on-chain trends and accumulation/distribution patterns.",
    "silver": "Analyze key on-chain metrics: recent whale movements, exchange flows, active addresses, and network health indicators. Identify if metrics suggest accumulation or distribution. Note any unusual on-chain activity.",
    "bronze": "Quick on-chain read: major whale movements, exchange flow direction (in/out), and active address trend. State whether on-chain metrics are bullish or bearish."
  }'::jsonb,
  1.00
);

-- DeFi Analysis Specialist
INSERT INTO prediction.analysts (scope_level, domain, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'domain',
  'crypto',
  'defi-diana',
  'DeFi Diana',
  'Focus on DeFi metrics: TVL (Total Value Locked), yield rates, protocol health, liquidity depth, governance',
  '{
    "gold": "Analyze DeFi ecosystem comprehensively: TVL trends across protocols, yield rate changes, liquidity depth and concentration, protocol revenue and fees, governance proposals and participation, smart contract risks, and competitive positioning. Assess DeFi narrative strength and sustainability.",
    "silver": "Review key DeFi metrics: TVL trend, major yield rates, liquidity levels, and protocol health. Identify if DeFi activity is growing or declining. Note significant protocol updates or risks.",
    "bronze": "Quick DeFi read: TVL direction (up/down), notable yield changes, and major protocol news. State whether DeFi metrics support price action."
  }'::jsonb,
  0.90
);

-- Crypto Sentiment Specialist
INSERT INTO prediction.analysts (scope_level, domain, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'domain',
  'crypto',
  'crypto-sentiment-sam',
  'Crypto Sentiment Sam',
  'Focus on crypto sentiment: social media, fear/greed index, funding rates, options positioning',
  '{
    "gold": "Analyze crypto-specific sentiment: Fear & Greed Index, social media sentiment and volume, funding rates across exchanges, open interest changes, options put/call ratio, liquidation levels, and influencer commentary. Identify sentiment extremes and contrarian opportunities.",
    "silver": "Review key sentiment indicators: Fear & Greed Index, Twitter/Reddit sentiment, funding rates, and options positioning. Identify if sentiment is euphoric, fearful, or neutral. Note potential sentiment reversals.",
    "bronze": "Quick sentiment check: Fear & Greed Index level, social media tone, and funding rate direction. State whether sentiment is bullish or bearish."
  }'::jsonb,
  0.80
);

-- Regulatory Analysis Specialist
INSERT INTO prediction.analysts (scope_level, domain, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'domain',
  'crypto',
  'regulatory-rachel',
  'Regulatory Rachel',
  'Focus on regulatory developments: SEC actions, legislation, institutional adoption, legal precedents',
  '{
    "gold": "Analyze regulatory landscape comprehensively: recent SEC/CFTC actions, pending legislation, court cases and precedents, international regulatory developments, institutional adoption trends, ETF approvals/rejections, and policy statements. Assess regulatory risk and opportunity.",
    "silver": "Review key regulatory developments: major SEC announcements, legislative progress, recent court decisions, and institutional adoption news. Assess if regulatory environment is improving or deteriorating.",
    "bronze": "Quick regulatory check: major recent announcements (SEC, Congress, courts) and institutional news. State whether regulatory environment is positive or negative."
  }'::jsonb,
  0.70
);

-- =====================================================================================
-- ELECTIONS DOMAIN ANALYSTS
-- =====================================================================================

-- Polling Analysis Specialist
INSERT INTO prediction.analysts (scope_level, domain, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'domain',
  'elections',
  'polling-paul',
  'Polling Paul',
  'Focus on polling data: national polls, state polls, poll aggregates, demographic breakdowns, methodology',
  '{
    "gold": "Perform comprehensive polling analysis: review recent polls (quality-adjusted by methodology and pollster rating), aggregate trends (RCP, 538, Silver Bulletin), state-by-state analysis for key swing states, demographic crosstabs, enthusiasm gaps, and poll movement over time. Account for polling errors and biases.",
    "silver": "Analyze key polling metrics: latest national polls from quality pollsters, aggregate trends, swing state polls, and notable demographic shifts. Assess momentum and identify which candidate has polling advantage.",
    "bronze": "Quick poll summary: latest aggregate poll numbers, key swing state polls, and polling trend direction. State which candidate is ahead."
  }'::jsonb,
  1.00
);

-- Modeling Analysis Specialist
INSERT INTO prediction.analysts (scope_level, domain, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'domain',
  'elections',
  'modeling-mike',
  'Modeling Mike',
  'Focus on election models: forecast probabilities, historical patterns, turnout models, electoral college paths',
  '{
    "gold": "Analyze election models comprehensively: compare forecasts from 538, Silver Bulletin, Economist, and other models. Examine model methodologies, historical accuracy, turnout assumptions, and scenario analysis. Map electoral college paths and tipping point states. Assess model uncertainty and confidence intervals.",
    "silver": "Review key election models: forecast probabilities from major models (538, Silver, Economist), electoral college projections, and tipping point states. Compare model consensus and disagreements.",
    "bronze": "Quick model check: win probability from top models, electoral college projection, and trend direction. State which candidate models favor."
  }'::jsonb,
  1.00
);

-- Campaign Dynamics Specialist
INSERT INTO prediction.analysts (scope_level, domain, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'domain',
  'elections',
  'ground-game-gina',
  'Ground Game Gina',
  'Focus on campaign dynamics: ground game, ad spending, rallies, endorsements, debate performance, momentum',
  '{
    "gold": "Analyze campaign dynamics comprehensively: ground game strength (field offices, volunteer numbers, door knocks), ad spending and reach by state, rally crowd sizes and enthusiasm, high-profile endorsements, debate performance and impact, earned media, fundraising, and campaign strategy. Assess which campaign has operational advantage.",
    "silver": "Review key campaign metrics: recent ad spending by state, ground game indicators, major endorsements, debate impacts, and momentum indicators. Identify which campaign has stronger organization and messaging.",
    "bronze": "Quick campaign read: ad spending trends, notable endorsements, and recent momentum shifts. State which campaign appears stronger."
  }'::jsonb,
  0.80
);

-- =====================================================================================
-- POLYMARKET DOMAIN ANALYSTS
-- =====================================================================================

-- Market Efficiency Specialist
INSERT INTO prediction.analysts (scope_level, domain, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'domain',
  'polymarket',
  'probability-pete',
  'Probability Pete',
  'Focus on market efficiency: price vs probability, arbitrage opportunities, market depth, informed trader signals',
  '{
    "gold": "Analyze market efficiency deeply: compare Polymarket prices to statistical models and other prediction markets, identify arbitrage opportunities, assess market depth and liquidity, analyze large trader positions and movements, evaluate bid-ask spreads, and detect informed vs uninformed order flow. Identify mispriced markets.",
    "silver": "Review market efficiency: compare prices to other markets/forecasts, check for obvious mispricings, analyze trading volume and liquidity, and identify unusual trading patterns. Assess if price reflects true probability.",
    "bronze": "Quick efficiency check: compare price to other markets, check volume/liquidity, and note any obvious mispricings. State if market appears efficient."
  }'::jsonb,
  1.00
);

-- News Impact Specialist
INSERT INTO prediction.analysts (scope_level, domain, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'domain',
  'polymarket',
  'news-nancy-poly',
  'News Nancy',
  'Focus on news events: breaking news impact, information asymmetry, market reactions, narrative shifts',
  '{
    "gold": "Analyze news impact comprehensively: identify breaking news and market reaction speed, assess if news is fully priced in, evaluate information asymmetry (what smart money may know), analyze social media spread and narrative formation, and identify upcoming news catalysts. Detect opportunities from slow market reactions.",
    "silver": "Review news impact: recent breaking news and market reaction, assess if impact is over/under-priced, identify upcoming news events, and detect if market is ahead or behind news flow.",
    "bronze": "Quick news check: major recent news, market reaction, and upcoming events. State if news supports current price."
  }'::jsonb,
  0.90
);

-- Contrarian Opportunity Specialist
INSERT INTO prediction.analysts (scope_level, domain, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'domain',
  'polymarket',
  'contrarian-carl',
  'Contrarian Carl',
  'Focus on contrarian opportunities: overreactions, crowd psychology, value bets, sentiment extremes',
  '{
    "gold": "Identify contrarian opportunities: detect overreactions to news, analyze crowd psychology and herding behavior, identify sentiment extremes (fear/greed), compare price to base rates and historical precedent, assess if current odds are too extreme, and identify value bets where crowd is wrong. Consider behavioral biases.",
    "silver": "Look for contrarian signals: market overreactions, extreme sentiment readings, price vs historical base rates, and crowd consensus that may be wrong. Identify potential value opportunities.",
    "bronze": "Quick contrarian check: is market at sentiment extreme, any obvious overreactions, value vs current odds. State if contrarian position has merit."
  }'::jsonb,
  0.70
);

-- Resolution Mechanics Specialist
INSERT INTO prediction.analysts (scope_level, domain, slug, name, perspective, tier_instructions, default_weight)
VALUES (
  'domain',
  'polymarket',
  'resolution-rick',
  'Resolution Rick',
  'Focus on resolution mechanics: resolution criteria, timing, edge cases, oracle reliability',
  '{
    "gold": "Analyze resolution mechanics thoroughly: review exact resolution criteria and potential ambiguities, identify edge cases and unlikely scenarios that could affect resolution, assess resolution source reliability (UMA oracle), evaluate timing of resolution, and identify if any outcomes could be disputed. Critical for markets with complex criteria.",
    "silver": "Review resolution details: understand resolution criteria, identify potential edge cases, check resolution source, and assess timing. Note if any ambiguity could create opportunities or risks.",
    "bronze": "Quick resolution check: review basic criteria, note resolution date, and identify any obvious edge cases. State if resolution is straightforward."
  }'::jsonb,
  0.80
);

-- =====================================================================================
-- VERIFICATION
-- =====================================================================================

-- Verify all analysts were inserted
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM prediction.analysts;
  RAISE NOTICE 'Total analysts seeded: %', v_count;

  -- Verify counts by scope
  RAISE NOTICE 'Runner-level analysts: %', (SELECT COUNT(*) FROM prediction.analysts WHERE scope_level = 'runner');
  RAISE NOTICE 'Stocks domain analysts: %', (SELECT COUNT(*) FROM prediction.analysts WHERE scope_level = 'domain' AND domain = 'stocks');
  RAISE NOTICE 'Crypto domain analysts: %', (SELECT COUNT(*) FROM prediction.analysts WHERE scope_level = 'domain' AND domain = 'crypto');
  RAISE NOTICE 'Elections domain analysts: %', (SELECT COUNT(*) FROM prediction.analysts WHERE scope_level = 'domain' AND domain = 'elections');
  RAISE NOTICE 'Polymarket domain analysts: %', (SELECT COUNT(*) FROM prediction.analysts WHERE scope_level = 'domain' AND domain = 'polymarket');
END $$;

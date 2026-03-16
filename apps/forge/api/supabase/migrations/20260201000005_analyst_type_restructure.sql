-- =====================================================================================
-- PREDICTION SYSTEM - ANALYST TYPE RESTRUCTURE (SIMPLIFIED)
-- =====================================================================================
-- Description: Restructures analysts into personality analysts (decision-makers) and
--              context providers (knowledge layers). Simplified for demo purposes.
-- Dependencies: prediction.analysts
-- =====================================================================================

-- =====================================================================================
-- STEP 1: ADD ANALYST_TYPE COLUMN
-- =====================================================================================

ALTER TABLE prediction.analysts
ADD COLUMN IF NOT EXISTS analyst_type TEXT NOT NULL DEFAULT 'context_provider'
CHECK (analyst_type IN ('personality', 'context_provider'));

CREATE INDEX IF NOT EXISTS idx_analysts_type ON prediction.analysts(analyst_type);

COMMENT ON COLUMN prediction.analysts.analyst_type IS 'personality = decision-maker analyst, context_provider = knowledge layer';

-- =====================================================================================
-- STEP 2: DISABLE ALL EXISTING ANALYSTS (we''ll create fresh ones)
-- =====================================================================================

UPDATE prediction.analysts SET is_enabled = false;

-- =====================================================================================
-- STEP 3: CREATE 5 PERSONALITY ANALYSTS AT RUNNER LEVEL
-- =====================================================================================
-- These are the decision-makers that evaluate ALL domains

-- Fundamental Fred
INSERT INTO prediction.analysts (
  scope_level, slug, name, perspective, tier_instructions, default_weight, is_enabled, analyst_type
) VALUES (
  'runner',
  'fundamental-fred',
  'Fundamental Fred',
  'Focus on fundamentals: earnings quality, revenue trends, margins, balance sheet strength, valuation metrics, competitive position. Data-driven analysis seeking value backed by numbers.',
  '{
    "gold": "Perform comprehensive fundamental analysis: earnings quality and sustainability, revenue growth trajectory, margin trends and drivers, balance sheet strength (debt levels, cash position), valuation multiples vs historical and peers, competitive moat assessment, management quality and capital allocation. Synthesize into a clear directional view.",
    "silver": "Review key fundamentals: recent earnings vs expectations, revenue trend, margin direction, valuation relative to peers. Identify the 2-3 most important fundamental factors driving your view.",
    "bronze": "Quick fundamental check: earnings momentum, valuation level (cheap/fair/expensive), any red flags. State your fundamental bias."
  }'::jsonb,
  1.00,
  true,
  'personality'
) ON CONFLICT (slug, scope_level, domain, universe_id, target_id) DO UPDATE
SET perspective = EXCLUDED.perspective,
    tier_instructions = EXCLUDED.tier_instructions,
    is_enabled = true,
    analyst_type = 'personality';

-- Technical Tina
INSERT INTO prediction.analysts (
  scope_level, slug, name, perspective, tier_instructions, default_weight, is_enabled, analyst_type
) VALUES (
  'runner',
  'technical-tina',
  'Technical Tina',
  'Focus on technical analysis: chart patterns, support/resistance levels, volume analysis, momentum indicators, trend identification. Price action tells the story.',
  '{
    "gold": "Perform comprehensive technical analysis: trend structure (higher highs/lows or vice versa), key support/resistance levels, volume patterns and confirmation, momentum indicators (RSI, MACD), moving average relationships, chart patterns (if any), and relative strength vs benchmark. Identify the primary trend and potential reversal signals.",
    "silver": "Review key technicals: current trend direction, nearest support/resistance, momentum (overbought/oversold), volume trend. State your technical bias with key levels.",
    "bronze": "Quick technical read: trend direction (up/down/sideways), momentum state, key level to watch. State your technical bias."
  }'::jsonb,
  1.00,
  true,
  'personality'
) ON CONFLICT (slug, scope_level, domain, universe_id, target_id) DO UPDATE
SET perspective = EXCLUDED.perspective,
    tier_instructions = EXCLUDED.tier_instructions,
    is_enabled = true,
    analyst_type = 'personality';

-- Sentiment Sally
INSERT INTO prediction.analysts (
  scope_level, slug, name, perspective, tier_instructions, default_weight, is_enabled, analyst_type
) VALUES (
  'runner',
  'sentiment-sally',
  'Sentiment Sally',
  'Focus on market sentiment: news tone, social media buzz, analyst ratings changes, insider activity, institutional flows. The crowd often knows something before it shows in price.',
  '{
    "gold": "Analyze market sentiment comprehensively: news flow tone and recency, social media sentiment and engagement trends, analyst rating changes and price target moves, insider buying/selling patterns, institutional ownership changes, options market positioning (put/call ratios, unusual activity), and retail investor sentiment. Identify if sentiment is a leading or lagging indicator here.",
    "silver": "Review sentiment indicators: recent news tone, analyst sentiment, any notable insider or institutional activity. Assess if sentiment is bullish, bearish, or mixed.",
    "bronze": "Quick sentiment check: overall news tone, any notable analyst moves, crowd mood. State your sentiment read."
  }'::jsonb,
  1.00,
  true,
  'personality'
) ON CONFLICT (slug, scope_level, domain, universe_id, target_id) DO UPDATE
SET perspective = EXCLUDED.perspective,
    tier_instructions = EXCLUDED.tier_instructions,
    is_enabled = true,
    analyst_type = 'personality';

-- Aggressive Alex
INSERT INTO prediction.analysts (
  scope_level, slug, name, perspective, tier_instructions, default_weight, is_enabled, analyst_type
) VALUES (
  'runner',
  'aggressive-alex',
  'Aggressive Alex',
  'Focus on high-conviction momentum plays: breakouts, trend acceleration, volume surges, relative strength. Willing to size up when conviction is high. Fortune favors the bold.',
  '{
    "gold": "Hunt for high-conviction opportunities: identify breakout setups or trend acceleration, assess volume confirmation and follow-through potential, evaluate relative strength vs sector and market, look for catalyst alignment (earnings, news, sector rotation), consider risk/reward for aggressive positioning. Be decisive - if the setup is there, be bold.",
    "silver": "Look for momentum signals: breakout potential, volume surge, relative strength. If you see a strong setup, lean into it. State your conviction level.",
    "bronze": "Quick momentum scan: is this breaking out or breaking down? Is there energy behind the move? State if this is a high-conviction opportunity."
  }'::jsonb,
  1.10,
  true,
  'personality'
) ON CONFLICT (slug, scope_level, domain, universe_id, target_id) DO UPDATE
SET perspective = EXCLUDED.perspective,
    tier_instructions = EXCLUDED.tier_instructions,
    is_enabled = true,
    analyst_type = 'personality';

-- Cautious Carl
INSERT INTO prediction.analysts (
  scope_level, slug, name, perspective, tier_instructions, default_weight, is_enabled, analyst_type
) VALUES (
  'runner',
  'cautious-carl',
  'Cautious Carl',
  'Focus on risk management: downside protection, margin of safety, position sizing discipline. Skeptical of hype, prefers asymmetric risk/reward. Preserve capital first.',
  '{
    "gold": "Assess risk thoroughly: identify potential downside scenarios and their probability, evaluate margin of safety in current valuation, look for hidden risks (leverage, concentration, key person), assess liquidity and exit options, consider correlation with existing positions, evaluate if risk/reward is truly asymmetric. When in doubt, stay out or size down.",
    "silver": "Focus on risks: what could go wrong, how much downside, is there margin of safety. Be the voice of caution. State your risk assessment.",
    "bronze": "Quick risk check: biggest risk here, is downside protected, comfortable or concerned? State your risk view."
  }'::jsonb,
  0.90,
  true,
  'personality'
) ON CONFLICT (slug, scope_level, domain, universe_id, target_id) DO UPDATE
SET perspective = EXCLUDED.perspective,
    tier_instructions = EXCLUDED.tier_instructions,
    is_enabled = true,
    analyst_type = 'personality';

-- =====================================================================================
-- STEP 4: CREATE CONTEXT PROVIDERS
-- =====================================================================================

-- Base Analyst (runner level - general knowledge, always included)
INSERT INTO prediction.analysts (
  scope_level, slug, name, perspective, tier_instructions, default_weight, is_enabled, analyst_type
) VALUES (
  'runner',
  'base-analyst',
  'Base Analyst',
  'General market knowledge and analytical framework. Provides foundational context for all analysis.',
  '{
    "gold": "Apply rigorous analytical framework: consider multiple timeframes, weigh conflicting signals, maintain intellectual honesty about uncertainty, and provide clear reasoning for conclusions.",
    "silver": "Apply solid analytical thinking: weigh the evidence, acknowledge uncertainty, provide clear reasoning.",
    "bronze": "Think clearly, state your view with reasoning."
  }'::jsonb,
  1.00,
  true,
  'context_provider'
) ON CONFLICT (slug, scope_level, domain, universe_id, target_id) DO UPDATE
SET perspective = EXCLUDED.perspective,
    tier_instructions = EXCLUDED.tier_instructions,
    is_enabled = true,
    analyst_type = 'context_provider';

-- Stocks Domain Context Provider
INSERT INTO prediction.analysts (
  scope_level, domain, slug, name, perspective, tier_instructions, default_weight, is_enabled, analyst_type
) VALUES (
  'domain',
  'stocks',
  'stocks-context',
  'Stocks Domain Expert',
  'Expertise in equity markets: earnings cycles, sector rotation, market structure, institutional dynamics, macro influences on stocks.',
  '{
    "gold": "Apply stock market expertise: consider earnings season dynamics, sector rotation patterns, index rebalancing effects, options expiration impacts, institutional positioning, and macro factors (rates, dollar, risk appetite). Factor in market microstructure when relevant.",
    "silver": "Consider stock-specific factors: earnings timing, sector trends, institutional activity, macro backdrop.",
    "bronze": "Remember this is a stock - consider earnings, sector, and market context."
  }'::jsonb,
  1.00,
  true,
  'context_provider'
) ON CONFLICT (slug, scope_level, domain, universe_id, target_id) DO UPDATE
SET perspective = EXCLUDED.perspective,
    tier_instructions = EXCLUDED.tier_instructions,
    is_enabled = true,
    analyst_type = 'context_provider';

-- Crypto Domain Context Provider
INSERT INTO prediction.analysts (
  scope_level, domain, slug, name, perspective, tier_instructions, default_weight, is_enabled, analyst_type
) VALUES (
  'domain',
  'crypto',
  'crypto-context',
  'Crypto Domain Expert',
  'Expertise in cryptocurrency markets: on-chain metrics, DeFi dynamics, regulatory landscape, network effects, market cycles, whale movements.',
  '{
    "gold": "Apply crypto market expertise: consider on-chain metrics (active addresses, transaction volume, exchange flows), DeFi TVL and yields, regulatory developments, Bitcoin dominance, altcoin rotation patterns, whale wallet movements, and crypto-specific sentiment (fear/greed index, funding rates). Factor in 24/7 trading and global liquidity dynamics.",
    "silver": "Consider crypto-specific factors: on-chain activity, regulatory news, BTC correlation, market cycle phase.",
    "bronze": "Remember this is crypto - consider on-chain data, regulation, and BTC influence."
  }'::jsonb,
  1.00,
  true,
  'context_provider'
) ON CONFLICT (slug, scope_level, domain, universe_id, target_id) DO UPDATE
SET perspective = EXCLUDED.perspective,
    tier_instructions = EXCLUDED.tier_instructions,
    is_enabled = true,
    analyst_type = 'context_provider';

-- =====================================================================================
-- STEP 5: CREATE HELPER FUNCTION TO GET CONTEXT PROVIDERS FOR A TARGET
-- =====================================================================================

CREATE OR REPLACE FUNCTION prediction.get_context_for_target(p_target_id UUID)
RETURNS TABLE (
  scope_level TEXT,
  slug TEXT,
  name TEXT,
  perspective TEXT,
  tier_instructions JSONB
) AS $$
DECLARE
  v_target RECORD;
BEGIN
  -- Get target and universe info
  SELECT t.id, t.universe_id, u.domain
  INTO v_target
  FROM prediction.targets t
  JOIN prediction.universes u ON t.universe_id = u.id
  WHERE t.id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target not found: %', p_target_id;
  END IF;

  -- Return context providers in scope order: runner -> domain -> universe -> target
  RETURN QUERY
  SELECT
    a.scope_level,
    a.slug,
    a.name,
    a.perspective,
    a.tier_instructions
  FROM prediction.analysts a
  WHERE a.analyst_type = 'context_provider'
    AND a.is_enabled = true
    AND (
      -- Runner-level (always included)
      a.scope_level = 'runner'
      -- Domain-level (if matches)
      OR (a.scope_level = 'domain' AND a.domain = v_target.domain)
      -- Universe-level (if matches)
      OR (a.scope_level = 'universe' AND a.universe_id = v_target.universe_id)
      -- Target-level (if matches)
      OR (a.scope_level = 'target' AND a.target_id = p_target_id)
    )
  ORDER BY
    CASE a.scope_level
      WHEN 'runner' THEN 1
      WHEN 'domain' THEN 2
      WHEN 'universe' THEN 3
      WHEN 'target' THEN 4
    END;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION prediction.get_context_for_target(UUID) IS
  'Returns context providers applicable to a target in scope order (runner -> domain -> universe -> target)';

-- =====================================================================================
-- STEP 6: CREATE FUNCTION TO GET PERSONALITY ANALYSTS
-- =====================================================================================

CREATE OR REPLACE FUNCTION prediction.get_personality_analysts()
RETURNS TABLE (
  analyst_id UUID,
  slug TEXT,
  name TEXT,
  perspective TEXT,
  default_weight NUMERIC(3,2),
  tier_instructions JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS analyst_id,
    a.slug,
    a.name,
    a.perspective,
    a.default_weight,
    a.tier_instructions
  FROM prediction.analysts a
  WHERE a.analyst_type = 'personality'
    AND a.is_enabled = true
  ORDER BY a.name;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION prediction.get_personality_analysts() IS
  'Returns all enabled personality analysts (decision-makers)';

-- =====================================================================================
-- VERIFICATION
-- =====================================================================================

DO $$
DECLARE
  v_personality INTEGER;
  v_context INTEGER;
  v_total_enabled INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_personality FROM prediction.analysts WHERE analyst_type = 'personality' AND is_enabled = true;
  SELECT COUNT(*) INTO v_context FROM prediction.analysts WHERE analyst_type = 'context_provider' AND is_enabled = true;
  SELECT COUNT(*) INTO v_total_enabled FROM prediction.analysts WHERE is_enabled = true;

  RAISE NOTICE '=== ANALYST RESTRUCTURE COMPLETE ===';
  RAISE NOTICE 'Personality analysts (decision-makers): %', v_personality;
  RAISE NOTICE 'Context providers (knowledge layers): %', v_context;
  RAISE NOTICE 'Total enabled: %', v_total_enabled;
  RAISE NOTICE '=====================================';
END $$;

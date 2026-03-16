-- =============================================================================
-- PREDICTION DIRECTION VALIDATION
-- =============================================================================
-- Triggers to enforce direction vocabulary by domain
-- Signals/Predictors use sentiment: bullish/bearish/neutral
-- Predictions use outcome: up/down/flat
-- Phase 1, Step 1-2
-- =============================================================================

-- =============================================================================
-- VALIDATION FUNCTIONS
-- =============================================================================

-- Validate signal/predictor direction (sentiment vocabulary)
CREATE OR REPLACE FUNCTION prediction.validate_signal_direction(
  p_direction TEXT,
  p_target_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_domain TEXT;
BEGIN
  -- Get target's domain via universe
  SELECT u.domain INTO v_domain
  FROM prediction.targets t
  JOIN prediction.universes u ON t.universe_id = u.id
  WHERE t.id = p_target_id;

  -- For stocks/crypto: bullish, bearish, neutral
  IF v_domain IN ('stocks', 'crypto') THEN
    RETURN p_direction IN ('bullish', 'bearish', 'neutral');
  END IF;

  -- For elections/polymarket: can also use yes/no
  -- Allow bullish/bearish/neutral as fallback
  IF v_domain IN ('elections', 'polymarket') THEN
    RETURN p_direction IN ('bullish', 'bearish', 'neutral', 'yes', 'no');
  END IF;

  -- Unknown domain
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- Validate prediction direction (outcome vocabulary)
CREATE OR REPLACE FUNCTION prediction.validate_prediction_direction(
  p_direction TEXT,
  p_target_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_domain TEXT;
BEGIN
  -- Get target's domain via universe
  SELECT u.domain INTO v_domain
  FROM prediction.targets t
  JOIN prediction.universes u ON t.universe_id = u.id
  WHERE t.id = p_target_id;

  -- For stocks/crypto: up, down, flat (outcome vocabulary)
  IF v_domain IN ('stocks', 'crypto') THEN
    RETURN p_direction IN ('up', 'down', 'flat');
  END IF;

  -- For elections/polymarket: yes/no/uncertain
  IF v_domain IN ('elections', 'polymarket') THEN
    RETURN p_direction IN ('yes', 'no', 'uncertain');
  END IF;

  -- Unknown domain
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- ENFORCEMENT TRIGGERS
-- =============================================================================

-- Enforce signal direction
CREATE OR REPLACE FUNCTION prediction.enforce_signal_direction()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT prediction.validate_signal_direction(NEW.direction, NEW.target_id) THEN
    RAISE EXCEPTION 'Invalid signal direction "%" for target domain', NEW.direction;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_signal_direction
  BEFORE INSERT OR UPDATE ON prediction.signals
  FOR EACH ROW
  EXECUTE FUNCTION prediction.enforce_signal_direction();

-- Enforce predictor direction
CREATE OR REPLACE FUNCTION prediction.enforce_predictor_direction()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT prediction.validate_signal_direction(NEW.direction, NEW.target_id) THEN
    RAISE EXCEPTION 'Invalid predictor direction "%" for target domain', NEW.direction;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_predictor_direction
  BEFORE INSERT OR UPDATE ON prediction.predictors
  FOR EACH ROW
  EXECUTE FUNCTION prediction.enforce_predictor_direction();

-- =============================================================================
-- DIRECTION MAPPING FUNCTION
-- =============================================================================
-- Maps sentiment (bullish/bearish) to outcome (up/down)

CREATE OR REPLACE FUNCTION prediction.map_sentiment_to_outcome(
  p_sentiment TEXT,
  p_domain TEXT
)
RETURNS TEXT AS $$
BEGIN
  IF p_domain IN ('stocks', 'crypto') THEN
    RETURN CASE p_sentiment
      WHEN 'bullish' THEN 'up'
      WHEN 'bearish' THEN 'down'
      WHEN 'neutral' THEN 'flat'
      ELSE NULL
    END;
  ELSIF p_domain IN ('elections', 'polymarket') THEN
    -- For elections/polymarket, sentiment maps to yes/no
    RETURN CASE p_sentiment
      WHEN 'bullish' THEN 'yes'
      WHEN 'bearish' THEN 'no'
      WHEN 'neutral' THEN 'uncertain'
      WHEN 'yes' THEN 'yes'
      WHEN 'no' THEN 'no'
      ELSE NULL
    END;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON FUNCTION prediction.validate_signal_direction(TEXT, UUID) IS 'Validates signal direction against target domain';
COMMENT ON FUNCTION prediction.validate_prediction_direction(TEXT, UUID) IS 'Validates prediction direction against target domain';
COMMENT ON FUNCTION prediction.map_sentiment_to_outcome(TEXT, TEXT) IS 'Maps sentiment vocabulary to outcome vocabulary';

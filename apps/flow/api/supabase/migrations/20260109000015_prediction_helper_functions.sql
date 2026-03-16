-- =====================================================================================
-- PREDICTION SYSTEM - PHASE 2: HELPER FUNCTIONS
-- =====================================================================================
-- Description: Helper functions for analyst and learning retrieval
-- Dependencies: prediction schema, analysts, analyst_overrides, learnings
-- =====================================================================================

-- =====================================================================================
-- GET ACTIVE ANALYSTS FUNCTION
-- =====================================================================================
-- Purpose: Returns analysts with effective weights for a target, respecting scope hierarchy
-- Parameters:
--   p_target_id: Target to get analysts for
--   p_tier: Optional LLM tier override ('gold', 'silver', 'bronze')
-- Returns: Set of active analysts with effective weights and instructions
-- =====================================================================================

CREATE OR REPLACE FUNCTION prediction.get_active_analysts(
  p_target_id UUID,
  p_tier TEXT DEFAULT NULL
)
RETURNS TABLE (
  analyst_id UUID,
  slug TEXT,
  name TEXT,
  perspective TEXT,
  effective_weight NUMERIC(3,2),
  effective_tier TEXT,
  tier_instructions JSONB,
  learned_patterns JSONB,
  scope_level TEXT
) AS $$
DECLARE
  v_target RECORD;
BEGIN
  -- Get target and universe info
  SELECT t.id, t.universe_id, u.domain, u.id as universe_id
  INTO v_target
  FROM prediction.targets t
  JOIN prediction.universes u ON t.universe_id = u.id
  WHERE t.id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target not found: %', p_target_id;
  END IF;

  RETURN QUERY
  WITH analyst_candidates AS (
    -- Get all applicable analysts by scope hierarchy
    SELECT
      a.id,
      a.slug,
      a.name,
      a.perspective,
      a.default_weight,
      a.tier_instructions,
      a.learned_patterns,
      a.scope_level,
      a.is_enabled,
      -- Priority: target > universe > domain > runner
      CASE a.scope_level
        WHEN 'target' THEN 1
        WHEN 'universe' THEN 2
        WHEN 'domain' THEN 3
        WHEN 'runner' THEN 4
      END AS scope_priority
    FROM prediction.analysts a
    WHERE a.is_enabled = true
      AND (
        -- Runner-level (global)
        a.scope_level = 'runner'
        -- Domain-level
        OR (a.scope_level = 'domain' AND a.domain = v_target.domain)
        -- Universe-level
        OR (a.scope_level = 'universe' AND a.universe_id = v_target.universe_id)
        -- Target-level
        OR (a.scope_level = 'target' AND a.target_id = p_target_id)
      )
  ),
  with_overrides AS (
    -- Apply overrides (target > universe)
    -- Use DISTINCT ON to pick the most specific scope per analyst slug
    SELECT DISTINCT ON (ac.slug)
      ac.id AS analyst_id,
      ac.slug,
      ac.name,
      ac.perspective,
      COALESCE(
        tao.weight_override,
        uao.weight_override,
        ac.default_weight
      ) AS effective_weight,
      COALESCE(
        tao.tier_override,
        uao.tier_override,
        COALESCE(p_tier, 'silver')
      ) AS effective_tier,
      ac.tier_instructions,
      ac.learned_patterns,
      ac.scope_level,
      COALESCE(
        tao.is_enabled_override,
        uao.is_enabled_override,
        ac.is_enabled
      ) AS is_enabled
    FROM analyst_candidates ac
    LEFT JOIN prediction.analyst_overrides tao
      ON tao.analyst_id = ac.id AND tao.target_id = p_target_id
    LEFT JOIN prediction.analyst_overrides uao
      ON uao.analyst_id = ac.id AND uao.universe_id = v_target.universe_id AND uao.target_id IS NULL
    ORDER BY ac.slug, ac.scope_priority
  )
  SELECT
    wo.analyst_id,
    wo.slug,
    wo.name,
    wo.perspective,
    wo.effective_weight,
    wo.effective_tier,
    wo.tier_instructions,
    wo.learned_patterns,
    wo.scope_level
  FROM with_overrides wo
  WHERE wo.is_enabled = true
    AND wo.effective_weight > 0
  ORDER BY wo.effective_weight DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Comments
COMMENT ON FUNCTION prediction.get_active_analysts(UUID, TEXT) IS
  'Returns active analysts for a target with effective weights, respecting scope hierarchy and overrides';

-- =====================================================================================
-- GET ACTIVE LEARNINGS FUNCTION
-- =====================================================================================
-- Purpose: Returns learnings applicable to a target, respecting scope hierarchy
-- Parameters:
--   p_target_id: Target to get learnings for
--   p_tier: Optional LLM tier filter
--   p_analyst_id: Optional analyst filter
-- Returns: Set of active learnings applicable to the target
-- =====================================================================================

CREATE OR REPLACE FUNCTION prediction.get_active_learnings(
  p_target_id UUID,
  p_tier TEXT DEFAULT NULL,
  p_analyst_id UUID DEFAULT NULL
)
RETURNS TABLE (
  learning_id UUID,
  learning_type TEXT,
  title TEXT,
  description TEXT,
  config JSONB,
  scope_level TEXT,
  times_applied INTEGER,
  times_helpful INTEGER
) AS $$
DECLARE
  v_target RECORD;
BEGIN
  -- Get target info
  SELECT t.id, t.universe_id, u.domain
  INTO v_target
  FROM prediction.targets t
  JOIN prediction.universes u ON t.universe_id = u.id
  WHERE t.id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target not found: %', p_target_id;
  END IF;

  RETURN QUERY
  SELECT
    l.id AS learning_id,
    l.learning_type,
    l.title,
    l.description,
    l.config,
    l.scope_level,
    l.times_applied,
    l.times_helpful
  FROM prediction.learnings l
  WHERE l.status = 'active'
    AND (
      -- Runner-level (global)
      l.scope_level = 'runner'
      -- Domain-level
      OR (l.scope_level = 'domain' AND l.domain = v_target.domain)
      -- Universe-level
      OR (l.scope_level = 'universe' AND l.universe_id = v_target.universe_id)
      -- Target-level
      OR (l.scope_level = 'target' AND l.target_id = p_target_id)
    )
    -- Analyst filter (if specified)
    AND (p_analyst_id IS NULL OR l.analyst_id IS NULL OR l.analyst_id = p_analyst_id)
  ORDER BY
    -- Broader scope first (runner -> target)
    CASE l.scope_level
      WHEN 'runner' THEN 1
      WHEN 'domain' THEN 2
      WHEN 'universe' THEN 3
      WHEN 'target' THEN 4
    END,
    l.times_helpful DESC,
    l.created_at ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Comments
COMMENT ON FUNCTION prediction.get_active_learnings(UUID, TEXT, UUID) IS
  'Returns active learnings for a target, respecting scope hierarchy, with optional analyst filter';

-- =====================================================================================
-- INCREMENT LEARNING APPLICATION FUNCTION
-- =====================================================================================
-- Purpose: Increments times_applied counter for a learning
-- Parameters:
--   p_learning_id: Learning to increment
--   p_was_helpful: Whether the learning was helpful (optional)
-- =====================================================================================

CREATE OR REPLACE FUNCTION prediction.increment_learning_application(
  p_learning_id UUID,
  p_was_helpful BOOLEAN DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE prediction.learnings
  SET
    times_applied = times_applied + 1,
    times_helpful = CASE
      WHEN p_was_helpful = true THEN times_helpful + 1
      ELSE times_helpful
    END,
    updated_at = NOW()
  WHERE id = p_learning_id;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON FUNCTION prediction.increment_learning_application(UUID, BOOLEAN) IS
  'Increments times_applied counter for a learning, optionally marking as helpful';

-- =====================================================================================
-- GET ANALYST EFFECTIVE SETTINGS FUNCTION
-- =====================================================================================
-- Purpose: Returns effective settings for a specific analyst at a target
-- Parameters:
--   p_analyst_id: Analyst to get settings for
--   p_target_id: Target to get settings for
--   p_tier: Optional LLM tier override
-- Returns: Single row with effective settings
-- =====================================================================================

CREATE OR REPLACE FUNCTION prediction.get_analyst_effective_settings(
  p_analyst_id UUID,
  p_target_id UUID,
  p_tier TEXT DEFAULT NULL
)
RETURNS TABLE (
  effective_weight NUMERIC(3,2),
  effective_tier TEXT,
  is_enabled BOOLEAN,
  tier_instructions JSONB
) AS $$
DECLARE
  v_analyst RECORD;
  v_target RECORD;
  v_target_override RECORD;
  v_universe_override RECORD;
BEGIN
  -- Get analyst info
  SELECT a.*, a.default_weight, a.is_enabled, a.tier_instructions
  INTO v_analyst
  FROM prediction.analysts a
  WHERE a.id = p_analyst_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Analyst not found: %', p_analyst_id;
  END IF;

  -- Get target info
  SELECT t.id, t.universe_id
  INTO v_target
  FROM prediction.targets t
  WHERE t.id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target not found: %', p_target_id;
  END IF;

  -- Get target-level override (if exists)
  SELECT ao.*
  INTO v_target_override
  FROM prediction.analyst_overrides ao
  WHERE ao.analyst_id = p_analyst_id
    AND ao.target_id = p_target_id;

  -- Get universe-level override (if exists and no target override)
  SELECT ao.*
  INTO v_universe_override
  FROM prediction.analyst_overrides ao
  WHERE ao.analyst_id = p_analyst_id
    AND ao.universe_id = v_target.universe_id
    AND ao.target_id IS NULL;

  -- Return effective settings
  RETURN QUERY
  SELECT
    COALESCE(
      v_target_override.weight_override,
      v_universe_override.weight_override,
      v_analyst.default_weight
    ) AS effective_weight,
    COALESCE(
      v_target_override.tier_override,
      v_universe_override.tier_override,
      COALESCE(p_tier, 'silver')
    ) AS effective_tier,
    COALESCE(
      v_target_override.is_enabled_override,
      v_universe_override.is_enabled_override,
      v_analyst.is_enabled
    ) AS is_enabled,
    v_analyst.tier_instructions;
END;
$$ LANGUAGE plpgsql STABLE;

-- Comments
COMMENT ON FUNCTION prediction.get_analyst_effective_settings(UUID, UUID, TEXT) IS
  'Returns effective settings for a specific analyst at a target, respecting overrides';

-- =====================================================================================
-- PREDICTION SYSTEM - PHASE 2: RLS POLICIES
-- =====================================================================================
-- Description: Row-level security policies for analyst and learning tables
-- Dependencies: prediction schema, all Phase 2 tables
-- =====================================================================================

-- =====================================================================================
-- ENABLE RLS
-- =====================================================================================

ALTER TABLE prediction.analysts ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.analyst_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.analyst_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.learning_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.source_crawls ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.source_seen_items ENABLE ROW LEVEL SECURITY;

-- =====================================================================================
-- ANALYSTS POLICIES
-- =====================================================================================

-- Service role has full access
CREATE POLICY analysts_service_policy ON prediction.analysts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read:
-- - Runner/domain level analysts (global)
-- - Universe/target level analysts if they have org access
CREATE POLICY analysts_read_policy ON prediction.analysts
  FOR SELECT TO authenticated
  USING (
    scope_level IN ('runner', 'domain')
    OR (
      scope_level IN ('universe', 'target')
      AND EXISTS (
        SELECT 1
        FROM prediction.universes u
        WHERE u.id = universe_id
          AND prediction.user_has_org_access(u.organization_slug)
      )
    )
  );

-- Only service role can insert/update/delete analysts
-- (Human admins would use service role or API endpoints)

-- =====================================================================================
-- ANALYST OVERRIDES POLICIES
-- =====================================================================================

-- Service role has full access
CREATE POLICY analyst_overrides_service_policy ON prediction.analyst_overrides
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read overrides for their universes/targets
CREATE POLICY analyst_overrides_read_policy ON prediction.analyst_overrides
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM prediction.universes u
      WHERE u.id = COALESCE(analyst_overrides.universe_id,
        (SELECT t.universe_id FROM prediction.targets t WHERE t.id = analyst_overrides.target_id))
        AND prediction.user_has_org_access(u.organization_slug)
    )
  );

-- =====================================================================================
-- ANALYST ASSESSMENTS POLICIES
-- =====================================================================================

-- Service role has full access
CREATE POLICY analyst_assessments_service_policy ON prediction.analyst_assessments
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read assessments for their org's predictors/predictions
CREATE POLICY analyst_assessments_read_policy ON prediction.analyst_assessments
  FOR SELECT TO authenticated
  USING (
    -- Via predictor
    EXISTS (
      SELECT 1
      FROM prediction.predictors pr
      JOIN prediction.targets t ON pr.target_id = t.id
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE pr.id = analyst_assessments.predictor_id
        AND prediction.user_has_org_access(u.organization_slug)
    )
    OR
    -- Via prediction
    EXISTS (
      SELECT 1
      FROM prediction.predictions p
      JOIN prediction.targets t ON p.target_id = t.id
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE p.id = analyst_assessments.prediction_id
        AND prediction.user_has_org_access(u.organization_slug)
    )
  );

-- =====================================================================================
-- LEARNINGS POLICIES
-- =====================================================================================

-- Service role has full access
CREATE POLICY learnings_service_policy ON prediction.learnings
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read:
-- - Runner/domain level learnings (global)
-- - Universe/target level learnings if they have org access
CREATE POLICY learnings_read_policy ON prediction.learnings
  FOR SELECT TO authenticated
  USING (
    scope_level IN ('runner', 'domain')
    OR (
      scope_level IN ('universe', 'target')
      AND EXISTS (
        SELECT 1
        FROM prediction.universes u
        WHERE u.id = COALESCE(learnings.universe_id,
          (SELECT t.universe_id FROM prediction.targets t WHERE t.id = learnings.target_id))
          AND prediction.user_has_org_access(u.organization_slug)
      )
    )
  );

-- =====================================================================================
-- LEARNING QUEUE POLICIES
-- =====================================================================================

-- Service role has full access
CREATE POLICY learning_queue_service_policy ON prediction.learning_queue
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read learning queue items for their orgs
CREATE POLICY learning_queue_read_policy ON prediction.learning_queue
  FOR SELECT TO authenticated
  USING (
    suggested_scope_level IN ('runner', 'domain')
    OR (
      suggested_scope_level IN ('universe', 'target')
      AND EXISTS (
        SELECT 1
        FROM prediction.universes u
        WHERE u.id = COALESCE(learning_queue.suggested_universe_id,
          (SELECT t.universe_id FROM prediction.targets t WHERE t.id = learning_queue.suggested_target_id))
          AND prediction.user_has_org_access(u.organization_slug)
      )
    )
  );

-- Authenticated users can update learning queue items for their orgs (for reviewing)
CREATE POLICY learning_queue_update_policy ON prediction.learning_queue
  FOR UPDATE TO authenticated
  USING (
    suggested_scope_level IN ('runner', 'domain')
    OR (
      suggested_scope_level IN ('universe', 'target')
      AND EXISTS (
        SELECT 1
        FROM prediction.universes u
        WHERE u.id = COALESCE(learning_queue.suggested_universe_id,
          (SELECT t.universe_id FROM prediction.targets t WHERE t.id = learning_queue.suggested_target_id))
          AND prediction.user_has_org_access(u.organization_slug)
      )
    )
  )
  WITH CHECK (
    suggested_scope_level IN ('runner', 'domain')
    OR (
      suggested_scope_level IN ('universe', 'target')
      AND EXISTS (
        SELECT 1
        FROM prediction.universes u
        WHERE u.id = COALESCE(learning_queue.suggested_universe_id,
          (SELECT t.universe_id FROM prediction.targets t WHERE t.id = learning_queue.suggested_target_id))
          AND prediction.user_has_org_access(u.organization_slug)
      )
    )
  );

-- =====================================================================================
-- REVIEW QUEUE POLICIES
-- =====================================================================================

-- Service role has full access
CREATE POLICY review_queue_service_policy ON prediction.review_queue
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read review queue items for their orgs
CREATE POLICY review_queue_read_policy ON prediction.review_queue
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM prediction.signals s
      JOIN prediction.targets t ON s.target_id = t.id
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE s.id = review_queue.signal_id
        AND prediction.user_has_org_access(u.organization_slug)
    )
  );

-- Authenticated users can update review queue items for their orgs (for reviewing)
CREATE POLICY review_queue_update_policy ON prediction.review_queue
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM prediction.signals s
      JOIN prediction.targets t ON s.target_id = t.id
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE s.id = review_queue.signal_id
        AND prediction.user_has_org_access(u.organization_slug)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM prediction.signals s
      JOIN prediction.targets t ON s.target_id = t.id
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE s.id = review_queue.signal_id
        AND prediction.user_has_org_access(u.organization_slug)
    )
  );

-- =====================================================================================
-- SOURCE CRAWLS POLICIES
-- =====================================================================================

-- Service role has full access
CREATE POLICY source_crawls_service_policy ON prediction.source_crawls
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read source crawls for their orgs
CREATE POLICY source_crawls_read_policy ON prediction.source_crawls
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM prediction.sources src
      JOIN prediction.targets t ON src.target_id = t.id
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE src.id = source_crawls.source_id
        AND prediction.user_has_org_access(u.organization_slug)
    )
  );

-- =====================================================================================
-- SOURCE SEEN ITEMS POLICIES
-- =====================================================================================

-- Service role has full access
CREATE POLICY source_seen_items_service_policy ON prediction.source_seen_items
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read seen items for their orgs
CREATE POLICY source_seen_items_read_policy ON prediction.source_seen_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM prediction.sources src
      JOIN prediction.targets t ON src.target_id = t.id
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE src.id = source_seen_items.source_id
        AND prediction.user_has_org_access(u.organization_slug)
    )
  );

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

COMMENT ON POLICY analysts_read_policy ON prediction.analysts IS
  'Authenticated users can read runner/domain analysts, and universe/target analysts for their orgs';

COMMENT ON POLICY analyst_overrides_read_policy ON prediction.analyst_overrides IS
  'Authenticated users can read overrides for their org universes/targets';

COMMENT ON POLICY analyst_assessments_read_policy ON prediction.analyst_assessments IS
  'Authenticated users can read assessments for their org predictors/predictions';

COMMENT ON POLICY learnings_read_policy ON prediction.learnings IS
  'Authenticated users can read runner/domain learnings, and universe/target learnings for their orgs';

COMMENT ON POLICY learning_queue_read_policy ON prediction.learning_queue IS
  'Authenticated users can read learning queue items for their orgs';

COMMENT ON POLICY learning_queue_update_policy ON prediction.learning_queue IS
  'Authenticated users can update (review) learning queue items for their orgs';

COMMENT ON POLICY review_queue_read_policy ON prediction.review_queue IS
  'Authenticated users can read review queue items for their orgs';

COMMENT ON POLICY review_queue_update_policy ON prediction.review_queue IS
  'Authenticated users can update (review) review queue items for their orgs';

COMMENT ON POLICY source_crawls_read_policy ON prediction.source_crawls IS
  'Authenticated users can read source crawls for their orgs';

COMMENT ON POLICY source_seen_items_read_policy ON prediction.source_seen_items IS
  'Authenticated users can read seen items for their orgs';

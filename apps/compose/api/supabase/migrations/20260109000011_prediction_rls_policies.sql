-- =============================================================================
-- PREDICTION RLS POLICIES
-- =============================================================================
-- Row Level Security policies for all prediction tables
-- Phase 1, Step 1-6
-- =============================================================================

-- =============================================================================
-- ENABLE RLS ON ALL TABLES
-- =============================================================================

ALTER TABLE prediction.strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.universes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.predictors ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.target_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.missed_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.tool_requests ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- HELPER FUNCTION: Check if user has access to organization
-- =============================================================================

CREATE OR REPLACE FUNCTION prediction.user_has_org_access(p_org_slug TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user is in the organization via RBAC
  RETURN EXISTS (
    SELECT 1 FROM public.rbac_get_user_organizations()
    WHERE slug = p_org_slug
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- STRATEGIES POLICIES (System strategies visible to all)
-- =============================================================================

-- Everyone can read strategies
CREATE POLICY strategies_read_policy ON prediction.strategies
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service_role can modify strategies
CREATE POLICY strategies_service_write_policy ON prediction.strategies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- UNIVERSES POLICIES (Organization-scoped)
-- =============================================================================

-- Users can read universes they have org access to
CREATE POLICY universes_read_policy ON prediction.universes
  FOR SELECT
  TO authenticated
  USING (prediction.user_has_org_access(organization_slug));

-- Users can create universes in orgs they have access to
CREATE POLICY universes_insert_policy ON prediction.universes
  FOR INSERT
  TO authenticated
  WITH CHECK (prediction.user_has_org_access(organization_slug));

-- Users can update universes in orgs they have access to
CREATE POLICY universes_update_policy ON prediction.universes
  FOR UPDATE
  TO authenticated
  USING (prediction.user_has_org_access(organization_slug))
  WITH CHECK (prediction.user_has_org_access(organization_slug));

-- Users can delete universes in orgs they have access to
CREATE POLICY universes_delete_policy ON prediction.universes
  FOR DELETE
  TO authenticated
  USING (prediction.user_has_org_access(organization_slug));

-- Service role has full access
CREATE POLICY universes_service_policy ON prediction.universes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- TARGETS POLICIES (Inherit from universe)
-- =============================================================================

-- Read: Access if user has universe access
CREATE POLICY targets_read_policy ON prediction.targets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM prediction.universes u
      WHERE u.id = universe_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  );

-- Write: Same as read
CREATE POLICY targets_write_policy ON prediction.targets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM prediction.universes u
      WHERE u.id = universe_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM prediction.universes u
      WHERE u.id = universe_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  );

-- Service role has full access
CREATE POLICY targets_service_policy ON prediction.targets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- SOURCES POLICIES (Scope-based)
-- =============================================================================

-- Runner/domain sources: visible to all authenticated users
-- Universe/target sources: require universe access
CREATE POLICY sources_read_policy ON prediction.sources
  FOR SELECT
  TO authenticated
  USING (
    scope_level IN ('runner', 'domain')
    OR (
      scope_level IN ('universe', 'target')
      AND EXISTS (
        SELECT 1 FROM prediction.universes u
        WHERE u.id = universe_id
        AND prediction.user_has_org_access(u.organization_slug)
      )
    )
  );

-- Write requires universe access for universe/target scoped
CREATE POLICY sources_write_policy ON prediction.sources
  FOR ALL
  TO authenticated
  USING (
    scope_level IN ('runner', 'domain')
    OR EXISTS (
      SELECT 1 FROM prediction.universes u
      WHERE u.id = universe_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  )
  WITH CHECK (
    scope_level IN ('runner', 'domain')
    OR EXISTS (
      SELECT 1 FROM prediction.universes u
      WHERE u.id = universe_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  );

-- Service role has full access
CREATE POLICY sources_service_policy ON prediction.sources
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- SIGNALS POLICIES (Inherit from target)
-- =============================================================================

CREATE POLICY signals_read_policy ON prediction.signals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM prediction.targets t
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE t.id = target_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  );

CREATE POLICY signals_service_policy ON prediction.signals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- PREDICTORS POLICIES (Inherit from target)
-- =============================================================================

CREATE POLICY predictors_read_policy ON prediction.predictors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM prediction.targets t
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE t.id = target_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  );

CREATE POLICY predictors_service_policy ON prediction.predictors
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- PREDICTIONS POLICIES (Inherit from target)
-- =============================================================================

CREATE POLICY predictions_read_policy ON prediction.predictions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM prediction.targets t
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE t.id = target_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  );

CREATE POLICY predictions_service_policy ON prediction.predictions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- SNAPSHOTS POLICIES (Inherit from prediction)
-- =============================================================================

CREATE POLICY snapshots_read_policy ON prediction.snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM prediction.predictions p
      JOIN prediction.targets t ON p.target_id = t.id
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE p.id = prediction_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  );

CREATE POLICY snapshots_service_policy ON prediction.snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- EVALUATIONS POLICIES (Inherit from prediction)
-- =============================================================================

CREATE POLICY evaluations_read_policy ON prediction.evaluations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM prediction.predictions p
      JOIN prediction.targets t ON p.target_id = t.id
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE p.id = prediction_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  );

CREATE POLICY evaluations_service_policy ON prediction.evaluations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- TARGET SNAPSHOTS POLICIES (Inherit from target)
-- =============================================================================

CREATE POLICY target_snapshots_read_policy ON prediction.target_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM prediction.targets t
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE t.id = target_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  );

CREATE POLICY target_snapshots_service_policy ON prediction.target_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- MISSED OPPORTUNITIES POLICIES (Inherit from target)
-- =============================================================================

CREATE POLICY missed_opportunities_read_policy ON prediction.missed_opportunities
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM prediction.targets t
      JOIN prediction.universes u ON t.universe_id = u.id
      WHERE t.id = target_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  );

CREATE POLICY missed_opportunities_service_policy ON prediction.missed_opportunities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- TOOL REQUESTS POLICIES (Scoped to universe via org)
-- =============================================================================

CREATE POLICY tool_requests_read_policy ON prediction.tool_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM prediction.universes u
      WHERE u.id = universe_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  );

CREATE POLICY tool_requests_write_policy ON prediction.tool_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM prediction.universes u
      WHERE u.id = universe_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM prediction.universes u
      WHERE u.id = universe_id
      AND prediction.user_has_org_access(u.organization_slug)
    )
  );

CREATE POLICY tool_requests_service_policy ON prediction.tool_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'RLS policies created for prediction schema';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Tables with RLS enabled:';
  RAISE NOTICE '  - strategies (all read, service write)';
  RAISE NOTICE '  - universes (org-scoped)';
  RAISE NOTICE '  - targets (universe-scoped)';
  RAISE NOTICE '  - sources (scope-based)';
  RAISE NOTICE '  - signals (target-scoped)';
  RAISE NOTICE '  - predictors (target-scoped)';
  RAISE NOTICE '  - predictions (target-scoped)';
  RAISE NOTICE '  - snapshots (prediction-scoped)';
  RAISE NOTICE '  - evaluations (prediction-scoped)';
  RAISE NOTICE '  - target_snapshots (target-scoped)';
  RAISE NOTICE '  - missed_opportunities (target-scoped)';
  RAISE NOTICE '  - tool_requests (universe-scoped)';
  RAISE NOTICE '================================================';
END $$;

-- =============================================================================
-- CREATE PREDICTION.TEST_AUDIT_LOG TABLE
-- =============================================================================
-- Audit trail for all test system actions
-- Test-Based Learning Loop - Phase 1: Schema Foundation
-- PRD Section: 11.3 Audit Logging
-- INV-07: Learning promotion MUST be human-approved, audited action
-- =============================================================================

CREATE TABLE prediction.test_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization scope
  organization_slug TEXT NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,

  -- User who performed the action
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Action type
  action TEXT NOT NULL,

  -- Resource being acted upon
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,

  -- Action details
  details JSONB DEFAULT '{}'::jsonb,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_test_audit_log_action CHECK (action IN (
    'scenario_created',
    'scenario_updated',
    'scenario_deleted',
    'scenario_run_started',
    'scenario_run_completed',
    'scenario_run_failed',
    'article_created',
    'article_updated',
    'article_deleted',
    'article_generated',
    'price_data_created',
    'price_data_bulk_imported',
    'learning_promoted',
    'learning_rejected',
    'learning_validation_started',
    'backtest_started',
    'backtest_completed',
    'test_mode_enabled',
    'test_mode_disabled',
    'test_data_purged'
  )),
  CONSTRAINT chk_test_audit_log_resource_type CHECK (resource_type IN (
    'test_scenario',
    'scenario_run',
    'test_article',
    'test_price_data',
    'learning',
    'backtest',
    'test_mode',
    'bulk_operation'
  ))
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_test_audit_log_org ON prediction.test_audit_log(organization_slug);
CREATE INDEX idx_test_audit_log_user ON prediction.test_audit_log(user_id);
CREATE INDEX idx_test_audit_log_action ON prediction.test_audit_log(action);
CREATE INDEX idx_test_audit_log_resource_type ON prediction.test_audit_log(resource_type);
CREATE INDEX idx_test_audit_log_resource_id ON prediction.test_audit_log(resource_id);
CREATE INDEX idx_test_audit_log_created_at ON prediction.test_audit_log(created_at DESC);

-- Composite index for resource lookups
CREATE INDEX idx_test_audit_log_resource ON prediction.test_audit_log(resource_type, resource_id);

-- =============================================================================
-- HELPER FUNCTION FOR LOGGING
-- =============================================================================

CREATE OR REPLACE FUNCTION prediction.log_test_audit(
  p_organization_slug TEXT,
  p_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO prediction.test_audit_log (
    organization_slug, user_id, action, resource_type, resource_id, details
  ) VALUES (
    p_organization_slug, p_user_id, p_action, p_resource_type, p_resource_id, p_details
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.test_audit_log IS 'Audit trail for all test system actions (INV-07)';
COMMENT ON COLUMN prediction.test_audit_log.action IS 'Type of action performed';
COMMENT ON COLUMN prediction.test_audit_log.resource_type IS 'Type of resource being acted upon';
COMMENT ON COLUMN prediction.test_audit_log.resource_id IS 'ID of the resource being acted upon';
COMMENT ON COLUMN prediction.test_audit_log.details IS 'Additional details about the action';
COMMENT ON FUNCTION prediction.log_test_audit IS 'Helper function to create audit log entries';

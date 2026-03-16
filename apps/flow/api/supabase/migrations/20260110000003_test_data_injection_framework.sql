-- =============================================================================
-- TEST DATA INJECTION FRAMEWORK
-- =============================================================================
-- Phase 3 of Financial Asset Predictor PRD
-- Adds test data markers to all prediction tables and creates test_scenarios table
-- =============================================================================

-- =============================================================================
-- TEST SCENARIOS TABLE
-- =============================================================================

CREATE TABLE prediction.test_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scenario metadata
  name TEXT NOT NULL,
  description TEXT,

  -- What this scenario tests
  injection_points TEXT[] NOT NULL,  -- Array of table names being tested
  target_id UUID REFERENCES prediction.targets(id) ON DELETE SET NULL,

  -- Multi-tenant isolation
  organization_slug TEXT NOT NULL,

  -- Configuration
  config JSONB DEFAULT '{}'::jsonb,

  -- Who created this
  created_by TEXT,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'running', 'completed', 'failed', 'archived'

  -- Results
  results JSONB,  -- { "signals_injected": 5, "predictions_generated": 3, ... }

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Constraints
  CHECK (status IN ('active', 'running', 'completed', 'failed', 'archived'))
);

-- Indexes for test scenarios
CREATE INDEX idx_test_scenarios_org ON prediction.test_scenarios(organization_slug);
CREATE INDEX idx_test_scenarios_status ON prediction.test_scenarios(status);
CREATE INDEX idx_test_scenarios_target ON prediction.test_scenarios(target_id) WHERE target_id IS NOT NULL;
CREATE INDEX idx_test_scenarios_created_at ON prediction.test_scenarios(created_at DESC);

-- =============================================================================
-- ADD TEST DATA MARKERS TO ALL PREDICTION TABLES
-- =============================================================================
-- Each table gets:
--   is_test_data BOOLEAN DEFAULT FALSE
--   test_scenario_id UUID (FK to test_scenarios)
-- =============================================================================

-- Helper function to add test data columns to a table
CREATE OR REPLACE FUNCTION prediction.add_test_data_columns(table_name TEXT)
RETURNS VOID AS $$
BEGIN
  -- Add is_test_data column
  EXECUTE format(
    'ALTER TABLE prediction.%I ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT FALSE',
    table_name
  );

  -- Add test_scenario_id column with FK
  EXECUTE format(
    'ALTER TABLE prediction.%I ADD COLUMN IF NOT EXISTS test_scenario_id UUID REFERENCES prediction.test_scenarios(id) ON DELETE SET NULL',
    table_name
  );

  -- Create partial index for efficient test data queries
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_%I_test_data ON prediction.%I(is_test_data) WHERE is_test_data = TRUE',
    table_name, table_name
  );

  -- Create index for scenario lookups
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_%I_test_scenario ON prediction.%I(test_scenario_id) WHERE test_scenario_id IS NOT NULL',
    table_name, table_name
  );
END;
$$ LANGUAGE plpgsql;

-- Apply to all prediction tables
SELECT prediction.add_test_data_columns('strategies');
SELECT prediction.add_test_data_columns('universes');
SELECT prediction.add_test_data_columns('targets');
SELECT prediction.add_test_data_columns('sources');
SELECT prediction.add_test_data_columns('source_crawls');
SELECT prediction.add_test_data_columns('source_seen_items');
SELECT prediction.add_test_data_columns('signal_fingerprints');
SELECT prediction.add_test_data_columns('signals');
SELECT prediction.add_test_data_columns('predictors');
SELECT prediction.add_test_data_columns('predictions');
SELECT prediction.add_test_data_columns('snapshots');
SELECT prediction.add_test_data_columns('evaluations');
SELECT prediction.add_test_data_columns('target_snapshots');
SELECT prediction.add_test_data_columns('missed_opportunities');
SELECT prediction.add_test_data_columns('tool_requests');
SELECT prediction.add_test_data_columns('analysts');
SELECT prediction.add_test_data_columns('learnings');
SELECT prediction.add_test_data_columns('learning_queue');
SELECT prediction.add_test_data_columns('review_queue');

-- Drop the helper function (no longer needed)
DROP FUNCTION prediction.add_test_data_columns(TEXT);

-- =============================================================================
-- RLS POLICY FOR TEST SCENARIOS
-- =============================================================================

ALTER TABLE prediction.test_scenarios ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their organization's test scenarios
CREATE POLICY test_scenarios_org_isolation ON prediction.test_scenarios
  FOR ALL
  USING (organization_slug = current_setting('app.current_org', true));

-- =============================================================================
-- CLEANUP FUNCTIONS
-- =============================================================================

-- Function to cleanup a specific test scenario
CREATE OR REPLACE FUNCTION prediction.cleanup_test_scenario(p_scenario_id UUID)
RETURNS TABLE (
  table_name TEXT,
  rows_deleted BIGINT
) AS $$
DECLARE
  tbl RECORD;
  deleted_count BIGINT;
BEGIN
  -- Delete from all tables that have test_scenario_id column
  FOR tbl IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'prediction'
      AND c.column_name = 'test_scenario_id'
      AND c.table_name != 'test_scenarios'
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'DELETE FROM prediction.%I WHERE test_scenario_id = $1',
      tbl.table_name
    ) USING p_scenario_id;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count > 0 THEN
      table_name := tbl.table_name;
      rows_deleted := deleted_count;
      RETURN NEXT;
    END IF;
  END LOOP;

  -- Finally, delete the scenario itself
  DELETE FROM prediction.test_scenarios WHERE id = p_scenario_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    table_name := 'test_scenarios';
    rows_deleted := deleted_count;
    RETURN NEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup ALL test data (dangerous but useful)
CREATE OR REPLACE FUNCTION prediction.cleanup_all_test_data()
RETURNS TABLE (
  table_name TEXT,
  rows_deleted BIGINT
) AS $$
DECLARE
  tbl RECORD;
  deleted_count BIGINT;
BEGIN
  -- Delete from all tables that have is_test_data column
  FOR tbl IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'prediction'
      AND c.column_name = 'is_test_data'
      AND c.table_name != 'test_scenarios'
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'DELETE FROM prediction.%I WHERE is_test_data = TRUE',
      tbl.table_name
    );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count > 0 THEN
      table_name := tbl.table_name;
      rows_deleted := deleted_count;
      RETURN NEXT;
    END IF;
  END LOOP;

  -- Delete all test scenarios
  DELETE FROM prediction.test_scenarios;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    table_name := 'test_scenarios';
    rows_deleted := deleted_count;
    RETURN NEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- HELPER VIEWS FOR TEST DATA ISOLATION
-- =============================================================================

-- View: Test scenario summary with counts per table
CREATE OR REPLACE VIEW prediction.test_scenario_summary AS
WITH counts AS (
  SELECT
    test_scenario_id,
    'signals' as table_name,
    COUNT(*) as row_count
  FROM prediction.signals
  WHERE is_test_data = TRUE
  GROUP BY test_scenario_id

  UNION ALL

  SELECT
    test_scenario_id,
    'predictors' as table_name,
    COUNT(*) as row_count
  FROM prediction.predictors
  WHERE is_test_data = TRUE
  GROUP BY test_scenario_id

  UNION ALL

  SELECT
    test_scenario_id,
    'predictions' as table_name,
    COUNT(*) as row_count
  FROM prediction.predictions
  WHERE is_test_data = TRUE
  GROUP BY test_scenario_id

  UNION ALL

  SELECT
    test_scenario_id,
    'evaluations' as table_name,
    COUNT(*) as row_count
  FROM prediction.evaluations
  WHERE is_test_data = TRUE
  GROUP BY test_scenario_id
)
SELECT
  ts.id,
  ts.name,
  ts.organization_slug,
  ts.status,
  ts.created_at,
  ts.started_at,
  ts.completed_at,
  COALESCE(jsonb_object_agg(c.table_name, c.row_count) FILTER (WHERE c.table_name IS NOT NULL), '{}'::jsonb) as data_counts
FROM prediction.test_scenarios ts
LEFT JOIN counts c ON c.test_scenario_id = ts.id
GROUP BY ts.id, ts.name, ts.organization_slug, ts.status, ts.created_at, ts.started_at, ts.completed_at;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE prediction.test_scenarios IS 'Test scenarios for the test data injection framework (Phase 3)';
COMMENT ON COLUMN prediction.test_scenarios.injection_points IS 'Array of table names that have test data for this scenario';
COMMENT ON COLUMN prediction.test_scenarios.organization_slug IS 'Organization slug for multi-tenant isolation';
COMMENT ON COLUMN prediction.test_scenarios.config IS 'Configuration JSONB for the test scenario';
COMMENT ON COLUMN prediction.test_scenarios.results IS 'Results JSONB after scenario execution';

COMMENT ON FUNCTION prediction.cleanup_test_scenario(UUID) IS 'Cleans up all test data for a specific scenario';
COMMENT ON FUNCTION prediction.cleanup_all_test_data() IS 'Cleans up ALL test data from the prediction schema - use with caution';

COMMENT ON VIEW prediction.test_scenario_summary IS 'Summary view of test scenarios with data counts per table';

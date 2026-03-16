-- =============================================================================
-- Phase 8: Historical Replay Test Infrastructure
-- =============================================================================
-- Creates tables for the replay/rollback testing system in Test Lab
-- Allows users to roll back to a point in time and replay predictions with
-- current learnings to validate improvement.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: replay_tests
-- Tracks replay test configurations and status
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prediction.replay_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- Test status lifecycle
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',           -- Created but not started
    'snapshot_created',  -- Snapshot taken, ready to run
    'running',           -- Pipeline executing
    'completed',         -- Finished successfully
    'failed',            -- Failed at some step
    'restored'           -- Original data restored (cleanup complete)
  )),

  -- Rollback configuration
  rollback_depth TEXT NOT NULL DEFAULT 'predictions' CHECK (rollback_depth IN (
    'predictions',  -- Only predictions rolled back
    'predictors',   -- Predictions + predictors rolled back
    'signals'       -- Signals + predictors + predictions rolled back
  )),
  rollback_to TIMESTAMPTZ NOT NULL,      -- Roll back to this point in time

  -- Scope
  universe_id UUID REFERENCES prediction.universes(id),
  target_ids UUID[] DEFAULT NULL,         -- NULL means all targets in universe

  -- Additional configuration
  config JSONB DEFAULT '{}'::jsonb,

  -- Results summary (populated on completion)
  results JSONB DEFAULT NULL,

  -- Error tracking
  error_message TEXT,

  -- Audit fields
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes for replay_tests
CREATE INDEX IF NOT EXISTS idx_replay_tests_org
  ON prediction.replay_tests(organization_slug);
CREATE INDEX IF NOT EXISTS idx_replay_tests_status
  ON prediction.replay_tests(status);
CREATE INDEX IF NOT EXISTS idx_replay_tests_universe
  ON prediction.replay_tests(universe_id);
CREATE INDEX IF NOT EXISTS idx_replay_tests_created
  ON prediction.replay_tests(created_at DESC);

-- -----------------------------------------------------------------------------
-- Table: replay_test_snapshots
-- Stores snapshots of original data before deletion
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prediction.replay_test_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  replay_test_id UUID NOT NULL REFERENCES prediction.replay_tests(id) ON DELETE CASCADE,

  -- What table was snapshotted
  table_name TEXT NOT NULL CHECK (table_name IN (
    'signals',
    'predictors',
    'predictions',
    'analyst_assessments'
  )),

  -- The actual data (array of records)
  original_data JSONB NOT NULL,

  -- Record IDs for efficient restoration
  record_ids UUID[] NOT NULL,

  -- Statistics
  row_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for replay_test_snapshots
CREATE INDEX IF NOT EXISTS idx_replay_snapshots_test
  ON prediction.replay_test_snapshots(replay_test_id);
CREATE INDEX IF NOT EXISTS idx_replay_snapshots_table
  ON prediction.replay_test_snapshots(table_name);

-- -----------------------------------------------------------------------------
-- Table: replay_test_results
-- Stores per-prediction comparison results
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prediction.replay_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  replay_test_id UUID NOT NULL REFERENCES prediction.replay_tests(id) ON DELETE CASCADE,
  target_id UUID REFERENCES prediction.targets(id),

  -- Original prediction data
  original_prediction_id UUID,
  original_direction TEXT,
  original_confidence DECIMAL(5,4),
  original_magnitude TEXT,
  original_predicted_at TIMESTAMPTZ,

  -- Replay prediction data
  replay_prediction_id UUID,
  replay_direction TEXT,
  replay_confidence DECIMAL(5,4),
  replay_magnitude TEXT,
  replay_predicted_at TIMESTAMPTZ,

  -- Comparison metrics
  direction_match BOOLEAN,           -- Did original and replay agree?
  confidence_diff DECIMAL(5,4),      -- replay_confidence - original_confidence

  -- Ground truth (from evaluations)
  evaluation_id UUID REFERENCES prediction.evaluations(id),
  actual_outcome TEXT,               -- What actually happened
  actual_outcome_value DECIMAL(20,8),

  -- Accuracy assessment
  original_correct BOOLEAN,          -- Was original prediction correct?
  replay_correct BOOLEAN,            -- Was replay prediction correct?
  improvement BOOLEAN,               -- Did replay do better than original?

  -- P&L comparison (hypothetical)
  pnl_original DECIMAL(20,8),        -- P&L if original prediction was followed
  pnl_replay DECIMAL(20,8),          -- P&L if replay prediction was followed
  pnl_diff DECIMAL(20,8),            -- pnl_replay - pnl_original

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for replay_test_results
CREATE INDEX IF NOT EXISTS idx_replay_results_test
  ON prediction.replay_test_results(replay_test_id);
CREATE INDEX IF NOT EXISTS idx_replay_results_target
  ON prediction.replay_test_results(target_id);
CREATE INDEX IF NOT EXISTS idx_replay_results_improvement
  ON prediction.replay_test_results(improvement) WHERE improvement IS NOT NULL;

-- -----------------------------------------------------------------------------
-- View: replay_test_summary
-- Aggregated view of replay test results
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW prediction.replay_test_summary AS
SELECT
  rt.id,
  rt.organization_slug,
  rt.name,
  rt.description,
  rt.status,
  rt.rollback_depth,
  rt.rollback_to,
  rt.universe_id,
  rt.target_ids,
  rt.created_by,
  rt.created_at,
  rt.started_at,
  rt.completed_at,
  rt.error_message,

  -- Aggregated metrics
  COUNT(rtr.id) AS total_comparisons,
  COUNT(rtr.id) FILTER (WHERE rtr.direction_match = true) AS direction_matches,
  COUNT(rtr.id) FILTER (WHERE rtr.original_correct = true) AS original_correct_count,
  COUNT(rtr.id) FILTER (WHERE rtr.replay_correct = true) AS replay_correct_count,
  COUNT(rtr.id) FILTER (WHERE rtr.improvement = true) AS improvements,

  -- Accuracy percentages
  CASE
    WHEN COUNT(rtr.id) FILTER (WHERE rtr.original_correct IS NOT NULL) > 0
    THEN ROUND(
      COUNT(rtr.id) FILTER (WHERE rtr.original_correct = true)::DECIMAL /
      COUNT(rtr.id) FILTER (WHERE rtr.original_correct IS NOT NULL) * 100,
      2
    )
    ELSE NULL
  END AS original_accuracy_pct,

  CASE
    WHEN COUNT(rtr.id) FILTER (WHERE rtr.replay_correct IS NOT NULL) > 0
    THEN ROUND(
      COUNT(rtr.id) FILTER (WHERE rtr.replay_correct = true)::DECIMAL /
      COUNT(rtr.id) FILTER (WHERE rtr.replay_correct IS NOT NULL) * 100,
      2
    )
    ELSE NULL
  END AS replay_accuracy_pct,

  -- P&L totals
  SUM(rtr.pnl_original) AS total_pnl_original,
  SUM(rtr.pnl_replay) AS total_pnl_replay,
  SUM(rtr.pnl_diff) AS total_pnl_improvement,

  -- Average confidence diff
  AVG(rtr.confidence_diff) AS avg_confidence_diff

FROM prediction.replay_tests rt
LEFT JOIN prediction.replay_test_results rtr ON rtr.replay_test_id = rt.id
GROUP BY rt.id;

-- -----------------------------------------------------------------------------
-- Function: create_replay_snapshot
-- Creates a snapshot of records for a replay test
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prediction.create_replay_snapshot(
  p_replay_test_id UUID,
  p_table_name TEXT,
  p_record_ids UUID[]
) RETURNS UUID AS $$
DECLARE
  v_snapshot_id UUID;
  v_data JSONB;
  v_count INTEGER;
BEGIN
  -- Get the data based on table name
  IF p_table_name = 'predictions' THEN
    SELECT jsonb_agg(row_to_json(p)::jsonb), COUNT(*)
    INTO v_data, v_count
    FROM prediction.predictions p
    WHERE p.id = ANY(p_record_ids);

  ELSIF p_table_name = 'predictors' THEN
    SELECT jsonb_agg(row_to_json(p)::jsonb), COUNT(*)
    INTO v_data, v_count
    FROM prediction.predictors p
    WHERE p.id = ANY(p_record_ids);

  ELSIF p_table_name = 'signals' THEN
    SELECT jsonb_agg(row_to_json(s)::jsonb), COUNT(*)
    INTO v_data, v_count
    FROM prediction.signals s
    WHERE s.id = ANY(p_record_ids);

  ELSIF p_table_name = 'analyst_assessments' THEN
    SELECT jsonb_agg(row_to_json(a)::jsonb), COUNT(*)
    INTO v_data, v_count
    FROM prediction.analyst_assessments a
    WHERE a.id = ANY(p_record_ids);

  ELSE
    RAISE EXCEPTION 'Unknown table name: %', p_table_name;
  END IF;

  -- Insert snapshot
  INSERT INTO prediction.replay_test_snapshots (
    replay_test_id,
    table_name,
    original_data,
    record_ids,
    row_count
  ) VALUES (
    p_replay_test_id,
    p_table_name,
    COALESCE(v_data, '[]'::jsonb),
    p_record_ids,
    COALESCE(v_count, 0)
  )
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Function: restore_replay_snapshot
-- Restores data from a snapshot
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prediction.restore_replay_snapshot(
  p_snapshot_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_snapshot RECORD;
  v_item JSONB;
  v_restored INTEGER := 0;
BEGIN
  -- Get the snapshot
  SELECT * INTO v_snapshot
  FROM prediction.replay_test_snapshots
  WHERE id = p_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot not found: %', p_snapshot_id;
  END IF;

  -- Restore based on table name
  IF v_snapshot.table_name = 'predictions' THEN
    INSERT INTO prediction.predictions
    SELECT * FROM jsonb_populate_recordset(null::prediction.predictions, v_snapshot.original_data)
    ON CONFLICT (id) DO UPDATE SET
      target_id = EXCLUDED.target_id,
      direction = EXCLUDED.direction,
      confidence = EXCLUDED.confidence,
      magnitude = EXCLUDED.magnitude,
      reasoning = EXCLUDED.reasoning,
      status = EXCLUDED.status,
      predicted_at = EXCLUDED.predicted_at;
    GET DIAGNOSTICS v_restored = ROW_COUNT;

  ELSIF v_snapshot.table_name = 'predictors' THEN
    INSERT INTO prediction.predictors
    SELECT * FROM jsonb_populate_recordset(null::prediction.predictors, v_snapshot.original_data)
    ON CONFLICT (id) DO UPDATE SET
      target_id = EXCLUDED.target_id,
      direction = EXCLUDED.direction,
      confidence = EXCLUDED.confidence,
      analysis = EXCLUDED.analysis,
      status = EXCLUDED.status;
    GET DIAGNOSTICS v_restored = ROW_COUNT;

  ELSIF v_snapshot.table_name = 'signals' THEN
    INSERT INTO prediction.signals
    SELECT * FROM jsonb_populate_recordset(null::prediction.signals, v_snapshot.original_data)
    ON CONFLICT (id) DO UPDATE SET
      target_id = EXCLUDED.target_id,
      source_id = EXCLUDED.source_id,
      content = EXCLUDED.content,
      signal_type = EXCLUDED.signal_type,
      sentiment = EXCLUDED.sentiment;
    GET DIAGNOSTICS v_restored = ROW_COUNT;

  ELSIF v_snapshot.table_name = 'analyst_assessments' THEN
    INSERT INTO prediction.analyst_assessments
    SELECT * FROM jsonb_populate_recordset(null::prediction.analyst_assessments, v_snapshot.original_data)
    ON CONFLICT (id) DO UPDATE SET
      analyst_id = EXCLUDED.analyst_id,
      predictor_id = EXCLUDED.predictor_id,
      direction = EXCLUDED.direction,
      confidence = EXCLUDED.confidence,
      analysis = EXCLUDED.analysis;
    GET DIAGNOSTICS v_restored = ROW_COUNT;

  END IF;

  RETURN v_restored;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Function: cleanup_replay_test
-- Cleans up all data associated with a replay test
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prediction.cleanup_replay_test(
  p_replay_test_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_results JSONB := '[]'::jsonb;
  v_count INTEGER;
BEGIN
  -- Delete results
  DELETE FROM prediction.replay_test_results
  WHERE replay_test_id = p_replay_test_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_results := v_results || jsonb_build_object('table', 'replay_test_results', 'deleted', v_count);

  -- Delete snapshots
  DELETE FROM prediction.replay_test_snapshots
  WHERE replay_test_id = p_replay_test_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_results := v_results || jsonb_build_object('table', 'replay_test_snapshots', 'deleted', v_count);

  -- Note: We don't delete the replay_test itself, just mark it as cleaned
  UPDATE prediction.replay_tests
  SET status = 'restored'
  WHERE id = p_replay_test_id;

  RETURN v_results;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Function: get_records_for_replay
-- Gets record IDs that would be affected by a replay test
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prediction.get_records_for_replay(
  p_rollback_depth TEXT,
  p_rollback_to TIMESTAMPTZ,
  p_universe_id UUID,
  p_target_ids UUID[] DEFAULT NULL
) RETURNS TABLE (
  table_name TEXT,
  record_ids UUID[],
  row_count INTEGER
) AS $$
DECLARE
  v_target_ids UUID[];
BEGIN
  -- Get target IDs
  IF p_target_ids IS NOT NULL AND array_length(p_target_ids, 1) > 0 THEN
    v_target_ids := p_target_ids;
  ELSE
    SELECT array_agg(id) INTO v_target_ids
    FROM prediction.targets
    WHERE universe_id = p_universe_id;
  END IF;

  -- Always return predictions
  RETURN QUERY
  SELECT
    'predictions'::TEXT,
    array_agg(p.id),
    COUNT(*)::INTEGER
  FROM prediction.predictions p
  WHERE p.target_id = ANY(v_target_ids)
    AND p.predicted_at >= p_rollback_to
    AND (p.is_test_data IS NULL OR p.is_test_data = false);

  -- Return predictors if depth is 'predictors' or 'signals'
  IF p_rollback_depth IN ('predictors', 'signals') THEN
    RETURN QUERY
    SELECT
      'predictors'::TEXT,
      array_agg(pr.id),
      COUNT(*)::INTEGER
    FROM prediction.predictors pr
    WHERE pr.target_id = ANY(v_target_ids)
      AND pr.created_at >= p_rollback_to
      AND (pr.is_test_data IS NULL OR pr.is_test_data = false);

    RETURN QUERY
    SELECT
      'analyst_assessments'::TEXT,
      array_agg(aa.id),
      COUNT(*)::INTEGER
    FROM prediction.analyst_assessments aa
    JOIN prediction.predictors pr ON aa.predictor_id = pr.id
    WHERE pr.target_id = ANY(v_target_ids)
      AND pr.created_at >= p_rollback_to
      AND (pr.is_test_data IS NULL OR pr.is_test_data = false);
  END IF;

  -- Return signals if depth is 'signals'
  IF p_rollback_depth = 'signals' THEN
    RETURN QUERY
    SELECT
      'signals'::TEXT,
      array_agg(s.id),
      COUNT(*)::INTEGER
    FROM prediction.signals s
    WHERE s.target_id = ANY(v_target_ids)
      AND s.created_at >= p_rollback_to
      AND (s.is_test_data IS NULL OR s.is_test_data = false);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Grant permissions
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON prediction.replay_tests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON prediction.replay_test_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON prediction.replay_test_results TO authenticated;
GRANT SELECT ON prediction.replay_test_summary TO authenticated;

GRANT EXECUTE ON FUNCTION prediction.create_replay_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION prediction.restore_replay_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION prediction.cleanup_replay_test TO authenticated;
GRANT EXECUTE ON FUNCTION prediction.get_records_for_replay TO authenticated;

-- -----------------------------------------------------------------------------
-- Comments
-- -----------------------------------------------------------------------------
COMMENT ON TABLE prediction.replay_tests IS 'Tracks historical replay test configurations and status for Test Lab';
COMMENT ON TABLE prediction.replay_test_snapshots IS 'Stores snapshots of original data before replay test deletion';
COMMENT ON TABLE prediction.replay_test_results IS 'Stores per-prediction comparison results from replay tests';
COMMENT ON VIEW prediction.replay_test_summary IS 'Aggregated view of replay test metrics';
COMMENT ON FUNCTION prediction.create_replay_snapshot IS 'Creates a snapshot of records for a replay test';
COMMENT ON FUNCTION prediction.restore_replay_snapshot IS 'Restores data from a snapshot';
COMMENT ON FUNCTION prediction.cleanup_replay_test IS 'Cleans up all data associated with a replay test';
COMMENT ON FUNCTION prediction.get_records_for_replay IS 'Gets record IDs that would be affected by a replay test';

-- =====================================================================================
-- FIX SEED DATA LINEAGE
-- =====================================================================================
-- Description: Links predictors to predictions and fixes snapshot format for proper lineage
-- This migration fixes the test data so the lineage tree view shows actual data
-- =====================================================================================

-- =====================================================================================
-- STEP 1: Link predictors to predictions via consumed_by_prediction_id
-- =====================================================================================

DO $$
DECLARE
  v_aapl_target_id UUID;
  v_nvda_target_id UUID;
  v_btc_target_id UUID;
  v_aapl_prediction_id UUID;
  v_nvda_prediction_id UUID;
  v_btc_prediction_id UUID;
BEGIN
  -- Get test target IDs
  SELECT id INTO v_aapl_target_id FROM prediction.targets WHERE symbol = 'T_AAPL' LIMIT 1;
  SELECT id INTO v_nvda_target_id FROM prediction.targets WHERE symbol = 'T_NVDA' LIMIT 1;
  SELECT id INTO v_btc_target_id FROM prediction.targets WHERE symbol = 'T_BTC' LIMIT 1;

  -- Get test prediction IDs (active ones)
  SELECT id INTO v_aapl_prediction_id FROM prediction.predictions
    WHERE target_id = v_aapl_target_id AND is_test_data = true AND status = 'active'
    ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO v_nvda_prediction_id FROM prediction.predictions
    WHERE target_id = v_nvda_target_id AND is_test_data = true AND status = 'active'
    ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO v_btc_prediction_id FROM prediction.predictions
    WHERE target_id = v_btc_target_id AND is_test_data = true AND status = 'active'
    ORDER BY created_at DESC LIMIT 1;

  -- Link T_AAPL predictors to AAPL prediction
  -- Note: Check constraint requires consumed_at when status = 'consumed'
  IF v_aapl_prediction_id IS NOT NULL THEN
    UPDATE prediction.predictors
    SET consumed_by_prediction_id = v_aapl_prediction_id,
        consumed_at = NOW(),
        status = 'consumed'
    WHERE target_id = v_aapl_target_id
      AND is_test_data = true
      AND consumed_by_prediction_id IS NULL;

    RAISE NOTICE 'Linked AAPL predictors to prediction %', v_aapl_prediction_id;
  END IF;

  -- Link T_NVDA predictors to NVDA prediction
  IF v_nvda_prediction_id IS NOT NULL THEN
    UPDATE prediction.predictors
    SET consumed_by_prediction_id = v_nvda_prediction_id,
        consumed_at = NOW(),
        status = 'consumed'
    WHERE target_id = v_nvda_target_id
      AND is_test_data = true
      AND consumed_by_prediction_id IS NULL;

    RAISE NOTICE 'Linked NVDA predictors to prediction %', v_nvda_prediction_id;
  END IF;

  -- Link T_BTC predictors to BTC prediction
  IF v_btc_prediction_id IS NOT NULL THEN
    UPDATE prediction.predictors
    SET consumed_by_prediction_id = v_btc_prediction_id,
        consumed_at = NOW(),
        status = 'consumed'
    WHERE target_id = v_btc_target_id
      AND is_test_data = true
      AND consumed_by_prediction_id IS NULL;

    RAISE NOTICE 'Linked BTC predictors to prediction %', v_btc_prediction_id;
  END IF;
END $$;

-- =====================================================================================
-- STEP 2: Fix snapshot predictors format
-- =====================================================================================
-- The snapshots need properly formatted predictor objects with predictor_id field
-- Column is analyst_predictions (not analyst_assessments), no captured_at column

DO $$
DECLARE
  v_prediction_id UUID;
  v_target_id UUID;
  v_predictors_json JSONB;
  v_analyst_predictions_json JSONB;
BEGIN
  -- Fix T_AAPL snapshot
  SELECT t.id INTO v_target_id FROM prediction.targets t WHERE t.symbol = 'T_AAPL' LIMIT 1;
  SELECT p.id INTO v_prediction_id FROM prediction.predictions p
    WHERE p.target_id = v_target_id AND p.is_test_data = true AND p.status = 'active'
    ORDER BY p.created_at DESC LIMIT 1;

  IF v_prediction_id IS NOT NULL THEN
    -- Build proper predictors array from actual predictors
    SELECT jsonb_agg(jsonb_build_object(
      'predictor_id', pr.id,
      'signal_content', COALESCE(pr.reasoning, ''),
      'direction', pr.direction,
      'strength', pr.strength,
      'confidence', pr.confidence,
      'analyst_slug', pr.analyst_slug,
      'created_at', pr.created_at
    ))
    INTO v_predictors_json
    FROM prediction.predictors pr
    WHERE pr.consumed_by_prediction_id = v_prediction_id;

    -- Build analyst predictions from the predictors
    SELECT jsonb_agg(jsonb_build_object(
      'analyst', jsonb_build_object('slug', pr.analyst_slug),
      'tier', 'gold',
      'direction', pr.direction,
      'confidence', pr.confidence,
      'reasoning', pr.reasoning,
      'key_factors', ARRAY['test_data'],
      'risks', ARRAY[]::text[],
      'learnings_applied', ARRAY[]::text[]
    ))
    INTO v_analyst_predictions_json
    FROM prediction.predictors pr
    WHERE pr.consumed_by_prediction_id = v_prediction_id;

    -- Delete existing snapshot if any, then insert new one
    DELETE FROM prediction.snapshots WHERE prediction_id = v_prediction_id;

    INSERT INTO prediction.snapshots (
      prediction_id,
      predictors,
      rejected_signals,
      analyst_predictions,
      llm_ensemble,
      learnings_applied,
      threshold_evaluation,
      timeline,
      is_test_data
    ) VALUES (
      v_prediction_id,
      COALESCE(v_predictors_json, '[]'::jsonb),
      '[]'::jsonb,
      COALESCE(v_analyst_predictions_json, '[]'::jsonb),
      jsonb_build_object(
        'tiers_used', ARRAY['gold', 'silver'],
        'tier_results', jsonb_build_object(
          'gold', jsonb_build_object('direction', 'up', 'confidence', 0.85, 'model', 'claude-sonnet-4-20250514', 'provider', 'anthropic'),
          'silver', jsonb_build_object('direction', 'up', 'confidence', 0.80, 'model', 'claude-3-5-haiku-20241022', 'provider', 'anthropic')
        ),
        'agreement_level', 0.90
      ),
      '[]'::jsonb,
      jsonb_build_object(
        'min_predictors', 2,
        'actual_predictors', COALESCE(jsonb_array_length(v_predictors_json), 0),
        'min_combined_strength', 5.0,
        'actual_combined_strength', 14.0,
        'min_consensus', 0.7,
        'actual_consensus', 0.95,
        'passed', true
      ),
      jsonb_build_array(
        jsonb_build_object('timestamp', NOW() - INTERVAL '2 hours', 'event_type', 'signal_received', 'details', jsonb_build_object('note', 'Initial signal detected')),
        jsonb_build_object('timestamp', NOW() - INTERVAL '1 hour', 'event_type', 'predictor_created', 'details', jsonb_build_object('analyst', 'fundamental-fred')),
        jsonb_build_object('timestamp', NOW(), 'event_type', 'prediction_generated', 'details', jsonb_build_object('confidence', 0.82))
      ),
      true
    );

    RAISE NOTICE 'Updated AAPL snapshot with % predictors', COALESCE(jsonb_array_length(v_predictors_json), 0);
  END IF;

  -- Fix T_NVDA snapshot
  SELECT t.id INTO v_target_id FROM prediction.targets t WHERE t.symbol = 'T_NVDA' LIMIT 1;
  SELECT p.id INTO v_prediction_id FROM prediction.predictions p
    WHERE p.target_id = v_target_id AND p.is_test_data = true AND p.status = 'active'
    ORDER BY p.created_at DESC LIMIT 1;

  IF v_prediction_id IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object(
      'predictor_id', pr.id,
      'signal_content', COALESCE(pr.reasoning, ''),
      'direction', pr.direction,
      'strength', pr.strength,
      'confidence', pr.confidence,
      'analyst_slug', pr.analyst_slug,
      'created_at', pr.created_at
    ))
    INTO v_predictors_json
    FROM prediction.predictors pr
    WHERE pr.consumed_by_prediction_id = v_prediction_id;

    SELECT jsonb_agg(jsonb_build_object(
      'analyst', jsonb_build_object('slug', pr.analyst_slug),
      'tier', 'gold',
      'direction', pr.direction,
      'confidence', pr.confidence,
      'reasoning', pr.reasoning,
      'key_factors', ARRAY['H200_demand', 'cloud_orders'],
      'risks', ARRAY['supply_constraints']::text[],
      'learnings_applied', ARRAY[]::text[]
    ))
    INTO v_analyst_predictions_json
    FROM prediction.predictors pr
    WHERE pr.consumed_by_prediction_id = v_prediction_id;

    DELETE FROM prediction.snapshots WHERE prediction_id = v_prediction_id;

    INSERT INTO prediction.snapshots (
      prediction_id,
      predictors,
      rejected_signals,
      analyst_predictions,
      llm_ensemble,
      learnings_applied,
      threshold_evaluation,
      timeline,
      is_test_data
    ) VALUES (
      v_prediction_id,
      COALESCE(v_predictors_json, '[]'::jsonb),
      '[]'::jsonb,
      COALESCE(v_analyst_predictions_json, '[]'::jsonb),
      jsonb_build_object(
        'tiers_used', ARRAY['gold', 'silver'],
        'tier_results', jsonb_build_object(
          'gold', jsonb_build_object('direction', 'up', 'confidence', 0.92, 'model', 'claude-sonnet-4-20250514', 'provider', 'anthropic'),
          'silver', jsonb_build_object('direction', 'up', 'confidence', 0.88, 'model', 'claude-3-5-haiku-20241022', 'provider', 'anthropic')
        ),
        'agreement_level', 0.95
      ),
      '[]'::jsonb,
      jsonb_build_object(
        'min_predictors', 2,
        'actual_predictors', COALESCE(jsonb_array_length(v_predictors_json), 0),
        'min_combined_strength', 5.0,
        'actual_combined_strength', 9.0,
        'min_consensus', 0.7,
        'actual_consensus', 1.0,
        'passed', true
      ),
      jsonb_build_array(
        jsonb_build_object('timestamp', NOW() - INTERVAL '3 hours', 'event_type', 'signal_received', 'details', jsonb_build_object('note', 'H200 demand signal')),
        jsonb_build_object('timestamp', NOW() - INTERVAL '2 hours', 'event_type', 'predictor_created', 'details', jsonb_build_object('analyst', 'fundamental-fred')),
        jsonb_build_object('timestamp', NOW(), 'event_type', 'prediction_generated', 'details', jsonb_build_object('confidence', 0.90))
      ),
      true
    );

    RAISE NOTICE 'Updated NVDA snapshot with % predictors', COALESCE(jsonb_array_length(v_predictors_json), 0);
  END IF;

  -- Fix T_BTC snapshot
  SELECT t.id INTO v_target_id FROM prediction.targets t WHERE t.symbol = 'T_BTC' LIMIT 1;
  SELECT p.id INTO v_prediction_id FROM prediction.predictions p
    WHERE p.target_id = v_target_id AND p.is_test_data = true AND p.status = 'active'
    ORDER BY p.created_at DESC LIMIT 1;

  IF v_prediction_id IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object(
      'predictor_id', pr.id,
      'signal_content', COALESCE(pr.reasoning, ''),
      'direction', pr.direction,
      'strength', pr.strength,
      'confidence', pr.confidence,
      'analyst_slug', pr.analyst_slug,
      'created_at', pr.created_at
    ))
    INTO v_predictors_json
    FROM prediction.predictors pr
    WHERE pr.consumed_by_prediction_id = v_prediction_id;

    SELECT jsonb_agg(jsonb_build_object(
      'analyst', jsonb_build_object('slug', pr.analyst_slug),
      'tier', 'gold',
      'direction', pr.direction,
      'confidence', pr.confidence,
      'reasoning', pr.reasoning,
      'key_factors', ARRAY['etf_inflows', 'institutional_adoption'],
      'risks', ARRAY['regulatory_risk']::text[],
      'learnings_applied', ARRAY[]::text[]
    ))
    INTO v_analyst_predictions_json
    FROM prediction.predictors pr
    WHERE pr.consumed_by_prediction_id = v_prediction_id;

    DELETE FROM prediction.snapshots WHERE prediction_id = v_prediction_id;

    INSERT INTO prediction.snapshots (
      prediction_id,
      predictors,
      rejected_signals,
      analyst_predictions,
      llm_ensemble,
      learnings_applied,
      threshold_evaluation,
      timeline,
      is_test_data
    ) VALUES (
      v_prediction_id,
      COALESCE(v_predictors_json, '[]'::jsonb),
      '[]'::jsonb,
      COALESCE(v_analyst_predictions_json, '[]'::jsonb),
      jsonb_build_object(
        'tiers_used', ARRAY['gold', 'silver'],
        'tier_results', jsonb_build_object(
          'gold', jsonb_build_object('direction', 'up', 'confidence', 0.88, 'model', 'claude-sonnet-4-20250514', 'provider', 'anthropic'),
          'silver', jsonb_build_object('direction', 'up', 'confidence', 0.82, 'model', 'claude-3-5-haiku-20241022', 'provider', 'anthropic')
        ),
        'agreement_level', 0.92
      ),
      '[]'::jsonb,
      jsonb_build_object(
        'min_predictors', 2,
        'actual_predictors', COALESCE(jsonb_array_length(v_predictors_json), 0),
        'min_combined_strength', 5.0,
        'actual_combined_strength', 8.0,
        'min_consensus', 0.7,
        'actual_consensus', 1.0,
        'passed', true
      ),
      jsonb_build_array(
        jsonb_build_object('timestamp', NOW() - INTERVAL '2 hours', 'event_type', 'signal_received', 'details', jsonb_build_object('note', 'ETF inflow signal')),
        jsonb_build_object('timestamp', NOW() - INTERVAL '1 hour', 'event_type', 'predictor_created', 'details', jsonb_build_object('analyst', 'on-chain-otto')),
        jsonb_build_object('timestamp', NOW(), 'event_type', 'prediction_generated', 'details', jsonb_build_object('confidence', 0.85))
      ),
      true
    );

    RAISE NOTICE 'Updated BTC snapshot with % predictors', COALESCE(jsonb_array_length(v_predictors_json), 0);
  END IF;
END $$;

-- =====================================================================================
-- VERIFICATION
-- =====================================================================================

DO $$
DECLARE
  v_linked_count INTEGER;
  v_snapshot_count INTEGER;
BEGIN
  -- Count linked predictors
  SELECT COUNT(*) INTO v_linked_count
  FROM prediction.predictors
  WHERE is_test_data = true AND consumed_by_prediction_id IS NOT NULL;

  -- Count snapshots with proper predictor format
  SELECT COUNT(*) INTO v_snapshot_count
  FROM prediction.snapshots s
  JOIN prediction.predictions p ON s.prediction_id = p.id
  WHERE p.is_test_data = true
    AND jsonb_array_length(s.predictors) > 0
    AND s.predictors->0 ? 'predictor_id';

  RAISE NOTICE '========== LINEAGE FIX VERIFICATION ==========';
  RAISE NOTICE 'Test predictors linked to predictions: %', v_linked_count;
  RAISE NOTICE 'Snapshots with proper predictor format: %', v_snapshot_count;
  RAISE NOTICE '===============================================';
END $$;

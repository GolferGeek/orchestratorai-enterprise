-- =============================================================================
-- DROP OLD PREDICTIONS AND FINANCE SCHEMAS
-- =============================================================================
-- This migration removes the deprecated schemas:
-- - predictions: Old prediction system (replaced by prediction-runner using prediction schema)
-- - finance: Unused schema (finance org uses prediction schema now)
--
-- The new prediction system uses the 'prediction' schema exclusively.
-- All services in prediction-runner module reference 'prediction.*' tables.
--
-- Created: 2026-01-11
-- =============================================================================

-- Drop predictions schema (old system from agent2agent/runners/prediction)
-- This includes all tables, functions, triggers, and indexes
DROP SCHEMA IF EXISTS predictions CASCADE;

-- Drop finance schema if it exists (was never properly migrated)
DROP SCHEMA IF EXISTS finance CASCADE;

-- Log the cleanup
DO $$
BEGIN
  RAISE NOTICE 'Dropped deprecated schemas: predictions, finance';
  RAISE NOTICE 'All prediction functionality now uses the "prediction" schema';
END $$;

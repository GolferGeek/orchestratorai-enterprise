-- =============================================================================
-- CREATE PREDICTION SCHEMA (Redesign)
-- =============================================================================
-- Creates the 'prediction' schema (singular) for the Prediction System Redesign
-- This is DISTINCT from the existing 'predictions' (plural) schema
-- Phase 1, Step 1-1: Core Database Schema
-- =============================================================================

-- Create prediction schema (singular - different from existing 'predictions' plural)
CREATE SCHEMA IF NOT EXISTS prediction;
COMMENT ON SCHEMA prediction IS 'Prediction System Redesign: signals, predictors, predictions, multi-analyst evaluation, learning loop';

-- Grant usage on schema
GRANT USAGE ON SCHEMA prediction TO postgres, anon, authenticated, service_role;

-- Grant all privileges on all tables in schema (for service_role)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA prediction TO service_role;

-- Grant all privileges on all sequences in schema (for service_role)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA prediction TO service_role;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA prediction GRANT ALL ON TABLES TO service_role;

-- Set default privileges for future sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA prediction GRANT ALL ON SEQUENCES TO service_role;

-- =============================================================================
-- SHARED FUNCTIONS
-- =============================================================================

-- Set updated_at function (reuse existing if available)
CREATE OR REPLACE FUNCTION prediction.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Prediction schema (redesign) created successfully';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Schema: prediction (singular)';
  RAISE NOTICE 'Note: This is DISTINCT from predictions (plural)';
  RAISE NOTICE '================================================';
END $$;

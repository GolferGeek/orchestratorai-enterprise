-- Migration: Add validation trigger for dimension weights
-- Ensures dimension weights always sum to 100% (1.0)

-- Create a function to validate dimension weights sum to 1.0
CREATE OR REPLACE FUNCTION risk.validate_dimension_weights()
RETURNS TRIGGER AS $$
DECLARE
  total_weight NUMERIC;
BEGIN
  -- Calculate sum of all active dimension weights
  SELECT SUM(weight) INTO total_weight
  FROM risk.dimensions
  WHERE is_active = true;

  -- Allow small floating point tolerance (0.99 to 1.01)
  IF total_weight < 0.99 OR total_weight > 1.01 THEN
    RAISE EXCEPTION 'Dimension weights must sum to 1.0 (100%%). Current sum: %', total_weight;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate on insert/update
DROP TRIGGER IF EXISTS validate_dimension_weights_trigger ON risk.dimensions;
CREATE TRIGGER validate_dimension_weights_trigger
AFTER INSERT OR UPDATE ON risk.dimensions
FOR EACH STATEMENT
EXECUTE FUNCTION risk.validate_dimension_weights();

-- Add comment explaining the constraint
COMMENT ON FUNCTION risk.validate_dimension_weights() IS
'Validates that active dimension weights sum to 100% (1.0).
This ensures composite risk scores are calculated correctly as weighted averages.';

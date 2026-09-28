-- Dimension weights must still sum to 1.0 per scope, but checked at commit,
-- so an admin can change several weights in one transaction (moving weight
-- from one dimension to another). The check itself is unchanged.
BEGIN;
DROP TRIGGER validate_dimension_weights_trigger ON risk.dimensions;
CREATE CONSTRAINT TRIGGER validate_dimension_weights_trigger
  AFTER INSERT OR UPDATE ON risk.dimensions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION risk.validate_dimension_weights();
COMMIT;

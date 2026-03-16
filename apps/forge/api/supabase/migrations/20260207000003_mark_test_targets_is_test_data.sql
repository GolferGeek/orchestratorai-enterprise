-- Mark T_ prefix targets as test data
-- These are duplicates of real instruments used for testing and should be
-- excluded from production queries via findAllActive() which filters is_test_data
UPDATE prediction.targets
SET is_test_data = true
WHERE symbol LIKE 'T\_%'
  AND (is_test_data IS NULL OR is_test_data = false);

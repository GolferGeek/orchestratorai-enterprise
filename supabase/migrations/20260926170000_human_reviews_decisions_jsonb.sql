-- human_reviews.allowed_decisions as jsonb, not text[]: the database plane's
-- query builder sends arrays as JSON, which a text[] column rejects
-- ("malformed array literal"). jsonb also carries over to SQL Server as JSON.

BEGIN;

ALTER TABLE workflows.human_reviews
  DROP CONSTRAINT human_reviews_approval_has_decisions,
  DROP CONSTRAINT human_reviews_allowed_decisions_check;

ALTER TABLE workflows.human_reviews
  ALTER COLUMN allowed_decisions DROP DEFAULT,
  ALTER COLUMN allowed_decisions TYPE JSONB USING to_jsonb(allowed_decisions),
  ALTER COLUMN allowed_decisions SET DEFAULT '[]'::jsonb,
  ADD CONSTRAINT human_reviews_allowed_decisions_check CHECK (
    jsonb_typeof(allowed_decisions) = 'array'
    AND allowed_decisions <@ '["approve", "reject", "modify"]'::jsonb
  ),
  ADD CONSTRAINT human_reviews_approval_has_decisions CHECK (
    kind <> 'approval' OR jsonb_array_length(allowed_decisions) > 0
  );

COMMIT;

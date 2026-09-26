-- workflows.registry.organization_slugs as jsonb, not text[]: the database
-- plane's builder sends arrays as JSON, which a text[] column rejects
-- ("malformed array literal"), and the API failed to boot on the registry
-- sync. Same fix as human_reviews.allowed_decisions.

BEGIN;

ALTER TABLE workflows.registry
  ALTER COLUMN organization_slugs TYPE JSONB USING to_jsonb(organization_slugs),
  ADD CONSTRAINT registry_organization_slugs_array CHECK (
    jsonb_typeof(organization_slugs) = 'array' AND jsonb_array_length(organization_slugs) > 0
  );

COMMIT;

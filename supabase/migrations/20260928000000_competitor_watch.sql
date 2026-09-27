-- Competitor watch (org effort Phase 4): the pages marketing follows, each
-- fetch of them, the writer agent, marketing's models, and a Monday trigger.
BEGIN;

CREATE TABLE marketing.competitor_sources (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_slug text NOT NULL,
  competitor        text NOT NULL CHECK (competitor <> ''),
  page              text NOT NULL CHECK (page <> ''),
  url               text NOT NULL CHECK (url ~ '^https://'),
  enabled           boolean NOT NULL DEFAULT true,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_slug, url)
);

-- What a page said at one fetch: live, or the Internet Archive's copy used as
-- the first baseline. The text is what the diff compares.
CREATE TABLE marketing.competitor_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid NOT NULL REFERENCES marketing.competitor_sources(id) ON DELETE CASCADE,
  organization_slug text NOT NULL,
  run_id            uuid REFERENCES workflows.runs(id) ON DELETE SET NULL,
  captured_from     text NOT NULL CHECK (captured_from IN ('live', 'archive')),
  archived_at       timestamptz,
  content_hash      text NOT NULL,
  text              text NOT NULL,
  fetched_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((captured_from = 'archive') = (archived_at IS NOT NULL))
);
CREATE INDEX competitor_snapshots_latest ON marketing.competitor_snapshots (source_id, fetched_at DESC) WHERE captured_from = 'live';

ALTER TABLE marketing.competitor_sources OWNER TO postgres;
ALTER TABLE marketing.competitor_snapshots OWNER TO postgres;
ALTER TABLE marketing.competitor_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.competitor_snapshots ENABLE ROW LEVEL SECURITY;

INSERT INTO marketing.competitor_sources (organization_slug, competitor, page, url) VALUES
  ('marketing', 'PostHog', 'Pricing', 'https://posthog.com/pricing'),
  ('marketing', 'Plausible', 'Home', 'https://plausible.io/'),
  ('marketing', 'Linear', 'Pricing', 'https://linear.app/pricing');

INSERT INTO workflows.agent_definitions
  (slug, name, description, instructions, model_role, output_format, input_schema, output_schema, max_tokens)
VALUES
  ('competitor-watch-writer', 'Competitor watch writer', 'Writes the digest of material competitor changes.',
   'You write the weekly competitor digest for a product marketing team from the changes you are given. Each change has the competitor, the page, what was removed and added, and a classification. Group by competitor. For each material change say in one or two sentences what changed and why a marketer should care, quoting prices and names exactly as the page does. End with at most three suggested follow-ups (for example: update our comparison page). Never infer a change that is not in the input. Plain prose with short paragraphs, under 300 words.',
   'writer', 'text',
   '{"type": "object", "properties": {"compareWith": {"type": "string"}, "changes": {"type": "array", "minItems": 1}}, "required": ["compareWith", "changes"], "additionalProperties": false}'::jsonb,
   NULL, 700);

INSERT INTO workflows.agent_definition_links (agent_slug, workflow_slug, purpose) VALUES
  ('competitor-watch-writer', 'competitor-watch', 'step'),
  ('workflow-trace-reviewer', 'competitor-watch', 'trace_review');

INSERT INTO workflows.model_profiles (organization_slug, workflow_slug, role, provider, model) VALUES
  ('marketing', 'competitor-watch', 'writer', 'openrouter', 'google/gemini-2.5-flash-lite'),
  ('marketing', 'competitor-watch', 'reviewer', 'openrouter', 'google/gemini-2.5-flash-lite');

INSERT INTO ambient.triggers
  (org_slug, name, description, source_type, enabled, source_config, action_config, trigger_kind, trigger_config, response_kind, response_config, cooldown_seconds, created_by)
SELECT 'marketing', 'Weekly competitor watch', 'Every Monday at 07:00 (Denver): what changed on competitor pages since the last run.', 'cron', true,
       '{"expression": "0 7 * * 1", "timezone": "America/Denver"}'::jsonb,
       '{"workflowSlug": "competitor-watch", "input": {"compareWith": "last-run"}}'::jsonb,
       'cron', '{"expression": "0 7 * * 1", "timezone": "America/Denver"}'::jsonb,
       'workflow', '{"workflowSlug": "competitor-watch", "input": {"compareWith": "last-run"}}'::jsonb,
       3600, u.id
FROM auth.users u WHERE u.email = 'admin-user@orchestratorai.io'
  AND NOT EXISTS (SELECT 1 FROM ambient.triggers WHERE org_slug = 'marketing' AND name = 'Weekly competitor watch');

COMMIT;

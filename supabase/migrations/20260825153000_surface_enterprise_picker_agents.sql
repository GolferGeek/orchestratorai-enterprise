BEGIN;

-- =============================================================================
-- Surface existing Enterprise seed assistants in the Agents picker
-- =============================================================================
-- Studio (Mac local Postgres on 6011) and the picker catalog agree on
-- visibility: metadata.status = 'active' and metadata.hidden IS NOT true.
-- public.agents has NO status column on Studio. Do not add one. Do not
-- reference agents.status.
--
-- GET /invoke/agents lists rows whose organization_slug contains the current
-- org, then rows that contain 'global'. Compose catalog types include
-- rag-runner (normalized to rag) and media
-- (apps/api/src/agents/invoke/agent-definition.service.ts).
--
-- HR Assistant is {human-resources}. The five legal assistants are {legal}
-- with agent_type rag-runner. Image Generator is {marketing}. They do not
-- appear next to HR until they also contain 'global'.
--
-- Fix: append 'global' while keeping the home org first so RAG stays on
-- org 'legal'. Activate via metadata only. Do not invent agents. Do not
-- enable Video or Marketing Swarm.

DO $$
DECLARE
  required_slugs TEXT[] := ARRAY[
    'legal-policies-agent',
    'legal-contracts-agent',
    'legal-litigation-agent',
    'legal-intake-agent',
    'legal-estate-agent',
    'image-generator',
    'infographic-agent'
  ];
  missing_slugs TEXT[];
BEGIN
  IF to_regclass('public.agents') IS NULL THEN
    RAISE EXCEPTION 'public.agents does not exist';
  END IF;

  SELECT COALESCE(array_agg(required.slug ORDER BY required.slug), ARRAY[]::text[])
  INTO missing_slugs
  FROM unnest(required_slugs) AS required(slug)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.agents existing WHERE existing.slug = required.slug
  );

  IF cardinality(missing_slugs) > 0 THEN
    RAISE EXCEPTION
      'Missing seed assistants required for the Enterprise picker: %',
      missing_slugs;
  END IF;
END
$$;

-- Phase 1: legal RAG assistants. Phase 2: Image Generator + Infographic Agent.
UPDATE public.agents
SET
  organization_slug = CASE
    WHEN 'global' = ANY (organization_slug) THEN organization_slug
    ELSE organization_slug || ARRAY['global']
  END,
  metadata = (COALESCE(metadata, '{}'::jsonb) - 'hidden')
    || jsonb_build_object('status', 'active'),
  updated_at = now()
WHERE slug IN (
  'legal-policies-agent',
  'legal-contracts-agent',
  'legal-litigation-agent',
  'legal-intake-agent',
  'legal-estate-agent',
  'image-generator',
  'infographic-agent'
);

-- Video Generator stays off. sora-2 is not assigned here.
UPDATE public.agents
SET
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{hidden}',
      'true'::jsonb,
      true
    ),
    '{status}',
    '"disabled"'::jsonb,
    true
  ),
  updated_at = now()
WHERE slug = 'video-generator';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'legal-policies-agent',
      'legal-contracts-agent',
      'legal-litigation-agent',
      'legal-intake-agent',
      'legal-estate-agent'
    ]) AS required(slug)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.agents a
      WHERE a.slug = required.slug
        AND a.agent_type IN ('rag', 'rag-runner')
        AND a.metadata ->> 'status' = 'active'
        AND COALESCE(a.metadata ->> 'hidden', 'false') <> 'true'
        AND a.organization_slug[1] = 'legal'
        AND 'global' = ANY (a.organization_slug)
        AND a.metadata #>> '{rag_config,collection_slug}' IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION
      'Phase 1 failed: legal assistants must be active, visible, legal-first, and global';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY['image-generator', 'infographic-agent']) AS required(slug)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.agents a
      WHERE a.slug = required.slug
        AND a.agent_type IN ('media', 'media-runner')
        AND a.metadata ->> 'status' = 'active'
        AND a.metadata ->> 'mediaType' = 'image'
        AND COALESCE(a.metadata ->> 'hidden', 'false') <> 'true'
        AND 'global' = ANY (a.organization_slug)
    )
  ) THEN
    RAISE EXCEPTION
      'Phase 2 failed: Image Generator and Infographic Agent must be active, visible, and global';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agents
    WHERE slug = 'video-generator'
      AND (
        metadata ->> 'hidden' <> 'true'
        OR metadata ->> 'status' <> 'disabled'
      )
  ) THEN
    RAISE EXCEPTION 'Video Generator must remain disabled and hidden';
  END IF;
END
$$;

COMMIT;

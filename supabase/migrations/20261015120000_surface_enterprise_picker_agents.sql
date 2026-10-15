BEGIN;

-- =============================================================================
-- Surface existing Enterprise seed assistants in the Agents picker
-- =============================================================================
-- Re-land of PR 34 (closed unmerged; its 20260825153000 file never reached
-- main). The Studio already has this data, applied by hand, and
-- supabase/baseline/seed.sql carries it, so on those databases this is a
-- no-op: every UPDATE only touches rows not yet in the target state and the
-- checks at the end pass. Safe to run any number of times.
--
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
-- HR Assistant is {human-resources}. The five legal assistants are home org
-- {legal} (agent_type rag), Infographic Agent is home org {marketing}, Image
-- Generator is {global} only. Org-scoped ones do not appear next to HR until
-- they also contain 'global'.
--
-- Fix: append 'global' while keeping the home org first. Activate via
-- metadata only. Being in the picker does not open legal's documents: a RAG
-- agent searches the CALLER's organization's collections plus global ones
-- (20261015130000_rag_org_scope_null_is_global.sql), so from another
-- organization a legal assistant finds no collection and refuses. Do not invent agents. Do not
-- touch Video Generator or Marketing Swarm. (PR 34 also forced Video
-- Generator hidden and disabled; that part is dropped because
-- 20261005160000_video_generator_on_openrouter.sql deliberately turned it on.)

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
)
  AND (
    NOT ('global' = ANY (organization_slug))
    OR metadata IS NULL
    OR metadata ->> 'status' IS DISTINCT FROM 'active'
    OR metadata ? 'hidden'
  );

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
END
$$;

COMMIT;

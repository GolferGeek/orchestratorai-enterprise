-- =============================================================================
-- GCP FIRST-DEPLOYMENT PRODUCT POLICY
-- =============================================================================
-- Video support remains implemented, but the first GCP deployment must not
-- expose or run the video agent. Enabling it later requires an intentional
-- database change together with the two OpenRouter video environment gates.

UPDATE public.agents
SET status = 'disabled',
    metadata = jsonb_set(
      jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{hidden}',
        'true'::jsonb,
        true
      ),
      '{status}',
      '"disabled"'::jsonb,
      true
    ),
    updated_at = now()
WHERE slug = 'video-generator'
  AND agent_type = 'media';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.agents
    WHERE slug = 'video-generator'
      AND agent_type = 'media'
      AND (
        status <> 'disabled'
        OR metadata->>'hidden' <> 'true'
        OR metadata->>'status' <> 'disabled'
      )
  ) THEN
    RAISE EXCEPTION 'First-deployment policy failed to disable the video agent';
  END IF;
END
$$;

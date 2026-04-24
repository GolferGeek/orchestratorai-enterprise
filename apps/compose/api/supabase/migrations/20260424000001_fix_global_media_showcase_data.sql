-- Ensure global media agents can create conversations and assets.
INSERT INTO public.organizations (slug, name, description, url, settings)
VALUES (
  'global',
  'Global',
  'Shared organization for globally available table-stakes agents',
  NULL,
  '{}'::jsonb
)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  settings = EXCLUDED.settings;

-- The OpenAI provider rejects sora-2-hd; keep Sora 2 as the active video model.
UPDATE public.llm_models
SET
  is_active = false,
  deprecation_reason = 'Provider rejects model id sora-2-hd; use sora-2.',
  deprecated_at = COALESCE(deprecated_at, NOW()),
  updated_at = NOW()
WHERE provider_name = 'openai'
  AND model_name = 'sora-2-hd';

UPDATE public.agents
SET output_type = 'image'
WHERE slug IN ('image-generator', 'infographic-agent')
  AND agent_type = 'media';

UPDATE public.agents
SET output_type = 'video'
WHERE slug = 'video-generator'
  AND agent_type = 'media';

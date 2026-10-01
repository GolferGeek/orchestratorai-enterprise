-- Media agents move to OpenRouter models (effort: openrouter-image-models,
-- 2026-10-01). A side-by-side of seven models picked these: GPT Image 2 as the
-- default (fastest, $0.006–0.014 an image against GPT Image 1's $0.167),
-- FLUX.2 Pro for product photos (no invented branding), and Recraft v4.1
-- Vector for infographics (real SVG, which the storage layer checks for active
-- content before keeping it).
--
-- The hand-kept model lists in these agents' metadata (supportedModels,
-- defaultModel, ...) are dropped: nothing reads them, and the model catalog
-- (llm_models, refreshed from OpenRouter) is what the picker offers.
BEGIN;

-- Catalog rows for the two models the agents need, so a fresh database has
-- them before its first catalog refresh (which then keeps them current).
INSERT INTO public.llm_models
  (model_name, provider_name, display_name, model_type, pricing_info_json, capabilities, vendor, is_local, is_active)
VALUES
  ('black-forest-labs/flux.2-pro', 'openrouter', 'Black Forest Labs: FLUX.2 [pro]', 'image-generation',
   '{"source": "openrouter", "input_per_1k": 0, "output_per_1k": 0, "per_image": 0.03}'::jsonb, '["text", "image"]'::jsonb, 'black-forest-labs', false, true),
  ('recraft/recraft-v4.1-vector', 'openrouter', 'Recraft: Recraft V4.1 Vector', 'image-generation',
   '{"source": "openrouter", "input_per_1k": 0, "output_per_1k": 0, "per_image": 0.08}'::jsonb, '["text", "image"]'::jsonb, 'recraft', false, true)
ON CONFLICT (model_name, provider_name) DO UPDATE SET is_active = true, model_type = EXCLUDED.model_type;

UPDATE public.agents
SET llm_config = '{"provider": "openrouter", "model": "openai/gpt-image-2"}'::jsonb,
    description = 'Generates illustrations, diagrams and general images with GPT Image 2 (through OpenRouter). Supports various sizes, styles and quality settings.',
    metadata = metadata - 'supportedModels' - 'supportedProviders' - 'defaultModel' - 'defaultProvider',
    updated_at = now()
WHERE slug = 'image-generator';

UPDATE public.agents
SET llm_config = '{"provider": "openrouter", "model": "recraft/recraft-v4.1-vector"}'::jsonb,
    metadata = (metadata - 'supportedModels' - 'supportedProviders' - 'defaultModel' - 'defaultProvider') || '{"format": "svg"}'::jsonb,
    updated_at = now()
WHERE slug = 'infographic-agent';

UPDATE public.agents
SET metadata = metadata - 'supportedModels' - 'supportedProviders' - 'defaultModel' - 'defaultProvider',
    updated_at = now()
WHERE slug = 'video-generator';

-- Product photos: a copy of the image generator on FLUX.2 Pro.
INSERT INTO public.agents
  (slug, organization_slug, name, description, version, agent_type, department, tags, io_schema,
   capabilities, context, endpoint, llm_config, metadata)
SELECT 'product-photo', organization_slug, 'Product Photo',
       'Realistic product and lifestyle photos with FLUX.2 Pro (through OpenRouter). Keeps products free of invented brand names and labels.',
       version, agent_type, department, ARRAY['image', 'generation', 'product', 'photo', 'media'], io_schema,
       capabilities, context, endpoint,
       '{"provider": "openrouter", "model": "black-forest-labs/flux.2-pro"}'::jsonb,
       metadata - 'supportedModels' - 'supportedProviders' - 'defaultModel' - 'defaultProvider'
FROM public.agents
WHERE slug = 'image-generator'
ON CONFLICT (slug) DO NOTHING;

COMMIT;

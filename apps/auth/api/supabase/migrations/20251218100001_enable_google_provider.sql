-- Enable Google provider for image generation
-- User has added a new Google/Gemini API key

UPDATE public.llm_providers
SET is_active = true, updated_at = NOW()
WHERE name = 'google';

-- Enable existing Google text models
UPDATE public.llm_models
SET is_active = true, updated_at = NOW()
WHERE provider_name = 'google';

-- Add Google Imagen models for image generation
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type, model_version,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
) VALUES
  ('imagen-3.0-generate-001', 'google', 'Imagen 3', 'image-generation', '3.0',
   NULL, NULL,
   '{"per_image": 0.03}'::jsonb,
   '["image-generation"]'::jsonb,
   'standard', 'medium', false, true),
  ('imagen-3.0-fast-generate-001', 'google', 'Imagen 3 Fast', 'image-generation', '3.0-fast',
   NULL, NULL,
   '{"per_image": 0.02}'::jsonb,
   '["image-generation"]'::jsonb,
   'economy', 'fast', false, true)
ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  model_type = EXCLUDED.model_type,
  pricing_info_json = EXCLUDED.pricing_info_json,
  capabilities = EXCLUDED.capabilities,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

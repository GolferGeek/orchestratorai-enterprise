-- =============================================================================
-- ADD MEDIA GENERATION MODELS (IMAGE AND VIDEO)
-- =============================================================================
-- Adds image and video generation models to llm_models table
-- These models use model_type 'image-generation' and 'video-generation'
-- Pricing is stored as cost per image or per second of video
-- =============================================================================

-- =============================================================================
-- OPENAI IMAGE GENERATION MODELS
-- =============================================================================

INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type, model_version,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active, training_data_cutoff
) VALUES
  -- GPT Image Family (Released 2025)
  ('gpt-image-1.5', 'openai', 'GPT Image 1.5', 'image-generation', '1.5',
   32000, 0,  -- context_window = max prompt chars, max_output_tokens not applicable
   '{"per_image_1024": 0.04, "per_image_1792": 0.08, "per_image_hd_1024": 0.08, "per_image_hd_1792": 0.12}',
   '["image-generation", "image-editing", "transparent-background", "text-rendering"]',
   'flagship', 'medium', false, true, '2025-04-01'),

  ('gpt-image-1', 'openai', 'GPT Image 1', 'image-generation', '1.0',
   32000, 0,
   '{"per_image_1024": 0.02, "per_image_1792": 0.04}',
   '["image-generation", "image-editing"]',
   'standard', 'medium', false, true, '2025-04-01'),

  ('gpt-image-1-mini', 'openai', 'GPT Image 1 Mini', 'image-generation', '1.0-mini',
   32000, 0,
   '{"per_image_1024": 0.01, "per_image_512": 0.005}',
   '["image-generation"]',
   'economy', 'fast', false, true, '2025-04-01')

ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  model_type = EXCLUDED.model_type,
  pricing_info_json = EXCLUDED.pricing_info_json,
  capabilities = EXCLUDED.capabilities,
  model_tier = EXCLUDED.model_tier,
  speed_tier = EXCLUDED.speed_tier,
  training_data_cutoff = EXCLUDED.training_data_cutoff,
  updated_at = NOW();

-- =============================================================================
-- OPENAI VIDEO GENERATION MODELS (SORA)
-- =============================================================================

INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type, model_version,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active, training_data_cutoff
) VALUES
  -- Sora 2 Family (Released September 2025)
  ('sora-2-hd', 'openai', 'Sora 2 HD', 'video-generation', '2.0-hd',
   32000, 0,  -- context_window = max prompt chars
   '{"per_second_720p": 0.10, "per_second_1080p": 0.30, "per_second_4k": 0.50, "max_duration_seconds": 60}',
   '["video-generation", "image-to-video", "audio-sync", "character-injection", "storyboard"]',
   'flagship', 'slow', false, true, '2025-09-01'),

  ('sora-2', 'openai', 'Sora 2', 'video-generation', '2.0',
   32000, 0,
   '{"per_second_720p": 0.05, "per_second_1080p": 0.15, "max_duration_seconds": 25}',
   '["video-generation", "image-to-video", "audio-sync"]',
   'standard', 'medium', false, true, '2025-09-01')

ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  model_type = EXCLUDED.model_type,
  pricing_info_json = EXCLUDED.pricing_info_json,
  capabilities = EXCLUDED.capabilities,
  model_tier = EXCLUDED.model_tier,
  speed_tier = EXCLUDED.speed_tier,
  training_data_cutoff = EXCLUDED.training_data_cutoff,
  updated_at = NOW();

-- =============================================================================
-- GOOGLE IMAGE GENERATION MODELS (IMAGEN)
-- =============================================================================

INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type, model_version,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active, training_data_cutoff
) VALUES
  -- Imagen 4 Family (GA November 2025)
  ('imagen-4.0-generate-001', 'google', 'Imagen 4', 'image-generation', '4.0',
   10000, 0,
   '{"per_image": 0.03, "note": "Vertex AI pricing"}',
   '["image-generation", "image-editing", "upscale", "synthid-watermark", "prompt-enhancement"]',
   'flagship', 'medium', false, true, '2025-11-01'),

  ('imagen-4.0-ultra-generate-001', 'google', 'Imagen 4 Ultra', 'image-generation', '4.0-ultra',
   10000, 0,
   '{"per_image": 0.06, "note": "Vertex AI pricing - highest quality"}',
   '["image-generation", "image-editing", "upscale", "synthid-watermark", "prompt-enhancement"]',
   'premium', 'slow', false, true, '2025-11-01'),

  ('imagen-4.0-fast-generate-001', 'google', 'Imagen 4 Fast', 'image-generation', '4.0-fast',
   10000, 0,
   '{"per_image": 0.015, "note": "Vertex AI pricing - optimized for speed"}',
   '["image-generation", "synthid-watermark"]',
   'economy', 'fast', false, true, '2025-11-01')

ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  model_type = EXCLUDED.model_type,
  pricing_info_json = EXCLUDED.pricing_info_json,
  capabilities = EXCLUDED.capabilities,
  model_tier = EXCLUDED.model_tier,
  speed_tier = EXCLUDED.speed_tier,
  training_data_cutoff = EXCLUDED.training_data_cutoff,
  updated_at = NOW();

-- =============================================================================
-- GOOGLE VIDEO GENERATION MODELS (VEO)
-- =============================================================================

INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type, model_version,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active, training_data_cutoff
) VALUES
  -- Veo 3 Family (GA 2025)
  ('veo-3.1-generate', 'google', 'Veo 3.1', 'video-generation', '3.1',
   10000, 0,
   '{"per_second": 0.08, "max_duration_seconds": 8, "note": "Vertex AI pricing"}',
   '["video-generation", "image-to-video", "audio-generation", "first-last-frame-control"]',
   'flagship', 'slow', false, true, '2025-10-01'),

  ('veo-3-generate', 'google', 'Veo 3', 'video-generation', '3.0',
   10000, 0,
   '{"per_second": 0.06, "max_duration_seconds": 8, "note": "Vertex AI pricing"}',
   '["video-generation", "image-to-video", "audio-generation"]',
   'standard', 'slow', false, true, '2025-06-01'),

  ('veo-3-fast', 'google', 'Veo 3 Fast', 'video-generation', '3.0-fast',
   10000, 0,
   '{"per_second": 0.03, "max_duration_seconds": 8, "note": "Vertex AI pricing - low latency"}',
   '["video-generation", "image-to-video"]',
   'economy', 'medium', false, true, '2025-06-01')

ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  model_type = EXCLUDED.model_type,
  pricing_info_json = EXCLUDED.pricing_info_json,
  capabilities = EXCLUDED.capabilities,
  model_tier = EXCLUDED.model_tier,
  speed_tier = EXCLUDED.speed_tier,
  training_data_cutoff = EXCLUDED.training_data_cutoff,
  updated_at = NOW();

-- =============================================================================
-- SUCCESS NOTIFICATION
-- =============================================================================

DO $$
DECLARE
  image_model_count INTEGER;
  video_model_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO image_model_count FROM public.llm_models WHERE model_type = 'image-generation';
  SELECT COUNT(*) INTO video_model_count FROM public.llm_models WHERE model_type = 'video-generation';

  RAISE NOTICE '================================================';
  RAISE NOTICE 'Media Generation Models added successfully';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Image generation models: %', image_model_count;
  RAISE NOTICE 'Video generation models: %', video_model_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Pricing format in pricing_info_json:';
  RAISE NOTICE '  - per_image: cost per generated image (USD)';
  RAISE NOTICE '  - per_image_1024/1792: cost by resolution';
  RAISE NOTICE '  - per_second: cost per second of video';
  RAISE NOTICE '  - max_duration_seconds: maximum video length';
  RAISE NOTICE '================================================';
END $$;

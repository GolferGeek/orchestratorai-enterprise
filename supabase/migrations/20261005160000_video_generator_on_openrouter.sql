-- The Video Generator runs on Veo 3.1 Fast through OpenRouter (effort:
-- openrouter-image-models). It was disabled and pointed at OpenAI's sora-2,
-- with no duration, aspect ratio or resolution, so the media runner refused it.
-- In the 2026-10-01 comparison Veo 3.1 Fast was the fastest (55 s for 4 s of
-- 720p) at $0.08 a second without audio, so a clip costs about $0.32.
--
-- Video models now come from OpenRouter's video catalog, which records what
-- each accepts (model_parameters_json.video) and its cheapest price a second.
-- This row is what the next catalog refresh would write, so a fresh database
-- can run the agent before its first refresh.
BEGIN;

INSERT INTO public.llm_models
  (model_name, provider_name, display_name, model_type, context_window, max_output_tokens,
   model_parameters_json, pricing_info_json, capabilities, vendor, is_local, is_active)
VALUES
  ('google/veo-3.1-fast', 'openrouter', 'Google: Veo 3.1 Fast', 'video-generation', NULL, NULL,
   '{"video": {"durations": [4, 6, 8], "resolutions": ["720p", "1080p", "4K"], "aspectRatios": ["16:9", "9:16"], "generateAudio": true}}'::jsonb,
   '{"source": "openrouter", "input_per_1k": 0, "output_per_1k": 0, "per_second": 0.08}'::jsonb,
   '["text", "image"]'::jsonb, 'google', false, true)
ON CONFLICT (model_name, provider_name) DO UPDATE
SET model_type = EXCLUDED.model_type,
    model_parameters_json = EXCLUDED.model_parameters_json,
    pricing_info_json = EXCLUDED.pricing_info_json,
    is_active = true,
    updated_at = now();

-- OpenRouter's general catalog still lists Sora 2 Pro, but its video API
-- answers 404 for it.
UPDATE public.llm_models
SET is_active = false,
    deprecated_at = now(),
    deprecation_reason = 'Not served by OpenRouter''s video API',
    updated_at = now()
WHERE provider_name = 'openrouter' AND model_name = 'openai/sora-2-pro';

UPDATE public.agents
SET llm_config = '{"provider": "openrouter", "model": "google/veo-3.1-fast"}'::jsonb,
    description = 'Generates short video clips from a description with Veo 3.1 Fast (through OpenRouter): 4 seconds of 16:9 720p, about $0.32 a clip.',
    metadata = (metadata - 'hidden' - 'asyncGeneration')
      || '{"status": "active", "duration": 4, "aspectRatio": "16:9", "resolution": "720p", "generateAudio": false, "estimatedProcessingTime": "about a minute"}'::jsonb,
    updated_at = now()
WHERE slug = 'video-generator';

COMMIT;

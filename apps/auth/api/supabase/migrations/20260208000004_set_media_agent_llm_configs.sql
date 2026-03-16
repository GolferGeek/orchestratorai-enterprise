-- Migration: Set llm_config for media agents
-- Description: Ensures all media agents (image-generator, video-generator, infographic-agent)
-- have their llm_config column populated so the frontend can set the correct
-- provider/model in the ExecutionContext when the agent is selected.

-- Image Generator: OpenAI gpt-image-1 (already has llm_config, but ensure consistency)
UPDATE public.agents
SET llm_config = '{"provider": "openai", "model": "gpt-image-1"}'::jsonb,
    updated_at = NOW()
WHERE slug = 'image-generator'
  AND (llm_config IS NULL OR llm_config->>'model' = 'gpt-image-1-mini');

-- Video Generator: OpenAI sora-2 (already has llm_config, ensure it's correct)
UPDATE public.agents
SET llm_config = '{"provider": "openai", "model": "sora-2"}'::jsonb,
    updated_at = NOW()
WHERE slug = 'video-generator'
  AND llm_config IS NULL;

-- Infographic Agent: OpenAI gpt-image-1 (same as image-generator)
UPDATE public.agents
SET llm_config = '{"provider": "openai", "model": "gpt-image-1"}'::jsonb,
    updated_at = NOW()
WHERE slug = 'infographic-agent'
  AND llm_config IS NULL;

-- Verification
DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM public.agents
  WHERE agent_type = 'media'
    AND llm_config IS NULL;

  IF missing_count > 0 THEN
    RAISE WARNING 'Found % media agent(s) still missing llm_config', missing_count;
  ELSE
    RAISE NOTICE 'All media agents have llm_config set';
  END IF;
END $$;

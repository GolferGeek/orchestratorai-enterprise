-- Migration: Fix stale defaultProvider/defaultModel in media agent metadata
-- The metadata.defaultProvider/defaultModel had stale google values while
-- llm_config was correctly set to openai. Both should agree.

-- Image Generator: google -> openai
UPDATE public.agents
SET metadata = jsonb_set(
  jsonb_set(metadata, '{defaultProvider}', '"openai"'),
  '{defaultModel}', '"gpt-image-1"'
),
updated_at = NOW()
WHERE slug = 'image-generator'
  AND metadata->>'defaultProvider' = 'google';

-- Infographic Agent: google -> openai
UPDATE public.agents
SET metadata = jsonb_set(
  jsonb_set(metadata, '{defaultProvider}', '"openai"'),
  '{defaultModel}', '"gpt-image-1"'
),
updated_at = NOW()
WHERE slug = 'infographic-agent'
  AND metadata->>'defaultProvider' = 'google';

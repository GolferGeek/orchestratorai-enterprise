-- Disable video-generator agent via metadata.status
-- OpenRouter simplified plane does not have suitable video generation models
-- Re-enable: UPDATE public.agents SET metadata = metadata || '{"status": "active"}'::jsonb WHERE slug = 'video-generator';

UPDATE public.agents
SET metadata = metadata || '{"status": "disabled"}'::jsonb
WHERE slug = 'video-generator';

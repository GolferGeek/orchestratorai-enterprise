-- Register the LLM providers the factory can actually route to.
--
-- `llm_usage.provider_name` is a foreign key onto `llm_providers(name)`, and
-- only 'ollama' was ever registered. Every other vendor therefore failed its
-- usage insert with a foreign key violation — which is the real reason
-- `llm_usage` contains nothing but Ollama rows and the LLM usage admin has
-- never shown a commercial call, with no cost or token accounting.
--
-- Worse, BaseLLMService.trackUsage does not swallow that failure: the insert
-- error propagates and fails the whole LLM request. So a vendor that was not
-- registered here could not be used at all through the fine_control path.
--
-- These are the providers in LLMServiceFactory.providerMap. Adding a backend
-- means adding its row here too, or its first call will fail on the FK.

INSERT INTO public.llm_providers
  (name, display_name, api_base_url, configuration_json, is_active, is_local)
VALUES
  ('openai', 'OpenAI', 'https://api.openai.com/v1',
   '{"auth_type": "bearer"}'::jsonb, true, false),
  ('anthropic', 'Anthropic', 'https://api.anthropic.com/v1',
   '{"auth_type": "x-api-key"}'::jsonb, true, false),
  ('google', 'Google', 'https://generativelanguage.googleapis.com/v1beta',
   '{"auth_type": "api_key"}'::jsonb, true, false),
  ('xai', 'xAI (Grok)', 'https://api.x.ai/v1',
   '{"auth_type": "bearer"}'::jsonb, true, false),
  ('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1',
   '{"auth_type": "bearer", "aggregator": true}'::jsonb, true, false)
ON CONFLICT (name) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      api_base_url = EXCLUDED.api_base_url,
      is_active = EXCLUDED.is_active,
      is_local = EXCLUDED.is_local,
      updated_at = now();

-- =============================================================================
-- ADD OLLAMA CLOUD MODELS
-- =============================================================================
-- Adds large models optimized for Ollama Cloud (70B+ parameters)
-- These models require significant GPU resources and are best run via cloud
-- To use: Set OLLAMA_CLOUD_API_KEY environment variable
-- =============================================================================

-- Ensure ollama provider exists
INSERT INTO public.llm_providers (
  name, display_name, api_base_url, is_active
) VALUES (
  'ollama', 'Ollama', 'http://localhost:11434', true
) ON CONFLICT (name) DO NOTHING;

-- Update ollama provider configuration to document cloud support
UPDATE public.llm_providers
SET configuration_json = '{"provider_type": "local", "cloud_api_key_env_var": "OLLAMA_CLOUD_API_KEY", "cloud_base_url": "https://ollama.com", "supports_cloud_mode": true}'::jsonb
WHERE name = 'ollama';

-- Insert Ollama Cloud models (large models best run via cloud)
INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type, model_version,
  context_window, max_output_tokens, model_tier, speed_tier, capabilities
) VALUES
('llama3.2:70b', 'ollama', 'Llama 3.2 70B (Cloud)', 'text-generation', '3.2', 128000, 4096, 'cloud', 'medium', '["chat", "text-generation"]'::jsonb),
('llama3.3:70b', 'ollama', 'Llama 3.3 70B (Cloud)', 'text-generation', '3.3', 128000, 4096, 'cloud', 'medium', '["chat", "text-generation"]'::jsonb),
('qwen2.5:72b', 'ollama', 'Qwen 2.5 72B (Cloud)', 'text-generation', '2.5', 32768, 4096, 'cloud', 'medium', '["chat", "text-generation"]'::jsonb),
('deepseek-r1:671b', 'ollama', 'DeepSeek R1 671B (Cloud)', 'text-generation', 'r1', 65536, 4096, 'cloud', 'slow', '["chat", "text-generation", "reasoning"]'::jsonb),
('mixtral:8x22b', 'ollama', 'Mixtral 8x22B (Cloud)', 'text-generation', '8x22b', 65536, 4096, 'cloud', 'medium', '["chat", "text-generation"]'::jsonb),
('gpt-oss:20b', 'ollama', 'GPT-OSS 20B (Cloud)', 'text-generation', '1.0', 32768, 4096, 'cloud', 'fast', '["chat", "text-generation"]'::jsonb),
('gpt-oss:120b', 'ollama', 'GPT-OSS 120B (Cloud)', 'text-generation', '1.0', 32768, 4096, 'cloud', 'medium', '["chat", "text-generation"]'::jsonb)
ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  model_type = EXCLUDED.model_type,
  model_version = EXCLUDED.model_version,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  model_tier = EXCLUDED.model_tier,
  speed_tier = EXCLUDED.speed_tier,
  capabilities = EXCLUDED.capabilities;

-- Verification
DO $$
DECLARE
  cloud_model_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO cloud_model_count
  FROM public.llm_models
  WHERE provider_name = 'ollama' AND model_tier = 'cloud';

  RAISE NOTICE 'Ollama Cloud models added: %', cloud_model_count;

  IF cloud_model_count < 7 THEN
    RAISE WARNING 'Expected at least 7 Ollama Cloud models, found %', cloud_model_count;
  END IF;
END $$;

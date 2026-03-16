-- =============================================================================
-- SEED LLM PROVIDERS AND MODELS WITH DECEMBER 2025 PRICING
-- =============================================================================
-- Populates llm_providers and llm_models tables with current pricing data
-- Pricing is stored as cost per 1K tokens (input/output) in USD
-- =============================================================================

-- =============================================================================
-- PROVIDERS
-- =============================================================================

INSERT INTO public.llm_providers (name, display_name, api_base_url, configuration_json, is_active, is_local)
VALUES
  ('openai', 'OpenAI', 'https://api.openai.com/v1', '{"auth_type": "bearer", "header": "Authorization"}', true, false),
  ('anthropic', 'Anthropic', 'https://api.anthropic.com/v1', '{"auth_type": "x-api-key", "header": "x-api-key"}', true, false),
  ('google', 'Google', 'https://generativelanguage.googleapis.com/v1', '{"auth_type": "api_key", "param": "key"}', true, false),
  ('xai', 'xAI', 'https://api.x.ai/v1', '{"auth_type": "bearer", "header": "Authorization"}', true, false),
  ('ollama', 'Ollama', 'http://localhost:11434', '{"auth_type": "none", "local": true}', true, true),
  ('ollama-cloud', 'Ollama Cloud', 'https://ollama.com/api', '{"auth_type": "bearer", "header": "Authorization"}', true, false)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  api_base_url = EXCLUDED.api_base_url,
  configuration_json = EXCLUDED.configuration_json,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- =============================================================================
-- OPENAI MODELS (December 2025)
-- =============================================================================

INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type, model_version,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active, training_data_cutoff
) VALUES
  -- GPT-5 Family (Released August 2025)
  ('gpt-5', 'openai', 'GPT-5', 'text-generation', '5.0',
   200000, 32768,
   '{"input_per_1k": 0.00125, "output_per_1k": 0.01, "cached_input_per_1k": 0.000125}',
   '["text", "code", "reasoning", "multimodal"]',
   'flagship', 'medium', false, true, '2025-09-30'),

  ('gpt-5.2', 'openai', 'GPT-5.2', 'text-generation', '5.2',
   400000, 128000,
   '{"input_per_1k": 0.00175, "output_per_1k": 0.014, "cached_input_per_1k": 0.000175}',
   '["text", "code", "reasoning", "multimodal", "extended_thinking"]',
   'flagship', 'medium', false, true, '2025-08-31'),

  ('gpt-5-mini', 'openai', 'GPT-5 Mini', 'text-generation', '5.0-mini',
   128000, 16384,
   '{"input_per_1k": 0.00025, "output_per_1k": 0.002, "cached_input_per_1k": 0.000025}',
   '["text", "code", "reasoning"]',
   'economy', 'fast', false, true, '2025-05-31'),

  -- GPT-4o Family
  ('gpt-4o', 'openai', 'GPT-4o', 'text-generation', '4o',
   128000, 16384,
   '{"input_per_1k": 0.005, "output_per_1k": 0.015}',
   '["text", "code", "vision", "audio"]',
   'standard', 'fast', false, true, '2024-10-01'),

  ('gpt-4o-mini', 'openai', 'GPT-4o Mini', 'text-generation', '4o-mini',
   128000, 16384,
   '{"input_per_1k": 0.00015, "output_per_1k": 0.0006}',
   '["text", "code", "vision"]',
   'economy', 'fast', false, true, '2024-10-01'),

  -- o-Series Reasoning Models
  ('o1', 'openai', 'o1', 'reasoning', 'o1',
   200000, 100000,
   '{"input_per_1k": 0.015, "output_per_1k": 0.06}',
   '["reasoning", "math", "code", "science"]',
   'premium', 'slow', false, true, '2024-12-01'),

  ('o1-mini', 'openai', 'o1 Mini', 'reasoning', 'o1-mini',
   128000, 65536,
   '{"input_per_1k": 0.003, "output_per_1k": 0.012}',
   '["reasoning", "math", "code"]',
   'standard', 'medium', false, true, '2024-12-01'),

  ('o3', 'openai', 'o3', 'reasoning', 'o3',
   200000, 100000,
   '{"input_per_1k": 0.001, "output_per_1k": 0.004}',
   '["reasoning", "math", "code", "science", "agentic"]',
   'standard', 'medium', false, true, '2025-06-01'),

  ('o3-mini', 'openai', 'o3 Mini', 'reasoning', 'o3-mini',
   128000, 65536,
   '{"input_per_1k": 0.00011, "output_per_1k": 0.00044}',
   '["reasoning", "math", "code"]',
   'economy', 'fast', false, true, '2025-06-01'),

  -- Legacy Models
  ('gpt-4', 'openai', 'GPT-4', 'text-generation', '4.0',
   8192, 4096,
   '{"input_per_1k": 0.03, "output_per_1k": 0.06}',
   '["text", "code"]',
   'legacy', 'slow', false, true, '2023-09-01'),

  ('gpt-4-turbo', 'openai', 'GPT-4 Turbo', 'text-generation', '4-turbo',
   128000, 4096,
   '{"input_per_1k": 0.01, "output_per_1k": 0.03}',
   '["text", "code", "vision"]',
   'legacy', 'medium', false, true, '2024-04-01'),

  ('gpt-3.5-turbo', 'openai', 'GPT-3.5 Turbo', 'text-generation', '3.5-turbo',
   16385, 4096,
   '{"input_per_1k": 0.0015, "output_per_1k": 0.002}',
   '["text", "code"]',
   'legacy', 'fast', false, true, '2023-09-01')

ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  pricing_info_json = EXCLUDED.pricing_info_json,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  capabilities = EXCLUDED.capabilities,
  model_tier = EXCLUDED.model_tier,
  speed_tier = EXCLUDED.speed_tier,
  training_data_cutoff = EXCLUDED.training_data_cutoff,
  updated_at = NOW();

-- =============================================================================
-- ANTHROPIC MODELS (December 2025)
-- =============================================================================

INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type, model_version,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active, training_data_cutoff
) VALUES
  -- Claude 4 Family
  ('claude-opus-4.5', 'anthropic', 'Claude Opus 4.5', 'text-generation', '4.5-opus',
   200000, 32768,
   '{"input_per_1k": 0.005, "output_per_1k": 0.025}',
   '["text", "code", "vision", "reasoning", "agentic"]',
   'flagship', 'medium', false, true, '2025-03-01'),

  ('claude-sonnet-4', 'anthropic', 'Claude Sonnet 4', 'text-generation', '4-sonnet',
   200000, 16384,
   '{"input_per_1k": 0.003, "output_per_1k": 0.015}',
   '["text", "code", "vision", "reasoning"]',
   'standard', 'fast', false, true, '2025-03-01'),

  ('claude-4.1-opus', 'anthropic', 'Claude 4.1 Opus', 'text-generation', '4.1-opus',
   200000, 32768,
   '{"input_per_1k": 0.02, "output_per_1k": 0.08, "thinking_per_1k": 0.04}',
   '["text", "code", "vision", "reasoning", "extended_thinking"]',
   'premium', 'slow', false, true, '2025-06-01'),

  ('claude-4.1-sonnet', 'anthropic', 'Claude 4.1 Sonnet', 'text-generation', '4.1-sonnet',
   200000, 16384,
   '{"input_per_1k": 0.005, "output_per_1k": 0.025, "thinking_per_1k": 0.01}',
   '["text", "code", "vision", "reasoning", "extended_thinking"]',
   'standard', 'medium', false, true, '2025-06-01'),

  -- Claude 3.5 Family
  ('claude-3-5-sonnet-20241022', 'anthropic', 'Claude 3.5 Sonnet', 'text-generation', '3.5-sonnet',
   200000, 8192,
   '{"input_per_1k": 0.003, "output_per_1k": 0.015}',
   '["text", "code", "vision"]',
   'standard', 'fast', false, true, '2024-04-01'),

  -- Claude 3 Family
  ('claude-3-opus-20240229', 'anthropic', 'Claude 3 Opus', 'text-generation', '3-opus',
   200000, 4096,
   '{"input_per_1k": 0.015, "output_per_1k": 0.075}',
   '["text", "code", "vision"]',
   'premium', 'slow', false, true, '2024-02-01'),

  ('claude-3-haiku-20240307', 'anthropic', 'Claude 3 Haiku', 'text-generation', '3-haiku',
   200000, 4096,
   '{"input_per_1k": 0.00025, "output_per_1k": 0.00125}',
   '["text", "code"]',
   'economy', 'fast', false, true, '2024-02-01')

ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  pricing_info_json = EXCLUDED.pricing_info_json,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  capabilities = EXCLUDED.capabilities,
  model_tier = EXCLUDED.model_tier,
  speed_tier = EXCLUDED.speed_tier,
  training_data_cutoff = EXCLUDED.training_data_cutoff,
  updated_at = NOW();

-- =============================================================================
-- GOOGLE GEMINI MODELS (December 2025)
-- =============================================================================

INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type, model_version,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active, training_data_cutoff
) VALUES
  -- Gemini 3 Family (November 2025)
  ('gemini-3-pro', 'google', 'Gemini 3 Pro', 'text-generation', '3-pro',
   1000000, 65536,
   '{"input_per_1k": 0.002, "output_per_1k": 0.012, "input_per_1k_long": 0.004, "output_per_1k_long": 0.018}',
   '["text", "code", "vision", "audio", "reasoning", "agentic"]',
   'flagship', 'medium', false, true, '2025-09-01'),

  -- Gemini 2.5 Family
  ('gemini-2.5-pro', 'google', 'Gemini 2.5 Pro', 'text-generation', '2.5-pro',
   1000000, 32768,
   '{"input_per_1k": 0.00125, "output_per_1k": 0.01, "input_per_1k_long": 0.0025, "output_per_1k_long": 0.02}',
   '["text", "code", "vision", "audio", "reasoning"]',
   'standard', 'medium', false, true, '2025-03-01'),

  ('gemini-2.5-flash', 'google', 'Gemini 2.5 Flash', 'text-generation', '2.5-flash',
   1000000, 16384,
   '{"input_per_1k": 0.00015, "output_per_1k": 0.0006}',
   '["text", "code", "vision"]',
   'economy', 'fast', false, true, '2025-03-01'),

  -- Gemini 2.0 Family
  ('gemini-2.0-flash', 'google', 'Gemini 2.0 Flash', 'text-generation', '2.0-flash',
   1000000, 8192,
   '{"input_per_1k": 0.0001, "output_per_1k": 0.0004}',
   '["text", "code", "vision"]',
   'economy', 'fast', false, true, '2024-12-01'),

  -- Gemini 1.5 Family (Legacy)
  ('gemini-1.5-pro', 'google', 'Gemini 1.5 Pro', 'text-generation', '1.5-pro',
   2000000, 8192,
   '{"input_per_1k": 0.00125, "output_per_1k": 0.005, "input_per_1k_long": 0.0025, "output_per_1k_long": 0.01}',
   '["text", "code", "vision", "audio"]',
   'legacy', 'medium', false, true, '2024-04-01'),

  ('gemini-1.5-flash', 'google', 'Gemini 1.5 Flash', 'text-generation', '1.5-flash',
   1000000, 8192,
   '{"input_per_1k": 0.000075, "output_per_1k": 0.0003}',
   '["text", "code", "vision"]',
   'legacy', 'fast', false, true, '2024-04-01')

ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  pricing_info_json = EXCLUDED.pricing_info_json,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  capabilities = EXCLUDED.capabilities,
  model_tier = EXCLUDED.model_tier,
  speed_tier = EXCLUDED.speed_tier,
  training_data_cutoff = EXCLUDED.training_data_cutoff,
  updated_at = NOW();

-- =============================================================================
-- XAI GROK MODELS (December 2025)
-- =============================================================================

INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type, model_version,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active, training_data_cutoff
) VALUES
  -- Grok 4 Family
  ('grok-4', 'xai', 'Grok 4', 'text-generation', '4.0',
   131072, 32768,
   '{"input_per_1k": 0.003, "output_per_1k": 0.015}',
   '["text", "code", "reasoning", "real_time_data"]',
   'flagship', 'medium', false, true, '2025-09-01'),

  ('grok-4.1-fast', 'xai', 'Grok 4.1 Fast', 'text-generation', '4.1-fast',
   131072, 16384,
   '{"input_per_1k": 0.0002, "output_per_1k": 0.0005}',
   '["text", "code", "real_time_data"]',
   'economy', 'fast', false, true, '2025-11-01'),

  -- Grok 3 Family
  ('grok-3', 'xai', 'Grok 3', 'text-generation', '3.0',
   131072, 16384,
   '{"input_per_1k": 0.003, "output_per_1k": 0.015}',
   '["text", "code", "reasoning", "real_time_data"]',
   'standard', 'medium', false, true, '2025-03-01'),

  ('grok-3-fast', 'xai', 'Grok 3 Fast', 'text-generation', '3-fast',
   131072, 8192,
   '{"input_per_1k": 0.0005, "output_per_1k": 0.0015}',
   '["text", "code", "real_time_data"]',
   'economy', 'fast', false, true, '2025-03-01'),

  -- Grok 2 Family (Legacy)
  ('grok-2', 'xai', 'Grok 2', 'text-generation', '2.0',
   131072, 8192,
   '{"input_per_1k": 0.002, "output_per_1k": 0.01}',
   '["text", "code", "real_time_data"]',
   'legacy', 'medium', false, true, '2024-08-01')

ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  pricing_info_json = EXCLUDED.pricing_info_json,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  capabilities = EXCLUDED.capabilities,
  model_tier = EXCLUDED.model_tier,
  speed_tier = EXCLUDED.speed_tier,
  training_data_cutoff = EXCLUDED.training_data_cutoff,
  updated_at = NOW();

-- =============================================================================
-- OLLAMA LOCAL MODELS (Estimated electricity costs)
-- =============================================================================

INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type, model_version,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
) VALUES
  -- Llama 3.2 Family
  ('llama3.2:1b', 'ollama', 'Llama 3.2 1B', 'text-generation', '3.2-1b',
   128000, 4096,
   '{"input_per_1k": 0.0001, "output_per_1k": 0.0001, "note": "estimated electricity cost"}',
   '["text", "code"]',
   'local', 'fast', true, true),

  ('llama3.2:3b', 'ollama', 'Llama 3.2 3B', 'text-generation', '3.2-3b',
   128000, 4096,
   '{"input_per_1k": 0.0002, "output_per_1k": 0.0002, "note": "estimated electricity cost"}',
   '["text", "code"]',
   'local', 'fast', true, true),

  -- Llama 3.1 Family
  ('llama3.1:8b', 'ollama', 'Llama 3.1 8B', 'text-generation', '3.1-8b',
   128000, 4096,
   '{"input_per_1k": 0.0005, "output_per_1k": 0.0005, "note": "estimated electricity cost"}',
   '["text", "code", "reasoning"]',
   'local', 'medium', true, true),

  ('llama3.1:70b', 'ollama', 'Llama 3.1 70B', 'text-generation', '3.1-70b',
   128000, 4096,
   '{"input_per_1k": 0.002, "output_per_1k": 0.002, "note": "estimated electricity cost"}',
   '["text", "code", "reasoning"]',
   'local', 'slow', true, true),

  -- Qwen Family
  ('qwen2.5:7b', 'ollama', 'Qwen 2.5 7B', 'text-generation', '2.5-7b',
   32768, 4096,
   '{"input_per_1k": 0.0004, "output_per_1k": 0.0004, "note": "estimated electricity cost"}',
   '["text", "code", "multilingual"]',
   'local', 'medium', true, true),

  ('qwen2.5:14b', 'ollama', 'Qwen 2.5 14B', 'text-generation', '2.5-14b',
   32768, 4096,
   '{"input_per_1k": 0.0008, "output_per_1k": 0.0008, "note": "estimated electricity cost"}',
   '["text", "code", "multilingual"]',
   'local', 'medium', true, true),

  ('qwen2.5:32b', 'ollama', 'Qwen 2.5 32B', 'text-generation', '2.5-32b',
   32768, 4096,
   '{"input_per_1k": 0.0015, "output_per_1k": 0.0015, "note": "estimated electricity cost"}',
   '["text", "code", "multilingual", "reasoning"]',
   'local', 'slow', true, true),

  -- Coding Models
  ('deepseek-coder:6.7b', 'ollama', 'DeepSeek Coder 6.7B', 'code-generation', '6.7b',
   16384, 4096,
   '{"input_per_1k": 0.0003, "output_per_1k": 0.0003, "note": "estimated electricity cost"}',
   '["code", "text"]',
   'local', 'fast', true, true),

  ('codellama:7b', 'ollama', 'Code Llama 7B', 'code-generation', '7b',
   16384, 4096,
   '{"input_per_1k": 0.0004, "output_per_1k": 0.0004, "note": "estimated electricity cost"}',
   '["code", "text"]',
   'local', 'fast', true, true),

  -- Mistral Family
  ('mistral:7b', 'ollama', 'Mistral 7B', 'text-generation', '7b',
   32768, 4096,
   '{"input_per_1k": 0.0004, "output_per_1k": 0.0004, "note": "estimated electricity cost"}',
   '["text", "code"]',
   'local', 'fast', true, true),

  ('mixtral:8x7b', 'ollama', 'Mixtral 8x7B', 'text-generation', '8x7b',
   32768, 4096,
   '{"input_per_1k": 0.001, "output_per_1k": 0.001, "note": "estimated electricity cost"}',
   '["text", "code", "reasoning"]',
   'local', 'medium', true, true)

ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  pricing_info_json = EXCLUDED.pricing_info_json,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  capabilities = EXCLUDED.capabilities,
  model_tier = EXCLUDED.model_tier,
  speed_tier = EXCLUDED.speed_tier,
  is_local = EXCLUDED.is_local,
  updated_at = NOW();

-- =============================================================================
-- SUCCESS NOTIFICATION
-- =============================================================================

DO $$
DECLARE
  provider_count INTEGER;
  model_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO provider_count FROM public.llm_providers;
  SELECT COUNT(*) INTO model_count FROM public.llm_models;

  RAISE NOTICE '================================================';
  RAISE NOTICE 'LLM Providers and Models seeded successfully';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Total providers: %', provider_count;
  RAISE NOTICE 'Total models: %', model_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Pricing format in pricing_info_json:';
  RAISE NOTICE '  - input_per_1k: cost per 1000 input tokens (USD)';
  RAISE NOTICE '  - output_per_1k: cost per 1000 output tokens (USD)';
  RAISE NOTICE '  - cached_input_per_1k: cost for cached input (if applicable)';
  RAISE NOTICE '  - thinking_per_1k: cost for thinking tokens (if applicable)';
  RAISE NOTICE '================================================';
END $$;

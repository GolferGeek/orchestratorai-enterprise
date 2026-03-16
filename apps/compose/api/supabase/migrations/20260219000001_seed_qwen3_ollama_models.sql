-- =============================================================================
-- Seed Qwen 3 family models for Ollama local provider
-- qwen3:32b (dense), qwen3:30b (MoE 30B-A3B), qwen3-coder:30b (MoE 30B-A3.3B),
-- qwen3-next:80b (MoE 80B-A3B)
-- =============================================================================

INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type, model_version,
  context_window, max_output_tokens, pricing_info_json, capabilities,
  model_tier, speed_tier, is_local, is_active
) VALUES
  -- Qwen 3 32B Dense - strong general-purpose local model
  ('qwen3:32b', 'ollama', 'Qwen 3 32B', 'text-generation', '3.0-32b',
   40960, 8192,
   '{"input_per_1k": 0.0015, "output_per_1k": 0.0015, "note": "estimated electricity cost"}',
   '["text", "code", "reasoning", "multilingual", "tool_use"]',
   'local', 'slow', true, true),

  -- Qwen 3 30B-A3B MoE - efficient MoE, only 3B active params
  ('qwen3:30b', 'ollama', 'Qwen 3 30B-A3B (MoE)', 'text-generation', '3.0-30b-a3b',
   256000, 8192,
   '{"input_per_1k": 0.001, "output_per_1k": 0.001, "note": "estimated electricity cost, MoE 3B active"}',
   '["text", "code", "reasoning", "multilingual", "tool_use"]',
   'local', 'medium', true, true),

  -- Qwen 3 Coder 30B-A3.3B MoE - agentic coding model, 70% code pretraining
  ('qwen3-coder:30b', 'ollama', 'Qwen 3 Coder 30B-A3.3B (MoE)', 'code-generation', '3.0-coder-30b-a3.3b',
   256000, 8192,
   '{"input_per_1k": 0.001, "output_per_1k": 0.001, "note": "estimated electricity cost, MoE 3.3B active"}',
   '["code", "text", "reasoning", "tool_use", "agentic"]',
   'local', 'medium', true, true),

  -- Qwen 3 Next 80B-A3B MoE - hybrid attention, extreme sparsity, most capable local option
  ('qwen3-next:80b', 'ollama', 'Qwen 3 Next 80B-A3B (MoE)', 'text-generation', '3.0-next-80b-a3b',
   256000, 8192,
   '{"input_per_1k": 0.002, "output_per_1k": 0.002, "note": "estimated electricity cost, MoE 3B active, hybrid attention"}',
   '["text", "code", "reasoning", "multilingual", "tool_use"]',
   'local', 'medium', true, true)

ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  model_type = EXCLUDED.model_type,
  model_version = EXCLUDED.model_version,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  pricing_info_json = EXCLUDED.pricing_info_json,
  capabilities = EXCLUDED.capabilities,
  model_tier = EXCLUDED.model_tier,
  speed_tier = EXCLUDED.speed_tier,
  is_local = EXCLUDED.is_local,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

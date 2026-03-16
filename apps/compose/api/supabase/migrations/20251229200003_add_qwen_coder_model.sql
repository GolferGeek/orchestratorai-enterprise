-- =============================================================================
-- ADD QWEN2.5-CODER MODEL
-- =============================================================================
-- Add qwen2.5-coder:7b model optimized for CAD code generation
-- This model is specifically tuned for code generation tasks
-- Created: 2025-12-29
-- =============================================================================

INSERT INTO public.llm_models (
    model_name,
    provider_name,
    display_name,
    model_type,
    model_version,
    context_window,
    max_output_tokens,
    pricing_info_json,
    capabilities,
    model_tier,
    speed_tier,
    is_local,
    is_active
) VALUES (
    'qwen2.5-coder:7b',
    'ollama',
    'Qwen 2.5 Coder 7B',
    'code-generation',
    '2.5-coder-7b',
    32768,
    8192,
    '{"input_per_1k": 0.0004, "output_per_1k": 0.0004, "note": "estimated electricity cost"}'::jsonb,
    '["code", "cad-scripting", "typescript", "javascript", "python"]',
    'local',
    'medium',
    true,
    true
)
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

-- =============================================================================
-- LOG SUCCESS
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Qwen 2.5 Coder model added';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Model: qwen2.5-coder:7b';
    RAISE NOTICE 'Provider: ollama';
    RAISE NOTICE 'Context window: 32K tokens';
    RAISE NOTICE 'Max output: 8K tokens';
    RAISE NOTICE 'Capabilities: code, cad-scripting, typescript';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'To install: ollama pull qwen2.5-coder:7b';
    RAISE NOTICE '================================================';
END $$;

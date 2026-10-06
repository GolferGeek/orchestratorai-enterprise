-- The OpenRouter Auto Router in the model catalog (OAN 1 admin crawl). The
-- agent pages' "Use best model" (on by default) selects openrouter/auto, but
-- with the fine-control LLM plane the picker lists models from this catalog,
-- and the catalog sync used to drop the router because the
-- OPENROUTER_AUTO_ALLOWED_MODELS allow-list (which models the router may pick)
-- never names the router itself. Every agent page then failed with "OpenRouter
-- Auto Router is unavailable from the active LLM plane". The sync now keeps
-- it; this row gives a fresh database the router before any sync runs.

INSERT INTO public.llm_models (
  model_name, provider_name, display_name, model_type, context_window, max_output_tokens,
  pricing_info_json, capabilities, is_local, is_active, vendor
) VALUES (
  'openrouter/auto', 'openrouter', 'Use best model (OpenRouter Auto Router)', 'text-generation', 2000000, NULL,
  '{"source": "openrouter", "note": "billed at the routed model''s price"}'::jsonb,
  '["text", "automatic-routing"]'::jsonb, false, true, 'openrouter'
)
ON CONFLICT (model_name, provider_name) DO UPDATE
SET is_active = true, deprecated_at = NULL, deprecation_reason = NULL, updated_at = now();

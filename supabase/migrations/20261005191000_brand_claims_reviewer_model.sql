-- The brand and claims reviewer runs on GPT-5 mini (through OpenRouter).
-- On the default model (Gemini 2.5 Flash Lite) it kept "clinically proven to
-- double focus" with no evidence and echoed the claim back as evidence; the
-- Jev guard then rightly blocked it. Side by side on the same two cases
-- (no evidence; a 12% pilot result), GPT-5 mini removed the unsupported claims
-- and kept the supported number exactly, as copy; Claude Haiku 4.5 and
-- Gemini 2.5 Flash answered the question instead of rewriting the copy.
BEGIN;

UPDATE public.agents
SET llm_config = '{"provider": "openrouter", "model": "openai/gpt-5-mini"}'::jsonb,
    updated_at = now()
WHERE slug = 'brand-claims-reviewer';

COMMIT;

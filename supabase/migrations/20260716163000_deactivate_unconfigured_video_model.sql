BEGIN;

UPDATE public.llm_models
SET is_active = false,
    deprecation_reason = 'Hidden until Sora-capable OpenAI video access is configured for the deployment.',
    updated_at = now()
WHERE provider_name = 'openai'
  AND model_name = 'sora-2';

COMMIT;

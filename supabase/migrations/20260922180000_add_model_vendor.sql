-- Separate "who made the model" from "how we call it".
--
-- `provider_name` has always meant the service we route through — it is what
-- ExecutionContext.provider carries, what LLMServiceFactory switches on, and
-- what llm_usage records as the party we sent data to. That meaning is correct
-- and stays.
--
-- What was missing is the vendor. Going through OpenRouter, every model would
-- have provider_name = 'openrouter', which collapses a 400-model catalogue into
-- a single entry in the "pick your provider" dropdown and leaves the user
-- scrolling. The vendor is already in the OpenRouter model id
-- ('anthropic/claude-haiku-4.5'), it simply had nowhere to live.
--
-- With both recorded, the UI groups by vendor while the call still routes by
-- provider_name, and nothing has to be inferred from the shape of an id.
--
--   anthropic/claude-haiku-4.5  provider_name=openrouter  vendor=anthropic
--   claude-sonnet-4-6           provider_name=anthropic   vendor=anthropic
--   llama3.2:3b                 provider_name=ollama      vendor=meta

ALTER TABLE public.llm_models
  ADD COLUMN IF NOT EXISTS vendor TEXT;

COMMENT ON COLUMN public.llm_models.vendor IS
  'Who made the model (anthropic, openai, meta). Grouping for the model picker. Distinct from provider_name, which is the service we route through.';

COMMENT ON COLUMN public.llm_models.provider_name IS
  'The service we route through (openrouter, ollama, anthropic). Matches ExecutionContext.provider and llm_usage.provider_name. Distinct from vendor.';

-- Backfill. A slashed id carries its maker, so use it. Anything else is a
-- locally hosted model, whose vendor is the service that serves it — deriving
-- a maker from the tag yields the model family (codellama, gpt-oss, qwen3-next)
-- and fills the picker with near-duplicate entries.
UPDATE public.llm_models
SET vendor = CASE
      WHEN model_name LIKE '%/%' THEN split_part(model_name, '/', 1)
      ELSE provider_name
    END
WHERE vendor IS NULL;

CREATE INDEX IF NOT EXISTS llm_models_vendor_idx ON public.llm_models (vendor);

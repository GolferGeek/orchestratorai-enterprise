-- Collapse locally hosted models under a single Ollama vendor.
--
-- The backfill in 20260922180000 derived a vendor from the model tag, which
-- for local models means the model family rather than a maker: codellama,
-- gpt-oss, qwen3-next, deepseek-r. That put twelve entries in the "pick your
-- provider" dropdown, several of them variants of the same name, which is
-- exactly the unusable list the vendor column existed to prevent.
--
-- For a locally hosted model the honest answer to "whose is this?" is Ollama:
-- it is what serves the model, what the user configured, and how they think
-- about it. Attributing llama to Meta and qwen to Alibaba would be more
-- precise and less useful — the dropdown is a routing aid, not an attribution.

UPDATE public.llm_models
SET vendor = 'ollama',
    updated_at = now()
WHERE provider_name = 'ollama';

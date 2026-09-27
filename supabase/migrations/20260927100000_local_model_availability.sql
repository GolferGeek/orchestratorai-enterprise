-- Local model availability (effort 5b, O4).
--
-- llm_models listed Ollama models the Studio does not have (qwen3:8b,
-- qwen2.5:7b, llama3.2), so a model choice could name a model that cannot
-- run: 14 marketing-swarm calls failed in one run on qwen3:8b.
--
-- is_available: for local (Ollama) models, whether the Ollama host has the
-- model installed, written by the LLM plane's inventory sync at API boot and
-- on POST /llm/sync-models. NULL for hosted providers, which are not tracked
-- this way. Separate from is_active, which stays the admin's choice.

BEGIN;

ALTER TABLE public.llm_models ADD COLUMN is_available BOOLEAN;
COMMENT ON COLUMN public.llm_models.is_available IS
  'Local models: installed on the Ollama host (inventory sync). NULL for hosted providers.';

-- Marketing Swarm offered llama3.2 and qwen3:8b as local models; neither is
-- installed. gemma4:e4b (8B) is the installed small model. Agents that had
-- both keep one row (the default).
DELETE FROM marketing.agent_llm_configs c
 WHERE c.llm_provider = 'ollama' AND c.llm_model = 'llama3.2'
   AND EXISTS (
     SELECT 1 FROM marketing.agent_llm_configs d
      WHERE d.agent_slug = c.agent_slug AND d.llm_provider = 'ollama' AND d.llm_model = 'qwen3:8b'
   );
UPDATE marketing.agent_llm_configs
   SET llm_model = 'gemma4:e4b', display_name = 'Gemma 4 E4B (Local)'
 WHERE llm_provider = 'ollama' AND llm_model IN ('qwen3:8b', 'llama3.2');

COMMIT;

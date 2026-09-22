-- Activate the global general-assistant demo agent.
--
-- It is fully configured — `context` agent type, a system prompt, llm_config
-- with temperature and maxTokens, global organization scope — but its
-- metadata.status was 'disabled', which AgentDefinitionService treats as
-- "excluded from the catalog". That left no invokable conversational agent
-- reachable by the seeded admin user, so the LLM boundary could not be
-- exercised end to end against a real provider.
--
-- Nothing else about the agent changes. It carries no provider or model of its
-- own, so the caller's ExecutionContext decides which vendor handles the
-- request — which is exactly what makes it useful for exercising the boundary
-- across backends.

UPDATE public.agents
SET metadata = jsonb_set(metadata, '{status}', '"active"'::jsonb),
    updated_at = now()
WHERE slug = 'general-assistant'
  AND metadata->>'status' = 'disabled';

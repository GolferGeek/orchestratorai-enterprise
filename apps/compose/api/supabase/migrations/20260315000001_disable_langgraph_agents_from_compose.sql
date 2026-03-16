-- =============================================================================
-- Disable LangGraph agents from Compose
-- =============================================================================
-- LangGraph agents belong in Forge, not Compose. Disable:
--   - marketing-swarm (LangGraph marketing swarm)
--   - cad-agent (LangGraph CAD agent)
--   - legal-department (LangGraph legal department AI)
-- =============================================================================

UPDATE public.agents
SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{status}', '"disabled"')
WHERE slug IN ('marketing-swarm', 'cad-agent', 'legal-department');

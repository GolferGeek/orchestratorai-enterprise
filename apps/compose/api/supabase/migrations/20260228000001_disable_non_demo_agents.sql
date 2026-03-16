-- =============================================================================
-- Disable all agents except marketing-swarm and hr-assistant
-- =============================================================================
-- For client demos, only Marketing Swarm and HR Assistant should be visible.
-- The agent-registry.service.ts already filters by metadata.status !== 'disabled'
-- =============================================================================

-- Disable all agents except the two demo agents
UPDATE public.agents
SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{status}', '"disabled"')
WHERE slug NOT IN ('marketing-swarm', 'hr-assistant');

-- Ensure demo agents are explicitly active
UPDATE public.agents
SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{status}', '"active"')
WHERE slug IN ('marketing-swarm', 'hr-assistant');

-- =============================================================================
-- Cleanup agent roster — move table-stakes agents to global, disable others
-- =============================================================================
-- Infographic Agent and Customer Service move to global org.
-- Extended Post Writer, Marketing Swarm, Department AI, HR Assistant (LangGraph),
-- both finance agents, and CAD Agent are disabled.
-- =============================================================================

-- Move to global
UPDATE public.agents SET organization_slug = ARRAY['global'] WHERE slug = 'infographic-agent';
UPDATE public.agents SET organization_slug = ARRAY['global'] WHERE slug = 'customer-service';

-- Disable agents
UPDATE public.agents SET status = 'disabled' WHERE slug IN (
  'extended-post-writer',
  'marketing-swarm',
  'legal-department',
  'hr-assistant-langgraph',
  'investment-risk-agent',
  'us-tech-stocks',
  'cad-agent'
);

DO $$
BEGIN
    RAISE NOTICE 'Agent roster cleaned up: 2 moved to global, 7 disabled';
END $$;

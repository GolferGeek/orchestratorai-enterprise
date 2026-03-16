-- Update agent_type from 'api' to 'langgraph' for agents that have been
-- merged into the NestJS API as LangGraph workflow modules.
-- These agents no longer use HTTP calls to a separate LangGraph server;
-- they are invoked directly by LanggraphAgentRunnerService via ModuleRef.

UPDATE public.agents
SET agent_type = 'langgraph',
    endpoint = NULL,
    updated_at = NOW()
WHERE slug IN (
  'legal-department',
  'marketing-swarm',
  'cad-agent',
  'business-automation-advisor',
  'extended-post-writer',
  'data-analyst'
)
AND agent_type = 'api';

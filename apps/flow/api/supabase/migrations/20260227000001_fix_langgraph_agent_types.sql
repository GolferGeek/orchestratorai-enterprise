-- Fix LangGraph agents: set agent_type='langgraph' and endpoint=NULL
-- These agents are now internal to the API (invoked via LanggraphAgentRunnerService),
-- not external HTTP services. They must NOT have endpoint URLs.

UPDATE public.agents
SET agent_type = 'langgraph',
    endpoint = NULL
WHERE slug IN (
    'legal-department',
    'marketing-swarm',
    'cad-agent',
    'business-automation-advisor',
    'extended-post-writer',
    'data-analyst'
);

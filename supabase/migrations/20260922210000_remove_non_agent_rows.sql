-- Get non-agents out of the agents table.
--
-- `agents` is supposed to mean one thing: a row a family runner can execute,
-- fully defined by that row. `agent_type` selects the runner — context, rag,
-- api, external, media.
--
-- These rows predate the workflow concept, from when everything was an agent.
-- None of them has a runner that can execute it, and leaving them forces
-- special cases: hardcoded slug lists in agent-definition.service.ts, a
-- workflow catalog sourced from agent data, and three separate ways to hide a
-- row from a UI.
--
--   cad-agent              langgraph   no implementation; parked deliberately
--   legal-department       langgraph   no implementation
--   extended-post-writer   langgraph   no implementation
--   customer-service       langgraph   IS implemented — but as a workflow with
--                                      its own controller at /customer-service.
--                                      The row is referenced by nothing; the
--                                      workflow does not need it and never did.
--   us-tech-stocks         prediction  market prediction; moved to Diviner, see
--                                      docs/efforts/archive/remove-predictor-risk/
--
-- `investment-risk-agent` is deliberately NOT removed. Risk is staying in
-- Enterprise and moving to a corporate-center org — enterprise risk management
-- (credit, operational, regulatory, geopolitical, concentration) is a corporate
-- function, not a finance-department one. The row is re-homed rather than
-- deleted; see plan §3 and Phase 4.
--
-- `marketing-swarm` is deliberately NOT removed here. Its row is currently
-- load-bearing: AgentDefinitionService.listWorkflows() queries the agents table
-- filtered by a hardcoded slug set, so deleting the row now would remove the
-- swarm from the workflow catalog. It goes once workflows list from a code
-- registry instead (plan §4, Phase 0.2).
--
-- Nothing references these rows by foreign key. llm_usage and conversation
-- history record agent names as free text, so past runs stay readable.

DELETE FROM public.agents
WHERE slug IN (
  'cad-agent',
  'legal-department',
  'extended-post-writer',
  'customer-service',
  'us-tech-stocks'
);

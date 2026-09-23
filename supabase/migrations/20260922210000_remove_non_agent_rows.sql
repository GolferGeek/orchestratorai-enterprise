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
-- `investment-risk-agent` is deliberately NOT removed here, on the theory that
-- risk is an agent to be re-homed to a corporate org.
--
-- SUPERSEDED by 20260922220000. Risk and prediction are workflow types, not
-- agent types — they were LangGraph dashboards, and corporate decision risk
-- comes back as a registered workflow. The row is deleted there, not re-homed.
-- This migration is left as applied; read the next one for the conclusion.
--
--   marketing-swarm        langgraph   IS implemented, and its row used to be
--                                      load-bearing: listWorkflows() queried
--                                      the agents table for it. It now
--                                      registers itself in WorkflowRegistry at
--                                      module init, so the row is dead weight.
--
-- Nothing references these rows by foreign key. llm_usage and conversation
-- history record agent names as free text, so past runs stay readable.

DELETE FROM public.agents
WHERE slug IN (
  'cad-agent',
  'legal-department',
  'extended-post-writer',
  'customer-service',
  'marketing-swarm',
  'us-tech-stocks'
);

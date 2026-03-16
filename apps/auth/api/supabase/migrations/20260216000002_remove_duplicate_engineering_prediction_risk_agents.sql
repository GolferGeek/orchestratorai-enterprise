-- Remove duplicate prediction and risk agents from engineering department.
-- These agents exist under the finance department as:
--   'us-tech-stocks' (prediction) and 'investment-risk-agent' (risk)
-- The engineering entries ('prediction-agent' and 'risk-agent') are duplicates
-- that are no longer needed in the engineering navigation.

-- First, update risk.scopes that reference 'risk-agent' to point to the
-- finance risk agent 'investment-risk-agent' instead.
UPDATE risk.scopes
SET agent_slug = 'investment-risk-agent'
WHERE agent_slug = 'risk-agent';

-- Now delete the duplicate engineering agents
DELETE FROM public.agents
WHERE slug IN ('prediction-agent', 'risk-agent')
  AND department = 'engineering';

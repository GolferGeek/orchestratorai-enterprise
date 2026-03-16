-- Migration: Update marketing-swarm agent timeout to 2 hours
-- The marketing swarm workflow can take a long time with multiple agents,
-- so we increase the timeout from 10 minutes to 2 hours (7,200,000ms)

UPDATE agents
SET endpoint = jsonb_set(
  endpoint::jsonb,
  '{timeout}',
  '7200000'
)
WHERE slug = 'marketing-swarm'
  AND endpoint IS NOT NULL
  AND endpoint::jsonb ? 'timeout';

-- Also update any future marketing swarm agents that might have the old timeout
UPDATE agents
SET endpoint = jsonb_set(
  endpoint::jsonb,
  '{timeout}',
  '7200000'
)
WHERE slug LIKE 'marketing-swarm%'
  AND endpoint IS NOT NULL
  AND endpoint::jsonb ? 'timeout'
  AND (endpoint::jsonb->>'timeout')::int < 7200000;

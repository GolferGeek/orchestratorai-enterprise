-- =============================================================================
-- REMOVE DATA ANALYST AGENT
-- =============================================================================
-- Migration to remove the Data Analyst agent from the system
-- Created: 2026-02-07
-- =============================================================================

-- Delete the data-analyst agent from the agents table
DELETE FROM public.agents
WHERE slug = 'data-analyst';

-- Log success
DO $$
BEGIN
  RAISE NOTICE 'Successfully removed data-analyst agent from the system';
END $$;

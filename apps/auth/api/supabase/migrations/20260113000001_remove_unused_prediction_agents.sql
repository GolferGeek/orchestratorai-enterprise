-- Migration: Remove unused prediction agents and rename remaining agent
-- Date: 2026-01-13
-- Description:
--   1. Removes crypto-majors-2025 and polymarket-politics-2025 agents
--   2. Renames us-tech-stocks-2025 to us-tech-stocks (removes year from slug and name)
--
-- Note: This also removes associated universes and targets. The seed data
-- incorrectly created multiple agents when only one was needed for testing.

BEGIN;

-- ============================================================================
-- STEP 1: Clean up unused prediction agents
-- ============================================================================

-- First, delete targets associated with universes of the agents being removed
DELETE FROM prediction.targets
WHERE universe_id IN (
    SELECT id FROM prediction.universes
    WHERE agent_slug IN ('crypto-majors-2025', 'polymarket-politics-2025')
);

-- Delete universes for the agents being removed
DELETE FROM prediction.universes
WHERE agent_slug IN ('crypto-majors-2025', 'polymarket-politics-2025');

-- Delete the agents from the agents table
DELETE FROM public.agents
WHERE slug IN ('crypto-majors-2025', 'polymarket-politics-2025');

-- ============================================================================
-- STEP 2: Rename remaining prediction agent (remove year suffix)
-- Need to temporarily drop the FK constraint, update both tables, then restore
-- ============================================================================

-- Temporarily drop the foreign key constraint
ALTER TABLE prediction.universes DROP CONSTRAINT IF EXISTS universes_agent_slug_fkey;

-- Update the agent slug and name
UPDATE public.agents
SET
    slug = 'us-tech-stocks',
    name = 'US Tech Stocks Predictor'
WHERE slug = 'us-tech-stocks-2025';

-- Update universes to use the new agent slug
UPDATE prediction.universes
SET agent_slug = 'us-tech-stocks'
WHERE agent_slug = 'us-tech-stocks-2025';

-- Restore the foreign key constraint
ALTER TABLE prediction.universes
ADD CONSTRAINT universes_agent_slug_fkey
FOREIGN KEY (agent_slug) REFERENCES public.agents(slug)
ON UPDATE CASCADE ON DELETE RESTRICT;

-- ============================================================================
-- STEP 3: Verification
-- ============================================================================

DO $$
DECLARE
    agent_count INTEGER;
    universe_count INTEGER;
    agent_name TEXT;
    agent_slug_var TEXT;
BEGIN
    -- Check agent count
    SELECT COUNT(*) INTO agent_count
    FROM public.agents
    WHERE agent_type = 'prediction';

    -- Check universe count
    SELECT COUNT(*) INTO universe_count
    FROM prediction.universes
    WHERE agent_slug = 'us-tech-stocks';

    -- Get agent details
    SELECT slug, name INTO agent_slug_var, agent_name
    FROM public.agents
    WHERE slug = 'us-tech-stocks';

    IF agent_count != 1 THEN
        RAISE WARNING 'Expected 1 prediction agent, found %', agent_count;
    ELSE
        RAISE NOTICE 'Migration complete:';
        RAISE NOTICE '  - Prediction agents: %', agent_count;
        RAISE NOTICE '  - Agent slug: %', agent_slug_var;
        RAISE NOTICE '  - Agent name: %', agent_name;
        RAISE NOTICE '  - Universes linked: %', universe_count;
    END IF;
END $$;

COMMIT;

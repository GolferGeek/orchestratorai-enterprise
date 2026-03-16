-- =============================================================================
-- REMOVE MARKETING SCHEMA LINK TO PUBLIC LLM_MODELS
-- =============================================================================
-- This migration removes the foreign key constraint from marketing.agent_llm_configs
-- to public.llm_models, as it is no longer needed.
--
-- The new architecture:
-- 1. Frontend uses simple provider/model dropdowns that select from llm_models API
-- 2. Provider/model values are passed at runtime in the request
-- 3. Costs are calculated dynamically by LLMPricingService
--
-- The FK was adding unnecessary coupling between schemas.
-- =============================================================================

-- Drop the view first (depends on the join)
DROP VIEW IF EXISTS marketing.agent_llm_configs_with_pricing;

-- Drop the foreign key constraint
ALTER TABLE marketing.agent_llm_configs
DROP CONSTRAINT IF EXISTS agent_llm_configs_llm_model_fkey;

-- =============================================================================
-- SUCCESS NOTIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Marketing schema unlinked from LLM models';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Removed FK: agent_llm_configs_llm_model_fkey';
  RAISE NOTICE 'Removed view: agent_llm_configs_with_pricing';
  RAISE NOTICE '';
  RAISE NOTICE 'Pricing is now handled dynamically by LLMPricingService';
  RAISE NOTICE '================================================';
END $$;

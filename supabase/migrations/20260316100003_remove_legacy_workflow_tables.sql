-- Legacy Workflow Table Removal
-- Step 3-4: Remove old framework-era tables after conversation-centric migration
--
-- WARNING: This migration is DESTRUCTIVE. Only run after:
-- 1. All products have been migrated to the v2 invoke contract
-- 2. Conversation-centric persistence is verified working
-- 3. No product code references these tables
--
-- Tables removed:
-- - plans (replaced by conversation-centric model)
-- - plan_versions (replaced by conversation-centric model)
-- - plan_deliverables (join table no longer needed)
-- - deliverables (outputs live in conversation messages)
-- - deliverable_versions (outputs live in conversation messages)
--
-- Tables KEPT:
-- - conversations (primary persistence unit in v2)
-- - tasks (kept for async tracking where truly needed)
-- - task_messages (primary message storage, enhanced with output_type)
-- - llm_usage (observability — still needed)
-- - human_approvals (HITL — still needed for Forge)
-- - observability_events (observability — still needed)

-- Remove plan infrastructure
DROP TABLE IF EXISTS public.plan_deliverables CASCADE;
DROP TABLE IF EXISTS public.plan_versions CASCADE;
DROP TABLE IF EXISTS public.plans CASCADE;

-- Remove deliverable infrastructure
DROP TABLE IF EXISTS public.deliverable_versions CASCADE;
DROP TABLE IF EXISTS public.deliverables CASCADE;

-- Clean up any orphaned foreign keys on tasks/conversations
-- (these may reference the dropped tables)
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_plan_id_fkey;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_deliverable_id_fkey;

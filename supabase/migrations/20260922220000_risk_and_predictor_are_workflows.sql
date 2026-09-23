-- Risk and predictor are workflow types, not agent types.
--
-- The previous migration (20260922210000) kept `investment-risk-agent` on the
-- theory that risk was an agent to be re-homed to a corporate org. That was
-- wrong about what risk is.
--
-- Risk and prediction were never agents here. They were LangGraph dashboards in
-- Forge — `apps/forge/api/src/agents/risk-runner/` (67 files) and
-- `.../predictor/` (164 files) — routed through the Bridge to Diviner. See
-- docs/efforts/archive/remove-predictor-risk/. That code is gone from this
-- repo; what is left is rows describing implementations that no longer exist,
-- typed `risk` and `prediction` because at the time every capability had to be
-- an agent row to appear anywhere.
--
-- Under the model the system now has, they are workflows: a graph in code that
-- registers itself in WorkflowRegistry. When corporate decision risk is built
-- (plan Phase 4) it comes back as a registered workflow. It will not need a row,
-- so there is nothing here worth re-homing.
--
--   investment-risk-agent   risk         disabled, archived; points its endpoint
--                                        at localhost:3000/api/v1/risk/... — a
--                                        service this repo does not contain
--   predictor               langgraph    same lineage; may already be absent,
--                                        the delete is by slug either way
--
-- The `risk` and `prediction` SCHEMAS stay. They hold a domain-neutral
-- assessment engine (scopes, weighted dimensions, subjects, assessments) that
-- Phase 4 builds the risk workflow on top of. Only the agent rows go.

-- Explicit transaction: the constraint is replaced by DROP then ADD, and a
-- failure between them would leave the table with no constraint at all.
BEGIN;

DELETE FROM public.agents
WHERE slug IN (
  'investment-risk-agent',
  'predictor'
);

-- Finish the v2 type rename, which never actually ran here.
--
-- 20260316100001_agent_table_v2.sql renames 'rag-runner' -> 'rag' and
-- 'orchestrator' -> 'context' and narrows the constraint. It is recorded as
-- applied in public.deployment_migrations, but it was never executed against
-- the deployed database: that ledger was SEEDED on first run, adopting all 34
-- then-existing files on the assumption that the baseline dump already
-- reflected them. For this file the assumption is false, and provably so — the
-- deployed agents table still has `version`, `io_schema` and `capabilities`,
-- and still lacks the `status` and `output_type` columns v2 adds.
--
-- Production is not broken by this: AgentDefinitionService strips '-runner' in
-- both normalizeFamily() and the catalog filter, and reads status from
-- metadata.status rather than the column. But the column holds two spellings
-- for one family, and the target constraint accepts only one.
--
-- This migration does NOT attempt the rest of v2. Adding columns and dropping
-- `version`/`io_schema`/`capabilities` is a separate, larger change that the
-- running code does not need. See the note in scripts/migrate-deployed.sh.
--
-- ORDER MATTERS, and the companion constraints matter. The live constraints
-- are keyed to the old vocabulary:
--
--   agents_agent_type_check     permits 'rag-runner', forbids 'rag'
--   agents_api_has_endpoint     'rag' is absent, so a null endpoint fails
--   agents_context_no_endpoint  same vocabulary
--   agents_context_has_llm      same vocabulary
--
-- so all of them have to come off before the rename. v2 drops exactly this set
-- and re-adds only the agent_type one; that decision is already made in the
-- repo and this is completing it, not re-opening it. Dropping first is safe
-- because the whole file is one transaction — there is no committed moment
-- where the table is unconstrained.
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_api_has_endpoint;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_context_has_llm;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_context_no_endpoint;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_api_no_llm;

-- Idempotent; a no-op wherever v2 did run.
UPDATE public.agents SET agent_type = 'rag'     WHERE agent_type = 'rag-runner';
UPDATE public.agents SET agent_type = 'context' WHERE agent_type = 'orchestrator';

-- `agent_type` selects the family runner. The old constraint has allowed
-- 'langgraph', 'prediction' and 'risk' since 20251229200005, none of which any
-- runner can execute — which is how the table accumulated rows that were not
-- agents. Narrow it to the five families that actually dispatch, so the next
-- non-agent is rejected at write time instead of being discovered a year later.
--
-- Fail with the offending slugs rather than the bare "violated by some row"
-- that ALTER TABLE would give. This guard is not decoration: it is what caught
-- the un-applied v2 rename before it reached a deploy.
DO $$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(slug || ' (' || agent_type || ')', ', ' ORDER BY slug)
    INTO offenders
    FROM public.agents
   WHERE agent_type NOT IN ('context', 'rag', 'api', 'external', 'media');

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot narrow agents_agent_type_check: these rows have no family runner: %',
      offenders;
  END IF;
END $$;

ALTER TABLE public.agents
  ADD CONSTRAINT agents_agent_type_check
    CHECK (agent_type IN ('context', 'rag', 'api', 'external', 'media'));

COMMENT ON CONSTRAINT agents_agent_type_check ON public.agents IS
  'agent_type selects the family runner. These five are the only ones that dispatch. Workflows are LangGraph endpoints in code and register in WorkflowRegistry — they do not belong in this table.';

COMMIT;

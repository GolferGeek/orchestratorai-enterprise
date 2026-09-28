-- The old marketing swarm is gone (it now runs on the workflow runtime, with
-- its configuration in marketing.swarm_*). Its runs and tables go with it.
-- Usage rows keep their cost history (llm_usage.conversation_id is set null).
BEGIN;

DELETE FROM public.conversations c
WHERE c.agent_name = 'marketing-swarm'
  AND NOT EXISTS (SELECT 1 FROM workflows.runs r WHERE r.id = c.id);

DROP TABLE marketing.evaluations;
DROP TABLE marketing.output_versions;
DROP TABLE marketing.execution_queue;
DROP TABLE marketing.outputs;
DROP TABLE marketing.swarm_tasks;
DROP TABLE marketing.agent_llm_configs;
DROP TABLE marketing.agents;
DROP TABLE marketing.content_types;

-- The old swarm's functions (the new swarm computes in code).
DROP FUNCTION marketing.calculate_final_rankings(uuid);
DROP FUNCTION marketing.calculate_initial_rankings(uuid);
DROP FUNCTION marketing.get_next_outputs(uuid, boolean, integer);
DROP FUNCTION marketing.get_next_pending_step(uuid);
DROP FUNCTION marketing.get_running_counts(uuid);
DROP FUNCTION marketing.get_task_progress(uuid);
DROP FUNCTION marketing.rank_to_weighted_score(integer);
DROP FUNCTION marketing.select_finalists(uuid, integer);
DROP FUNCTION marketing.update_outputs_updated_at();

COMMIT;

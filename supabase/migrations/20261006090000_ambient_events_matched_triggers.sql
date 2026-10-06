-- How many triggers a pushed event matched, recorded once the evaluator has
-- looked (null until then). An A2A task on the ambient route follows its
-- event: until this is set the event is still being evaluated; 0 means nothing
-- in the organization runs for it; otherwise the task waits for that many
-- executions (ambient.trigger_executions.event_id) and follows what they start
-- (effort: ambient push and A2A agents, agentic endpoint slice 4).
BEGIN;

ALTER TABLE ambient.events
  ADD COLUMN matched_triggers integer CHECK (matched_triggers IS NULL OR matched_triggers >= 0);

COMMIT;

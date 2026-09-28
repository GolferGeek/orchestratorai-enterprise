-- Ambient replies through the A2A agent a request came in on (effort: ambient
-- push and A2A agents, Phase 3).
--
-- An event pushed by an A2A agent for a Gatehouse caller remembers where it
-- came from (origin: via agent, caller, the caller's contextId and our task).
-- A trigger with action_config.replyToCaller sends its result back: for an
-- agent action at once, for a workflow action when the run ends. The
-- execution records the reply's state, so a reply waiting on a run survives a
-- restart.
BEGIN;

ALTER TABLE ambient.events
  ADD COLUMN origin jsonb CHECK (origin IS NULL OR (
    jsonb_typeof(origin->'via') = 'string' AND jsonb_typeof(origin->'callerId') = 'string'
    AND jsonb_typeof(origin->'contextId') = 'string' AND jsonb_typeof(origin->'taskId') = 'string'
  ));

ALTER TABLE ambient.trigger_executions
  -- sending: claimed by one API instance, so a reply goes out once.
  ADD COLUMN reply_state text CHECK (reply_state IN ('waiting', 'sending', 'sent', 'refused', 'failed')),
  -- The workflow run a waiting reply follows.
  ADD COLUMN reply_run_id uuid,
  ADD COLUMN reply jsonb,
  ADD CHECK (reply_state IS DISTINCT FROM 'waiting' OR reply_run_id IS NOT NULL);
CREATE INDEX ambient_trigger_executions_reply_waiting_idx
  ON ambient.trigger_executions (reply_run_id) WHERE reply_state = 'waiting';

COMMIT;

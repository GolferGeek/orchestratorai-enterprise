-- Outbound A2A calls: every SendMessage the Gatehouse makes to another A2A
-- agent, whether an A2A agent of ours calling its remote target or ambient
-- replying to a caller through the agent the request came in on (effort:
-- ambient push and A2A agents, Phase 6). The Gatehouse pages read it.
BEGIN;

CREATE TABLE gatehouse.outbound_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug text NOT NULL,
  -- Our A2A agent that made the call.
  agent_slug text NOT NULL,
  -- 'call': the agent's own target; 'reply': an answer to a caller.
  kind text NOT NULL CHECK (kind IN ('call', 'reply')),
  remote_card_url text NOT NULL,
  -- From the remote's card, once it was read.
  remote_name text,
  -- The caller a reply went to.
  caller_id uuid REFERENCES gatehouse.callers(id) ON DELETE SET NULL,
  context_id text,
  state text NOT NULL CHECK (state IN ('sending', 'answered', 'failed')),
  -- The A2A task state the remote answered with.
  remote_state text,
  remote_task_id text,
  error text,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
ALTER TABLE gatehouse.outbound_calls OWNER TO postgres;
CREATE INDEX gatehouse_outbound_calls_org_idx ON gatehouse.outbound_calls (org_slug, created_at DESC);

COMMIT;

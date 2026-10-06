-- Agent keys: how an outside agent that cannot sign with a registered key
-- (ChatGPT, Codex, Claude, a buyer's own script) calls our A2A agents
-- (effort: ambient push and A2A agents, agentic endpoint slice 1).
--
-- A grant is a named, revocable credential for one agent, acting for one of
-- the company's customer accounts. The account lives in the company's own
-- (business) database; the grant keeps only a reference to it (account_ref)
-- and a label to show, never a copy of the customer. The key itself is never
-- stored: only its SHA-256 hash and a short prefix to recognise it by.
--
-- order_policy and the limits say what the agent may do with orders; the
-- order workflow enforces them (they travel with every call in metadata).
-- Later slices issue the same grants through OAuth (kind 'oauth').
--
-- Logging in and authentication belong to the company's database; workflow
-- work to this one. These tables are the default credential store, for a
-- deployment whose own Supabase is the company database (enterprise itself).
-- A client copy with a separate company database (Neuromics) plugs in a store
-- over the grants it already keeps there, so a task points at its grant by
-- reference (grant_ref), not by foreign key.
BEGIN;

CREATE TABLE gatehouse.agent_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug text NOT NULL CHECK (length(org_slug) BETWEEN 1 AND 100),
  agent_name text NOT NULL CHECK (length(agent_name) BETWEEN 1 AND 80),
  -- The customer account the agent acts for, in the company's own records.
  account_ref text NOT NULL CHECK (length(account_ref) BETWEEN 1 AND 200),
  account_label text NOT NULL CHECK (length(account_label) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK (kind IN ('api_key', 'oauth')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text NOT NULL CHECK (length(token_prefix) BETWEEN 8 AND 16),
  order_policy text NOT NULL DEFAULT 'approve_each'
    CHECK (order_policy IN ('none', 'approve_each', 'auto_within_limits')),
  per_order_limit_cents integer CHECK (per_order_limit_cents IS NULL OR per_order_limit_cents >= 0),
  monthly_limit_cents integer CHECK (monthly_limit_cents IS NULL OR monthly_limit_cents >= 0),
  rate_limit_per_minute integer NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute > 0),
  valid_until timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  -- 'admin:<user id>' for a key staff issued.
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (order_policy <> 'auto_within_limits' OR per_order_limit_cents IS NOT NULL)
);
ALTER TABLE gatehouse.agent_grants OWNER TO postgres;
CREATE INDEX gatehouse_agent_grants_org_idx ON gatehouse.agent_grants (org_slug, created_at DESC);

-- One row per accepted call, for the grant's rate limit; pruned after an hour.
CREATE TABLE gatehouse.grant_calls (
  grant_id uuid NOT NULL REFERENCES gatehouse.agent_grants(id) ON DELETE CASCADE,
  called_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gatehouse.grant_calls OWNER TO postgres;
CREATE INDEX gatehouse_grant_calls_rate_idx ON gatehouse.grant_calls (grant_id, called_at DESC);

-- A task belongs to a registered caller or to an agent key, never both. The
-- key is named by its grant's id in whichever store holds it.
ALTER TABLE gatehouse.tasks
  ADD COLUMN grant_ref text CHECK (grant_ref IS NULL OR length(grant_ref) BETWEEN 1 AND 200),
  ALTER COLUMN caller_id DROP NOT NULL,
  ADD CONSTRAINT tasks_one_principal CHECK (num_nonnulls(caller_id, grant_ref) = 1);
CREATE INDEX gatehouse_tasks_grant_idx ON gatehouse.tasks (grant_ref, agent_slug, created_at DESC) WHERE grant_ref IS NOT NULL;

COMMIT;

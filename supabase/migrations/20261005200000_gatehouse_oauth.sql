-- "Log in with <company>": the OAuth 2.1 authorization server outside agents
-- (ChatGPT, Claude, Codex) use to get an agent key (effort: ambient push and
-- A2A agents, agentic endpoint slice 2). Ported from neuromics.com's
-- src/lib/agent/oauth.ts.
--
-- An app registers itself (RFC 7591, public clients with PKCE only). The
-- person signs in through the auth plane, picks the customer account and the
-- ordering limits on our consent page, and the app gets a one-time code it
-- exchanges for an agent key (agent_grants, kind 'oauth') and a refresh token.
-- Codes and refresh tokens are stored only as SHA-256 hashes.
--
-- Like agent_grants, these are the default credential store's tables; a
-- client copy with a separate company database keeps its own there.
BEGIN;

CREATE TABLE gatehouse.oauth_clients (
  client_id text PRIMARY KEY CHECK (length(client_id) BETWEEN 8 AND 100),
  client_name text NOT NULL CHECK (length(client_name) BETWEEN 1 AND 80),
  redirect_uris text[] NOT NULL CHECK (cardinality(redirect_uris) BETWEEN 1 AND 10),
  client_uri text CHECK (client_uri IS NULL OR client_uri ~ '^https://'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
ALTER TABLE gatehouse.oauth_clients OWNER TO postgres;

CREATE TABLE gatehouse.oauth_codes (
  code_hash text PRIMARY KEY CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  client_id text NOT NULL REFERENCES gatehouse.oauth_clients(client_id) ON DELETE CASCADE,
  grant_id uuid NOT NULL REFERENCES gatehouse.agent_grants(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL CHECK (length(code_challenge) BETWEEN 43 AND 128),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gatehouse.oauth_codes OWNER TO postgres;

ALTER TABLE gatehouse.agent_grants
  ADD COLUMN refresh_token_hash text UNIQUE CHECK (refresh_token_hash IS NULL OR refresh_token_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN oauth_client_id text REFERENCES gatehouse.oauth_clients(client_id) ON DELETE CASCADE,
  ADD CONSTRAINT agent_grants_oauth_client CHECK (kind <> 'oauth' OR oauth_client_id IS NOT NULL);

COMMIT;

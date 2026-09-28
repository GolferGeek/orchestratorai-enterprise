-- The Gatehouse's callers: outside A2A agents that may call our published A2A
-- agents (effort: ambient push and A2A agents, Phase 3).
--
-- A caller is an agent, not a person, so it is not in auth.users. It proves
-- who it is with its own key pair: every request carries a short-lived JWT
-- signed with its private key (iss = its agent card URL). We keep only public
-- keys, either a JWKS URL on the card's own origin, or a public JWK set an
-- admin pasted in. Never a shared secret.
BEGIN;

CREATE SCHEMA gatehouse;
ALTER SCHEMA gatehouse OWNER TO postgres;

CREATE TABLE gatehouse.callers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  card_url text NOT NULL UNIQUE CHECK (card_url ~ '^https://'),
  jwks_url text CHECK (jwks_url ~ '^https://'),
  jwks jsonb CHECK (jwks IS NULL OR jsonb_typeof(jwks->'keys') = 'array'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  rate_limit_per_minute integer NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute > 0),
  -- 'self' (proved control of the card's origin) or 'admin:<user id>'.
  registered_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  CHECK ((jwks_url IS NULL) <> (jwks IS NULL))
);
ALTER TABLE gatehouse.callers OWNER TO postgres;

-- Every accepted token's jti, so a token cannot be replayed. The same rows
-- count a caller's requests for its rate limit.
CREATE TABLE gatehouse.used_tokens (
  caller_id uuid NOT NULL REFERENCES gatehouse.callers(id) ON DELETE CASCADE,
  jti text NOT NULL CHECK (length(jti) BETWEEN 8 AND 200),
  expires_at timestamptz NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (caller_id, jti)
);
ALTER TABLE gatehouse.used_tokens OWNER TO postgres;
CREATE INDEX gatehouse_used_tokens_rate_idx ON gatehouse.used_tokens (caller_id, used_at DESC);
CREATE INDEX gatehouse_used_tokens_expiry_idx ON gatehouse.used_tokens (expires_at);

COMMIT;

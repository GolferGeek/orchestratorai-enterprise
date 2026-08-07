-- Distributed replay protection for signed Secure Conversations requests.
-- A primary-key insert is the atomic claim shared by every API instance.

CREATE TABLE IF NOT EXISTS ambient.a2a_inbound_nonces (
  nonce TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS a2a_inbound_nonces_expires_at_idx
  ON ambient.a2a_inbound_nonces (expires_at);

ALTER TABLE ambient.a2a_inbound_nonces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_a2a_inbound_nonces
  ON ambient.a2a_inbound_nonces;

CREATE POLICY service_role_all_a2a_inbound_nonces
  ON ambient.a2a_inbound_nonces
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

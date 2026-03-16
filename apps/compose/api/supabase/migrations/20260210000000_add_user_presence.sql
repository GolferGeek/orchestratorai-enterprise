-- =============================================================================
-- Add User Presence Table for Global Online Tracking
-- =============================================================================
-- Tracks which users are currently active on Flow.
-- Users send heartbeats every 30 seconds; anyone active within 60 seconds is "online".

CREATE TABLE IF NOT EXISTS orch_flow.user_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_presence_active
  ON orch_flow.user_presence (last_active_at);

-- RLS
ALTER TABLE orch_flow.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view presence"
  ON orch_flow.user_presence FOR SELECT
  USING (true);

CREATE POLICY "Users can upsert their own presence"
  ON orch_flow.user_presence FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own presence"
  ON orch_flow.user_presence FOR UPDATE
  USING (user_id = auth.uid());

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE orch_flow.user_presence;

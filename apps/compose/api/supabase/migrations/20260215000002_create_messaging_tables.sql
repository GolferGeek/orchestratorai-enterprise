-- =============================================================================
-- Messaging Channel Tables
-- =============================================================================
-- Phase 6: Multi-channel messaging support
-- - channel_users: Maps external channel identities to internal users
-- - channel_message_log: Audit log of all inbound/outbound messages

-- Channel user identity mapping
CREATE TABLE IF NOT EXISTS public.channel_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  channel_user_id TEXT NOT NULL,
  display_name TEXT,
  is_allowed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel, channel_user_id)
);

-- Message log for all channels
CREATE TABLE IF NOT EXISTS public.channel_message_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_user_id UUID REFERENCES public.channel_users(id),
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,
  message_text TEXT,
  channel_message_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_channel_users_channel ON public.channel_users(channel, channel_user_id);
CREATE INDEX IF NOT EXISTS idx_channel_users_allowed ON public.channel_users(is_allowed) WHERE is_allowed = true;
CREATE INDEX IF NOT EXISTS idx_channel_message_log_user ON public.channel_message_log(channel_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_message_log_channel ON public.channel_message_log(channel, created_at DESC);

-- Enable RLS
ALTER TABLE public.channel_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_message_log ENABLE ROW LEVEL SECURITY;

-- Service role has full access (these tables are managed by the API, not by end users)
CREATE POLICY "Service role full access to channel_users"
  ON public.channel_users FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to channel_message_log"
  ON public.channel_message_log FOR ALL
  USING (auth.role() = 'service_role');

-- Authenticated users can view their own channel identities
CREATE POLICY "Users can view their own channel identities"
  ON public.channel_users FOR SELECT
  USING (user_id = auth.uid());

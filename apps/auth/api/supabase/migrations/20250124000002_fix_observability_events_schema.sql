-- Fix observability_events table schema to match application code
-- Drop and recreate with correct schema

DROP TABLE IF EXISTS public.observability_events CASCADE;

CREATE TABLE public.observability_events (
  id BIGSERIAL PRIMARY KEY,

  -- Event identification
  source_app TEXT NOT NULL DEFAULT 'orchestrator-ai',
  session_id TEXT, -- conversationId or taskId
  hook_event_type TEXT NOT NULL, -- 'agent.started', 'agent.progress', 'agent.completed', etc.

  -- User context
  user_id UUID,
  username TEXT, -- display_name or email (cached for performance)

  -- Task/Conversation context
  conversation_id UUID,
  task_id TEXT NOT NULL, -- Changed from UUID to TEXT to match application

  -- Agent context
  agent_slug TEXT,
  organization_slug TEXT,
  mode TEXT, -- 'converse', 'plan', 'build', 'orchestrate'

  -- Event data
  status TEXT,
  message TEXT,
  progress INTEGER, -- 0-100
  step TEXT,
  sequence INTEGER,
  total_steps INTEGER,

  -- Full event payload
  payload JSONB NOT NULL,

  -- Timestamps
  timestamp BIGINT NOT NULL, -- Milliseconds since epoch
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_observability_events_created_at ON public.observability_events(created_at DESC);
CREATE INDEX idx_observability_events_timestamp ON public.observability_events(timestamp DESC);
CREATE INDEX idx_observability_events_user_id ON public.observability_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_observability_events_task_id ON public.observability_events(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_observability_events_conversation_id ON public.observability_events(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_observability_events_agent_slug ON public.observability_events(agent_slug) WHERE agent_slug IS NOT NULL;
CREATE INDEX idx_observability_events_hook_event_type ON public.observability_events(hook_event_type);

-- Comment on table
COMMENT ON TABLE public.observability_events IS 'Real-time agent execution events for admin observability and monitoring';

-- Comment on columns
COMMENT ON COLUMN public.observability_events.session_id IS 'conversationId or taskId used for grouping events';
COMMENT ON COLUMN public.observability_events.hook_event_type IS 'Event type: agent.started, agent.progress, agent.completed, agent.failed';
COMMENT ON COLUMN public.observability_events.username IS 'Cached display_name or email for performance';
COMMENT ON COLUMN public.observability_events.payload IS 'Full event payload as JSONB (flexible structure)';
COMMENT ON COLUMN public.observability_events.timestamp IS 'Event timestamp in milliseconds since epoch';

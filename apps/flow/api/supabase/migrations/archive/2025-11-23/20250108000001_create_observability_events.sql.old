-- Create observability events table for real-time agent monitoring
-- This table stores all agent execution events for admin observability

CREATE TABLE IF NOT EXISTS public.observability_events (
  id BIGSERIAL PRIMARY KEY,
  
  -- Event identification
  source_app TEXT NOT NULL DEFAULT 'orchestrator-ai',
  session_id TEXT NOT NULL, -- conversationId or taskId
  hook_event_type TEXT NOT NULL, -- 'agent.started', 'agent.progress', 'agent.completed', etc.
  
  -- User context
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  username TEXT, -- display_name or email (cached for performance)
  
  -- Task/Conversation context
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  
  -- Agent context
  agent_slug TEXT,
  organization_slug TEXT,
  mode TEXT, -- 'converse', 'plan', 'build', 'orchestrate'
  
  -- Event data
  status TEXT,
  message TEXT,
  progress INTEGER, -- 0-100
  step TEXT,
  
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

-- Comment on table
COMMENT ON TABLE public.observability_events IS 'Real-time agent execution events for admin observability and monitoring';

-- Comment on columns
COMMENT ON COLUMN public.observability_events.session_id IS 'conversationId or taskId used for grouping events';
COMMENT ON COLUMN public.observability_events.hook_event_type IS 'Event type: agent.started, agent.progress, agent.completed, agent.failed';
COMMENT ON COLUMN public.observability_events.username IS 'Cached display_name or email for performance';
COMMENT ON COLUMN public.observability_events.payload IS 'Full event payload as JSONB (flexible structure)';
COMMENT ON COLUMN public.observability_events.timestamp IS 'Event timestamp in milliseconds since epoch';

-- Optional: Function to clean up old events (can be enabled later if storage becomes an issue)
-- Not scheduled by default - events are kept indefinitely
CREATE OR REPLACE FUNCTION public.cleanup_old_observability_events(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.observability_events
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.cleanup_old_observability_events IS 'Optional cleanup function to delete events older than specified days. Not scheduled by default.';


-- Conversation-Centric V2 Migration
-- Step 3-3: Add typed output support to conversation messages
--
-- The v2 model makes conversation the primary persisted unit.
-- Messages carry typed output directly instead of referencing
-- separate task/deliverable records.

-- Add output_type to conversation messages for typed rendering
ALTER TABLE public.task_messages
  ADD COLUMN IF NOT EXISTS output_type TEXT DEFAULT NULL
    CHECK (output_type IS NULL OR output_type IN ('text', 'markdown', 'json', 'image', 'video', 'audio', 'artifact-ref')),
  ADD COLUMN IF NOT EXISTS structured_content JSONB DEFAULT NULL;

COMMENT ON COLUMN public.task_messages.output_type IS 'V2: Typed output for frontend rendering. NULL for plain user messages.';
COMMENT ON COLUMN public.task_messages.structured_content IS 'V2: Structured content payload for non-text outputs (JSON objects, media refs, etc.)';

-- Add conversation-level metadata for v2
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_output_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;

COMMENT ON COLUMN public.conversations.last_output_type IS 'V2: Output type of the most recent agent response';
COMMENT ON COLUMN public.conversations.message_count IS 'V2: Cached message count for list views';

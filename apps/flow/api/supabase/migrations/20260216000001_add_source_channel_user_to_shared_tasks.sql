-- Add source_channel_user_id to shared_tasks for mobile → Flow task traceability
-- When a task is created via Telegram/WhatsApp, this links back to the originating mobile user
-- so completion notifications can be sent back to the correct channel

ALTER TABLE orch_flow.shared_tasks
ADD COLUMN IF NOT EXISTS source_channel_user_id UUID REFERENCES public.channel_users(id);

COMMENT ON COLUMN orch_flow.shared_tasks.source_channel_user_id IS
  'Links to the mobile channel user who initiated this task (for completion notifications)';

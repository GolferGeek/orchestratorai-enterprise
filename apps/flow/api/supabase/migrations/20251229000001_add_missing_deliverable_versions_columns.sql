-- Migration: Add missing columns to deliverable_versions table
--
-- Reason: The deliverable_versions table was created with minimal columns, but the code
--         expects additional columns: created_by_type, is_current_version, task_id,
--         file_attachments, and updated_at. This migration adds these columns to match
--         the expected schema and the snapshot schema.

-- Add created_by_type column
ALTER TABLE public.deliverable_versions
ADD COLUMN IF NOT EXISTS created_by_type VARCHAR(50) DEFAULT 'ai_response';

-- Add constraint for created_by_type values
ALTER TABLE public.deliverable_versions
DROP CONSTRAINT IF EXISTS deliverable_versions_created_by_type_check;

ALTER TABLE public.deliverable_versions
ADD CONSTRAINT deliverable_versions_created_by_type_check
CHECK (created_by_type IN (
    'ai_response',
    'manual_edit',
    'ai_enhancement',
    'user_request',
    'conversation_task',
    'conversation_merge',
    'llm_rerun'
));

-- Add is_current_version column
ALTER TABLE public.deliverable_versions
ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN DEFAULT false;

-- Add task_id column
ALTER TABLE public.deliverable_versions
ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL;

-- Add file_attachments column
ALTER TABLE public.deliverable_versions
ADD COLUMN IF NOT EXISTS file_attachments JSONB DEFAULT '{}'::jsonb;

-- Add updated_at column
ALTER TABLE public.deliverable_versions
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Update format column type to match snapshot (VARCHAR(100) instead of TEXT)
ALTER TABLE public.deliverable_versions
ALTER COLUMN format TYPE VARCHAR(100);

-- Add comments
COMMENT ON COLUMN public.deliverable_versions.created_by_type IS 'How the version was created: user_request, agent_generated, rerun, merge';
COMMENT ON COLUMN public.deliverable_versions.is_current_version IS 'Indicates if this is the active version of the deliverable';
COMMENT ON COLUMN public.deliverable_versions.task_id IS 'Reference to the task that created this version';
COMMENT ON COLUMN public.deliverable_versions.file_attachments IS 'JSON object containing file attachment metadata';

-- Create index on task_id if it doesn't exist
CREATE INDEX IF NOT EXISTS deliverable_versions_task_id_idx ON public.deliverable_versions(task_id);


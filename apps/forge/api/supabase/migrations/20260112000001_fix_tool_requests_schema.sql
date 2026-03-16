-- ============================================================================
-- Fix tool_requests Schema
-- ============================================================================
-- Aligns the prediction.tool_requests table with the TypeScript interface
-- by adding missing columns and renaming existing ones
-- ============================================================================

-- Add missing columns
ALTER TABLE prediction.tool_requests
ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'
  CHECK (priority IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE prediction.tool_requests
ADD COLUMN IF NOT EXISTS rationale TEXT;

ALTER TABLE prediction.tool_requests
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE prediction.tool_requests
ADD COLUMN IF NOT EXISTS resolved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE prediction.tool_requests
ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- Add name column (title was the original name, we'll add name as an alias)
ALTER TABLE prediction.tool_requests
ADD COLUMN IF NOT EXISTS name TEXT;

-- Backfill name from title
UPDATE prediction.tool_requests
SET name = title
WHERE name IS NULL AND title IS NOT NULL;

-- Rename source_missed_opportunity_id to missed_opportunity_id if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'prediction'
    AND table_name = 'tool_requests'
    AND column_name = 'source_missed_opportunity_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'prediction'
    AND table_name = 'tool_requests'
    AND column_name = 'missed_opportunity_id'
  ) THEN
    ALTER TABLE prediction.tool_requests
    RENAME COLUMN source_missed_opportunity_id TO missed_opportunity_id;
  END IF;
END $$;

-- Make name NOT NULL with default after backfill
DO $$
BEGIN
  UPDATE prediction.tool_requests SET name = 'Unnamed Request' WHERE name IS NULL;
  ALTER TABLE prediction.tool_requests ALTER COLUMN name SET NOT NULL;
EXCEPTION WHEN others THEN
  -- Already NOT NULL
  NULL;
END $$;

-- Create index on priority for sorting
CREATE INDEX IF NOT EXISTS idx_tool_requests_priority ON prediction.tool_requests(priority);

COMMENT ON COLUMN prediction.tool_requests.priority IS 'Request priority: low, medium, high, critical';
COMMENT ON COLUMN prediction.tool_requests.rationale IS 'Reason/justification for this tool request';
COMMENT ON COLUMN prediction.tool_requests.resolved_at IS 'Timestamp when request was resolved (done/rejected)';
COMMENT ON COLUMN prediction.tool_requests.resolved_by_user_id IS 'User who resolved this request';
COMMENT ON COLUMN prediction.tool_requests.resolution_notes IS 'Notes about the resolution';

-- Add per-room access control to DD rooms (allow-list of userIds)
-- Shape: {"mode":"open"} or {"mode":"allowlist","allowedUserIds":["uuid",...]}
-- Default: all existing and new rooms are "open" unless explicitly restricted.

ALTER TABLE legal.agent_jobs
  ADD COLUMN IF NOT EXISTS access_control JSONB NOT NULL DEFAULT '{"mode":"open"}'::jsonb;

-- CHECK: mode must be 'open' or 'allowlist'; when 'allowlist', allowedUserIds must be an array.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_jobs_access_control_check'
      AND conrelid = 'legal.agent_jobs'::regclass
  ) THEN
    ALTER TABLE legal.agent_jobs
      ADD CONSTRAINT agent_jobs_access_control_check CHECK (
        (access_control->>'mode') IN ('open', 'allowlist')
        AND (
          (access_control->>'mode') = 'open'
          OR jsonb_typeof(access_control->'allowedUserIds') = 'array'
        )
      );
  END IF;
END $$;

-- GIN index for future @> containment queries on the JSONB column.
CREATE INDEX IF NOT EXISTS legal_agent_jobs_access_control_gin
  ON legal.agent_jobs USING gin (access_control);

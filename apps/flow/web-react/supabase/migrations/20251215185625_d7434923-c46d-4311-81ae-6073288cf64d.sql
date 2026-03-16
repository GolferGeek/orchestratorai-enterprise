-- Rename duration_minutes to duration_seconds and convert values
ALTER TABLE timer_state RENAME COLUMN duration_minutes TO duration_seconds;

-- Update default to 25 minutes in seconds (1500)
ALTER TABLE timer_state ALTER COLUMN duration_seconds SET DEFAULT 1500;

-- Convert any existing minute values to seconds
UPDATE timer_state SET duration_seconds = duration_seconds * 60 WHERE duration_seconds IS NOT NULL AND duration_seconds < 100;
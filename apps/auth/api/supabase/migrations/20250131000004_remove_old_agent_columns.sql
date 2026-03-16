-- =============================================================================
-- REMOVE OLD AGENT COLUMNS
-- =============================================================================
-- Removes deprecated columns from agents table that are no longer used by the code
-- Old columns: display_name, yaml, mode_profile, status, function_code
-- New columns are used instead: name, capabilities, department, tags, metadata
-- Created: 2025-01-31
-- =============================================================================

-- Drop old columns that are no longer used
ALTER TABLE public.agents 
  DROP COLUMN IF EXISTS display_name,
  DROP COLUMN IF EXISTS yaml,
  DROP COLUMN IF EXISTS mode_profile,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS function_code;

-- Note: The new columns (name, capabilities, department, tags, metadata) are already in place
-- and being used by the application code.


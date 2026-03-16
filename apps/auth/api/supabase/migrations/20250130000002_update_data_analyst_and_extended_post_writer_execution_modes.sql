-- =============================================================================
-- UPDATE EXECUTION MODES FOR DATA ANALYST AND EXTENDED POST WRITER
-- =============================================================================
-- Updates execution_modes in metadata for:
--   - data-analyst
--   - extended-post-writer
-- 
-- Changes execution_modes from "immediate" only to include:
--   ["immediate", "polling", "real-time"]
-- 
-- This enables polling and real-time streaming for these agents.
-- Created: 2025-01-30
-- =============================================================================

-- Update data-analyst agent
UPDATE public.agents
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'execution_modes', ARRAY['immediate', 'polling', 'real-time']::text[]
),
updated_at = CURRENT_TIMESTAMP
WHERE slug = 'data-analyst';

-- Update extended-post-writer agent
UPDATE public.agents
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'execution_modes', ARRAY['immediate', 'polling', 'real-time']::text[]
),
updated_at = CURRENT_TIMESTAMP
WHERE slug = 'extended-post-writer';

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- After running, verify with:
-- SELECT slug, name, metadata->>'execution_modes' as execution_modes
-- FROM agents
-- WHERE slug IN ('data-analyst', 'extended-post-writer');




-- =============================================================================
-- ADD EXECUTION_MODES TO ALL AGENTS
-- =============================================================================
-- Ensures all agents (including context agents) have execution_modes in metadata
-- Default: ["immediate", "polling", "real-time"] - all modes supported
-- This enables real-time streaming for ALL agent types
-- Created: Phase 7 - Real-time Observability
-- =============================================================================

-- Update all agents that don't have execution_modes in their metadata
-- Set default to support all modes including real-time
UPDATE public.agents
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'execution_modes', ARRAY['immediate', 'polling', 'real-time']
)
WHERE metadata IS NULL
   OR NOT (metadata ? 'execution_modes');

-- Add comment explaining the field
COMMENT ON COLUMN public.agents.metadata IS
  'Flexible extended metadata including execution_modes (["immediate", "polling", "real-time"]), author, license, docs, etc.';

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- After running, verify with:
-- SELECT slug, agent_type, metadata->>'execution_modes' as execution_modes
-- FROM agents;

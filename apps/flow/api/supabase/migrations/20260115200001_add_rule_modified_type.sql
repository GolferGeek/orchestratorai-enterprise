-- =============================================================================
-- ADD rule_modified TO MODIFICATION TYPE
-- =============================================================================
-- Description: Updates the agent_self_modification_log constraint to include 'rule_modified'
-- This supports the agent self-adaptation feature where agents can modify existing rules

-- Drop the existing constraint
ALTER TABLE prediction.agent_self_modification_log
  DROP CONSTRAINT IF EXISTS agent_self_modification_log_modification_type_check;

-- Add updated constraint with rule_modified
ALTER TABLE prediction.agent_self_modification_log
  ADD CONSTRAINT agent_self_modification_log_modification_type_check
  CHECK (modification_type IN ('rule_added', 'rule_removed', 'rule_modified', 'weight_changed', 'journal_entry', 'status_change'));

COMMENT ON COLUMN prediction.agent_self_modification_log.modification_type IS 'Type of modification: rule_added, rule_removed, rule_modified, weight_changed, journal_entry, status_change';

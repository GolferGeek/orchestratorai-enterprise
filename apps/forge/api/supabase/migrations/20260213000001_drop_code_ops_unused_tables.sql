-- Migration: Drop unused code_ops tables and views
-- Date: 2026-02-13
-- Description: Removes artifact_events, skill_events, and artifacts tables
--              along with their dependent views. These were part of a self-reporting
--              system that added overhead without providing actionable value.
--              Keeping: quality_issues, scan_runs, fix_attempts, pivot_learnings
--              (these serve the error scanning/fixing/learning workflow).

-- ============================================================================
-- DROP VIEWS (must drop before tables due to dependencies)
-- ============================================================================

DROP VIEW IF EXISTS code_ops.v_artifact_never_called;
DROP VIEW IF EXISTS code_ops.v_artifact_daily_summary;
DROP VIEW IF EXISTS code_ops.skill_health;

-- ============================================================================
-- DROP TABLES
-- ============================================================================

-- skill_events has FK to fix_attempts, drop it first
DROP TABLE IF EXISTS code_ops.skill_events;

-- artifact_events has FK to scan_runs, drop it
DROP TABLE IF EXISTS code_ops.artifact_events;

-- artifacts inventory (no longer populated)
DROP TABLE IF EXISTS code_ops.artifacts;

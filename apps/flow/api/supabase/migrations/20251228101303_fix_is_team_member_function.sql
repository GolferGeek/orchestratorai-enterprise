-- Migration: Fix orch_flow.is_team_member() to query public.team_members instead of orch_flow.team_members
--
-- Reason: orch_flow.team_members table was removed. Team membership data is now in public.team_members
--          which is accessed via API. This function is used by RLS policies on timer_state and other tables.
--
-- IMPORTANT: All team-related data (teams, team_members) is stored in the public schema and accessed
--            via API endpoints. The orch_flow schema should NOT contain any tables starting with "team".

CREATE OR REPLACE FUNCTION orch_flow.is_team_member(_user_id UUID, _team_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members
    WHERE user_id = _user_id
      AND team_id = _team_id
  );
$$ LANGUAGE sql STABLE;

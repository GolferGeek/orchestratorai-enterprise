-- Fix timer_state RLS policy to allow INSERT operations
-- The previous policy was missing WITH CHECK clause which is required for INSERT

DROP POLICY IF EXISTS "Users can manage timer in their teams" ON orch_flow.timer_state;

CREATE POLICY "Users can manage timer in their teams"
ON orch_flow.timer_state FOR ALL
USING (
  team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id)
)
WITH CHECK (
  team_id IS NULL OR orch_flow.is_team_member(auth.uid(), team_id)
);

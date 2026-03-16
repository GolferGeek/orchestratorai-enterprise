-- ============================================================================
-- Migration: Filter Leaderboard to Personality Analysts Only
-- ============================================================================
-- The leaderboard should only show the 5 personality analysts (decision-makers):
-- - Fundamental Fred
-- - Technical Tina
-- - Sentiment Sally
-- - Aggressive Alex
-- - Cautious Carl
--
-- Context providers (base-analyst, domain experts) should NOT appear on leaderboard.
-- ============================================================================

-- Drop and recreate the view with personality filter
CREATE OR REPLACE VIEW prediction.v_analyst_fork_comparison AS
SELECT
  a.id AS analyst_id,
  a.slug,
  a.name,
  a.perspective,
  up.current_balance AS user_balance,
  up.total_realized_pnl AS user_realized_pnl,
  up.total_unrealized_pnl AS user_unrealized_pnl,
  up.win_count AS user_wins,
  up.loss_count AS user_losses,
  ap.current_balance AS agent_balance,
  ap.total_realized_pnl AS agent_realized_pnl,
  ap.total_unrealized_pnl AS agent_unrealized_pnl,
  ap.win_count AS agent_wins,
  ap.loss_count AS agent_losses,
  ap.status AS agent_status,
  ap.current_balance - up.current_balance AS balance_diff,
  CASE
    WHEN up.current_balance > 0 THEN
      (ap.current_balance - up.current_balance) / up.current_balance * 100
    ELSE 0
  END AS balance_diff_percent
FROM prediction.analysts a
LEFT JOIN prediction.analyst_portfolios up
  ON up.analyst_id = a.id AND up.fork_type = 'user'
LEFT JOIN prediction.analyst_portfolios ap
  ON ap.analyst_id = a.id AND ap.fork_type = 'agent'
WHERE a.analyst_type = 'personality'  -- Only show personality analysts on leaderboard
  AND a.is_enabled = true;

-- Log the change
DO $$
BEGIN
  RAISE NOTICE 'Updated v_analyst_fork_comparison to only show personality analysts';
  RAISE NOTICE 'Leaderboard now shows: Fundamental Fred, Technical Tina, Sentiment Sally, Aggressive Alex, Cautious Carl';
END $$;

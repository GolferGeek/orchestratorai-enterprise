-- ============================================================================
-- Migration: Add Arbitrator Fork to Leaderboard View
-- ============================================================================
-- Adds arbitrator portfolio columns to v_analyst_fork_comparison so the
-- Trading Dashboard leaderboard shows all three forks: User, AI, Arbitrator.
-- ============================================================================

DROP VIEW IF EXISTS prediction.v_analyst_fork_comparison;

CREATE VIEW prediction.v_analyst_fork_comparison AS
SELECT
  a.id AS analyst_id,
  a.slug,
  a.name,
  a.perspective,
  -- User fork
  up.current_balance AS user_balance,
  up.total_realized_pnl AS user_realized_pnl,
  up.total_unrealized_pnl AS user_unrealized_pnl,
  up.win_count AS user_wins,
  up.loss_count AS user_losses,
  -- AI fork
  ap.current_balance AS agent_balance,
  ap.total_realized_pnl AS agent_realized_pnl,
  ap.total_unrealized_pnl AS agent_unrealized_pnl,
  ap.win_count AS agent_wins,
  ap.loss_count AS agent_losses,
  ap.status AS agent_status,
  -- Arbitrator fork
  arb.current_balance AS arbitrator_balance,
  arb.total_realized_pnl AS arbitrator_realized_pnl,
  arb.total_unrealized_pnl AS arbitrator_unrealized_pnl,
  arb.win_count AS arbitrator_wins,
  arb.loss_count AS arbitrator_losses,
  arb.status AS arbitrator_status,
  -- Diff: agent vs user (existing)
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
  ON ap.analyst_id = a.id AND ap.fork_type = 'ai'
LEFT JOIN prediction.analyst_portfolios arb
  ON arb.analyst_id = a.id AND arb.fork_type = 'arbitrator'
WHERE a.analyst_type = 'personality'
  AND a.is_enabled = true;

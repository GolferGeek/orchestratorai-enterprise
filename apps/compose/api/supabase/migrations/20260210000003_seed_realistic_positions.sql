-- ============================================================================
-- Migration: Seed Realistic Portfolio & Position Data
-- ============================================================================
-- Populates the Trading Dashboard with 3 weeks of realistic trading activity
-- across all 5 personality analysts × 3 forks (user/ai/arbitrator), plus
-- a user portfolio. 8 trade events, mix of open/closed positions.
-- ============================================================================

-- ============================================================================
-- STEP 1: Ensure arbitrator portfolios exist for all personality analysts
-- (user and ai portfolios were created in 20260115 migration)
-- ============================================================================

INSERT INTO prediction.analyst_portfolios (analyst_id, fork_type)
SELECT id, 'user' FROM prediction.analysts
WHERE analyst_type = 'personality' AND is_enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM prediction.analyst_portfolios
    WHERE analyst_id = prediction.analysts.id AND fork_type = 'user'
  );

INSERT INTO prediction.analyst_portfolios (analyst_id, fork_type)
SELECT id, 'ai' FROM prediction.analysts
WHERE analyst_type = 'personality' AND is_enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM prediction.analyst_portfolios
    WHERE analyst_id = prediction.analysts.id AND fork_type = 'ai'
  );

INSERT INTO prediction.analyst_portfolios (analyst_id, fork_type)
SELECT id, 'arbitrator' FROM prediction.analysts
WHERE analyst_type = 'personality' AND is_enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM prediction.analyst_portfolios
    WHERE analyst_id = prediction.analysts.id AND fork_type = 'arbitrator'
  );

-- ============================================================================
-- STEP 2: Insert target snapshots (price history at each trade event)
-- ============================================================================

-- Helper: get target_id by symbol
-- We'll use CTEs throughout for cleaner references

DO $$
DECLARE
  -- Target IDs
  v_nvda_id UUID;
  v_aapl_id UUID;
  v_btc_id  UUID;
  v_eth_id  UUID;
  v_tsla_id UUID;
  v_msft_id UUID;
  v_sol_id  UUID;
  v_meta_id UUID;

  -- Analyst IDs
  v_fred_id  UUID;
  v_tina_id  UUID;
  v_sally_id UUID;
  v_alex_id  UUID;
  v_carl_id  UUID;

  -- Portfolio IDs (analyst_id + fork_type → portfolio_id)
  v_fred_user_pf  UUID;
  v_fred_ai_pf    UUID;
  v_fred_arb_pf   UUID;
  v_tina_user_pf  UUID;
  v_tina_ai_pf    UUID;
  v_tina_arb_pf   UUID;
  v_sally_user_pf UUID;
  v_sally_ai_pf   UUID;
  v_sally_arb_pf  UUID;
  v_alex_user_pf  UUID;
  v_alex_ai_pf    UUID;
  v_alex_arb_pf   UUID;
  v_carl_user_pf  UUID;
  v_carl_ai_pf    UUID;
  v_carl_arb_pf   UUID;

  -- User portfolio
  v_user_id UUID;
  v_user_pf UUID;

BEGIN
  -- ========================================================================
  -- Resolve target IDs
  -- ========================================================================
  SELECT id INTO v_nvda_id FROM prediction.targets WHERE symbol = 'NVDA' LIMIT 1;
  SELECT id INTO v_aapl_id FROM prediction.targets WHERE symbol = 'AAPL' LIMIT 1;
  SELECT id INTO v_btc_id  FROM prediction.targets WHERE symbol = 'BTC'  LIMIT 1;
  SELECT id INTO v_eth_id  FROM prediction.targets WHERE symbol = 'ETH'  LIMIT 1;
  SELECT id INTO v_tsla_id FROM prediction.targets WHERE symbol = 'TSLA' LIMIT 1;
  SELECT id INTO v_msft_id FROM prediction.targets WHERE symbol = 'MSFT' LIMIT 1;
  SELECT id INTO v_sol_id  FROM prediction.targets WHERE symbol = 'SOL'  LIMIT 1;
  SELECT id INTO v_meta_id FROM prediction.targets WHERE symbol = 'META' LIMIT 1;

  -- Abort if targets don't exist
  IF v_nvda_id IS NULL OR v_aapl_id IS NULL OR v_btc_id IS NULL THEN
    RAISE EXCEPTION 'Required targets not found. Run seed migrations first.';
  END IF;

  -- ========================================================================
  -- Resolve analyst IDs
  -- ========================================================================
  SELECT id INTO v_fred_id  FROM prediction.analysts WHERE slug = 'fundamental-fred' AND analyst_type = 'personality' LIMIT 1;
  SELECT id INTO v_tina_id  FROM prediction.analysts WHERE slug = 'technical-tina'   AND analyst_type = 'personality' LIMIT 1;
  SELECT id INTO v_sally_id FROM prediction.analysts WHERE slug = 'sentiment-sally'  AND analyst_type = 'personality' LIMIT 1;
  SELECT id INTO v_alex_id  FROM prediction.analysts WHERE slug = 'aggressive-alex'  AND analyst_type = 'personality' LIMIT 1;
  SELECT id INTO v_carl_id  FROM prediction.analysts WHERE slug = 'cautious-carl'    AND analyst_type = 'personality' LIMIT 1;

  IF v_fred_id IS NULL OR v_tina_id IS NULL OR v_sally_id IS NULL OR v_alex_id IS NULL OR v_carl_id IS NULL THEN
    RAISE EXCEPTION 'Required personality analysts not found. Expected: fundamental-fred, technical-tina, sentiment-sally, aggressive-alex, cautious-carl';
  END IF;

  -- ========================================================================
  -- Resolve portfolio IDs
  -- ========================================================================
  SELECT id INTO v_fred_user_pf  FROM prediction.analyst_portfolios WHERE analyst_id = v_fred_id  AND fork_type = 'user';
  SELECT id INTO v_fred_ai_pf    FROM prediction.analyst_portfolios WHERE analyst_id = v_fred_id  AND fork_type = 'ai';
  SELECT id INTO v_fred_arb_pf   FROM prediction.analyst_portfolios WHERE analyst_id = v_fred_id  AND fork_type = 'arbitrator';
  SELECT id INTO v_tina_user_pf  FROM prediction.analyst_portfolios WHERE analyst_id = v_tina_id  AND fork_type = 'user';
  SELECT id INTO v_tina_ai_pf    FROM prediction.analyst_portfolios WHERE analyst_id = v_tina_id  AND fork_type = 'ai';
  SELECT id INTO v_tina_arb_pf   FROM prediction.analyst_portfolios WHERE analyst_id = v_tina_id  AND fork_type = 'arbitrator';
  SELECT id INTO v_sally_user_pf FROM prediction.analyst_portfolios WHERE analyst_id = v_sally_id AND fork_type = 'user';
  SELECT id INTO v_sally_ai_pf   FROM prediction.analyst_portfolios WHERE analyst_id = v_sally_id AND fork_type = 'ai';
  SELECT id INTO v_sally_arb_pf  FROM prediction.analyst_portfolios WHERE analyst_id = v_sally_id AND fork_type = 'arbitrator';
  SELECT id INTO v_alex_user_pf  FROM prediction.analyst_portfolios WHERE analyst_id = v_alex_id  AND fork_type = 'user';
  SELECT id INTO v_alex_ai_pf    FROM prediction.analyst_portfolios WHERE analyst_id = v_alex_id  AND fork_type = 'ai';
  SELECT id INTO v_alex_arb_pf   FROM prediction.analyst_portfolios WHERE analyst_id = v_alex_id  AND fork_type = 'arbitrator';
  SELECT id INTO v_carl_user_pf  FROM prediction.analyst_portfolios WHERE analyst_id = v_carl_id  AND fork_type = 'user';
  SELECT id INTO v_carl_ai_pf    FROM prediction.analyst_portfolios WHERE analyst_id = v_carl_id  AND fork_type = 'ai';
  SELECT id INTO v_carl_arb_pf   FROM prediction.analyst_portfolios WHERE analyst_id = v_carl_id  AND fork_type = 'arbitrator';

  IF v_fred_user_pf IS NULL OR v_alex_arb_pf IS NULL THEN
    RAISE EXCEPTION 'Missing analyst portfolios. Ensure all 5 analysts have user/ai/arbitrator portfolios.';
  END IF;

  -- ========================================================================
  -- Create user portfolio (use first auth user or a known UUID)
  -- ========================================================================
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO prediction.user_portfolios (user_id, org_slug)
    VALUES (v_user_id, 'finance')
    ON CONFLICT (user_id, org_slug) DO NOTHING;

    SELECT id INTO v_user_pf FROM prediction.user_portfolios
    WHERE user_id = v_user_id AND org_slug = 'finance';
  END IF;

  -- ========================================================================
  -- STEP 2: Insert target snapshots (price history)
  -- ========================================================================

  -- NVDA price history
  INSERT INTO prediction.target_snapshots (target_id, value, captured_at) VALUES
    (v_nvda_id, 136.50, '2026-01-20 16:00:00-05'),
    (v_nvda_id, 140.20, '2026-01-24 16:00:00-05'),
    (v_nvda_id, 142.80, '2026-01-27 16:00:00-05'),
    (v_nvda_id, 138.90, '2026-01-31 16:00:00-05'),
    (v_nvda_id, 141.50, '2026-02-03 16:00:00-05'),
    (v_nvda_id, 144.30, '2026-02-07 16:00:00-05'),
    (v_nvda_id, 145.80, '2026-02-10 12:00:00-05');

  -- AAPL price history
  INSERT INTO prediction.target_snapshots (target_id, value, captured_at) VALUES
    (v_aapl_id, 236.40, '2026-01-20 16:00:00-05'),
    (v_aapl_id, 238.10, '2026-01-24 16:00:00-05'),
    (v_aapl_id, 241.60, '2026-01-27 16:00:00-05'),
    (v_aapl_id, 239.80, '2026-01-31 16:00:00-05'),
    (v_aapl_id, 242.30, '2026-02-03 16:00:00-05'),
    (v_aapl_id, 244.50, '2026-02-07 16:00:00-05'),
    (v_aapl_id, 243.20, '2026-02-10 12:00:00-05');

  -- BTC price history
  INSERT INTO prediction.target_snapshots (target_id, value, captured_at) VALUES
    (v_btc_id, 97200,  '2026-01-20 16:00:00-05'),
    (v_btc_id, 98500,  '2026-01-22 16:00:00-05'),
    (v_btc_id, 99800,  '2026-01-24 16:00:00-05'),
    (v_btc_id, 101500, '2026-01-27 16:00:00-05'),
    (v_btc_id, 98400,  '2026-01-31 16:00:00-05'),
    (v_btc_id, 100200, '2026-02-03 16:00:00-05'),
    (v_btc_id, 103800, '2026-02-07 16:00:00-05'),
    (v_btc_id, 104500, '2026-02-10 12:00:00-05');

  -- ETH price history
  INSERT INTO prediction.target_snapshots (target_id, value, captured_at) VALUES
    (v_eth_id, 2780, '2026-01-20 16:00:00-05'),
    (v_eth_id, 2850, '2026-01-24 16:00:00-05'),
    (v_eth_id, 2890, '2026-01-28 16:00:00-05'),
    (v_eth_id, 2920, '2026-01-27 16:00:00-05'),
    (v_eth_id, 2760, '2026-01-31 16:00:00-05'),
    (v_eth_id, 2880, '2026-02-03 16:00:00-05'),
    (v_eth_id, 3050, '2026-02-07 16:00:00-05'),
    (v_eth_id, 3120, '2026-02-10 12:00:00-05');

  -- TSLA price history
  INSERT INTO prediction.target_snapshots (target_id, value, captured_at) VALUES
    (v_tsla_id, 392.80, '2026-01-20 16:00:00-05'),
    (v_tsla_id, 398.50, '2026-01-24 16:00:00-05'),
    (v_tsla_id, 405.20, '2026-01-27 16:00:00-05'),
    (v_tsla_id, 388.60, '2026-01-31 16:00:00-05'),
    (v_tsla_id, 396.40, '2026-02-03 16:00:00-05'),
    (v_tsla_id, 412.80, '2026-02-07 16:00:00-05'),
    (v_tsla_id, 408.50, '2026-02-10 12:00:00-05');

  -- MSFT price history
  INSERT INTO prediction.target_snapshots (target_id, value, captured_at) VALUES
    (v_msft_id, 432.60, '2026-01-20 16:00:00-05'),
    (v_msft_id, 436.80, '2026-01-24 16:00:00-05'),
    (v_msft_id, 440.20, '2026-01-27 16:00:00-05'),
    (v_msft_id, 437.50, '2026-01-31 16:00:00-05'),
    (v_msft_id, 439.60, '2026-02-03 16:00:00-05'),
    (v_msft_id, 443.90, '2026-02-07 16:00:00-05'),
    (v_msft_id, 445.20, '2026-02-10 12:00:00-05');

  -- SOL price history
  INSERT INTO prediction.target_snapshots (target_id, value, captured_at) VALUES
    (v_sol_id, 208.40, '2026-01-20 16:00:00-05'),
    (v_sol_id, 215.60, '2026-01-24 16:00:00-05'),
    (v_sol_id, 221.30, '2026-01-27 16:00:00-05'),
    (v_sol_id, 212.80, '2026-01-31 16:00:00-05'),
    (v_sol_id, 218.50, '2026-02-03 16:00:00-05'),
    (v_sol_id, 222.40, '2026-02-05 16:00:00-05'),
    (v_sol_id, 226.40, '2026-02-07 16:00:00-05'),
    (v_sol_id, 228.90, '2026-02-10 12:00:00-05');

  -- META price history
  INSERT INTO prediction.target_snapshots (target_id, value, captured_at) VALUES
    (v_meta_id, 632.40, '2026-01-20 16:00:00-05'),
    (v_meta_id, 628.50, '2026-01-24 16:00:00-05'),
    (v_meta_id, 625.80, '2026-01-27 16:00:00-05'),
    (v_meta_id, 618.20, '2026-01-31 16:00:00-05'),
    (v_meta_id, 618.80, '2026-02-06 16:00:00-05'),
    (v_meta_id, 622.40, '2026-02-03 16:00:00-05'),
    (v_meta_id, 616.50, '2026-02-07 16:00:00-05'),
    (v_meta_id, 614.80, '2026-02-10 12:00:00-05');

  -- ========================================================================
  -- STEP 3: Insert analyst positions
  -- ========================================================================

  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  -- EVENT 1: Jan 20 — NVDA Breakout (entry 136.50)
  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  -- Fundamental Fred: all 3 forks closed at 140.20 on Jan 24
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, exit_price, unrealized_pnl, realized_pnl, fork_type, status, opened_at, closed_at)
  VALUES
    (v_fred_user_pf, v_nvda_id, 'NVDA', 'long', 550, 136.50, 140.20, 140.20, 0, 2035.00, 'user', 'closed', '2026-01-20 10:30:00-05', '2026-01-24 15:30:00-05'),
    (v_fred_ai_pf,   v_nvda_id, 'NVDA', 'long', 730, 136.50, 140.20, 140.20, 0, 2701.00, 'ai',   'closed', '2026-01-20 10:30:00-05', '2026-01-24 15:30:00-05'),
    (v_fred_arb_pf,  v_nvda_id, 'NVDA', 'long', 650, 136.50, 140.20, 140.20, 0, 2405.00, 'arbitrator', 'closed', '2026-01-20 10:30:00-05', '2026-01-24 15:30:00-05');

  -- Technical Tina: user closed Jan 27 at 142.80, ai still open, arb closed Jan 27
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, exit_price, unrealized_pnl, realized_pnl, fork_type, status, opened_at, closed_at)
  VALUES
    (v_tina_user_pf, v_nvda_id, 'NVDA', 'long', 1100, 136.50, 142.80, 142.80, 0, 6930.00, 'user', 'closed', '2026-01-20 10:30:00-05', '2026-01-27 15:30:00-05'),
    (v_tina_arb_pf,  v_nvda_id, 'NVDA', 'long', 1100, 136.50, 142.80, 142.80, 0, 6930.00, 'arbitrator', 'closed', '2026-01-20 10:30:00-05', '2026-01-27 15:30:00-05');
  -- Tina AI: still open
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, fork_type, status, opened_at)
  VALUES
    (v_tina_ai_pf, v_nvda_id, 'NVDA', 'long', 1100, 136.50, 145.80, 10230.00, 'ai', 'open', '2026-01-20 10:30:00-05');

  -- Aggressive Alex: all 3 forks still open
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, fork_type, status, opened_at)
  VALUES
    (v_alex_user_pf, v_nvda_id, 'NVDA', 'long', 1100, 136.50, 145.80, 10230.00, 'user', 'open', '2026-01-20 10:30:00-05'),
    (v_alex_ai_pf,   v_nvda_id, 'NVDA', 'long', 1100, 136.50, 145.80, 10230.00, 'ai',   'open', '2026-01-20 10:30:00-05'),
    (v_alex_arb_pf,  v_nvda_id, 'NVDA', 'long', 1100, 136.50, 145.80, 10230.00, 'arbitrator', 'open', '2026-01-20 10:30:00-05');

  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  -- EVENT 2: Jan 22 — BTC Rally (entry 98500)
  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  -- Sentiment Sally: all 3 forks closed at 101500 on Jan 27
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, exit_price, unrealized_pnl, realized_pnl, fork_type, status, opened_at, closed_at)
  VALUES
    (v_sally_user_pf, v_btc_id, 'BTC', 'long', 0.55, 98500, 101500, 101500, 0, 1650.00, 'user', 'closed', '2026-01-22 14:00:00-05', '2026-01-27 14:00:00-05'),
    (v_sally_ai_pf,   v_btc_id, 'BTC', 'long', 0.80, 98500, 101500, 101500, 0, 2400.00, 'ai',   'closed', '2026-01-22 14:00:00-05', '2026-01-27 14:00:00-05'),
    (v_sally_arb_pf,  v_btc_id, 'BTC', 'long', 0.65, 98500, 101500, 101500, 0, 1950.00, 'arbitrator', 'closed', '2026-01-22 14:00:00-05', '2026-01-27 14:00:00-05');

  -- Cautious Carl: user long closed Jan 24, ai SHORT closed Jan 24, arb long closed Jan 24
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, exit_price, unrealized_pnl, realized_pnl, fork_type, status, opened_at, closed_at)
  VALUES
    (v_carl_user_pf, v_btc_id, 'BTC', 'long',  0.30, 98500, 99800, 99800, 0, 390.00,  'user', 'closed', '2026-01-22 14:00:00-05', '2026-01-24 14:00:00-05'),
    (v_carl_ai_pf,   v_btc_id, 'BTC', 'short', 0.25, 98500, 99800, 99800, 0, -325.00, 'ai',   'closed', '2026-01-22 14:00:00-05', '2026-01-24 14:00:00-05'),
    (v_carl_arb_pf,  v_btc_id, 'BTC', 'long',  0.20, 98500, 99800, 99800, 0, 260.00,  'arbitrator', 'closed', '2026-01-22 14:00:00-05', '2026-01-24 14:00:00-05');

  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  -- EVENT 3: Jan 27 — AAPL Earnings (entry 241.60)
  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  -- Fundamental Fred
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, exit_price, unrealized_pnl, realized_pnl, fork_type, status, opened_at, closed_at)
  VALUES
    (v_fred_user_pf, v_aapl_id, 'AAPL', 'long', 420, 241.60, 239.80, 239.80, 0, -756.00,  'user', 'closed', '2026-01-27 10:00:00-05', '2026-01-31 15:30:00-05'),
    (v_fred_ai_pf,   v_aapl_id, 'AAPL', 'long', 420, 241.60, 244.50, 244.50, 0, 1218.00,  'ai',   'closed', '2026-01-27 10:00:00-05', '2026-02-07 15:30:00-05'),
    (v_fred_arb_pf,  v_aapl_id, 'AAPL', 'long', 420, 241.60, 242.30, 242.30, 0, 294.00,   'arbitrator', 'closed', '2026-01-27 10:00:00-05', '2026-02-03 15:30:00-05');

  -- Technical Tina: user short (won), ai short (lost), arb long (won)
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, exit_price, unrealized_pnl, realized_pnl, fork_type, status, opened_at, closed_at)
  VALUES
    (v_tina_user_pf, v_aapl_id, 'AAPL', 'short', 300, 241.60, 239.80, 239.80, 0, 540.00,  'user', 'closed', '2026-01-27 10:00:00-05', '2026-01-31 15:30:00-05'),
    (v_tina_ai_pf,   v_aapl_id, 'AAPL', 'short', 350, 241.60, 242.30, 242.30, 0, -245.00, 'ai',   'closed', '2026-01-27 10:00:00-05', '2026-02-03 15:30:00-05'),
    (v_tina_arb_pf,  v_aapl_id, 'AAPL', 'long',  280, 241.60, 243.20, 243.20, 0, 448.00,  'arbitrator', 'closed', '2026-01-27 10:00:00-05', '2026-02-10 12:00:00-05');

  -- Sentiment Sally: user closed, ai open, arb open
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, exit_price, unrealized_pnl, realized_pnl, fork_type, status, opened_at, closed_at)
  VALUES
    (v_sally_user_pf, v_aapl_id, 'AAPL', 'long', 380, 241.60, 243.20, 243.20, 0, 608.00, 'user', 'closed', '2026-01-27 10:00:00-05', '2026-02-10 12:00:00-05');
  -- Sally AI and Arb: still open on AAPL
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, fork_type, status, opened_at)
  VALUES
    (v_sally_ai_pf,  v_aapl_id, 'AAPL', 'long', 450, 241.60, 243.20, 720.00, 'ai',        'open', '2026-01-27 10:00:00-05'),
    (v_sally_arb_pf, v_aapl_id, 'AAPL', 'long', 400, 241.60, 243.20, 640.00, 'arbitrator', 'open', '2026-01-27 10:00:00-05');

  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  -- EVENT 4: Jan 28 — ETH Upgrade (entry 2890)
  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  -- Aggressive Alex: all 3 forks open
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, fork_type, status, opened_at)
  VALUES
    (v_alex_user_pf, v_eth_id, 'ETH', 'long', 35, 2890, 3120, 8050.00,  'user',       'open', '2026-01-28 11:00:00-05'),
    (v_alex_ai_pf,   v_eth_id, 'ETH', 'long', 50, 2890, 3120, 11500.00, 'ai',         'open', '2026-01-28 11:00:00-05'),
    (v_alex_arb_pf,  v_eth_id, 'ETH', 'long', 40, 2890, 3120, 9200.00,  'arbitrator', 'open', '2026-01-28 11:00:00-05');

  -- Cautious Carl: user long closed (loss), ai short closed (win), arb long closed (win)
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, exit_price, unrealized_pnl, realized_pnl, fork_type, status, opened_at, closed_at)
  VALUES
    (v_carl_user_pf, v_eth_id, 'ETH', 'long',  15, 2890, 2760, 2760, 0, -1950.00, 'user', 'closed', '2026-01-28 11:00:00-05', '2026-01-31 15:00:00-05'),
    (v_carl_ai_pf,   v_eth_id, 'ETH', 'short', 10, 2890, 2760, 2760, 0, 1300.00,  'ai',   'closed', '2026-01-28 11:00:00-05', '2026-01-31 15:00:00-05'),
    (v_carl_arb_pf,  v_eth_id, 'ETH', 'long',  12, 2890, 3050, 3050, 0, 1920.00,  'arbitrator', 'closed', '2026-01-28 11:00:00-05', '2026-02-07 15:00:00-05');

  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  -- EVENT 5: Jan 31 — TSLA Dip Buy (entry 388.60)
  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  -- Aggressive Alex: user & ai closed (win), arb open
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, exit_price, unrealized_pnl, realized_pnl, fork_type, status, opened_at, closed_at)
  VALUES
    (v_alex_user_pf, v_tsla_id, 'TSLA', 'long', 260, 388.60, 412.80, 412.80, 0, 6292.00, 'user', 'closed', '2026-01-31 10:30:00-05', '2026-02-07 15:30:00-05'),
    (v_alex_ai_pf,   v_tsla_id, 'TSLA', 'long', 380, 388.60, 412.80, 412.80, 0, 9196.00, 'ai',   'closed', '2026-01-31 10:30:00-05', '2026-02-07 15:30:00-05');
  -- Alex arb: open
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, fork_type, status, opened_at)
  VALUES
    (v_alex_arb_pf, v_tsla_id, 'TSLA', 'long', 300, 388.60, 408.50, 5970.00, 'arbitrator', 'open', '2026-01-31 10:30:00-05');

  -- Cautious Carl: user short (loss), ai short (loss), arb long (open)
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, exit_price, unrealized_pnl, realized_pnl, fork_type, status, opened_at, closed_at)
  VALUES
    (v_carl_user_pf, v_tsla_id, 'TSLA', 'short', 80,  388.60, 396.40, 396.40, 0, -624.00, 'user', 'closed', '2026-01-31 10:30:00-05', '2026-02-03 15:30:00-05'),
    (v_carl_ai_pf,   v_tsla_id, 'TSLA', 'short', 100, 388.60, 396.40, 396.40, 0, -780.00, 'ai',   'closed', '2026-01-31 10:30:00-05', '2026-02-03 15:30:00-05');
  -- Carl arb: open long
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, fork_type, status, opened_at)
  VALUES
    (v_carl_arb_pf, v_tsla_id, 'TSLA', 'long', 60, 388.60, 408.50, 1194.00, 'arbitrator', 'open', '2026-01-31 10:30:00-05');

  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  -- EVENT 6: Feb 3 — MSFT AI Growth (entry 439.60)
  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  -- Fundamental Fred: all 3 forks open
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, fork_type, status, opened_at)
  VALUES
    (v_fred_user_pf, v_msft_id, 'MSFT', 'long', 230, 439.60, 445.20, 1288.00, 'user',       'open', '2026-02-03 10:00:00-05'),
    (v_fred_ai_pf,   v_msft_id, 'MSFT', 'long', 340, 439.60, 445.20, 1904.00, 'ai',         'open', '2026-02-03 10:00:00-05'),
    (v_fred_arb_pf,  v_msft_id, 'MSFT', 'long', 280, 439.60, 445.20, 1568.00, 'arbitrator', 'open', '2026-02-03 10:00:00-05');

  -- Sentiment Sally: all 3 forks open
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, fork_type, status, opened_at)
  VALUES
    (v_sally_user_pf, v_msft_id, 'MSFT', 'long', 200, 439.60, 445.20, 1120.00, 'user',       'open', '2026-02-03 10:00:00-05'),
    (v_sally_ai_pf,   v_msft_id, 'MSFT', 'long', 250, 439.60, 445.20, 1400.00, 'ai',         'open', '2026-02-03 10:00:00-05'),
    (v_sally_arb_pf,  v_msft_id, 'MSFT', 'long', 220, 439.60, 445.20, 1232.00, 'arbitrator', 'open', '2026-02-03 10:00:00-05');

  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  -- EVENT 7: Feb 5 — SOL Momentum (entry 222.40)
  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  -- Technical Tina: all 3 forks open
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, fork_type, status, opened_at)
  VALUES
    (v_tina_user_pf, v_sol_id, 'SOL', 'long', 350, 222.40, 228.90, 2275.00, 'user',       'open', '2026-02-05 11:00:00-05'),
    (v_tina_ai_pf,   v_sol_id, 'SOL', 'long', 450, 222.40, 228.90, 2925.00, 'ai',         'open', '2026-02-05 11:00:00-05'),
    (v_tina_arb_pf,  v_sol_id, 'SOL', 'long', 400, 222.40, 228.90, 2600.00, 'arbitrator', 'open', '2026-02-05 11:00:00-05');

  -- Aggressive Alex: all 3 forks open
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, fork_type, status, opened_at)
  VALUES
    (v_alex_user_pf, v_sol_id, 'SOL', 'long', 500, 222.40, 228.90, 3250.00, 'user',       'open', '2026-02-05 11:00:00-05'),
    (v_alex_ai_pf,   v_sol_id, 'SOL', 'long', 650, 222.40, 228.90, 4225.00, 'ai',         'open', '2026-02-05 11:00:00-05'),
    (v_alex_arb_pf,  v_sol_id, 'SOL', 'long', 550, 222.40, 228.90, 3575.00, 'arbitrator', 'open', '2026-02-05 11:00:00-05');

  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  -- EVENT 8: Feb 6 — META Short (entry 618.80)
  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  -- Sentiment Sally: all 3 forks open (short)
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, fork_type, status, opened_at)
  VALUES
    (v_sally_user_pf, v_meta_id, 'META', 'short', 130, 618.80, 614.80, 520.00,  'user',       'open', '2026-02-06 10:30:00-05'),
    (v_sally_ai_pf,   v_meta_id, 'META', 'short', 180, 618.80, 614.80, 720.00,  'ai',         'open', '2026-02-06 10:30:00-05'),
    (v_sally_arb_pf,  v_meta_id, 'META', 'short', 150, 618.80, 614.80, 600.00,  'arbitrator', 'open', '2026-02-06 10:30:00-05');

  -- Cautious Carl: all 3 forks open (short)
  INSERT INTO prediction.analyst_positions
    (portfolio_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, fork_type, status, opened_at)
  VALUES
    (v_carl_user_pf, v_meta_id, 'META', 'short', 100, 618.80, 614.80, 400.00, 'user',       'open', '2026-02-06 10:30:00-05'),
    (v_carl_ai_pf,   v_meta_id, 'META', 'short', 80,  618.80, 614.80, 320.00, 'ai',         'open', '2026-02-06 10:30:00-05'),
    (v_carl_arb_pf,  v_meta_id, 'META', 'short', 90,  618.80, 614.80, 360.00, 'arbitrator', 'open', '2026-02-06 10:30:00-05');

  -- ========================================================================
  -- STEP 4: Update analyst portfolio balances
  -- ========================================================================
  -- Formula: current_balance = initial_balance + realized_pnl + unrealized_pnl

  -- Fundamental Fred
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 + 2035 - 756 + 1288, total_realized_pnl = 2035 - 756, total_unrealized_pnl = 1288,
    win_count = 1, loss_count = 1
  WHERE id = v_fred_user_pf;
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 + 2701 + 1218 + 1904, total_realized_pnl = 2701 + 1218, total_unrealized_pnl = 1904,
    win_count = 2, loss_count = 0
  WHERE id = v_fred_ai_pf;
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 + 2405 + 294 + 1568, total_realized_pnl = 2405 + 294, total_unrealized_pnl = 1568,
    win_count = 2, loss_count = 0
  WHERE id = v_fred_arb_pf;

  -- Technical Tina
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 + 6930 + 540 + 2275, total_realized_pnl = 6930 + 540, total_unrealized_pnl = 2275,
    win_count = 2, loss_count = 0
  WHERE id = v_tina_user_pf;
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 - 245 + 10230 + 2925, total_realized_pnl = -245, total_unrealized_pnl = 10230 + 2925,
    win_count = 0, loss_count = 1
  WHERE id = v_tina_ai_pf;
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 + 6930 + 448 + 2600, total_realized_pnl = 6930 + 448, total_unrealized_pnl = 2600,
    win_count = 2, loss_count = 0
  WHERE id = v_tina_arb_pf;

  -- Sentiment Sally
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 + 1650 + 608 + 1120 + 520, total_realized_pnl = 1650 + 608, total_unrealized_pnl = 1120 + 520,
    win_count = 2, loss_count = 0
  WHERE id = v_sally_user_pf;
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 + 2400 + 720 + 1400 + 720, total_realized_pnl = 2400, total_unrealized_pnl = 720 + 1400 + 720,
    win_count = 1, loss_count = 0
  WHERE id = v_sally_ai_pf;
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 + 1950 + 640 + 1232 + 600, total_realized_pnl = 1950, total_unrealized_pnl = 640 + 1232 + 600,
    win_count = 1, loss_count = 0
  WHERE id = v_sally_arb_pf;

  -- Aggressive Alex
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 + 6292 + 10230 + 8050 + 3250, total_realized_pnl = 6292, total_unrealized_pnl = 10230 + 8050 + 3250,
    win_count = 1, loss_count = 0
  WHERE id = v_alex_user_pf;
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 + 9196 + 10230 + 11500 + 4225, total_realized_pnl = 9196, total_unrealized_pnl = 10230 + 11500 + 4225,
    win_count = 1, loss_count = 0
  WHERE id = v_alex_ai_pf;
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 + 10230 + 9200 + 5970 + 3575, total_realized_pnl = 0, total_unrealized_pnl = 10230 + 9200 + 5970 + 3575,
    win_count = 0, loss_count = 0
  WHERE id = v_alex_arb_pf;

  -- Cautious Carl
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 + 390 - 1950 - 624 + 400, total_realized_pnl = 390 - 1950 - 624, total_unrealized_pnl = 400,
    win_count = 1, loss_count = 2
  WHERE id = v_carl_user_pf;
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 - 325 + 1300 - 780 + 320, total_realized_pnl = -325 + 1300 - 780, total_unrealized_pnl = 320,
    win_count = 1, loss_count = 2
  WHERE id = v_carl_ai_pf;
  UPDATE prediction.analyst_portfolios SET
    current_balance = 1000000 + 260 + 1920 + 1194 + 360, total_realized_pnl = 260 + 1920, total_unrealized_pnl = 1194 + 360,
    win_count = 2, loss_count = 0
  WHERE id = v_carl_arb_pf;

  -- ========================================================================
  -- STEP 5: Insert user positions (if user exists)
  -- ========================================================================

  IF v_user_pf IS NOT NULL THEN

    -- Create stub predictions for user positions (user_positions.prediction_id is NOT NULL)
    DECLARE
      v_pred_nvda UUID;
      v_pred_btc  UUID;
      v_pred_aapl UUID;
      v_pred_eth  UUID;
      v_pred_msft UUID;
      v_pred_meta UUID;
    BEGIN

    INSERT INTO prediction.predictions
      (target_id, direction, confidence, reasoning, timeframe_hours, predicted_at, expires_at, entry_price, analyst_ensemble, llm_ensemble, status, is_test)
    VALUES
      (v_nvda_id, 'up',   0.85, 'NVDA breakout above resistance, AI spending cycle accelerating', 168, '2026-01-20 10:00:00-05', '2026-01-27 10:00:00-05', 136.50, '{"seed": true}'::jsonb, '{"seed": true}'::jsonb, 'resolved', false)
    RETURNING id INTO v_pred_nvda;

    INSERT INTO prediction.predictions
      (target_id, direction, confidence, reasoning, timeframe_hours, predicted_at, expires_at, entry_price, analyst_ensemble, llm_ensemble, status, is_test)
    VALUES
      (v_btc_id, 'up', 0.80, 'BTC institutional flows strong, pushing toward 100K+', 168, '2026-01-22 14:00:00-05', '2026-01-29 14:00:00-05', 98500, '{"seed": true}'::jsonb, '{"seed": true}'::jsonb, 'resolved', false)
    RETURNING id INTO v_pred_btc;

    INSERT INTO prediction.predictions
      (target_id, direction, confidence, reasoning, timeframe_hours, predicted_at, expires_at, entry_price, analyst_ensemble, llm_ensemble, status, is_test)
    VALUES
      (v_aapl_id, 'up', 0.72, 'AAPL mixed earnings signals, slight bullish lean', 336, '2026-01-27 10:00:00-05', '2026-02-10 10:00:00-05', 241.60, '{"seed": true}'::jsonb, '{"seed": true}'::jsonb, 'active', false)
    RETURNING id INTO v_pred_aapl;

    INSERT INTO prediction.predictions
      (target_id, direction, confidence, reasoning, timeframe_hours, predicted_at, expires_at, entry_price, analyst_ensemble, llm_ensemble, status, is_test)
    VALUES
      (v_eth_id, 'up', 0.78, 'ETH network upgrade imminent, developer activity surging', 336, '2026-01-28 11:00:00-05', '2026-02-11 11:00:00-05', 2890, '{"seed": true}'::jsonb, '{"seed": true}'::jsonb, 'active', false)
    RETURNING id INTO v_pred_eth;

    INSERT INTO prediction.predictions
      (target_id, direction, confidence, reasoning, timeframe_hours, predicted_at, expires_at, entry_price, analyst_ensemble, llm_ensemble, status, is_test)
    VALUES
      (v_msft_id, 'up', 0.82, 'Azure AI revenue beat expectations, MSFT breaking out above 440', 336, '2026-02-03 10:00:00-05', '2026-02-17 10:00:00-05', 439.60, '{"seed": true}'::jsonb, '{"seed": true}'::jsonb, 'active', false)
    RETURNING id INTO v_pred_msft;

    INSERT INTO prediction.predictions
      (target_id, direction, confidence, reasoning, timeframe_hours, predicted_at, expires_at, entry_price, analyst_ensemble, llm_ensemble, status, is_test)
    VALUES
      (v_meta_id, 'down', 0.75, 'EU regulation news hitting META, sentiment turning negative', 336, '2026-02-06 10:00:00-05', '2026-02-20 10:00:00-05', 618.80, '{"seed": true}'::jsonb, '{"seed": true}'::jsonb, 'active', false)
    RETURNING id INTO v_pred_meta;

    -- Now insert user positions with prediction references

    -- Event 1: NVDA long, closed Feb 7
    INSERT INTO prediction.user_positions
      (portfolio_id, prediction_id, target_id, symbol, direction, quantity, entry_price, current_price, exit_price, unrealized_pnl, realized_pnl, status, opened_at, closed_at)
    VALUES
      (v_user_pf, v_pred_nvda, v_nvda_id, 'NVDA', 'long', 400, 136.50, 144.30, 144.30, 0, 3120.00, 'closed', '2026-01-20 10:30:00-05', '2026-02-07 15:30:00-05');

    -- Event 2: BTC long, closed Feb 7
    INSERT INTO prediction.user_positions
      (portfolio_id, prediction_id, target_id, symbol, direction, quantity, entry_price, current_price, exit_price, unrealized_pnl, realized_pnl, status, opened_at, closed_at)
    VALUES
      (v_user_pf, v_pred_btc, v_btc_id, 'BTC', 'long', 0.50, 98500, 103800, 103800, 0, 2650.00, 'closed', '2026-01-22 14:00:00-05', '2026-02-07 14:00:00-05');

    -- Event 3: AAPL long, open
    INSERT INTO prediction.user_positions
      (portfolio_id, prediction_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, status, opened_at)
    VALUES
      (v_user_pf, v_pred_aapl, v_aapl_id, 'AAPL', 'long', 250, 241.60, 243.20, 400.00, 'open', '2026-01-27 10:00:00-05');

    -- Event 4: ETH long, open
    INSERT INTO prediction.user_positions
      (portfolio_id, prediction_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, status, opened_at)
    VALUES
      (v_user_pf, v_pred_eth, v_eth_id, 'ETH', 'long', 20, 2890, 3120, 4600.00, 'open', '2026-01-28 11:00:00-05');

    -- Event 6: MSFT long, open
    INSERT INTO prediction.user_positions
      (portfolio_id, prediction_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, status, opened_at)
    VALUES
      (v_user_pf, v_pred_msft, v_msft_id, 'MSFT', 'long', 150, 439.60, 445.20, 840.00, 'open', '2026-02-03 10:00:00-05');

    -- Event 8: META short, open
    INSERT INTO prediction.user_positions
      (portfolio_id, prediction_id, target_id, symbol, direction, quantity, entry_price, current_price, unrealized_pnl, status, opened_at)
    VALUES
      (v_user_pf, v_pred_meta, v_meta_id, 'META', 'short', 100, 618.80, 614.80, 400.00, 'open', '2026-02-06 10:30:00-05');

    -- Update user portfolio balance
    UPDATE prediction.user_portfolios SET
      current_balance = 1000000 + 3120 + 2650 + 400 + 4600 + 840 + 400,
      total_realized_pnl = 3120 + 2650,
      total_unrealized_pnl = 400 + 4600 + 840 + 400
    WHERE id = v_user_pf;

    END; -- end inner DECLARE block

  END IF;

  -- ========================================================================
  -- STEP 6: Verification
  -- ========================================================================
  RAISE NOTICE 'Seed data complete:';
  RAISE NOTICE '  - Target snapshots inserted for 8 instruments';
  RAISE NOTICE '  - Analyst positions inserted across 8 trade events';
  RAISE NOTICE '  - Portfolio balances updated for all 15 analyst/fork combos';
  IF v_user_pf IS NOT NULL THEN
    RAISE NOTICE '  - User portfolio created with 6 positions';
  ELSE
    RAISE NOTICE '  - No auth user found; user portfolio skipped';
  END IF;

END $$;

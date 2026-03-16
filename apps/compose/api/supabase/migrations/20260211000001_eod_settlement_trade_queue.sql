-- ============================================================================
-- Migration: EOD Settlement - Trade Queue & Settlement Log
-- ============================================================================
-- Adds two tables to support end-of-day batch trading:
-- 1. user_trade_queue: Users queue trades during the day, executed at EOD
-- 2. eod_settlement_log: Daily settlement summary for review/learning
-- ============================================================================

-- ============================================================================
-- Table 1: User Trade Queue
-- ============================================================================
-- During the day, users queue trades (instead of executing immediately).
-- At 5 PM ET the EOD Settlement Runner processes all pending entries,
-- creating user_positions at the closing price.
-- ============================================================================

CREATE TABLE prediction.user_trade_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id UUID NOT NULL,
  org_slug TEXT NOT NULL,
  portfolio_id UUID NOT NULL REFERENCES prediction.user_portfolios(id) ON DELETE CASCADE,

  -- Prediction reference
  prediction_id UUID NOT NULL REFERENCES prediction.predictions(id) ON DELETE CASCADE,

  -- Target reference
  target_id UUID NOT NULL,
  symbol TEXT NOT NULL,

  -- Trade details (locked at queue time)
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  quantity NUMERIC(20,8) NOT NULL CHECK (quantity > 0),

  -- Status
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'executed', 'cancelled')),

  -- Execution result (populated by EOD runner)
  executed_position_id UUID REFERENCES prediction.user_positions(id),
  execution_price NUMERIC(20,8),
  executed_at TIMESTAMPTZ,

  -- Timestamps
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup for EOD runner: all pending trades
CREATE INDEX idx_user_trade_queue_pending
  ON prediction.user_trade_queue(status)
  WHERE status = 'queued';

-- Fast lookup for user's queue view
CREATE INDEX idx_user_trade_queue_user
  ON prediction.user_trade_queue(user_id, org_slug, status);

-- Chronological ordering
CREATE INDEX idx_user_trade_queue_queued_at
  ON prediction.user_trade_queue(queued_at DESC);

-- ============================================================================
-- Table 2: EOD Settlement Log
-- ============================================================================
-- One row per trading day. Captures what happened during settlement
-- for next-morning review and learning.
-- ============================================================================

CREATE TABLE prediction.eod_settlement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Settlement date (one per day)
  settlement_date DATE NOT NULL UNIQUE,

  -- Step 1: User trade queue execution
  queued_trades_executed INTEGER NOT NULL DEFAULT 0,

  -- Step 2: Analyst position creation
  analyst_positions_created INTEGER NOT NULL DEFAULT 0,

  -- Step 3: Prediction resolution & position closing
  predictions_resolved INTEGER NOT NULL DEFAULT 0,
  positions_closed INTEGER NOT NULL DEFAULT 0,

  -- Step 4: Unrealized P&L updates
  unrealized_pnl_updated INTEGER NOT NULL DEFAULT 0,

  -- P&L summary
  total_realized_pnl NUMERIC(20,8) NOT NULL DEFAULT 0,

  -- Errors (array of error messages)
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_eod_settlement_log_date
  ON prediction.eod_settlement_log(settlement_date DESC);

/**
 * Portfolio interfaces for tracking P&L and positions
 * Supports both user portfolios and analyst portfolios (with dual forks)
 */

/**
 * Fork type for analyst context versioning
 * - user: User-maintained context section
 * - ai: AI-maintained context section (self-improving)
 * - arbitrator: Combines both sections, makes final call
 */
export type ForkType = 'user' | 'ai' | 'arbitrator';

/**
 * Context mode for predictions - which context produced the prediction
 */
export type ContextMode = 'user' | 'ai' | 'arbitrator' | 'combined';

/**
 * Position sizing configuration tier
 */
export interface PositionSizingConfig {
  id: string;
  org_slug: string;
  tier_name: string;
  min_confidence: number;
  max_confidence: number;
  position_percent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Portfolio status for agent fork (motivation system)
 */
export type PortfolioStatus = 'active' | 'warning' | 'probation' | 'suspended';

/**
 * Position direction
 */
export type PositionDirection = 'long' | 'short';

/**
 * Position status
 */
export type PositionStatus = 'open' | 'closed';

/**
 * Changed by options for context versioning
 */
export type ChangedBy = 'system' | 'user' | 'learning_loop' | 'agent_self';

/**
 * Analyst context version - tracks version history for analyst contexts
 * Supports forked model: user fork vs agent fork
 */
export interface AnalystContextVersion {
  id: string;
  analyst_id: string;
  fork_type: ForkType;
  version_number: number;
  perspective: string;
  tier_instructions: Record<string, string | undefined>;
  default_weight: number;
  agent_journal?: string; // Only for agent fork
  change_reason?: string;
  changed_by: ChangedBy;
  is_current: boolean;
  created_at: string;
}

/**
 * Runner context version - tracks version history for prediction runner configuration
 */
export interface RunnerContextVersion {
  id: string;
  runner_type: string;
  version_number: number;
  context: string;
  model_config?: Record<string, unknown>;
  learning_config?: Record<string, unknown>;
  risk_profile?: string;
  change_reason?: string;
  changed_by: ChangedBy;
  is_current: boolean;
  created_at: string;
}

/**
 * Universe context version - tracks version history for universe configuration
 */
export interface UniverseContextVersion {
  id: string;
  universe_id: string;
  version_number: number;
  description: string;
  llm_config?: Record<string, unknown>;
  thresholds?: Record<string, unknown>;
  change_reason?: string;
  changed_by: ChangedBy;
  is_current: boolean;
  created_at: string;
}

/**
 * Target context version - tracks version history for target configuration
 */
export interface TargetContextVersion {
  id: string;
  target_id: string;
  version_number: number;
  context?: string;
  metadata?: Record<string, unknown>;
  llm_config_override?: Record<string, unknown>;
  change_reason?: string;
  changed_by: ChangedBy;
  is_current: boolean;
  created_at: string;
}

/**
 * Analyst portfolio - tracks P&L for an analyst fork
 */
export interface AnalystPortfolio {
  id: string;
  analyst_id: string;
  fork_type: ForkType;
  initial_balance: number;
  current_balance: number;
  total_realized_pnl: number;
  total_unrealized_pnl: number;
  win_count: number;
  loss_count: number;
  status: PortfolioStatus;
  status_changed_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Analyst position - individual trade position for analyst
 */
export interface AnalystPosition {
  id: string;
  portfolio_id: string;
  analyst_assessment_id?: string;
  prediction_id?: string;
  target_id: string;
  symbol: string;
  direction: PositionDirection;
  quantity: number;
  entry_price: number;
  current_price: number;
  exit_price?: number;
  unrealized_pnl: number;
  realized_pnl?: number;
  is_paper_only: boolean;
  status: PositionStatus;
  opened_at: string;
  closed_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * User portfolio - tracks P&L for user's paper trading
 */
export interface UserPortfolio {
  id: string;
  user_id: string;
  org_slug: string;
  initial_balance: number;
  current_balance: number;
  total_realized_pnl: number;
  total_unrealized_pnl: number;
  created_at: string;
  updated_at: string;
}

/**
 * User position - individual trade position for user
 */
export interface UserPosition {
  id: string;
  portfolio_id: string;
  prediction_id: string;
  target_id: string;
  symbol: string;
  direction: PositionDirection;
  quantity: number;
  entry_price: number;
  current_price: number;
  exit_price?: number;
  unrealized_pnl: number;
  realized_pnl?: number;
  status: PositionStatus;
  opened_at: string;
  closed_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Analyst performance metrics - daily tracking
 */
export interface AnalystPerformanceMetrics {
  id: string;
  analyst_id: string;
  fork_type: ForkType;
  metric_date: string;
  solo_pnl: number;
  contribution_pnl: number;
  dissent_accuracy?: number;
  dissent_count: number;
  rank_in_portfolio?: number;
  total_analysts?: number;
  created_at: string;
}

/**
 * Agent self-modification log entry
 */
export type ModificationType =
  | 'rule_added'
  | 'rule_removed'
  | 'rule_modified'
  | 'weight_changed'
  | 'journal_entry'
  | 'status_change';

export interface AgentSelfModificationLog {
  id: string;
  analyst_id: string;
  modification_type: ModificationType;
  summary: string;
  details: Record<string, unknown>;
  trigger_reason?: string;
  performance_context?: Record<string, unknown>;
  acknowledged: boolean;
  acknowledged_at?: string;
  created_at: string;
}

/**
 * Analyst adaptation diff - tracks differences between forks
 */
export type AdoptionStatus = 'pending' | 'adopted' | 'rejected' | 'partial';

export interface AnalystAdaptationDiff {
  id: string;
  analyst_id: string;
  user_version_id: string;
  agent_version_id: string;
  diff_summary: string;
  performance_comparison: {
    user_pnl: number;
    agent_pnl: number;
    period: string;
  };
  adoption_status: AdoptionStatus;
  adopted_changes?: Record<string, unknown>;
  created_at: string;
}

/**
 * Fork learning exchange - bidirectional learning dialogue
 */
export type LearningOutcome = 'adopted' | 'rejected' | 'noted' | 'pending';
export type ExchangeInitiator = 'user' | 'ai';

export interface ForkLearningExchange {
  id: string;
  analyst_id: string;
  initiated_by: ExchangeInitiator;
  question: string;
  response?: string;
  context_diff?: Record<string, unknown>;
  performance_evidence?: Record<string, unknown>;
  outcome: LearningOutcome;
  adoption_details?: Record<string, unknown>;
  created_at: string;
}

/**
 * Create position input
 */
export interface CreatePositionInput {
  portfolio_id: string;
  analyst_assessment_id?: string;
  prediction_id?: string;
  target_id: string;
  symbol: string;
  direction: PositionDirection;
  quantity: number;
  entry_price: number;
  is_paper_only?: boolean;
}

/**
 * Create analyst context version input
 */
export interface CreateAnalystContextVersionInput {
  analyst_id: string;
  fork_type: ForkType;
  perspective: string;
  tier_instructions: Record<string, string | undefined>;
  default_weight: number;
  agent_journal?: string;
  change_reason?: string;
  changed_by: ChangedBy;
}

/**
 * P&L calculation result
 */
export interface PnLCalculation {
  unrealized_pnl: number;
  realized_pnl?: number;
  total_pnl: number;
  percent_change: number;
}

/**
 * Trade queue status
 */
export type TradeQueueStatus = 'queued' | 'executed' | 'cancelled';

/**
 * User trade queue entry - queued during the day, executed at EOD
 */
export interface UserTradeQueueEntry {
  id: string;
  user_id: string;
  org_slug: string;
  portfolio_id: string;
  prediction_id: string;
  target_id: string;
  symbol: string;
  direction: PositionDirection;
  quantity: number;
  status: TradeQueueStatus;
  executed_position_id?: string;
  execution_price?: number;
  executed_at?: string;
  queued_at: string;
  cancelled_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * EOD settlement log entry - one per trading day
 */
export interface EodSettlementLogEntry {
  id: string;
  settlement_date: string;
  queued_trades_executed: number;
  analyst_positions_created: number;
  predictions_resolved: number;
  positions_closed: number;
  unrealized_pnl_updated: number;
  total_realized_pnl: number;
  errors: string[];
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
}

/**
 * Input for creating a trade queue entry
 */
export interface CreateTradeQueueInput {
  user_id: string;
  org_slug: string;
  portfolio_id: string;
  prediction_id: string;
  target_id: string;
  symbol: string;
  direction: PositionDirection;
  quantity: number;
}

/**
 * Fork comparison view
 */
export interface AnalystForkComparison {
  analyst_id: string;
  slug: string;
  name: string;
  perspective: string;
  user_balance: number;
  user_realized_pnl: number;
  user_unrealized_pnl: number;
  user_wins: number;
  user_losses: number;
  agent_balance: number;
  agent_realized_pnl: number;
  agent_unrealized_pnl: number;
  agent_wins: number;
  agent_losses: number;
  agent_status: PortfolioStatus;
  arbitrator_balance: number | null;
  arbitrator_realized_pnl: number | null;
  arbitrator_unrealized_pnl: number | null;
  arbitrator_wins: number | null;
  arbitrator_losses: number | null;
  arbitrator_status: PortfolioStatus | null;
  balance_diff: number;
  balance_diff_percent: number;
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  AnalystPortfolio,
  AnalystPosition,
  UserPortfolio,
  UserPosition,
  AnalystContextVersion,
  RunnerContextVersion,
  UniverseContextVersion,
  TargetContextVersion,
  AgentSelfModificationLog,
  AnalystForkComparison,
  AnalystPerformanceMetrics,
  ForkLearningExchange,
  ForkType,
  PositionDirection,
  CreatePositionInput,
  CreateAnalystContextVersionInput,
  ModificationType,
  PositionSizingConfig,
  UserTradeQueueEntry,
  CreateTradeQueueInput,
  EodSettlementLogEntry,
} from '../interfaces/portfolio.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

@Injectable()
export class PortfolioRepository {
  private readonly logger = new Logger(PortfolioRepository.name);
  private readonly schema = 'prediction';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  // =============================================================================
  // POSITION SIZING CONFIG
  // =============================================================================

  /**
   * Get position sizing configuration for an organization
   * Falls back to global defaults (org_slug = '*') if no org-specific config exists
   */
  async getPositionSizingConfig(
    orgSlug: string = '*',
  ): Promise<PositionSizingConfig[]> {
    // First try org-specific config
    const { data: orgConfig, error: orgError } = (await this.db
      .from(this.schema, 'position_sizing_config')
      .select('*')
      .eq('org_slug', orgSlug)
      .eq('is_active', true)
      .order('min_confidence', {
        ascending: true,
      })) as SupabaseSelectListResponse<PositionSizingConfig>;

    if (orgError) {
      this.logger.error(
        `Failed to get position sizing config: ${orgError.message}`,
      );
      throw new Error(
        `Failed to get position sizing config: ${orgError.message}`,
      );
    }

    // If org-specific config exists, use it
    if (orgConfig && orgConfig.length > 0) {
      return orgConfig;
    }

    // Fall back to global defaults
    const { data: globalConfig, error: globalError } = (await this.db
      .from(this.schema, 'position_sizing_config')
      .select('*')
      .eq('org_slug', '*')
      .eq('is_active', true)
      .order('min_confidence', {
        ascending: true,
      })) as SupabaseSelectListResponse<PositionSizingConfig>;

    if (globalError) {
      this.logger.error(
        `Failed to get global position sizing config: ${globalError.message}`,
      );
      throw new Error(
        `Failed to get global position sizing config: ${globalError.message}`,
      );
    }

    return globalConfig ?? [];
  }

  /**
   * Get position percent based on confidence level
   * Uses the tiered config from database
   */
  async getPositionPercentForConfidence(
    confidence: number,
    orgSlug: string = '*',
  ): Promise<number> {
    const config = await this.getPositionSizingConfig(orgSlug);

    // Find the tier that matches the confidence
    for (const tier of config) {
      if (
        confidence >= tier.min_confidence &&
        confidence < tier.max_confidence
      ) {
        return tier.position_percent;
      }
    }

    // If confidence is at or above the highest tier max, use the highest tier
    if (config.length > 0) {
      const highestTier = config[config.length - 1];
      if (highestTier && confidence >= highestTier.min_confidence) {
        return highestTier.position_percent;
      }
    }

    // Default fallback if no config found
    this.logger.warn(
      `No position sizing tier found for confidence ${confidence}, using default 5%`,
    );
    return 0.05;
  }

  // =============================================================================
  // ANALYST PORTFOLIOS
  // =============================================================================

  async getAnalystPortfolio(
    analystId: string,
    forkType: ForkType,
  ): Promise<AnalystPortfolio | null> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_portfolios')
      .select('*')
      .eq('analyst_id', analystId)
      .eq('fork_type', forkType)
      .single()) as SupabaseSelectResponse<AnalystPortfolio>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to get analyst portfolio: ${error.message}`);
      throw new Error(`Failed to get analyst portfolio: ${error.message}`);
    }

    return data;
  }

  async getAllAnalystPortfolios(
    forkType?: ForkType,
  ): Promise<AnalystPortfolio[]> {
    let query = this.db.from(this.schema, 'analyst_portfolios').select('*');

    if (forkType) {
      query = query.eq('fork_type', forkType);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<AnalystPortfolio>;

    if (error) {
      this.logger.error(`Failed to get analyst portfolios: ${error.message}`);
      throw new Error(`Failed to get analyst portfolios: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Create a new analyst portfolio for a specific fork type
   * @param analystId The analyst ID
   * @param forkType The fork type (user or agent)
   * @param initialBalance Initial balance (defaults to $1M)
   */
  async createAnalystPortfolio(
    analystId: string,
    forkType: ForkType,
    initialBalance: number = 1000000,
  ): Promise<AnalystPortfolio> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_portfolios')
      .insert({
        analyst_id: analystId,
        fork_type: forkType,
        initial_balance: initialBalance,
        current_balance: initialBalance,
        total_realized_pnl: 0,
        total_unrealized_pnl: 0,
        win_count: 0,
        loss_count: 0,
        status: 'active',
      })
      .select()
      .single()) as SupabaseSelectResponse<AnalystPortfolio>;

    if (error) {
      this.logger.error(`Failed to create analyst portfolio: ${error.message}`);
      throw new Error(`Failed to create analyst portfolio: ${error.message}`);
    }

    return data!;
  }

  /**
   * Create both user and ai portfolios for an analyst
   * Called when a new analyst is created
   */
  async createAnalystPortfolios(
    analystId: string,
    initialBalance: number = 1000000,
  ): Promise<{
    userPortfolio: AnalystPortfolio;
    aiPortfolio: AnalystPortfolio;
  }> {
    const userPortfolio = await this.createAnalystPortfolio(
      analystId,
      'user',
      initialBalance,
    );
    const aiPortfolio = await this.createAnalystPortfolio(
      analystId,
      'ai',
      initialBalance,
    );

    this.logger.log(
      `Created dual portfolios for analyst ${analystId} with $${initialBalance} initial balance each`,
    );

    return { userPortfolio, aiPortfolio };
  }

  async updateAnalystPortfolioBalance(
    portfolioId: string,
    currentBalance: number,
    unrealizedPnl: number,
  ): Promise<AnalystPortfolio> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_portfolios')
      .update({
        current_balance: currentBalance,
        total_unrealized_pnl: unrealizedPnl,
      })
      .eq('id', portfolioId)
      .select()
      .single()) as SupabaseSelectResponse<AnalystPortfolio>;

    if (error) {
      this.logger.error(
        `Failed to update analyst portfolio balance: ${error.message}`,
      );
      throw new Error(
        `Failed to update analyst portfolio balance: ${error.message}`,
      );
    }

    return data!;
  }

  async recordAnalystTradeResult(
    portfolioId: string,
    realizedPnl: number,
    isWin: boolean,
  ): Promise<AnalystPortfolio> {
    // First get current values
    const { data: current, error: fetchError } = (await this.db
      .from(this.schema, 'analyst_portfolios')
      .select('*')
      .eq('id', portfolioId)
      .single()) as SupabaseSelectResponse<AnalystPortfolio>;

    if (fetchError) {
      throw new Error(`Failed to fetch portfolio: ${fetchError.message}`);
    }

    // Update with new values
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_portfolios')
      .update({
        current_balance: current!.current_balance + realizedPnl,
        total_realized_pnl: current!.total_realized_pnl + realizedPnl,
        win_count: isWin ? current!.win_count + 1 : current!.win_count,
        loss_count: isWin ? current!.loss_count : current!.loss_count + 1,
      })
      .eq('id', portfolioId)
      .select()
      .single()) as SupabaseSelectResponse<AnalystPortfolio>;

    if (error) {
      this.logger.error(
        `Failed to record analyst trade result: ${error.message}`,
      );
      throw new Error(
        `Failed to record analyst trade result: ${error.message}`,
      );
    }

    return data!;
  }

  // =============================================================================
  // ANALYST POSITIONS
  // =============================================================================

  async createAnalystPosition(
    input: CreatePositionInput,
  ): Promise<AnalystPosition> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_positions')
      .insert({
        portfolio_id: input.portfolio_id,
        analyst_assessment_id: input.analyst_assessment_id,
        prediction_id: input.prediction_id,
        target_id: input.target_id,
        symbol: input.symbol,
        direction: input.direction,
        quantity: input.quantity,
        entry_price: input.entry_price,
        current_price: input.entry_price, // Start at entry
        is_paper_only: input.is_paper_only ?? false,
        status: 'open',
      })
      .select()
      .single()) as SupabaseSelectResponse<AnalystPosition>;

    if (error) {
      this.logger.error(`Failed to create analyst position: ${error.message}`);
      throw new Error(`Failed to create analyst position: ${error.message}`);
    }

    return data!;
  }

  async getOpenAnalystPositions(
    portfolioId?: string,
  ): Promise<AnalystPosition[]> {
    let query = this.db
      .from(this.schema, 'analyst_positions')
      .select('*')
      .eq('status', 'open');

    if (portfolioId) {
      query = query.eq('portfolio_id', portfolioId);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<AnalystPosition>;

    if (error) {
      this.logger.error(
        `Failed to get open analyst positions: ${error.message}`,
      );
      throw new Error(`Failed to get open analyst positions: ${error.message}`);
    }

    return data ?? [];
  }

  async getOpenPositionsByTarget(targetId: string): Promise<AnalystPosition[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_positions')
      .select('*')
      .eq('target_id', targetId)
      .eq('status', 'open')) as SupabaseSelectListResponse<AnalystPosition>;

    if (error) {
      this.logger.error(
        `Failed to get open positions by target: ${error.message}`,
      );
      throw new Error(
        `Failed to get open positions by target: ${error.message}`,
      );
    }

    return data ?? [];
  }

  async updateAnalystPositionPrice(
    positionId: string,
    currentPrice: number,
    unrealizedPnl: number,
  ): Promise<AnalystPosition> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_positions')
      .update({
        current_price: currentPrice,
        unrealized_pnl: unrealizedPnl,
      })
      .eq('id', positionId)
      .select()
      .single()) as SupabaseSelectResponse<AnalystPosition>;

    if (error) {
      this.logger.error(
        `Failed to update analyst position price: ${error.message}`,
      );
      throw new Error(
        `Failed to update analyst position price: ${error.message}`,
      );
    }

    return data!;
  }

  async closeAnalystPosition(
    positionId: string,
    exitPrice: number,
    realizedPnl: number,
  ): Promise<AnalystPosition> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_positions')
      .update({
        exit_price: exitPrice,
        current_price: exitPrice,
        realized_pnl: realizedPnl,
        unrealized_pnl: 0,
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', positionId)
      .select()
      .single()) as SupabaseSelectResponse<AnalystPosition>;

    if (error) {
      this.logger.error(`Failed to close analyst position: ${error.message}`);
      throw new Error(`Failed to close analyst position: ${error.message}`);
    }

    return data!;
  }

  // =============================================================================
  // USER PORTFOLIOS
  // =============================================================================

  async getUserPortfolio(
    userId: string,
    orgSlug: string,
  ): Promise<UserPortfolio | null> {
    const { data, error } = (await this.db
      .from(this.schema, 'user_portfolios')
      .select('*')
      .eq('user_id', userId)
      .eq('org_slug', orgSlug)
      .single()) as SupabaseSelectResponse<UserPortfolio>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to get user portfolio: ${error.message}`);
      throw new Error(`Failed to get user portfolio: ${error.message}`);
    }

    return data;
  }

  async createUserPortfolio(
    userId: string,
    orgSlug: string,
    initialBalance: number = 1000000,
  ): Promise<UserPortfolio> {
    const { data, error } = (await this.db
      .from(this.schema, 'user_portfolios')
      .insert({
        user_id: userId,
        org_slug: orgSlug,
        initial_balance: initialBalance,
        current_balance: initialBalance,
      })
      .select()
      .single()) as SupabaseSelectResponse<UserPortfolio>;

    if (error) {
      this.logger.error(`Failed to create user portfolio: ${error.message}`);
      throw new Error(`Failed to create user portfolio: ${error.message}`);
    }

    return data!;
  }

  async getOrCreateUserPortfolio(
    userId: string,
    orgSlug: string,
  ): Promise<UserPortfolio> {
    const existing = await this.getUserPortfolio(userId, orgSlug);
    if (existing) return existing;
    return this.createUserPortfolio(userId, orgSlug);
  }

  // =============================================================================
  // USER POSITIONS
  // =============================================================================

  async createUserPosition(
    portfolioId: string,
    predictionId: string,
    targetId: string,
    symbol: string,
    direction: PositionDirection,
    quantity: number,
    entryPrice: number,
  ): Promise<UserPosition> {
    const { data, error } = (await this.db
      .from(this.schema, 'user_positions')
      .insert({
        portfolio_id: portfolioId,
        prediction_id: predictionId,
        target_id: targetId,
        symbol: symbol,
        direction: direction,
        quantity: quantity,
        entry_price: entryPrice,
        current_price: entryPrice,
        status: 'open',
      })
      .select()
      .single()) as SupabaseSelectResponse<UserPosition>;

    if (error) {
      this.logger.error(`Failed to create user position: ${error.message}`);
      throw new Error(`Failed to create user position: ${error.message}`);
    }

    return data!;
  }

  async getOpenUserPositions(portfolioId: string): Promise<UserPosition[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'user_positions')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('status', 'open')) as SupabaseSelectListResponse<UserPosition>;

    if (error) {
      this.logger.error(`Failed to get open user positions: ${error.message}`);
      throw new Error(`Failed to get open user positions: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Get open analyst positions by prediction ID
   * Used to find positions to close when a prediction resolves
   */
  async getOpenAnalystPositionsByPrediction(
    predictionId: string,
  ): Promise<AnalystPosition[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_positions')
      .select('*')
      .eq('prediction_id', predictionId)
      .eq('status', 'open')) as SupabaseSelectListResponse<AnalystPosition>;

    if (error) {
      this.logger.error(
        `Failed to get analyst positions by prediction: ${error.message}`,
      );
      throw new Error(
        `Failed to get analyst positions by prediction: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Get open user positions by prediction ID
   * Used to find positions to close when a prediction resolves
   */
  async getOpenUserPositionsByPrediction(
    predictionId: string,
  ): Promise<UserPosition[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'user_positions')
      .select('*')
      .eq('prediction_id', predictionId)
      .eq('status', 'open')) as SupabaseSelectListResponse<UserPosition>;

    if (error) {
      this.logger.error(
        `Failed to get user positions by prediction: ${error.message}`,
      );
      throw new Error(
        `Failed to get user positions by prediction: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Close a user position
   */
  async closeUserPosition(
    positionId: string,
    exitPrice: number,
    realizedPnl: number,
  ): Promise<UserPosition> {
    const { data, error } = (await this.db
      .from(this.schema, 'user_positions')
      .update({
        exit_price: exitPrice,
        current_price: exitPrice,
        realized_pnl: realizedPnl,
        unrealized_pnl: 0,
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', positionId)
      .select()
      .single()) as SupabaseSelectResponse<UserPosition>;

    if (error) {
      this.logger.error(`Failed to close user position: ${error.message}`);
      throw new Error(`Failed to close user position: ${error.message}`);
    }

    return data!;
  }

  /**
   * Get closed user positions with optional date filters
   * Used for portfolio history and win rate calculation
   */
  async getClosedUserPositions(
    portfolioId: string,
    options?: {
      startDate?: string;
      endDate?: string;
      symbol?: string;
      limit?: number;
    },
  ): Promise<UserPosition[]> {
    let query = this.db
      .from(this.schema, 'user_positions')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false });

    if (options?.startDate) {
      query = query.gte('closed_at', options.startDate);
    }
    if (options?.endDate) {
      query = query.lte('closed_at', options.endDate);
    }
    if (options?.symbol) {
      query = query.eq('symbol', options.symbol);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<UserPosition>;

    if (error) {
      this.logger.error(
        `Failed to get closed user positions: ${error.message}`,
      );
      throw new Error(`Failed to get closed user positions: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Get win/loss statistics for a user portfolio
   * Returns counts and calculated win rate
   */
  async getUserPortfolioStats(portfolioId: string): Promise<{
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
  }> {
    const closedPositions = await this.getClosedUserPositions(portfolioId);

    const wins = closedPositions.filter(
      (p) => (p.realized_pnl ?? 0) > 0,
    ).length;
    const losses = closedPositions.filter(
      (p) => (p.realized_pnl ?? 0) < 0,
    ).length;
    const totalTrades = closedPositions.length;
    const winRate = totalTrades > 0 ? wins / totalTrades : 0;

    return { totalTrades, wins, losses, winRate };
  }

  /**
   * Update user portfolio with realized P&L
   */
  async recordUserTradeResult(
    portfolioId: string,
    realizedPnl: number,
  ): Promise<UserPortfolio> {
    // First get current values
    const { data: current, error: fetchError } = (await this.db
      .from(this.schema, 'user_portfolios')
      .select('*')
      .eq('id', portfolioId)
      .single()) as SupabaseSelectResponse<UserPortfolio>;

    if (fetchError) {
      throw new Error(`Failed to fetch user portfolio: ${fetchError.message}`);
    }

    // Update with new values
    const { data, error } = (await this.db
      .from(this.schema, 'user_portfolios')
      .update({
        current_balance: current!.current_balance + realizedPnl,
        total_realized_pnl: current!.total_realized_pnl + realizedPnl,
      })
      .eq('id', portfolioId)
      .select()
      .single()) as SupabaseSelectResponse<UserPortfolio>;

    if (error) {
      this.logger.error(`Failed to record user trade result: ${error.message}`);
      throw new Error(`Failed to record user trade result: ${error.message}`);
    }

    return data!;
  }

  // =============================================================================
  // ANALYST CONTEXT VERSIONS
  // =============================================================================

  async getCurrentAnalystContextVersion(
    analystId: string,
    forkType: ForkType,
  ): Promise<AnalystContextVersion | null> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_context_versions')
      .select('*')
      .eq('analyst_id', analystId)
      .eq('fork_type', forkType)
      .eq('is_current', true)
      .single()) as SupabaseSelectResponse<AnalystContextVersion>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to get current analyst context version: ${error.message}`,
      );
      throw new Error(
        `Failed to get current analyst context version: ${error.message}`,
      );
    }

    return data;
  }

  async createAnalystContextVersion(
    input: CreateAnalystContextVersionInput,
  ): Promise<AnalystContextVersion> {
    // First, mark any existing current version as not current
    await this.db
      .from(this.schema, 'analyst_context_versions')
      .update({ is_current: false })
      .eq('analyst_id', input.analyst_id)
      .eq('fork_type', input.fork_type)
      .eq('is_current', true);

    // Get the next version number
    const { data: versions } = (await this.db
      .from(this.schema, 'analyst_context_versions')
      .select('version_number')
      .eq('analyst_id', input.analyst_id)
      .eq('fork_type', input.fork_type)
      .order('version_number', { ascending: false })
      .limit(1)) as SupabaseSelectListResponse<{ version_number: number }>;

    const nextVersion =
      versions && versions.length > 0 && versions[0]
        ? versions[0].version_number + 1
        : 1;

    // Create the new version
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_context_versions')
      .insert({
        analyst_id: input.analyst_id,
        fork_type: input.fork_type,
        version_number: nextVersion,
        perspective: input.perspective,
        tier_instructions: input.tier_instructions,
        default_weight: input.default_weight,
        agent_journal: input.agent_journal,
        change_reason: input.change_reason,
        changed_by: input.changed_by,
        is_current: true,
      })
      .select()
      .single()) as SupabaseSelectResponse<AnalystContextVersion>;

    if (error) {
      this.logger.error(
        `Failed to create analyst context version: ${error.message}`,
      );
      throw new Error(
        `Failed to create analyst context version: ${error.message}`,
      );
    }

    return data!;
  }

  // =============================================================================
  // AGENT SELF-MODIFICATION LOG
  // =============================================================================

  async logAgentSelfModification(
    analystId: string,
    modificationType: ModificationType,
    summary: string,
    details: Record<string, unknown>,
    triggerReason?: string,
    performanceContext?: Record<string, unknown>,
  ): Promise<AgentSelfModificationLog> {
    const { data, error } = (await this.db
      .from(this.schema, 'agent_self_modification_log')
      .insert({
        analyst_id: analystId,
        modification_type: modificationType,
        summary: summary,
        details: details,
        trigger_reason: triggerReason,
        performance_context: performanceContext,
      })
      .select()
      .single()) as SupabaseSelectResponse<AgentSelfModificationLog>;

    if (error) {
      this.logger.error(
        `Failed to log agent self modification: ${error.message}`,
      );
      throw new Error(
        `Failed to log agent self modification: ${error.message}`,
      );
    }

    return data!;
  }

  async getUnacknowledgedModifications(): Promise<AgentSelfModificationLog[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'agent_self_modification_log')
      .select('*')
      .eq('acknowledged', false)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<AgentSelfModificationLog>;

    if (error) {
      this.logger.error(
        `Failed to get unacknowledged modifications: ${error.message}`,
      );
      throw new Error(
        `Failed to get unacknowledged modifications: ${error.message}`,
      );
    }

    return data ?? [];
  }

  async acknowledgeModification(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, 'agent_self_modification_log')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to acknowledge modification: ${error.message}`);
      throw new Error(`Failed to acknowledge modification: ${error.message}`);
    }
  }

  // =============================================================================
  // RUNNER CONTEXT VERSIONS
  // =============================================================================

  async getCurrentRunnerContextVersion(
    runnerType: string,
  ): Promise<RunnerContextVersion | null> {
    const { data, error } = (await this.db
      .from(this.schema, 'runner_context_versions')
      .select('*')
      .eq('runner_type', runnerType)
      .eq('is_current', true)
      .single()) as SupabaseSelectResponse<RunnerContextVersion>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to get current runner context version: ${error.message}`,
      );
      throw new Error(
        `Failed to get current runner context version: ${error.message}`,
      );
    }

    return data;
  }

  // =============================================================================
  // UNIVERSE CONTEXT VERSIONS
  // =============================================================================

  async getCurrentUniverseContextVersion(
    universeId: string,
  ): Promise<UniverseContextVersion | null> {
    const { data, error } = (await this.db
      .from(this.schema, 'universe_context_versions')
      .select('*')
      .eq('universe_id', universeId)
      .eq('is_current', true)
      .single()) as SupabaseSelectResponse<UniverseContextVersion>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to get current universe context version: ${error.message}`,
      );
      throw new Error(
        `Failed to get current universe context version: ${error.message}`,
      );
    }

    return data;
  }

  // =============================================================================
  // TARGET CONTEXT VERSIONS
  // =============================================================================

  async getCurrentTargetContextVersion(
    targetId: string,
  ): Promise<TargetContextVersion | null> {
    const { data, error } = (await this.db
      .from(this.schema, 'target_context_versions')
      .select('*')
      .eq('target_id', targetId)
      .eq('is_current', true)
      .single()) as SupabaseSelectResponse<TargetContextVersion>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to get current target context version: ${error.message}`,
      );
      throw new Error(
        `Failed to get current target context version: ${error.message}`,
      );
    }

    return data;
  }

  // =============================================================================
  // ALL CURRENT ANALYST CONTEXT VERSIONS
  // =============================================================================

  /**
   * Get all current analyst context versions for a specific fork type
   * Returns a map of analyst_id -> context version ID
   * Used when creating predictions to capture which versions were used
   */
  async getAllCurrentAnalystContextVersions(
    forkType: ForkType,
  ): Promise<Map<string, string>> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_context_versions')
      .select('id, analyst_id')
      .eq('fork_type', forkType)
      .eq('is_current', true)) as SupabaseSelectListResponse<{
      id: string;
      analyst_id: string;
    }>;

    if (error) {
      this.logger.error(
        `Failed to get all current analyst context versions: ${error.message}`,
      );
      throw new Error(
        `Failed to get all current analyst context versions: ${error.message}`,
      );
    }

    const versionMap = new Map<string, string>();
    for (const version of data ?? []) {
      versionMap.set(version.analyst_id, version.id);
    }

    return versionMap;
  }

  // =============================================================================
  // VIEWS
  // =============================================================================

  async getAnalystForkComparisons(): Promise<AnalystForkComparison[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'v_analyst_fork_comparison')
      .select('*')) as SupabaseSelectListResponse<AnalystForkComparison>;

    if (error) {
      this.logger.error(
        `Failed to get analyst fork comparisons: ${error.message}`,
      );
      throw new Error(
        `Failed to get analyst fork comparisons: ${error.message}`,
      );
    }

    return data ?? [];
  }

  // =============================================================================
  // ANALYST PERFORMANCE METRICS
  // =============================================================================

  /**
   * Save or update performance metrics for an analyst fork on a specific date
   */
  async upsertPerformanceMetrics(
    analystId: string,
    forkType: ForkType,
    metricDate: string,
    metrics: {
      solo_pnl: number;
      contribution_pnl: number;
      dissent_accuracy?: number;
      dissent_count: number;
      rank_in_portfolio?: number;
      total_analysts?: number;
    },
  ): Promise<AnalystPerformanceMetrics> {
    // Check if exists first
    const { data: existing } = (await this.db
      .from(this.schema, 'analyst_performance_metrics')
      .select('id')
      .eq('analyst_id', analystId)
      .eq('fork_type', forkType)
      .eq('metric_date', metricDate)
      .single()) as SupabaseSelectResponse<{ id: string }>;

    if (existing) {
      // Update
      const { data, error } = (await this.db
        .from(this.schema, 'analyst_performance_metrics')
        .update(metrics)
        .eq('id', existing.id)
        .select()
        .single()) as SupabaseSelectResponse<AnalystPerformanceMetrics>;

      if (error) {
        this.logger.error(
          `Failed to update performance metrics: ${error.message}`,
        );
        throw new Error(
          `Failed to update performance metrics: ${error.message}`,
        );
      }

      return data!;
    } else {
      // Insert
      const { data, error } = (await this.db
        .from(this.schema, 'analyst_performance_metrics')
        .insert({
          analyst_id: analystId,
          fork_type: forkType,
          metric_date: metricDate,
          ...metrics,
        })
        .select()
        .single()) as SupabaseSelectResponse<AnalystPerformanceMetrics>;

      if (error) {
        this.logger.error(
          `Failed to insert performance metrics: ${error.message}`,
        );
        throw new Error(
          `Failed to insert performance metrics: ${error.message}`,
        );
      }

      return data!;
    }
  }

  /**
   * Get performance metrics for an analyst fork within a date range
   */
  async getPerformanceMetrics(
    analystId: string,
    forkType: ForkType,
    startDate?: string,
    endDate?: string,
  ): Promise<AnalystPerformanceMetrics[]> {
    let query = this.db
      .from(this.schema, 'analyst_performance_metrics')
      .select('*')
      .eq('analyst_id', analystId)
      .eq('fork_type', forkType)
      .order('metric_date', { ascending: false });

    if (startDate) {
      query = query.gte('metric_date', startDate);
    }
    if (endDate) {
      query = query.lte('metric_date', endDate);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<AnalystPerformanceMetrics>;

    if (error) {
      this.logger.error(`Failed to get performance metrics: ${error.message}`);
      throw new Error(`Failed to get performance metrics: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Get latest performance metrics for all analysts of a fork type
   */
  async getLatestPerformanceMetricsForAllAnalysts(
    forkType: ForkType,
  ): Promise<AnalystPerformanceMetrics[]> {
    // Get the most recent date with metrics
    const { data: latestDateData } = (await this.db
      .from(this.schema, 'analyst_performance_metrics')
      .select('metric_date')
      .eq('fork_type', forkType)
      .order('metric_date', { ascending: false })
      .limit(1)) as SupabaseSelectListResponse<{ metric_date: string }>;

    if (!latestDateData || latestDateData.length === 0 || !latestDateData[0]) {
      return [];
    }

    const latestDate = latestDateData[0].metric_date;

    const { data, error } = (await this.db
      .from(this.schema, 'analyst_performance_metrics')
      .select('*')
      .eq('fork_type', forkType)
      .eq('metric_date', latestDate)
      .order('rank_in_portfolio', {
        ascending: true,
      })) as SupabaseSelectListResponse<AnalystPerformanceMetrics>;

    if (error) {
      this.logger.error(
        `Failed to get latest performance metrics: ${error.message}`,
      );
      throw new Error(
        `Failed to get latest performance metrics: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Get closed positions for an analyst within a date range
   * Used for calculating solo P&L
   */
  async getClosedPositionsForAnalyst(
    portfolioId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<AnalystPosition[]> {
    let query = this.db
      .from(this.schema, 'analyst_positions')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('status', 'closed');

    if (startDate) {
      query = query.gte('closed_at', startDate);
    }
    if (endDate) {
      query = query.lte('closed_at', endDate);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<AnalystPosition>;

    if (error) {
      this.logger.error(
        `Failed to get closed positions for analyst: ${error.message}`,
      );
      throw new Error(
        `Failed to get closed positions for analyst: ${error.message}`,
      );
    }

    return data ?? [];
  }

  // =============================================================================
  // FORK LEARNING EXCHANGES
  // =============================================================================

  /**
   * Create a new learning exchange
   */
  async createLearningExchange(
    analystId: string,
    initiatedBy: 'user' | 'ai',
    question: string,
    contextDiff?: Record<string, unknown>,
    performanceEvidence?: Record<string, unknown>,
  ): Promise<ForkLearningExchange> {
    const { data, error } = (await this.db
      .from(this.schema, 'fork_learning_exchanges')
      .insert({
        analyst_id: analystId,
        initiated_by: initiatedBy,
        question: question,
        context_diff: contextDiff,
        performance_evidence: performanceEvidence,
        outcome: 'pending',
      })
      .select()
      .single()) as SupabaseSelectResponse<ForkLearningExchange>;

    if (error) {
      this.logger.error(`Failed to create learning exchange: ${error.message}`);
      throw new Error(`Failed to create learning exchange: ${error.message}`);
    }

    return data!;
  }

  /**
   * Update a learning exchange with response and outcome
   */
  async updateLearningExchange(
    id: string,
    response: string,
    outcome: 'adopted' | 'rejected' | 'noted' | 'pending',
    adoptionDetails?: Record<string, unknown>,
  ): Promise<ForkLearningExchange> {
    const { data, error } = (await this.db
      .from(this.schema, 'fork_learning_exchanges')
      .update({
        response: response,
        outcome: outcome,
        adoption_details: adoptionDetails,
      })
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<ForkLearningExchange>;

    if (error) {
      this.logger.error(`Failed to update learning exchange: ${error.message}`);
      throw new Error(`Failed to update learning exchange: ${error.message}`);
    }

    return data!;
  }

  /**
   * Get learning exchanges for an analyst
   */
  async getLearningExchanges(
    analystId: string,
    initiatedBy?: 'user' | 'ai',
    outcome?: 'adopted' | 'rejected' | 'noted' | 'pending',
  ): Promise<ForkLearningExchange[]> {
    let query = this.db
      .from(this.schema, 'fork_learning_exchanges')
      .select('*')
      .eq('analyst_id', analystId)
      .order('created_at', { ascending: false });

    if (initiatedBy) {
      query = query.eq('initiated_by', initiatedBy);
    }
    if (outcome) {
      query = query.eq('outcome', outcome);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<ForkLearningExchange>;

    if (error) {
      this.logger.error(`Failed to get learning exchanges: ${error.message}`);
      throw new Error(`Failed to get learning exchanges: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Get a learning exchange by ID
   */
  async getLearningExchangeById(
    id: string,
  ): Promise<ForkLearningExchange | null> {
    const { data, error } = (await this.db
      .from(this.schema, 'fork_learning_exchanges')
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<ForkLearningExchange>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to get learning exchange: ${error.message}`);
      throw new Error(`Failed to get learning exchange: ${error.message}`);
    }

    return data;
  }

  /**
   * Get pending learning exchanges (for HITL queue)
   */
  async getPendingLearningExchanges(): Promise<ForkLearningExchange[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'fork_learning_exchanges')
      .select('*')
      .eq('outcome', 'pending')
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<ForkLearningExchange>;

    if (error) {
      this.logger.error(
        `Failed to get pending learning exchanges: ${error.message}`,
      );
      throw new Error(
        `Failed to get pending learning exchanges: ${error.message}`,
      );
    }

    return data ?? [];
  }

  // =============================================================================
  // ROLLBACK FUNCTIONALITY
  // =============================================================================

  /**
   * Get all context versions for an analyst (for version history UI)
   */
  async getAnalystContextVersionHistory(
    analystId: string,
    forkType: ForkType,
  ): Promise<AnalystContextVersion[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_context_versions')
      .select('*')
      .eq('analyst_id', analystId)
      .eq('fork_type', forkType)
      .order('version_number', {
        ascending: false,
      })) as SupabaseSelectListResponse<AnalystContextVersion>;

    if (error) {
      this.logger.error(
        `Failed to get analyst context version history: ${error.message}`,
      );
      throw new Error(
        `Failed to get analyst context version history: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Get a specific context version by ID
   */
  async getAnalystContextVersionById(
    versionId: string,
  ): Promise<AnalystContextVersion | null> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_context_versions')
      .select('*')
      .eq('id', versionId)
      .single()) as SupabaseSelectResponse<AnalystContextVersion>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to get context version: ${error.message}`);
      throw new Error(`Failed to get context version: ${error.message}`);
    }

    return data;
  }

  /**
   * Rollback an analyst's context to a previous version
   *
   * This creates a NEW version that copies the content from the target version,
   * preserving the full history. The rollback itself is logged.
   *
   * @param analystId The analyst ID
   * @param forkType Which fork to rollback ('user' or 'ai')
   * @param targetVersionId The version ID to rollback to
   * @param reason Why the rollback is being performed
   * @returns The new version created from the rollback
   */
  async rollbackAnalystContextVersion(
    analystId: string,
    forkType: ForkType,
    targetVersionId: string,
    reason: string,
  ): Promise<AnalystContextVersion> {
    // Get the target version to copy from
    const targetVersion =
      await this.getAnalystContextVersionById(targetVersionId);
    if (!targetVersion) {
      throw new Error(`Target version not found: ${targetVersionId}`);
    }

    // Verify it belongs to the same analyst and fork
    if (targetVersion.analyst_id !== analystId) {
      throw new Error('Target version does not belong to this analyst');
    }
    if (targetVersion.fork_type !== forkType) {
      throw new Error('Target version does not belong to this fork type');
    }

    // Get the current version to mark as not current
    const currentVersion = await this.getCurrentAnalystContextVersion(
      analystId,
      forkType,
    );

    if (currentVersion) {
      // Mark current as not current
      await this.db
        .from(this.schema, 'analyst_context_versions')
        .update({ is_current: false })
        .eq('id', currentVersion.id);
    }

    // Get the next version number
    const nextVersionNumber = currentVersion
      ? currentVersion.version_number + 1
      : 1;

    // Create new version as a rollback (copies content from target)
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_context_versions')
      .insert({
        analyst_id: analystId,
        fork_type: forkType,
        version_number: nextVersionNumber,
        perspective: targetVersion.perspective,
        tier_instructions: targetVersion.tier_instructions,
        default_weight: targetVersion.default_weight,
        agent_journal: targetVersion.agent_journal,
        change_reason: `Rollback to v${targetVersion.version_number}: ${reason}`,
        changed_by: 'user',
        is_current: true,
      })
      .select()
      .single()) as SupabaseSelectResponse<AnalystContextVersion>;

    if (error) {
      this.logger.error(`Failed to create rollback version: ${error.message}`);
      throw new Error(`Failed to create rollback version: ${error.message}`);
    }

    this.logger.log(
      `Rolled back analyst ${analystId} ${forkType} fork from v${currentVersion?.version_number ?? 0} to v${targetVersion.version_number} (new version: v${nextVersionNumber})`,
    );

    return data!;
  }

  // =============================================================================
  // USER TRADE QUEUE (EOD Settlement)
  // =============================================================================

  /**
   * Create a trade queue entry - user queues a trade during the day for EOD execution
   */
  async createTradeQueueEntry(
    input: CreateTradeQueueInput,
  ): Promise<UserTradeQueueEntry> {
    const { data, error } = (await this.db
      .from(this.schema, 'user_trade_queue')
      .insert({
        user_id: input.user_id,
        org_slug: input.org_slug,
        portfolio_id: input.portfolio_id,
        prediction_id: input.prediction_id,
        target_id: input.target_id,
        symbol: input.symbol,
        direction: input.direction,
        quantity: input.quantity,
        status: 'queued',
      })
      .select()
      .single()) as SupabaseSelectResponse<UserTradeQueueEntry>;

    if (error) {
      this.logger.error(`Failed to create trade queue entry: ${error.message}`);
      throw new Error(`Failed to create trade queue entry: ${error.message}`);
    }

    return data!;
  }

  /**
   * Get all queued trades for a specific user
   */
  async getQueuedTradesForUser(
    userId: string,
    orgSlug: string,
  ): Promise<UserTradeQueueEntry[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'user_trade_queue')
      .select('*')
      .eq('user_id', userId)
      .eq('org_slug', orgSlug)
      .eq('status', 'queued')
      .order('queued_at', {
        ascending: true,
      })) as SupabaseSelectListResponse<UserTradeQueueEntry>;

    if (error) {
      this.logger.error(
        `Failed to get queued trades for user: ${error.message}`,
      );
      throw new Error(`Failed to get queued trades for user: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Get ALL pending queued trades across all users - used by EOD runner
   */
  async getAllQueuedTrades(): Promise<UserTradeQueueEntry[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'user_trade_queue')
      .select('*')
      .eq('status', 'queued')
      .order('queued_at', {
        ascending: true,
      })) as SupabaseSelectListResponse<UserTradeQueueEntry>;

    if (error) {
      this.logger.error(`Failed to get all queued trades: ${error.message}`);
      throw new Error(`Failed to get all queued trades: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Cancel a queued trade
   */
  async cancelQueuedTrade(tradeId: string): Promise<UserTradeQueueEntry> {
    const { data, error } = (await this.db
      .from(this.schema, 'user_trade_queue')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', tradeId)
      .eq('status', 'queued')
      .select()
      .single()) as SupabaseSelectResponse<UserTradeQueueEntry>;

    if (error) {
      this.logger.error(`Failed to cancel queued trade: ${error.message}`);
      throw new Error(`Failed to cancel queued trade: ${error.message}`);
    }

    return data!;
  }

  /**
   * Mark a queued trade as executed after EOD processing
   */
  async markTradeExecuted(
    tradeId: string,
    positionId: string,
    executionPrice: number,
  ): Promise<UserTradeQueueEntry> {
    const { data, error } = (await this.db
      .from(this.schema, 'user_trade_queue')
      .update({
        status: 'executed',
        executed_position_id: positionId,
        execution_price: executionPrice,
        executed_at: new Date().toISOString(),
      })
      .eq('id', tradeId)
      .select()
      .single()) as SupabaseSelectResponse<UserTradeQueueEntry>;

    if (error) {
      this.logger.error(`Failed to mark trade as executed: ${error.message}`);
      throw new Error(`Failed to mark trade as executed: ${error.message}`);
    }

    return data!;
  }

  // =============================================================================
  // EOD SETTLEMENT LOG
  // =============================================================================

  /**
   * Create an EOD settlement log entry
   */
  async createSettlementLog(input: {
    settlement_date: string;
    queued_trades_executed: number;
    analyst_positions_created: number;
    predictions_resolved: number;
    positions_closed: number;
    unrealized_pnl_updated: number;
    total_realized_pnl: number;
    errors: string[];
    started_at: string;
    completed_at: string;
    duration_ms: number;
  }): Promise<EodSettlementLogEntry> {
    const { data, error } = (await this.db
      .from(this.schema, 'eod_settlement_log')
      .insert({
        settlement_date: input.settlement_date,
        queued_trades_executed: input.queued_trades_executed,
        analyst_positions_created: input.analyst_positions_created,
        predictions_resolved: input.predictions_resolved,
        positions_closed: input.positions_closed,
        unrealized_pnl_updated: input.unrealized_pnl_updated,
        total_realized_pnl: input.total_realized_pnl,
        errors: JSON.stringify(input.errors),
        started_at: input.started_at,
        completed_at: input.completed_at,
        duration_ms: input.duration_ms,
      })
      .select()
      .single()) as SupabaseSelectResponse<EodSettlementLogEntry>;

    if (error) {
      this.logger.error(`Failed to create settlement log: ${error.message}`);
      throw new Error(`Failed to create settlement log: ${error.message}`);
    }

    return data!;
  }

  /**
   * Check whether a settlement log entry exists for a specific settlement date.
   * Date must be in YYYY-MM-DD format.
   */
  async hasSettlementForDate(settlementDate: string): Promise<boolean> {
    const { count, error } = await this.db
      .from(this.schema, 'eod_settlement_log')
      .select('id', { count: 'exact', head: true })
      .eq('settlement_date', settlementDate);

    if (error) {
      this.logger.error(
        `Failed to check settlement date ${settlementDate}: ${error.message}`,
      );
      throw new Error(
        `Failed to check settlement date ${settlementDate}: ${error.message}`,
      );
    }

    return (count ?? 0) > 0;
  }

  /**
   * Count queued user trades with queued_at <= cutoff timestamp.
   */
  async countQueuedTradesBefore(cutoffIso: string): Promise<number> {
    const { count, error } = await this.db
      .from(this.schema, 'user_trade_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued')
      .lte('queued_at', cutoffIso);

    if (error) {
      this.logger.error(
        `Failed to count queued trades before ${cutoffIso}: ${error.message}`,
      );
      throw new Error(
        `Failed to count queued trades before ${cutoffIso}: ${error.message}`,
      );
    }

    return count ?? 0;
  }

  /**
   * Get all open user positions across ALL portfolios
   * Used by EOD runner to update unrealized P&L
   */
  async getAllOpenUserPositions(): Promise<UserPosition[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'user_positions')
      .select('*')
      .eq('status', 'open')) as SupabaseSelectListResponse<UserPosition>;

    if (error) {
      this.logger.error(
        `Failed to get all open user positions: ${error.message}`,
      );
      throw new Error(
        `Failed to get all open user positions: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Update a user position's current price and unrealized P&L
   */
  async updateUserPositionPrice(
    positionId: string,
    currentPrice: number,
    unrealizedPnl: number,
  ): Promise<UserPosition> {
    const { data, error } = (await this.db
      .from(this.schema, 'user_positions')
      .update({
        current_price: currentPrice,
        unrealized_pnl: unrealizedPnl,
      })
      .eq('id', positionId)
      .select()
      .single()) as SupabaseSelectResponse<UserPosition>;

    if (error) {
      this.logger.error(
        `Failed to update user position price: ${error.message}`,
      );
      throw new Error(`Failed to update user position price: ${error.message}`);
    }

    return data!;
  }

  // =============================================================================
  // HELPER FUNCTIONS
  // =============================================================================

  /**
   * Calculate P&L for a position
   */
  calculatePnL(
    direction: PositionDirection,
    entryPrice: number,
    currentPrice: number,
    quantity: number,
  ): number {
    if (direction === 'long') {
      return (currentPrice - entryPrice) * quantity;
    } else {
      return (entryPrice - currentPrice) * quantity;
    }
  }

  /**
   * Calculate recommended position size based on risk parameters
   */
  calculatePositionSize(
    portfolioBalance: number,
    entryPrice: number,
    stopLossPrice: number,
    riskPercent: number = 0.02, // Default 2% risk per trade
  ): number {
    const riskAmount = portfolioBalance * riskPercent;
    const stopDistance = Math.abs(entryPrice - stopLossPrice);
    if (stopDistance === 0) return 0;
    return riskAmount / stopDistance;
  }
}

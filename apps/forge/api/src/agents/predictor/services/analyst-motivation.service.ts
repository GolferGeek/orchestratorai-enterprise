import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import { PortfolioRepository } from '../repositories/portfolio.repository';
import { AnalystRepository } from '../repositories/analyst.repository';
import { PortfolioStatus, ForkType } from '../interfaces/portfolio.interface';
import { Analyst } from '../interfaces/analyst.interface';

/**
 * Status threshold configuration
 * Balance thresholds are based on $1M initial balance
 */
export interface StatusThresholds {
  active: { minBalance: number };
  warning: { minBalance: number; maxBalance: number };
  probation: {
    minBalance: number;
    maxBalance: number;
    weightMultiplier: number;
  };
  suspended: { maxBalance: number };
}

/**
 * Default thresholds based on $1M initial balance
 */
export const DEFAULT_STATUS_THRESHOLDS: StatusThresholds = {
  active: { minBalance: 800000 }, // $800K+
  warning: { minBalance: 600000, maxBalance: 800000 }, // $600K - $800K
  probation: { minBalance: 400000, maxBalance: 600000, weightMultiplier: 0.5 }, // $400K - $600K, 50% weight
  suspended: { maxBalance: 400000 }, // Below $400K
};

/**
 * Status change event for notifications
 */
export interface StatusChangeEvent {
  analystId: string;
  analystSlug: string;
  previousStatus: PortfolioStatus;
  newStatus: PortfolioStatus;
  currentBalance: number;
  initialBalance: number;
  drawdownPercent: number;
  triggerReason: string;
}

/**
 * Performance context to inject into analyst prompts
 */
export interface PerformanceContext {
  currentBalance: number;
  initialBalance: number;
  pnlAmount: number;
  pnlPercent: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  status: PortfolioStatus;
  rank?: number;
  totalAnalysts?: number;
  statusMessage?: string;
  peerComparison?: PeerComparisonEntry[];
}

/**
 * Peer comparison entry for leaderboard injection
 */
export interface PeerComparisonEntry {
  rank: number;
  slug: string;
  pnlAmount: number;
  isCurrentAnalyst: boolean;
}

/**
 * Boss feedback message for status changes
 */
export interface BossFeedback {
  analystId: string;
  status: PortfolioStatus;
  message: string;
  contextModification?: string;
}

/**
 * Input for agent self-adaptation
 */
export interface AgentSelfAdaptationInput {
  analystId: string;
  ruleType: 'add' | 'modify' | 'remove';
  ruleSummary: string;
  ruleDetails: string;
  triggerReason: string;
  performanceEvidence: {
    relatedPredictions?: string[];
    successRate?: number;
    pnlImpact?: number;
  };
}

/**
 * Service for managing analyst motivation through P&L-driven feedback
 * Applies ONLY to the AI fork - user fork remains stable
 *
 * Status thresholds (based on $1M initial):
 * - active: $800K+ - Normal operation
 * - warning: $600K-$800K - Warning messaging
 * - probation: $400K-$600K - Weight reduced 50%, boss feedback
 * - suspended: <$400K - Paper-only mode, removed from ensemble
 */
@Injectable()
export class AnalystMotivationService {
  private readonly logger = new Logger(AnalystMotivationService.name);
  private readonly thresholds: StatusThresholds;

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly portfolioRepository: PortfolioRepository,
    private readonly analystRepository: AnalystRepository,
  ) {
    this.thresholds = DEFAULT_STATUS_THRESHOLDS;
  }

  /**
   * Determine the appropriate status based on current balance
   */
  determineStatus(
    currentBalance: number,
    initialBalance: number,
  ): PortfolioStatus {
    // Scale thresholds based on initial balance
    const scale = initialBalance / 1000000;
    const activeMin = this.thresholds.active.minBalance * scale;
    const warningMin = this.thresholds.warning.minBalance * scale;
    const probationMin = this.thresholds.probation.minBalance * scale;

    if (currentBalance >= activeMin) {
      return 'active';
    } else if (currentBalance >= warningMin) {
      return 'warning';
    } else if (currentBalance >= probationMin) {
      return 'probation';
    } else {
      return 'suspended';
    }
  }

  /**
   * Evaluate and update status for a single analyst's AI portfolio
   * Returns status change event if status changed
   */
  async evaluateAndUpdateStatus(
    analystId: string,
  ): Promise<StatusChangeEvent | null> {
    // Get the AI portfolio (motivation only applies to AI fork)
    const portfolio = await this.portfolioRepository.getAnalystPortfolio(
      analystId,
      'ai',
    );

    if (!portfolio) {
      this.logger.warn(`No AI portfolio found for analyst ${analystId}`);
      return null;
    }

    const newStatus = this.determineStatus(
      portfolio.current_balance,
      portfolio.initial_balance,
    );

    // Check if status changed
    if (newStatus === portfolio.status) {
      return null;
    }

    // Get analyst details for the event
    const analyst = await this.analystRepository.findById(analystId);
    if (!analyst) {
      this.logger.error(`Analyst ${analystId} not found`);
      return null;
    }

    // Update the portfolio status
    await this.updatePortfolioStatus(portfolio.id, newStatus);

    const drawdownPercent =
      ((portfolio.initial_balance - portfolio.current_balance) /
        portfolio.initial_balance) *
      100;

    const event: StatusChangeEvent = {
      analystId,
      analystSlug: analyst.slug,
      previousStatus: portfolio.status,
      newStatus,
      currentBalance: portfolio.current_balance,
      initialBalance: portfolio.initial_balance,
      drawdownPercent,
      triggerReason: this.getStatusChangeReason(
        portfolio.status,
        newStatus,
        drawdownPercent,
      ),
    };

    this.logger.log(
      `Analyst ${analyst.slug} status changed: ${portfolio.status} -> ${newStatus} (balance: $${portfolio.current_balance.toFixed(2)}, drawdown: ${drawdownPercent.toFixed(1)}%)`,
    );

    // Generate boss feedback for status transitions
    const bossFeedback = this.generateBossFeedback(
      analyst,
      newStatus,
      drawdownPercent,
    );

    // If boss feedback includes context modification, create a new context version
    if (bossFeedback.contextModification) {
      await this.applyBossFeedbackToContext(
        analyst,
        bossFeedback,
        newStatus,
        drawdownPercent,
      );
    }

    // Log the modification for HITL notification
    await this.portfolioRepository.logAgentSelfModification(
      analystId,
      'status_change',
      `Status changed from ${portfolio.status} to ${newStatus}`,
      {
        previous_status: portfolio.status,
        new_status: newStatus,
        current_balance: portfolio.current_balance,
        drawdown_percent: drawdownPercent,
        boss_feedback: bossFeedback.message,
        context_modified: !!bossFeedback.contextModification,
      },
      event.triggerReason,
      {
        initial_balance: portfolio.initial_balance,
        win_count: portfolio.win_count,
        loss_count: portfolio.loss_count,
      },
    );

    return event;
  }

  /**
   * Apply boss feedback context modification to analyst's AI fork
   */
  private async applyBossFeedbackToContext(
    analyst: Analyst,
    bossFeedback: BossFeedback,
    newStatus: PortfolioStatus,
    drawdownPercent: number,
  ): Promise<void> {
    if (!bossFeedback.contextModification) {
      return;
    }

    try {
      // Create a new context version with the boss feedback appended
      const modifiedTierInstructions = {
        ...analyst.tier_instructions,
        // Append the boss feedback to the silver tier instructions (or create if doesn't exist)
        silver:
          `${analyst.tier_instructions.silver || ''}\n\n${bossFeedback.contextModification}`.trim(),
      };

      await this.analystRepository.createContextVersion(
        analyst.id,
        'ai',
        analyst.perspective,
        modifiedTierInstructions,
        analyst.default_weight,
        `Boss feedback after ${newStatus} status (${drawdownPercent.toFixed(0)}% drawdown)`,
        'system',
      );

      this.logger.log(
        `Applied boss feedback to agent context for analyst ${analyst.slug}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to apply boss feedback to context for analyst ${analyst.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Evaluate status for all AI portfolios
   * Should be called periodically (e.g., daily)
   */
  async evaluateAllAiPortfolios(): Promise<StatusChangeEvent[]> {
    const portfolios =
      await this.portfolioRepository.getAllAnalystPortfolios('ai');
    const events: StatusChangeEvent[] = [];

    for (const portfolio of portfolios) {
      try {
        const event = await this.evaluateAndUpdateStatus(portfolio.analyst_id);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        this.logger.error(
          `Failed to evaluate status for analyst ${portfolio.analyst_id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (events.length > 0) {
      this.logger.log(
        `Evaluated ${portfolios.length} AI portfolios, ${events.length} status changes`,
      );
    }

    return events;
  }

  /**
   * Build performance context for injection into analyst prompt
   */
  async buildPerformanceContext(
    analystId: string,
    forkType: ForkType,
  ): Promise<PerformanceContext | null> {
    const portfolio = await this.portfolioRepository.getAnalystPortfolio(
      analystId,
      forkType,
    );

    if (!portfolio) {
      return null;
    }

    const totalTrades = portfolio.win_count + portfolio.loss_count;
    const winRate = totalTrades > 0 ? portfolio.win_count / totalTrades : 0;
    const pnlAmount = portfolio.current_balance - portfolio.initial_balance;
    const pnlPercent = (pnlAmount / portfolio.initial_balance) * 100;

    const context: PerformanceContext = {
      currentBalance: portfolio.current_balance,
      initialBalance: portfolio.initial_balance,
      pnlAmount,
      pnlPercent,
      winCount: portfolio.win_count,
      lossCount: portfolio.loss_count,
      winRate,
      status: portfolio.status,
    };

    // Add status-specific messaging for AI fork
    if (forkType === 'ai') {
      context.statusMessage = this.getStatusMessage(
        portfolio.status,
        pnlPercent,
      );

      // Add peer comparison for AI fork
      const peerComparison = await this.buildPeerComparison(analystId);
      if (peerComparison) {
        context.peerComparison = peerComparison.peers;
        context.rank = peerComparison.currentRank;
        context.totalAnalysts = peerComparison.totalAnalysts;
      }
    }

    return context;
  }

  /**
   * Build peer comparison leaderboard
   */
  async buildPeerComparison(analystId: string): Promise<{
    peers: PeerComparisonEntry[];
    currentRank: number;
    totalAnalysts: number;
  } | null> {
    const portfolios =
      await this.portfolioRepository.getAllAnalystPortfolios('ai');

    if (portfolios.length === 0) {
      return null;
    }

    // Get analyst details for all portfolios
    const analysts = await this.analystRepository.getActive();
    const analystMap = new Map(analysts.map((a) => [a.id, a]));

    // Sort by P&L
    const sorted = portfolios
      .map((p) => ({
        analystId: p.analyst_id,
        slug: analystMap.get(p.analyst_id)?.slug ?? 'unknown',
        pnlAmount: p.current_balance - p.initial_balance,
      }))
      .sort((a, b) => b.pnlAmount - a.pnlAmount);

    // Find current analyst's rank
    const currentRank = sorted.findIndex((p) => p.analystId === analystId) + 1;

    // Build peer entries (top 3 + current analyst if not in top 3)
    const peers: PeerComparisonEntry[] = [];
    const topN = Math.min(3, sorted.length);

    for (let i = 0; i < topN; i++) {
      const entry = sorted[i];
      if (entry) {
        peers.push({
          rank: i + 1,
          slug: entry.slug,
          pnlAmount: entry.pnlAmount,
          isCurrentAnalyst: entry.analystId === analystId,
        });
      }
    }

    // Add current analyst if not in top 3
    if (currentRank > topN) {
      const currentEntry = sorted[currentRank - 1];
      if (currentEntry) {
        peers.push({
          rank: currentRank,
          slug: currentEntry.slug,
          pnlAmount: currentEntry.pnlAmount,
          isCurrentAnalyst: true,
        });
      }
    }

    return {
      peers,
      currentRank,
      totalAnalysts: portfolios.length,
    };
  }

  /**
   * Generate boss feedback message for status changes
   */
  generateBossFeedback(
    analyst: Analyst,
    newStatus: PortfolioStatus,
    drawdownPercent: number,
  ): BossFeedback {
    let message: string;
    let contextModification: string | undefined;

    switch (newStatus) {
      case 'warning':
        message =
          `Your recent performance has declined. Your balance has dropped ${drawdownPercent.toFixed(0)}% from initial. ` +
          `Focus on higher-conviction setups and consider being more selective with your calls.`;
        break;

      case 'probation':
        message =
          `Your account has entered probation due to significant losses (${drawdownPercent.toFixed(0)}% drawdown). ` +
          `Your weight in the ensemble has been reduced by 50%. ` +
          `You must demonstrate improved judgment before returning to full participation. ` +
          `Reserve high-confidence ratings (>80%) for only the strongest setups.`;
        contextModification =
          `IMPORTANT: Your recent calls have resulted in significant losses. ` +
          `Until your performance improves, apply higher scrutiny to potential trades ` +
          `and reserve high-confidence ratings (>80%) for only the strongest setups.`;
        break;

      case 'suspended':
        message =
          `Your account has been suspended due to severe losses (${drawdownPercent.toFixed(0)}% drawdown). ` +
          `You will continue making assessments in paper-only mode. ` +
          `These will not affect the ensemble but will be tracked. ` +
          `Demonstrate consistent improvement in paper mode to begin recovery.`;
        contextModification =
          `CRITICAL: You are in SUSPENDED status due to significant losses. ` +
          `Your assessments will be tracked but NOT included in the ensemble. ` +
          `Focus on rebuilding your track record through careful, high-quality analysis.`;
        break;

      case 'active':
        message =
          `Congratulations! Your performance has improved and you have returned to active status. ` +
          `Continue making disciplined, well-reasoned calls.`;
        break;

      default:
        // This should never be reached as all PortfolioStatus values are handled
        message = `Status updated to ${newStatus as string}.`;
    }

    return {
      analystId: analyst.id,
      status: newStatus,
      message,
      contextModification,
    };
  }

  /**
   * Format performance context as markdown for prompt injection
   */
  formatPerformanceContextForPrompt(context: PerformanceContext): string {
    const lines: string[] = [
      '## Your Performance Status',
      `- Current Balance: $${context.currentBalance.toLocaleString()} (started with $${context.initialBalance.toLocaleString()})`,
      `- P&L: ${context.pnlAmount >= 0 ? '+' : ''}$${context.pnlAmount.toLocaleString()} (${context.pnlPercent >= 0 ? '+' : ''}${context.pnlPercent.toFixed(1)}%)`,
      `- Win Rate: ${(context.winRate * 100).toFixed(0)}% (${context.winCount} wins / ${context.lossCount} losses)`,
    ];

    if (context.rank && context.totalAnalysts) {
      lines.push(
        `- Rank: #${context.rank} of ${context.totalAnalysts} analysts`,
      );
    }

    // Add peer comparison
    if (context.peerComparison && context.peerComparison.length > 0) {
      lines.push('');
      lines.push('## Peer Comparison');
      for (const peer of context.peerComparison) {
        const marker = peer.isCurrentAnalyst ? 'YOU: ' : '';
        const pnlStr =
          peer.pnlAmount >= 0
            ? `+$${peer.pnlAmount.toLocaleString()}`
            : `-$${Math.abs(peer.pnlAmount).toLocaleString()}`;
        lines.push(`${peer.rank}. ${marker}${peer.slug}: ${pnlStr}`);
      }
    }

    // Add status-specific notice
    if (context.statusMessage) {
      lines.push('');
      lines.push('## Performance Notice');
      lines.push(context.statusMessage);
    }

    return lines.join('\n');
  }

  /**
   * Get effective weight for an analyst based on status
   * Probation status reduces weight by 50%
   */
  getEffectiveWeight(baseWeight: number, status: PortfolioStatus): number {
    if (status === 'probation') {
      return baseWeight * this.thresholds.probation.weightMultiplier;
    }
    if (status === 'suspended') {
      return 0; // No weight when suspended
    }
    return baseWeight;
  }

  /**
   * Check if analyst should be included in ensemble
   */
  shouldIncludeInEnsemble(status: PortfolioStatus): boolean {
    return status !== 'suspended';
  }

  /**
   * Check if analyst is in recovery mode (paper-only)
   */
  isInRecoveryMode(status: PortfolioStatus): boolean {
    return status === 'suspended';
  }

  /**
   * Check if an analyst in paper-only mode qualifies for recovery
   * Returns true if paper performance shows +20% gain
   */
  async checkRecoveryEligibility(analystId: string): Promise<{
    eligible: boolean;
    paperPnlPercent: number;
    message: string;
  }> {
    const portfolio = await this.portfolioRepository.getAnalystPortfolio(
      analystId,
      'ai',
    );

    if (!portfolio || portfolio.status !== 'suspended') {
      return {
        eligible: false,
        paperPnlPercent: 0,
        message: 'Not in suspended status',
      };
    }

    // Get paper-only positions performance
    // For now, we'll use the overall portfolio P&L since suspension
    // In production, you'd track paper-only positions separately
    const currentPnl = portfolio.current_balance - portfolio.initial_balance;
    const paperPnlPercent = (currentPnl / portfolio.initial_balance) * 100;

    // Recovery threshold: need to show +20% improvement in paper mode
    const recoveryThreshold = 20;
    const eligible = paperPnlPercent >= recoveryThreshold;

    return {
      eligible,
      paperPnlPercent,
      message: eligible
        ? `Paper performance improved by ${paperPnlPercent.toFixed(1)}% - eligible for probation`
        : `Paper performance at ${paperPnlPercent.toFixed(1)}% - need ${recoveryThreshold}% to recover`,
    };
  }

  /**
   * Process recovery for a suspended analyst
   * Upgrades from suspended to probation if eligible
   */
  async processRecovery(analystId: string): Promise<StatusChangeEvent | null> {
    const eligibility = await this.checkRecoveryEligibility(analystId);

    if (!eligibility.eligible) {
      this.logger.log(
        `Analyst ${analystId} not eligible for recovery: ${eligibility.message}`,
      );
      return null;
    }

    const portfolio = await this.portfolioRepository.getAnalystPortfolio(
      analystId,
      'ai',
    );

    if (!portfolio) {
      return null;
    }

    const analyst = await this.analystRepository.findById(analystId);
    if (!analyst) {
      return null;
    }

    // Upgrade to probation
    await this.updatePortfolioStatus(portfolio.id, 'probation');

    const event: StatusChangeEvent = {
      analystId,
      analystSlug: analyst.slug,
      previousStatus: 'suspended',
      newStatus: 'probation',
      currentBalance: portfolio.current_balance,
      initialBalance: portfolio.initial_balance,
      drawdownPercent:
        ((portfolio.initial_balance - portfolio.current_balance) /
          portfolio.initial_balance) *
        100,
      triggerReason: `Recovery from suspension: paper P&L improved to ${eligibility.paperPnlPercent.toFixed(1)}%`,
    };

    this.logger.log(
      `Analyst ${analyst.slug} recovered from suspended to probation (paper P&L: ${eligibility.paperPnlPercent.toFixed(1)}%)`,
    );

    // Log the recovery
    await this.portfolioRepository.logAgentSelfModification(
      analystId,
      'status_change',
      `Recovered from suspended to probation`,
      {
        previous_status: 'suspended',
        new_status: 'probation',
        paper_pnl_percent: eligibility.paperPnlPercent,
        recovery_reason: event.triggerReason,
      },
      event.triggerReason,
      {
        initial_balance: portfolio.initial_balance,
        current_balance: portfolio.current_balance,
      },
    );

    return event;
  }

  /**
   * Check and process recovery for all suspended analysts
   * Should be called periodically (e.g., daily)
   */
  async processAllRecoveries(): Promise<StatusChangeEvent[]> {
    const portfolios =
      await this.portfolioRepository.getAllAnalystPortfolios('ai');
    const events: StatusChangeEvent[] = [];

    // Filter to suspended portfolios only
    const suspendedPortfolios = portfolios.filter(
      (p) => p.status === 'suspended',
    );

    for (const portfolio of suspendedPortfolios) {
      try {
        const event = await this.processRecovery(portfolio.analyst_id);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        this.logger.error(
          `Failed to process recovery for analyst ${portfolio.analyst_id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (events.length > 0) {
      this.logger.log(
        `Processed ${suspendedPortfolios.length} suspended portfolios, ${events.length} recoveries`,
      );
    }

    return events;
  }

  // =========================================================================
  // AGENT SELF-ADAPTATION
  // =========================================================================

  /**
   * Allow agent to adapt its own context based on performance
   * This is called when the AI fork decides to modify its own behavior
   */
  async recordAgentSelfAdaptation(
    input: AgentSelfAdaptationInput,
  ): Promise<void> {
    const {
      analystId,
      ruleType,
      ruleSummary,
      ruleDetails,
      triggerReason,
      performanceEvidence,
    } = input;

    const analyst = await this.analystRepository.findById(analystId);
    if (!analyst) {
      this.logger.error(`Analyst ${analystId} not found for self-adaptation`);
      return;
    }

    // Create modified tier instructions
    let modifiedTierInstructions = { ...analyst.tier_instructions };
    const timestamp = new Date().toISOString().slice(0, 10);

    switch (ruleType) {
      case 'add': {
        // Append the new rule to the silver tier instructions
        const currentSilver = modifiedTierInstructions.silver || '';
        modifiedTierInstructions = {
          ...modifiedTierInstructions,
          silver:
            `${currentSilver}\n\n[Self-learned ${timestamp}] ${ruleDetails}`.trim(),
        };
        break;
      }
      case 'modify': {
        // In a more sophisticated system, we'd parse and modify specific rules
        // For now, we append a modification note
        const modifySilver = modifiedTierInstructions.silver || '';
        modifiedTierInstructions = {
          ...modifiedTierInstructions,
          silver:
            `${modifySilver}\n\n[Modified ${timestamp}] ${ruleDetails}`.trim(),
        };
        break;
      }
      case 'remove': {
        // Log the removal but keep the rule visible (marked as deprecated)
        const removeSilver = modifiedTierInstructions.silver || '';
        modifiedTierInstructions = {
          ...modifiedTierInstructions,
          silver:
            `${removeSilver}\n\n[Deprecated ${timestamp}] No longer using: ${ruleSummary}`.trim(),
        };
        break;
      }
    }

    try {
      // Create a new context version with the adaptation
      await this.analystRepository.createContextVersion(
        analystId,
        'ai',
        analyst.perspective,
        modifiedTierInstructions,
        analyst.default_weight,
        `Self-adaptation: ${ruleSummary}`,
        'agent_self',
      );

      // Log the modification for HITL notification
      await this.portfolioRepository.logAgentSelfModification(
        analystId,
        ruleType === 'add'
          ? 'rule_added'
          : ruleType === 'modify'
            ? 'rule_modified'
            : 'rule_removed',
        ruleSummary,
        {
          rule_type: ruleType,
          rule_details: ruleDetails,
          performance_evidence: performanceEvidence,
        },
        triggerReason,
        performanceEvidence,
      );

      this.logger.log(
        `Agent ${analyst.slug} self-adapted: ${ruleType} - ${ruleSummary}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to record self-adaptation for analyst ${analystId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Record agent journal entry (self-notes about strategies)
   */
  async recordAgentJournalEntry(
    analystId: string,
    entry: string,
    relatedContext?: Record<string, unknown>,
  ): Promise<void> {
    const analyst = await this.analystRepository.findById(analystId);
    if (!analyst) {
      this.logger.error(`Analyst ${analystId} not found for journal entry`);
      return;
    }

    try {
      // Get current context version to append journal
      const currentVersions =
        await this.analystRepository.getAllCurrentContextVersions('ai');
      const currentVersion = currentVersions.get(analystId);

      const currentJournal = currentVersion?.agent_journal || '';
      const timestamp = new Date().toISOString();
      const updatedJournal =
        `${currentJournal}\n\n[${timestamp}] ${entry}`.trim();

      // Create new version with updated journal
      await this.analystRepository.createContextVersion(
        analystId,
        'ai',
        analyst.perspective,
        analyst.tier_instructions,
        analyst.default_weight,
        `Journal entry: ${entry.slice(0, 50)}...`,
        'agent_self',
        updatedJournal,
      );

      // Log the journal entry
      await this.portfolioRepository.logAgentSelfModification(
        analystId,
        'journal_entry',
        `Journal: ${entry.slice(0, 100)}...`,
        {
          full_entry: entry,
          related_context: relatedContext,
        },
        'Self-reflection',
        relatedContext,
      );

      this.logger.log(
        `Agent ${analyst.slug} journal entry: ${entry.slice(0, 50)}...`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to record journal entry for analyst ${analystId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private async updatePortfolioStatus(
    portfolioId: string,
    newStatus: PortfolioStatus,
  ): Promise<void> {
    // Use raw update since we need to set status_changed_at
    await this.db
      .from('prediction', 'analyst_portfolios')
      .update({
        status: newStatus,
        status_changed_at: new Date().toISOString(),
      })
      .eq('id', portfolioId);
  }

  private getStatusChangeReason(
    previousStatus: PortfolioStatus,
    newStatus: PortfolioStatus,
    drawdownPercent: number,
  ): string {
    if (this.isUpgrade(previousStatus, newStatus)) {
      return `Performance improved - upgraded from ${previousStatus} to ${newStatus}`;
    }

    switch (newStatus) {
      case 'warning':
        return `Balance dropped to warning threshold (${drawdownPercent.toFixed(0)}% drawdown)`;
      case 'probation':
        return `Significant losses triggered probation (${drawdownPercent.toFixed(0)}% drawdown)`;
      case 'suspended':
        return `Severe losses triggered suspension (${drawdownPercent.toFixed(0)}% drawdown)`;
      default:
        return `Status changed due to balance movement`;
    }
  }

  private isUpgrade(
    previousStatus: PortfolioStatus,
    newStatus: PortfolioStatus,
  ): boolean {
    const statusOrder: PortfolioStatus[] = [
      'suspended',
      'probation',
      'warning',
      'active',
    ];
    const prevIndex = statusOrder.indexOf(previousStatus);
    const newIndex = statusOrder.indexOf(newStatus);
    return newIndex > prevIndex;
  }

  private getStatusMessage(
    status: PortfolioStatus,
    pnlPercent: number,
  ): string {
    switch (status) {
      case 'warning':
        return (
          `Your recent performance (${pnlPercent.toFixed(1)}%) has triggered a warning. ` +
          `Consider being more selective with high-confidence calls until accuracy improves.`
        );
      case 'probation':
        return (
          `PROBATION: Your account is under review due to significant losses (${pnlPercent.toFixed(1)}%). ` +
          `Your ensemble weight has been reduced. Focus on high-conviction setups only.`
        );
      case 'suspended':
        return (
          `SUSPENDED: Your assessments are paper-only due to severe drawdown (${pnlPercent.toFixed(1)}%). ` +
          `Demonstrate consistent improvement to begin recovery.`
        );
      default:
        return '';
    }
  }
}

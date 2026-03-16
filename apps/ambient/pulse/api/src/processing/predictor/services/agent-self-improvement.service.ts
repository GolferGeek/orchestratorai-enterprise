import { Injectable, Logger } from '@nestjs/common';
import { PortfolioRepository } from '../repositories/portfolio.repository';
import { AnalystRepository } from '../repositories/analyst.repository';
import {
  AnalystMotivationService,
  AgentSelfAdaptationInput,
} from './analyst-motivation.service';
import { EvaluationResult } from './evaluation.service';
import {
  AnalystPortfolio,
  AnalystPosition,
} from '../interfaces/portfolio.interface';

/**
 * Pattern detection result for triggering self-adaptation
 */
export interface PatternDetectionResult {
  patternType:
    | 'consecutive_losses'
    | 'sector_weakness'
    | 'timeframe_issue'
    | 'confidence_calibration'
    | 'magnitude_error';
  analystId: string;
  description: string;
  evidenceCount: number;
  suggestedAdaptation: {
    ruleType: 'add' | 'modify' | 'remove';
    ruleSummary: string;
    ruleDetails: string;
  };
}

/**
 * Self-improvement trigger configuration
 */
export interface SelfImprovementConfig {
  // Minimum consecutive losses before triggering adaptation
  minConsecutiveLosses: number;
  // Minimum drawdown percent to trigger urgent adaptation
  urgentDrawdownThreshold: number;
  // Minimum positions to analyze for patterns
  minPositionsForPattern: number;
  // Win rate threshold below which to trigger adaptation
  lowWinRateThreshold: number;
}

const DEFAULT_CONFIG: SelfImprovementConfig = {
  minConsecutiveLosses: 3,
  urgentDrawdownThreshold: 20, // -20%
  minPositionsForPattern: 5,
  lowWinRateThreshold: 0.4, // 40%
};

/**
 * Agent Self-Improvement Service
 *
 * Analyzes ai fork performance after predictions are resolved and
 * triggers self-adaptation when patterns are detected:
 *
 * - Consecutive losses → Add caution rule
 * - Sector-specific weakness → Add sector filter
 * - Timeframe issues → Adjust horizon preferences
 * - Confidence calibration → Recalibrate confidence thresholds
 * - Magnitude errors → Adjust magnitude expectations
 *
 * All adaptations are logged for HITL visibility (informational, no approval needed)
 */
@Injectable()
export class AgentSelfImprovementService {
  private readonly logger = new Logger(AgentSelfImprovementService.name);
  private readonly config: SelfImprovementConfig;

  constructor(
    private readonly portfolioRepository: PortfolioRepository,
    private readonly analystRepository: AnalystRepository,
    private readonly motivationService: AnalystMotivationService,
  ) {
    this.config = DEFAULT_CONFIG;
  }

  /**
   * Analyze and potentially trigger self-improvement for an analyst's ai fork
   * Called after a prediction involving this analyst is evaluated
   */
  async analyzeAndAdapt(
    analystId: string,
    evaluationResult: EvaluationResult,
  ): Promise<PatternDetectionResult[]> {
    this.logger.debug(
      `Analyzing self-improvement for analyst ${analystId} after evaluation`,
    );

    // Get the ai portfolio
    const portfolio = await this.portfolioRepository.getAnalystPortfolio(
      analystId,
      'ai',
    );

    if (!portfolio) {
      this.logger.warn(`No ai portfolio found for analyst ${analystId}`);
      return [];
    }

    // Get recent closed positions for pattern analysis
    const positions =
      await this.portfolioRepository.getClosedPositionsForAnalyst(portfolio.id);

    if (positions.length < this.config.minPositionsForPattern) {
      this.logger.debug(
        `Not enough positions (${positions.length}) for pattern analysis`,
      );
      return [];
    }

    // Detect patterns
    const patterns: PatternDetectionResult[] = [];

    // Check for consecutive losses
    const consecutiveLossPattern = this.detectConsecutiveLosses(
      analystId,
      positions,
    );
    if (consecutiveLossPattern) {
      patterns.push(consecutiveLossPattern);
    }

    // Check for confidence calibration issues
    const confidencePattern = this.detectConfidenceCalibrationIssue(
      analystId,
      positions,
      evaluationResult,
    );
    if (confidencePattern) {
      patterns.push(confidencePattern);
    }

    // Check for low win rate
    const winRatePattern = this.detectLowWinRate(analystId, portfolio);
    if (winRatePattern) {
      patterns.push(winRatePattern);
    }

    // Check for significant drawdown
    const drawdownPattern = this.detectSignificantDrawdown(
      analystId,
      portfolio,
    );
    if (drawdownPattern) {
      patterns.push(drawdownPattern);
    }

    // Apply adaptations for detected patterns
    for (const pattern of patterns) {
      await this.applyAdaptation(pattern);
    }

    if (patterns.length > 0) {
      this.logger.log(
        `Analyst ${analystId} self-improvement: ${patterns.length} patterns detected and adapted`,
      );
    }

    return patterns;
  }

  /**
   * Run periodic self-improvement analysis for all ai forks
   * Should be called daily or after batch evaluations
   */
  async runPeriodicAnalysis(): Promise<Map<string, PatternDetectionResult[]>> {
    this.logger.log('Running periodic self-improvement analysis');

    const portfolios =
      await this.portfolioRepository.getAllAnalystPortfolios('ai');
    const results = new Map<string, PatternDetectionResult[]>();

    for (const portfolio of portfolios) {
      try {
        // Create a mock evaluation result for periodic analysis
        const mockEvaluation: EvaluationResult = {
          predictionId: 'periodic-check',
          directionCorrect: true,
          magnitudeAccuracy: 0.5,
          timingAccuracy: 0.5,
          overallScore: 0.5,
          actualDirection: 'flat',
          actualMagnitude: 0,
          details: {
            predictedDirection: 'flat',
            predictedMagnitude: 0,
            predictedConfidence: 0.5,
            horizonHours: 24,
          },
        };

        const patterns = await this.analyzeAndAdapt(
          portfolio.analyst_id,
          mockEvaluation,
        );

        if (patterns.length > 0) {
          results.set(portfolio.analyst_id, patterns);
        }
      } catch (error) {
        this.logger.error(
          `Failed to analyze analyst ${portfolio.analyst_id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Periodic analysis complete: ${results.size} analysts had adaptations`,
    );

    return results;
  }

  // =============================================================================
  // PATTERN DETECTION
  // =============================================================================

  /**
   * Detect consecutive losses pattern
   */
  private detectConsecutiveLosses(
    analystId: string,
    positions: AnalystPosition[],
  ): PatternDetectionResult | null {
    // Sort by closed_at descending to get most recent first
    const sorted = [...positions]
      .filter((p) => p.closed_at)
      .sort(
        (a, b) =>
          new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime(),
      );

    // Count consecutive losses from the most recent
    let consecutiveLosses = 0;
    for (const pos of sorted) {
      if (pos.realized_pnl !== undefined && pos.realized_pnl < 0) {
        consecutiveLosses++;
      } else {
        break;
      }
    }

    if (consecutiveLosses >= this.config.minConsecutiveLosses) {
      return {
        patternType: 'consecutive_losses',
        analystId,
        description: `${consecutiveLosses} consecutive losing trades detected`,
        evidenceCount: consecutiveLosses,
        suggestedAdaptation: {
          ruleType: 'add',
          ruleSummary: `Added caution after ${consecutiveLosses} consecutive losses`,
          ruleDetails:
            'After a losing streak, apply extra scrutiny to new signals. ' +
            'Consider reducing position sizes and requiring higher conviction before entering trades.',
        },
      };
    }

    return null;
  }

  /**
   * Detect confidence calibration issues
   * High confidence calls with poor outcomes
   */
  private detectConfidenceCalibrationIssue(
    analystId: string,
    positions: AnalystPosition[],
    _evaluation: EvaluationResult,
  ): PatternDetectionResult | null {
    // This would require linking positions back to assessments for confidence data
    // For now, we'll use a simplified heuristic based on loss rates
    const recentPositions = positions.slice(0, 10);
    const losses = recentPositions.filter(
      (p) => p.realized_pnl !== undefined && p.realized_pnl < 0,
    );

    // If more than 60% of recent positions are losses, may indicate overconfidence
    if (
      recentPositions.length >= 5 &&
      losses.length / recentPositions.length > 0.6
    ) {
      return {
        patternType: 'confidence_calibration',
        analystId,
        description: `${losses.length}/${recentPositions.length} recent positions were losses - possible overconfidence`,
        evidenceCount: losses.length,
        suggestedAdaptation: {
          ruleType: 'modify',
          ruleSummary: 'Recalibrating confidence thresholds',
          ruleDetails:
            'Recent performance suggests confidence levels may be too high. ' +
            'Reserve high-confidence ratings (>80%) for only the strongest setups ' +
            'with multiple confirming signals.',
        },
      };
    }

    return null;
  }

  /**
   * Detect low win rate over time
   */
  private detectLowWinRate(
    analystId: string,
    portfolio: AnalystPortfolio,
  ): PatternDetectionResult | null {
    const totalTrades = portfolio.win_count + portfolio.loss_count;

    if (totalTrades < this.config.minPositionsForPattern) {
      return null;
    }

    const winRate = portfolio.win_count / totalTrades;

    if (winRate < this.config.lowWinRateThreshold) {
      return {
        patternType: 'confidence_calibration',
        analystId,
        description: `Win rate ${(winRate * 100).toFixed(1)}% is below threshold`,
        evidenceCount: totalTrades,
        suggestedAdaptation: {
          ruleType: 'add',
          ruleSummary: `Improving selectivity after ${(winRate * 100).toFixed(0)}% win rate`,
          ruleDetails:
            'Overall win rate indicates a need for more selective entry criteria. ' +
            'Focus on higher-conviction setups and consider waiting for additional ' +
            'confirmation before acting on signals.',
        },
      };
    }

    return null;
  }

  /**
   * Detect significant drawdown requiring urgent adaptation
   */
  private detectSignificantDrawdown(
    analystId: string,
    portfolio: AnalystPortfolio,
  ): PatternDetectionResult | null {
    const drawdownPercent =
      ((portfolio.initial_balance - portfolio.current_balance) /
        portfolio.initial_balance) *
      100;

    if (drawdownPercent >= this.config.urgentDrawdownThreshold) {
      return {
        patternType: 'consecutive_losses',
        analystId,
        description: `Significant drawdown of ${drawdownPercent.toFixed(1)}%`,
        evidenceCount: 1,
        suggestedAdaptation: {
          ruleType: 'add',
          ruleSummary: `Risk management after ${drawdownPercent.toFixed(0)}% drawdown`,
          ruleDetails:
            `Account has experienced a ${drawdownPercent.toFixed(1)}% drawdown from initial balance. ` +
            'Implement stricter risk management: reduce position sizes, ' +
            'require higher confidence for entries, and consider avoiding ' +
            'volatile setups until performance stabilizes.',
        },
      };
    }

    return null;
  }

  // =============================================================================
  // ADAPTATION APPLICATION
  // =============================================================================

  /**
   * Apply a detected pattern adaptation via the motivation service
   */
  private async applyAdaptation(
    pattern: PatternDetectionResult,
  ): Promise<void> {
    const input: AgentSelfAdaptationInput = {
      analystId: pattern.analystId,
      ruleType: pattern.suggestedAdaptation.ruleType,
      ruleSummary: pattern.suggestedAdaptation.ruleSummary,
      ruleDetails: pattern.suggestedAdaptation.ruleDetails,
      triggerReason: `${pattern.patternType}: ${pattern.description} (evidence: ${pattern.evidenceCount} items)`,
      performanceEvidence: {
        // Use successRate to convey pattern strength
        successRate: pattern.evidenceCount > 0 ? 1 / pattern.evidenceCount : 0,
      },
    };

    try {
      await this.motivationService.recordAgentSelfAdaptation(input);
      this.logger.log(
        `Applied self-adaptation for analyst ${pattern.analystId}: ${pattern.suggestedAdaptation.ruleSummary}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to apply adaptation for analyst ${pattern.analystId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Record a journal entry for an agent reflecting on performance
   */
  async recordReflection(
    analystId: string,
    reflection: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    await this.motivationService.recordAgentJournalEntry(
      analystId,
      reflection,
      context,
    );
  }
}

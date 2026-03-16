import { Injectable, Logger } from '@nestjs/common';
import { PortfolioRepository } from '../repositories/portfolio.repository';
import { AnalystRepository } from '../repositories/analyst.repository';
import {
  ForkType,
  AnalystPerformanceMetrics,
} from '../interfaces/portfolio.interface';
import {
  AnalystAssessmentResult,
  EnsembleResult,
} from '../interfaces/ensemble.interface';

/**
 * Input for recording dissent tracking
 */
export interface DissentTrackingInput {
  analystId: string;
  forkType: ForkType;
  analystDirection: string;
  ensembleDirection: string;
  actualDirection: string;
}

/**
 * Daily metrics summary for an analyst
 */
export interface DailyMetricsSummary {
  analystId: string;
  forkType: ForkType;
  metricDate: string;
  soloPnl: number;
  contributionPnl: number;
  dissentAccuracy?: number;
  dissentCount: number;
  rankInPortfolio?: number;
  totalAnalysts?: number;
}

/**
 * Dissent record for tracking analyst accuracy when disagreeing
 */
interface DissentRecord {
  analystId: string;
  forkType: ForkType;
  wasCorrect: boolean;
  metricDate: string;
}

/**
 * Service for calculating and tracking analyst performance metrics
 * Tracks three key metrics per fork:
 * 1. Solo P&L - P&L if only this analyst's picks were used
 * 2. Contribution P&L - Weighted contribution to ensemble outcomes
 * 3. Dissent Accuracy - Accuracy when disagreeing with ensemble consensus
 */
@Injectable()
export class AnalystPerformanceService {
  private readonly logger = new Logger(AnalystPerformanceService.name);

  // In-memory dissent tracking (flushed daily to DB)
  private dissentRecords: DissentRecord[] = [];

  constructor(
    private readonly portfolioRepository: PortfolioRepository,
    private readonly analystRepository: AnalystRepository,
  ) {}

  /**
   * Calculate solo P&L for an analyst
   * This is the P&L if ONLY this analyst's positions were taken
   */
  async calculateSoloPnl(
    analystId: string,
    forkType: ForkType,
    startDate?: string,
    endDate?: string,
  ): Promise<number> {
    const portfolio = await this.portfolioRepository.getAnalystPortfolio(
      analystId,
      forkType,
    );

    if (!portfolio) {
      this.logger.warn(
        `No ${forkType} portfolio found for analyst ${analystId}`,
      );
      return 0;
    }

    const closedPositions =
      await this.portfolioRepository.getClosedPositionsForAnalyst(
        portfolio.id,
        startDate,
        endDate,
      );

    // Sum up all realized P&L from closed positions
    const soloPnl = closedPositions.reduce((total, position) => {
      return total + (position.realized_pnl ?? 0);
    }, 0);

    return soloPnl;
  }

  /**
   * Calculate contribution P&L for an analyst
   * This is the analyst's weighted share of ensemble outcomes
   *
   * Formula: analyst_weight * (1/total_analysts) * ensemble_outcome
   * Where ensemble_outcome is the P&L if the ensemble direction was traded
   */
  calculateContributionPnl(
    analystWeight: number,
    totalAnalysts: number,
    ensemblePnl: number,
    analystAgreedWithEnsemble: boolean,
  ): number {
    if (totalAnalysts === 0) return 0;

    // Base contribution is their share of the ensemble
    const baseContribution = (analystWeight / totalAnalysts) * ensemblePnl;

    // If analyst disagreed with ensemble but ensemble was right, their contribution is negative
    // If analyst agreed with ensemble, they get positive contribution
    // If analyst disagreed and ensemble was wrong, they get positive contribution (they were right)
    if (analystAgreedWithEnsemble) {
      return baseContribution;
    } else {
      // Dissenter: if ensemble was right (positive P&L), dissenter hurt the team
      // If ensemble was wrong (negative P&L), dissenter helped by advocating different
      return -baseContribution;
    }
  }

  /**
   * Track a dissent event when analyst disagrees with ensemble
   */
  trackDissent(input: DissentTrackingInput): void {
    const {
      analystId,
      forkType,
      analystDirection,
      ensembleDirection,
      actualDirection,
    } = input;

    // Only track if analyst disagreed with ensemble
    if (analystDirection.toLowerCase() === ensembleDirection.toLowerCase()) {
      return;
    }

    // Determine if the analyst was correct
    const wasCorrect =
      analystDirection.toLowerCase() === actualDirection.toLowerCase();

    const metricDate = new Date().toISOString().slice(0, 10);
    this.dissentRecords.push({
      analystId,
      forkType,
      wasCorrect,
      metricDate,
    });

    this.logger.log(
      `Tracked dissent for analyst ${analystId} (${forkType}): analyst=${analystDirection}, ensemble=${ensembleDirection}, actual=${actualDirection}, correct=${wasCorrect}`,
    );
  }

  /**
   * Calculate dissent accuracy for an analyst on a specific date
   * Returns the percentage of times the analyst was correct when they disagreed with ensemble
   */
  calculateDissentAccuracy(
    analystId: string,
    forkType: ForkType,
    metricDate: string,
  ): { accuracy: number | undefined; count: number } {
    const relevantRecords = this.dissentRecords.filter(
      (r) =>
        r.analystId === analystId &&
        r.forkType === forkType &&
        r.metricDate === metricDate,
    );

    if (relevantRecords.length === 0) {
      return { accuracy: undefined, count: 0 };
    }

    const correctCount = relevantRecords.filter((r) => r.wasCorrect).length;
    const accuracy = correctCount / relevantRecords.length;

    return { accuracy, count: relevantRecords.length };
  }

  /**
   * Process ensemble result to track dissents when prediction is resolved
   */
  trackDissentFromEnsembleResult(
    ensembleResult: EnsembleResult,
    actualDirection: string,
    forkType: ForkType,
  ): void {
    const ensembleDirection = ensembleResult.aggregated.direction;

    for (const assessment of ensembleResult.assessments) {
      this.trackDissent({
        analystId: assessment.analyst.analyst_id,
        forkType,
        analystDirection: assessment.direction,
        ensembleDirection,
        actualDirection,
      });
    }
  }

  /**
   * Calculate and save daily performance metrics for all analysts
   * Should be called at end of trading day or during batch processing
   */
  async calculateAndSaveDailyMetrics(
    forkType: ForkType,
    metricDate: string,
    ensemblePnl: number,
  ): Promise<AnalystPerformanceMetrics[]> {
    // Get all analysts
    const analysts = await this.analystRepository.getActive();
    const totalAnalysts = analysts.length;

    if (totalAnalysts === 0) {
      this.logger.warn('No active analysts found');
      return [];
    }

    // Calculate metrics for each analyst
    const metricsResults: AnalystPerformanceMetrics[] = [];
    const soloPnls: { analystId: string; soloPnl: number }[] = [];

    for (const analyst of analysts) {
      const soloPnl = await this.calculateSoloPnl(
        analyst.id,
        forkType,
        metricDate,
        metricDate,
      );
      soloPnls.push({ analystId: analyst.id, soloPnl });
    }

    // Sort by solo P&L to determine rank
    soloPnls.sort((a, b) => b.soloPnl - a.soloPnl);

    // Create rank map
    const rankMap = new Map<string, number>();
    soloPnls.forEach((item, index) => {
      rankMap.set(item.analystId, index + 1);
    });

    // Save metrics for each analyst
    for (const analyst of analysts) {
      const soloPnl =
        soloPnls.find((s) => s.analystId === analyst.id)?.soloPnl ?? 0;
      const { accuracy: dissentAccuracy, count: dissentCount } =
        this.calculateDissentAccuracy(analyst.id, forkType, metricDate);

      // Get portfolio for weight (not currently used but kept for future weighting)
      await this.portfolioRepository.getAnalystPortfolio(analyst.id, forkType);

      // Calculate contribution P&L (assuming equal weight for now)
      // In production, we'd look at actual ensemble participation
      const contributionPnl = this.calculateContributionPnl(
        analyst.default_weight,
        totalAnalysts,
        ensemblePnl,
        true, // Simplified: assume agreement for daily rollup
      );

      const metrics = await this.portfolioRepository.upsertPerformanceMetrics(
        analyst.id,
        forkType,
        metricDate,
        {
          solo_pnl: soloPnl,
          contribution_pnl: contributionPnl,
          dissent_accuracy: dissentAccuracy,
          dissent_count: dissentCount,
          rank_in_portfolio: rankMap.get(analyst.id),
          total_analysts: totalAnalysts,
        },
      );

      metricsResults.push(metrics);

      this.logger.log(
        `Saved metrics for analyst ${analyst.slug} (${forkType}): solo=$${soloPnl.toFixed(2)}, contribution=$${contributionPnl.toFixed(2)}, dissent=${dissentCount} (${dissentAccuracy !== undefined ? (dissentAccuracy * 100).toFixed(1) + '%' : 'N/A'}), rank=${rankMap.get(analyst.id)}/${totalAnalysts}`,
      );
    }

    // Clear dissent records for this date after processing
    this.dissentRecords = this.dissentRecords.filter(
      (r) => r.metricDate !== metricDate || r.forkType !== forkType,
    );

    return metricsResults;
  }

  /**
   * Get performance summary for an analyst
   */
  async getAnalystPerformanceSummary(
    analystId: string,
    forkType: ForkType,
    days: number = 30,
  ): Promise<{
    totalSoloPnl: number;
    totalContributionPnl: number;
    avgDissentAccuracy?: number;
    totalDissentCount: number;
    avgRank?: number;
    metrics: AnalystPerformanceMetrics[];
  }> {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const metrics = await this.portfolioRepository.getPerformanceMetrics(
      analystId,
      forkType,
      startDate,
      endDate,
    );

    if (metrics.length === 0) {
      return {
        totalSoloPnl: 0,
        totalContributionPnl: 0,
        avgDissentAccuracy: undefined,
        totalDissentCount: 0,
        avgRank: undefined,
        metrics: [],
      };
    }

    const totalSoloPnl = metrics.reduce((sum, m) => sum + m.solo_pnl, 0);
    const totalContributionPnl = metrics.reduce(
      (sum, m) => sum + m.contribution_pnl,
      0,
    );
    const totalDissentCount = metrics.reduce(
      (sum, m) => sum + m.dissent_count,
      0,
    );

    // Calculate weighted average dissent accuracy
    const metricsWithDissent = metrics.filter(
      (m) =>
        m.dissent_accuracy !== null &&
        m.dissent_accuracy !== undefined &&
        m.dissent_count > 0,
    );
    let avgDissentAccuracy: number | undefined;
    if (metricsWithDissent.length > 0) {
      const totalWeightedAccuracy = metricsWithDissent.reduce(
        (sum, m) => sum + (m.dissent_accuracy ?? 0) * m.dissent_count,
        0,
      );
      const totalWeight = metricsWithDissent.reduce(
        (sum, m) => sum + m.dissent_count,
        0,
      );
      avgDissentAccuracy =
        totalWeight > 0 ? totalWeightedAccuracy / totalWeight : undefined;
    }

    // Calculate average rank
    const metricsWithRank = metrics.filter(
      (m) => m.rank_in_portfolio !== null && m.rank_in_portfolio !== undefined,
    );
    const avgRank =
      metricsWithRank.length > 0
        ? metricsWithRank.reduce(
            (sum, m) => sum + (m.rank_in_portfolio ?? 0),
            0,
          ) / metricsWithRank.length
        : undefined;

    return {
      totalSoloPnl,
      totalContributionPnl,
      avgDissentAccuracy,
      totalDissentCount,
      avgRank,
      metrics,
    };
  }

  /**
   * Get leaderboard for a fork type
   */
  async getLeaderboard(forkType: ForkType): Promise<
    Array<{
      analystId: string;
      slug: string;
      soloPnl: number;
      contributionPnl: number;
      dissentAccuracy?: number;
      dissentCount: number;
      rank: number;
    }>
  > {
    const latestMetrics =
      await this.portfolioRepository.getLatestPerformanceMetricsForAllAnalysts(
        forkType,
      );

    // Get analyst details
    const analysts = await this.analystRepository.getActive();
    const analystMap = new Map(analysts.map((a) => [a.id, a]));

    return latestMetrics.map((m) => ({
      analystId: m.analyst_id,
      slug: analystMap.get(m.analyst_id)?.slug ?? 'unknown',
      soloPnl: m.solo_pnl,
      contributionPnl: m.contribution_pnl,
      dissentAccuracy: m.dissent_accuracy ?? undefined,
      dissentCount: m.dissent_count,
      rank: m.rank_in_portfolio ?? 0,
    }));
  }

  /**
   * Process prediction outcome and update all relevant metrics
   * Called when a prediction is resolved
   */
  processPredictionOutcome(
    predictionId: string,
    actualDirection: string,
    _ensemblePnl: number,
    userAssessments: AnalystAssessmentResult[],
    agentAssessments: AnalystAssessmentResult[],
  ): void {
    // Track dissents for both forks
    if (userAssessments.length > 0) {
      // Build a pseudo ensemble result for user fork
      const userEnsembleDirection =
        this.calculateMajorityDirection(userAssessments);
      for (const assessment of userAssessments) {
        this.trackDissent({
          analystId: assessment.analyst.analyst_id,
          forkType: 'user',
          analystDirection: assessment.direction,
          ensembleDirection: userEnsembleDirection,
          actualDirection,
        });
      }
    }

    if (agentAssessments.length > 0) {
      // Build a pseudo ensemble result for ai fork
      const aiEnsembleDirection =
        this.calculateMajorityDirection(agentAssessments);
      for (const assessment of agentAssessments) {
        this.trackDissent({
          analystId: assessment.analyst.analyst_id,
          forkType: 'ai',
          analystDirection: assessment.direction,
          ensembleDirection: aiEnsembleDirection,
          actualDirection,
        });
      }
    }

    this.logger.log(
      `Processed prediction ${predictionId} outcome: actual=${actualDirection}, tracked ${userAssessments.length} user and ${agentAssessments.length} agent dissent records`,
    );
  }

  /**
   * Calculate majority direction from assessments
   */
  private calculateMajorityDirection(
    assessments: AnalystAssessmentResult[],
  ): string {
    const directionCounts = new Map<string, number>();

    for (const assessment of assessments) {
      const dir = assessment.direction.toLowerCase();
      directionCounts.set(
        dir,
        (directionCounts.get(dir) ?? 0) + assessment.analyst.effective_weight,
      );
    }

    let maxDirection = '';
    let maxWeight = 0;
    for (const [dir, weight] of directionCounts) {
      if (weight > maxWeight) {
        maxWeight = weight;
        maxDirection = dir;
      }
    }

    return maxDirection;
  }

  /**
   * Clear in-memory dissent records (for testing)
   */
  clearDissentRecords(): void {
    this.dissentRecords = [];
  }
}

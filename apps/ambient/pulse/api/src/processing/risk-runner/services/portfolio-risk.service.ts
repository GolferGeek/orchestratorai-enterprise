/**
 * Portfolio Risk Aggregation Service
 *
 * Phase 5: Portfolio-level risk aggregation across multiple subjects
 * Provides aggregate views, breakdowns, and trend analysis for scopes
 */

import { Injectable, Logger } from '@nestjs/common';
import { SubjectRepository } from '../repositories/subject.repository';
import { CompositeScoreRepository } from '../repositories/composite-score.repository';
import { AssessmentRepository } from '../repositories/assessment.repository';
import { AlertRepository } from '../repositories/alert.repository';
import { ScopeRepository } from '../repositories/scope.repository';
import { DimensionRepository } from '../repositories/dimension.repository';
import { CorrelationAnalysisService } from './correlation-analysis.service';
import {
  PortfolioRiskSummary,
  RiskDistribution,
  DimensionBreakdown,
  AlertsSummary,
  SubjectRiskContribution,
  PortfolioHeatmap,
  HeatmapSubject,
  HeatmapCell,
  PortfolioTrend,
  PortfolioTrendPoint,
} from '../interfaces/portfolio.interface';

export interface PortfolioAnalysisOptions {
  includeInactiveSubjects?: boolean;
  maxAlerts?: number;
}

@Injectable()
export class PortfolioRiskService {
  private readonly logger = new Logger(PortfolioRiskService.name);

  constructor(
    private readonly scopeRepo: ScopeRepository,
    private readonly subjectRepo: SubjectRepository,
    private readonly compositeScoreRepo: CompositeScoreRepository,
    private readonly assessmentRepo: AssessmentRepository,
    private readonly alertRepo: AlertRepository,
    private readonly dimensionRepo: DimensionRepository,
    private readonly correlationService: CorrelationAnalysisService,
  ) {}

  /**
   * Generate comprehensive portfolio risk summary for a scope
   */
  async getPortfolioSummary(
    scopeId: string,
    options: PortfolioAnalysisOptions = {},
  ): Promise<PortfolioRiskSummary> {
    const scope = await this.scopeRepo.findById(scopeId);
    if (!scope) {
      throw new Error(`Scope not found: ${scopeId}`);
    }

    // Get all subjects
    const subjects = await this.subjectRepo.findByScope(scopeId);
    const activeSubjects = options.includeInactiveSubjects
      ? subjects
      : subjects.filter((s) => s.is_active);

    // Get composite scores for all subjects
    const scores: Array<{ subjectId: string; score: number }> = [];
    for (const subject of activeSubjects) {
      const score = await this.compositeScoreRepo.findActiveBySubject(
        subject.id,
      );
      if (score) {
        scores.push({ subjectId: subject.id, score: score.overall_score });
      }
    }

    // Calculate risk distribution
    const riskDistribution = this.calculateRiskDistribution(
      scores.map((s) => s.score),
    );

    // Calculate aggregated metrics
    const scoreValues = scores.map((s) => s.score);
    const avgScore =
      scoreValues.length > 0
        ? Math.round(
            scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length,
          )
        : 0;
    const maxScore = scoreValues.length > 0 ? Math.max(...scoreValues) : 0;
    const minScore = scoreValues.length > 0 ? Math.min(...scoreValues) : 0;

    // Get dimension breakdown
    const dimensionBreakdown = await this.calculateDimensionBreakdown(scopeId);

    // Get alerts summary
    const alertsSummary = await this.getAlertsSummary(
      scopeId,
      options.maxAlerts ?? 5,
    );

    // Get concentration risk
    const concentrationRisk =
      await this.correlationService.analyzeConcentrationRisk(scopeId);

    return {
      scope_id: scopeId,
      scope_name: scope.name,
      total_subjects: activeSubjects.length,
      assessed_subjects: scores.length,
      average_risk_score: avgScore,
      weighted_risk_score: avgScore, // Equal weights for now
      max_risk_score: maxScore,
      min_risk_score: minScore,
      risk_distribution: riskDistribution,
      dimension_breakdown: dimensionBreakdown,
      alerts_summary: alertsSummary,
      concentration_risk: {
        concentration_score: concentrationRisk.concentration_score,
        risk_level: concentrationRisk.risk_level,
        highly_correlated_pairs: concentrationRisk.highly_correlated_pairs,
        recommendation:
          concentrationRisk.recommendations[0] ?? 'No specific recommendations',
      },
      calculated_at: new Date().toISOString(),
    };
  }

  /**
   * Get contribution of each subject to portfolio risk
   */
  async getSubjectContributions(
    scopeId: string,
  ): Promise<SubjectRiskContribution[]> {
    const subjects = await this.subjectRepo.findByScope(scopeId);
    const activeSubjects = subjects.filter((s) => s.is_active);

    const contributions: SubjectRiskContribution[] = [];
    let totalWeightedRisk = 0;

    // First pass: gather all data
    for (const subject of activeSubjects) {
      const score = await this.compositeScoreRepo.findActiveBySubject(
        subject.id,
      );
      const alerts = await this.alertRepo.findBySubject(subject.id);
      const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged_at);

      if (score) {
        const weight = (subject.metadata?.weight as number) ?? 1.0;
        const weightedContribution = score.overall_score * weight;
        totalWeightedRisk += weightedContribution;

        contributions.push({
          subject_id: subject.id,
          identifier: subject.identifier,
          name: subject.name,
          risk_score: score.overall_score,
          weight,
          weighted_contribution: weightedContribution,
          percentage_of_total: 0, // Calculate after we have total
          dimension_scores: score.dimension_scores,
          is_high_risk: score.overall_score >= 70,
          alerts_count: unacknowledgedAlerts.length,
        });
      }
    }

    // Second pass: calculate percentages
    for (const contribution of contributions) {
      contribution.percentage_of_total =
        totalWeightedRisk > 0
          ? Math.round(
              (contribution.weighted_contribution / totalWeightedRisk) * 100,
            )
          : 0;
    }

    // Sort by weighted contribution (highest risk first)
    return contributions.sort(
      (a, b) => b.weighted_contribution - a.weighted_contribution,
    );
  }

  /**
   * Generate portfolio heatmap data
   */
  async getPortfolioHeatmap(scopeId: string): Promise<PortfolioHeatmap> {
    const subjects = await this.subjectRepo.findByScope(scopeId);
    const activeSubjects = subjects.filter((s) => s.is_active);
    const dimensions = await this.dimensionRepo.findByScope(scopeId);

    const heatmapSubjects: HeatmapSubject[] = [];
    const cells: HeatmapCell[] = [];
    const dimensionSlugs = dimensions.map((d) => d.slug);

    // Collect all scores per dimension for relative scoring
    const dimensionScores: Map<string, number[]> = new Map();
    for (const dim of dimensions) {
      dimensionScores.set(dim.slug, []);
    }

    // First pass: gather data
    const subjectData: Array<{
      subject: HeatmapSubject;
      scores: Map<string, number>;
    }> = [];

    for (const subject of activeSubjects) {
      const compositeScore = await this.compositeScoreRepo.findActiveBySubject(
        subject.id,
      );

      if (compositeScore) {
        heatmapSubjects.push({
          id: subject.id,
          identifier: subject.identifier,
          overall_score: compositeScore.overall_score,
        });

        const scores = new Map<string, number>();
        for (const [dimSlug, score] of Object.entries(
          compositeScore.dimension_scores,
        )) {
          scores.set(dimSlug, score);
          const existing = dimensionScores.get(dimSlug) ?? [];
          existing.push(score);
          dimensionScores.set(dimSlug, existing);
        }

        subjectData.push({
          subject: {
            id: subject.id,
            identifier: subject.identifier,
            overall_score: compositeScore.overall_score,
          },
          scores,
        });
      }
    }

    // Calculate thresholds for relative scoring
    const dimensionThresholds = new Map<
      string,
      { low: number; high: number }
    >();
    for (const [dimSlug, scores] of dimensionScores.entries()) {
      if (scores.length > 0) {
        const sorted = [...scores].sort((a, b) => a - b);
        const percentile33 = sorted[Math.floor(scores.length * 0.33)] ?? 0;
        const percentile67 = sorted[Math.floor(scores.length * 0.67)] ?? 100;
        dimensionThresholds.set(dimSlug, {
          low: percentile33,
          high: percentile67,
        });
      }
    }

    // Second pass: create cells with relative scoring
    for (let subjIdx = 0; subjIdx < subjectData.length; subjIdx++) {
      const data = subjectData[subjIdx]!;

      for (let dimIdx = 0; dimIdx < dimensionSlugs.length; dimIdx++) {
        const dimSlug = dimensionSlugs[dimIdx]!;
        const score = data.scores.get(dimSlug) ?? 0;
        const thresholds = dimensionThresholds.get(dimSlug) ?? {
          low: 33,
          high: 67,
        };

        let relativeScore: 'low' | 'average' | 'high';
        if (score <= thresholds.low) {
          relativeScore = 'low';
        } else if (score >= thresholds.high) {
          relativeScore = 'high';
        } else {
          relativeScore = 'average';
        }

        cells.push({
          subject_index: subjIdx,
          dimension_index: dimIdx,
          score,
          relative_score: relativeScore,
        });
      }
    }

    return {
      scope_id: scopeId,
      subjects: heatmapSubjects,
      dimensions: dimensionSlugs,
      cells,
    };
  }

  /**
   * Get portfolio trend over time
   */
  async getPortfolioTrend(
    scopeId: string,
    period: 'day' | 'week' | 'month' = 'week',
  ): Promise<PortfolioTrend> {
    const subjects = await this.subjectRepo.findByScope(scopeId);
    const activeSubjectIds = subjects
      .filter((s) => s.is_active)
      .map((s) => s.id);

    // Determine date range based on period
    const now = new Date();
    const dataPoints: PortfolioTrendPoint[] = [];
    let pointCount: number;
    let intervalMs: number;

    switch (period) {
      case 'day':
        pointCount = 24;
        intervalMs = 60 * 60 * 1000; // 1 hour
        break;
      case 'week':
        pointCount = 7;
        intervalMs = 24 * 60 * 60 * 1000; // 1 day
        break;
      case 'month':
        pointCount = 30;
        intervalMs = 24 * 60 * 60 * 1000; // 1 day
        break;
    }

    // Collect historical data points
    for (let i = pointCount - 1; i >= 0; i--) {
      const pointDate = new Date(now.getTime() - i * intervalMs);
      const scores: number[] = [];
      let highRiskCount = 0;

      // Get scores for each subject at this point in time
      for (const subjectId of activeSubjectIds) {
        const history = await this.compositeScoreRepo.findHistory(subjectId, 1);
        const historyScore = history.find(
          (s) => new Date(s.created_at) <= pointDate,
        );

        if (historyScore) {
          scores.push(historyScore.overall_score);
          if (historyScore.overall_score >= 70) {
            highRiskCount++;
          }
        }
      }

      dataPoints.push({
        date: pointDate.toISOString().split('T')[0]!,
        average_risk_score:
          scores.length > 0
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : 0,
        subjects_assessed: scores.length,
        high_risk_subjects: highRiskCount,
      });
    }

    // Determine trend direction
    const recentAvg =
      dataPoints.length >= 3
        ? (dataPoints[dataPoints.length - 1]?.average_risk_score ??
            0 +
              (dataPoints[dataPoints.length - 2]?.average_risk_score ?? 0) +
              (dataPoints[dataPoints.length - 3]?.average_risk_score ?? 0)) / 3
        : (dataPoints[dataPoints.length - 1]?.average_risk_score ?? 0);

    const olderAvg =
      dataPoints.length >= 6
        ? ((dataPoints[0]?.average_risk_score ?? 0) +
            (dataPoints[1]?.average_risk_score ?? 0) +
            (dataPoints[2]?.average_risk_score ?? 0)) /
          3
        : (dataPoints[0]?.average_risk_score ?? 0);

    let trendDirection: 'improving' | 'stable' | 'worsening';
    const change = recentAvg - olderAvg;

    if (change < -5) {
      trendDirection = 'improving'; // Risk is going down
    } else if (change > 5) {
      trendDirection = 'worsening'; // Risk is going up
    } else {
      trendDirection = 'stable';
    }

    const changePercentage =
      olderAvg > 0 ? Math.round((change / olderAvg) * 100) : 0;

    return {
      scope_id: scopeId,
      period,
      data_points: dataPoints,
      trend_direction: trendDirection,
      change_percentage: changePercentage,
    };
  }

  /**
   * Calculate risk distribution across scores
   */
  private calculateRiskDistribution(scores: number[]): RiskDistribution {
    const distribution: RiskDistribution = {
      low: 0,
      moderate: 0,
      elevated: 0,
      high: 0,
      critical: 0,
    };

    for (const score of scores) {
      if (score <= 30) {
        distribution.low++;
      } else if (score <= 50) {
        distribution.moderate++;
      } else if (score <= 70) {
        distribution.elevated++;
      } else if (score <= 85) {
        distribution.high++;
      } else {
        distribution.critical++;
      }
    }

    return distribution;
  }

  /**
   * Calculate dimension breakdown across portfolio
   */
  private async calculateDimensionBreakdown(
    scopeId: string,
  ): Promise<DimensionBreakdown[]> {
    const dimensions = await this.dimensionRepo.findByScope(scopeId);
    const subjects = await this.subjectRepo.findByScope(scopeId);
    const activeSubjects = subjects.filter((s) => s.is_active);

    const breakdown: DimensionBreakdown[] = [];

    for (const dimension of dimensions) {
      const scores: number[] = [];

      for (const subject of activeSubjects) {
        const compositeScore =
          await this.compositeScoreRepo.findActiveBySubject(subject.id);

        if (
          compositeScore?.dimension_scores &&
          compositeScore.dimension_scores[dimension.slug] !== undefined
        ) {
          scores.push(compositeScore.dimension_scores[dimension.slug]!);
        }
      }

      if (scores.length > 0) {
        breakdown.push({
          dimension_slug: dimension.slug,
          dimension_name: dimension.name,
          average_score: Math.round(
            scores.reduce((a, b) => a + b, 0) / scores.length,
          ),
          max_score: Math.max(...scores),
          min_score: Math.min(...scores),
          contributing_subjects: scores.length,
        });
      }
    }

    // Sort by average score (highest risk dimensions first)
    return breakdown.sort((a, b) => b.average_score - a.average_score);
  }

  /**
   * Get alerts summary for scope
   */
  private async getAlertsSummary(
    scopeId: string,
    maxAlerts: number,
  ): Promise<AlertsSummary> {
    const alerts = await this.alertRepo.findByScope(scopeId);

    const summary: AlertsSummary = {
      total: alerts.length,
      unacknowledged: alerts.filter(
        (a: { acknowledged_at: string | null }) => !a.acknowledged_at,
      ).length,
      by_severity: {
        info: 0,
        warning: 0,
        critical: 0,
      },
      recent_alerts: [],
    };

    for (const alert of alerts) {
      if (alert.severity === 'info') summary.by_severity.info++;
      else if (alert.severity === 'warning') summary.by_severity.warning++;
      else if (alert.severity === 'critical') summary.by_severity.critical++;
    }

    // Get recent unacknowledged alerts
    const recentAlerts = alerts
      .filter((a: { acknowledged_at: string | null }) => !a.acknowledged_at)
      .sort(
        (a: { created_at: string }, b: { created_at: string }) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, maxAlerts);

    // Enrich with subject identifiers
    for (const alert of recentAlerts) {
      const subject = await this.subjectRepo.findById(alert.subject_id);
      summary.recent_alerts.push({
        id: alert.id,
        subject_identifier: subject?.identifier ?? 'Unknown',
        alert_type: alert.alert_type,
        severity: alert.severity,
        message: alert.message ?? '',
        created_at: alert.created_at,
      });
    }

    return summary;
  }
}

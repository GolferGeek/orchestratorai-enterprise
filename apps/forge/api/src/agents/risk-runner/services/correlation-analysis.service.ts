/**
 * Correlation Analysis Service
 *
 * Phase 5: Cross-subject correlation analysis for portfolio risk assessment
 * Calculates correlations between subjects based on their dimension scores
 */

import { Injectable, Logger } from '@nestjs/common';
import { SubjectRepository } from '../repositories/subject.repository';
import { CompositeScoreRepository } from '../repositories/composite-score.repository';
import { AssessmentRepository } from '../repositories/assessment.repository';
import { ScopeRepository } from '../repositories/scope.repository';
import {
  SubjectCorrelation,
  DimensionCorrelation,
  CorrelationMatrix,
  CorrelationMatrixSubject,
  CorrelationMatrixEntry,
  ConcentrationRisk,
} from '../interfaces/correlation.interface';
import { RiskSubject } from '../interfaces/subject.interface';
import { RiskCompositeScore } from '../interfaces/composite-score.interface';
import { RiskAssessment } from '../interfaces/assessment.interface';

export interface CorrelationAnalysisOptions {
  includeInactiveSubjects?: boolean;
  minDataPoints?: number; // Minimum shared dimensions required
}

interface SubjectScoreData {
  subject: RiskSubject;
  compositeScore: RiskCompositeScore | null;
  assessments: RiskAssessment[];
  dimensionScores: Map<string, number>;
}

@Injectable()
export class CorrelationAnalysisService {
  private readonly logger = new Logger(CorrelationAnalysisService.name);

  constructor(
    private readonly subjectRepo: SubjectRepository,
    private readonly compositeScoreRepo: CompositeScoreRepository,
    private readonly assessmentRepo: AssessmentRepository,
    private readonly scopeRepo: ScopeRepository,
  ) {}

  /**
   * Calculate correlation between two specific subjects
   */
  async calculateSubjectCorrelation(
    subjectAId: string,
    subjectBId: string,
  ): Promise<SubjectCorrelation | null> {
    const [dataA, dataB] = await Promise.all([
      this.getSubjectScoreData(subjectAId),
      this.getSubjectScoreData(subjectBId),
    ]);

    if (!dataA || !dataB) {
      this.logger.warn(
        `Cannot calculate correlation: missing data for subjects`,
      );
      return null;
    }

    return this.computeCorrelation(dataA, dataB);
  }

  /**
   * Generate a full correlation matrix for a scope
   */
  async generateCorrelationMatrix(
    scopeId: string,
    options: CorrelationAnalysisOptions = {},
  ): Promise<CorrelationMatrix> {
    const scope = await this.scopeRepo.findById(scopeId);
    if (!scope) {
      throw new Error(`Scope not found: ${scopeId}`);
    }

    // Get all subjects for the scope
    const subjects = await this.subjectRepo.findByScope(scopeId);
    const activeSubjects = options.includeInactiveSubjects
      ? subjects
      : subjects.filter((s) => s.is_active);

    // Get score data for all subjects
    const subjectDataList: SubjectScoreData[] = [];
    for (const subject of activeSubjects) {
      const data = await this.getSubjectScoreData(subject.id);
      if (data && data.compositeScore) {
        subjectDataList.push(data);
      }
    }

    // Build matrix subjects list
    const matrixSubjects: CorrelationMatrixSubject[] = subjectDataList.map(
      (data) => ({
        id: data.subject.id,
        identifier: data.subject.identifier,
        name: data.subject.name,
        current_score: data.compositeScore?.overall_score ?? null,
      }),
    );

    // Calculate correlations for all pairs
    const matrix: CorrelationMatrixEntry[] = [];
    let totalCorrelation = 0;
    let pairCount = 0;
    let highestCorrelation = { subject_a: '', subject_b: '', correlation: -2 };
    let lowestCorrelation = { subject_a: '', subject_b: '', correlation: 2 };

    for (let i = 0; i < subjectDataList.length; i++) {
      for (let j = i + 1; j < subjectDataList.length; j++) {
        const correlation = this.computeCorrelation(
          subjectDataList[i]!,
          subjectDataList[j]!,
        );

        if (correlation) {
          const coeff = correlation.correlation_coefficient;

          matrix.push({
            subject_a_index: i,
            subject_b_index: j,
            correlation: coeff,
          });

          totalCorrelation += coeff;
          pairCount++;

          if (coeff > highestCorrelation.correlation) {
            highestCorrelation = {
              subject_a: correlation.subject_a_identifier,
              subject_b: correlation.subject_b_identifier,
              correlation: coeff,
            };
          }

          if (coeff < lowestCorrelation.correlation) {
            lowestCorrelation = {
              subject_a: correlation.subject_a_identifier,
              subject_b: correlation.subject_b_identifier,
              correlation: coeff,
            };
          }
        }
      }
    }

    return {
      scope_id: scopeId,
      scope_name: scope.name,
      subjects: matrixSubjects,
      matrix,
      average_correlation: pairCount > 0 ? totalCorrelation / pairCount : 0,
      highest_correlation: {
        subject_a_identifier: highestCorrelation.subject_a,
        subject_b_identifier: highestCorrelation.subject_b,
        correlation: highestCorrelation.correlation,
      },
      lowest_correlation: {
        subject_a_identifier: lowestCorrelation.subject_a,
        subject_b_identifier: lowestCorrelation.subject_b,
        correlation: lowestCorrelation.correlation,
      },
      calculated_at: new Date().toISOString(),
    };
  }

  /**
   * Analyze concentration risk for a scope
   */
  async analyzeConcentrationRisk(scopeId: string): Promise<ConcentrationRisk> {
    const matrix = await this.generateCorrelationMatrix(scopeId);

    // Count highly correlated pairs (|correlation| > 0.7)
    const highlyCorrelatedPairs = matrix.matrix.filter(
      (entry) => Math.abs(entry.correlation) > 0.7,
    );

    // Calculate concentration score based on average correlation and pair count
    const avgCorrelation = matrix.average_correlation;
    const highCorrelationRatio =
      matrix.matrix.length > 0
        ? highlyCorrelatedPairs.length / matrix.matrix.length
        : 0;

    // Concentration score: weighted combination of avg correlation and high correlation ratio
    const concentrationScore = Math.min(
      100,
      Math.round(
        Math.abs(avgCorrelation) * 40 + // 0-40 points from avg correlation
          highCorrelationRatio * 60, // 0-60 points from high correlation ratio
      ),
    );

    // Determine risk level
    let riskLevel: 'low' | 'moderate' | 'high' | 'critical';
    if (concentrationScore < 25) {
      riskLevel = 'low';
    } else if (concentrationScore < 50) {
      riskLevel = 'moderate';
    } else if (concentrationScore < 75) {
      riskLevel = 'high';
    } else {
      riskLevel = 'critical';
    }

    // Generate recommendations
    const recommendations = this.generateConcentrationRecommendations(
      riskLevel,
      highlyCorrelatedPairs.length,
      matrix.subjects.length,
    );

    // Get top correlated pairs as full SubjectCorrelation objects
    const topPairs: SubjectCorrelation[] = [];
    const sortedMatrix = [...matrix.matrix].sort(
      (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation),
    );

    for (const entry of sortedMatrix.slice(0, 5)) {
      const subjectA = matrix.subjects[entry.subject_a_index];
      const subjectB = matrix.subjects[entry.subject_b_index];

      if (subjectA && subjectB) {
        topPairs.push({
          subject_a_id: subjectA.id,
          subject_a_identifier: subjectA.identifier,
          subject_b_id: subjectB.id,
          subject_b_identifier: subjectB.identifier,
          correlation_coefficient: entry.correlation,
          strength: this.getCorrelationStrength(entry.correlation),
          dimension_correlations: [],
          calculated_at: matrix.calculated_at,
        });
      }
    }

    return {
      scope_id: scopeId,
      total_subjects: matrix.subjects.length,
      highly_correlated_pairs: highlyCorrelatedPairs.length,
      concentration_score: concentrationScore,
      risk_level: riskLevel,
      recommendations,
      top_correlated_pairs: topPairs,
      calculated_at: new Date().toISOString(),
    };
  }

  /**
   * Get score data for a subject
   */
  private async getSubjectScoreData(
    subjectId: string,
  ): Promise<SubjectScoreData | null> {
    const subject = await this.subjectRepo.findById(subjectId);
    if (!subject) {
      return null;
    }

    const compositeScore =
      await this.compositeScoreRepo.findActiveBySubject(subjectId);
    const assessments = await this.assessmentRepo.findBySubject(subjectId);

    // Build dimension scores map from assessments
    const dimensionScores = new Map<string, number>();
    for (const assessment of assessments) {
      if (assessment.dimension_id) {
        dimensionScores.set(assessment.dimension_id, assessment.score);
      }
    }

    return {
      subject,
      compositeScore,
      assessments,
      dimensionScores,
    };
  }

  /**
   * Compute correlation between two subjects
   */
  private computeCorrelation(
    dataA: SubjectScoreData,
    dataB: SubjectScoreData,
  ): SubjectCorrelation | null {
    // Find shared dimensions
    const sharedDimensions = new Set<string>();
    for (const dimId of dataA.dimensionScores.keys()) {
      if (dataB.dimensionScores.has(dimId)) {
        sharedDimensions.add(dimId);
      }
    }

    if (sharedDimensions.size < 2) {
      // Need at least 2 shared dimensions for meaningful correlation
      return null;
    }

    // Calculate Pearson correlation coefficient
    const scoresA: number[] = [];
    const scoresB: number[] = [];
    const dimensionCorrelations: DimensionCorrelation[] = [];

    for (const dimId of sharedDimensions) {
      const scoreA = dataA.dimensionScores.get(dimId) ?? 0;
      const scoreB = dataB.dimensionScores.get(dimId) ?? 0;
      scoresA.push(scoreA);
      scoresB.push(scoreB);

      // Use dimension_id as slug/name since RiskAssessment doesn't include dimension details
      // In production, you'd join with dimensions table, but for correlation we just need IDs
      dimensionCorrelations.push({
        dimension_slug: dimId,
        dimension_name: dimId,
        correlation_coefficient: 0, // Will be calculated per-dimension if needed
        score_a: scoreA,
        score_b: scoreB,
      });
    }

    const correlation = this.pearsonCorrelation(scoresA, scoresB);

    return {
      subject_a_id: dataA.subject.id,
      subject_a_identifier: dataA.subject.identifier,
      subject_b_id: dataB.subject.id,
      subject_b_identifier: dataB.subject.identifier,
      correlation_coefficient: correlation,
      strength: this.getCorrelationStrength(correlation),
      dimension_correlations: dimensionCorrelations,
      calculated_at: new Date().toISOString(),
    };
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n !== y.length || n < 2) {
      return 0;
    }

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((total, xi, i) => total + xi * (y[i] ?? 0), 0);
    const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
    const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY),
    );

    if (denominator === 0) {
      return 0;
    }

    return Math.round((numerator / denominator) * 100) / 100;
  }

  /**
   * Get correlation strength label
   */
  private getCorrelationStrength(
    correlation: number,
  ): SubjectCorrelation['strength'] {
    const absCorr = Math.abs(correlation);

    if (correlation < -0.7) return 'strong_negative';
    if (correlation < -0.3) return 'moderate_negative';
    if (absCorr < 0.3) return 'weak';
    if (correlation < 0.7) return 'moderate_positive';
    return 'strong_positive';
  }

  /**
   * Generate recommendations based on concentration risk
   */
  private generateConcentrationRecommendations(
    riskLevel: ConcentrationRisk['risk_level'],
    highlyCorrelatedPairs: number,
    totalSubjects: number,
  ): string[] {
    const recommendations: string[] = [];

    if (riskLevel === 'critical') {
      recommendations.push(
        'CRITICAL: Portfolio is highly concentrated. Consider immediate diversification.',
      );
      recommendations.push(
        `${highlyCorrelatedPairs} pairs of subjects are highly correlated - systematic risk is elevated.`,
      );
    } else if (riskLevel === 'high') {
      recommendations.push(
        'Portfolio shows significant correlation. Review sector and asset allocation.',
      );
      if (totalSubjects < 5) {
        recommendations.push(
          'Consider adding more subjects to improve diversification.',
        );
      }
    } else if (riskLevel === 'moderate') {
      recommendations.push(
        'Portfolio diversification is moderate. Monitor highly correlated pairs.',
      );
    } else {
      recommendations.push(
        'Portfolio shows good diversification. Continue monitoring.',
      );
    }

    return recommendations;
  }
}

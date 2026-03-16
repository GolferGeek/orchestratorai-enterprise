import { Injectable, Logger } from '@nestjs/common';
import { RiskAssessment } from '../interfaces/assessment.interface';
import { RiskDimension } from '../interfaces/dimension.interface';
import { DimensionScoreMap } from '../interfaces/composite-score.interface';

export interface AggregationResult {
  overallScore: number;
  dimensionScores: DimensionScoreMap;
  confidence: number;
}

@Injectable()
export class ScoreAggregationService {
  private readonly logger = new Logger(ScoreAggregationService.name);

  /**
   * Validate that dimension weights sum to 100% (1.0)
   * Throws error if weights are invalid
   */
  validateDimensionWeights(dimensions: RiskDimension[]): void {
    const activeDimensions = dimensions.filter((d) => d.is_active !== false);
    const totalWeight = activeDimensions.reduce(
      (sum, d) => sum + (d.weight ?? 0),
      0,
    );

    // Allow small floating point tolerance (0.99 to 1.01)
    if (totalWeight < 0.99 || totalWeight > 1.01) {
      throw new Error(
        `Dimension weights must sum to 100% (1.0). Current sum: ${(totalWeight * 100).toFixed(1)}%`,
      );
    }
  }

  /**
   * Aggregate dimension assessments into a composite risk score
   * Uses weighted average based on dimension weights
   * Requires weights to sum to 100% for accurate scoring
   */
  aggregateAssessments(
    assessments: RiskAssessment[],
    dimensions: RiskDimension[],
  ): AggregationResult {
    if (assessments.length === 0) {
      this.logger.warn('No assessments to aggregate');
      return {
        overallScore: 0,
        dimensionScores: {},
        confidence: 0,
      };
    }

    // Validate weights sum to 100%
    this.validateDimensionWeights(dimensions);

    // Create a map of dimension ID to dimension for quick lookup
    const dimensionMap = new Map(dimensions.map((d) => [d.id, d]));

    // Build dimension scores map and calculate weighted sum
    const dimensionScores: DimensionScoreMap = {};
    let weightedSum = 0;
    let totalWeight = 0;
    let confidenceSum = 0;
    let confidenceCount = 0;

    for (const assessment of assessments) {
      const dimension = dimensionMap.get(assessment.dimension_id);
      if (!dimension) {
        this.logger.warn(
          `Dimension not found for assessment: ${assessment.id}`,
        );
        continue;
      }

      // Store dimension score
      dimensionScores[dimension.slug] = assessment.score;

      // Add to weighted calculation
      const weight = dimension.weight ?? 0;
      weightedSum += assessment.score * weight;
      totalWeight += weight;

      // Track confidence
      if (
        assessment.confidence !== null &&
        assessment.confidence !== undefined
      ) {
        confidenceSum += assessment.confidence;
        confidenceCount++;
      }
    }

    // Warn if not all dimensions have assessments (weights won't sum correctly)
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      this.logger.warn(
        `Only ${(totalWeight * 100).toFixed(1)}% of dimensions have assessments. ` +
          `Missing dimensions will skew the composite score.`,
      );
    }

    // Calculate overall score (weighted average of 0-100 scores)
    // Individual dimension scores are already on 0-100 scale from LLM
    const rawScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    // Clamp to valid range and round
    const overallScore = Math.max(0, Math.min(100, Math.round(rawScore)));

    // Calculate average confidence
    const confidence =
      confidenceCount > 0
        ? Number((confidenceSum / confidenceCount).toFixed(2))
        : 0;

    this.logger.debug(
      `Aggregated ${assessments.length} assessments: overall=${overallScore}, confidence=${confidence}`,
    );

    return {
      overallScore,
      dimensionScores,
      confidence,
    };
  }

  /**
   * Apply debate adjustment to a score
   */
  applyDebateAdjustment(originalScore: number, adjustment: number): number {
    const adjusted = originalScore + adjustment;
    // Clamp to 0-100 range
    return Math.max(0, Math.min(100, adjusted));
  }

  /**
   * Calculate confidence for a composite score based on dimension assessments
   */
  calculateCompositeConfidence(assessments: RiskAssessment[]): number {
    if (assessments.length === 0) {
      return 0;
    }

    const validConfidences = assessments
      .filter((a) => a.confidence !== null && a.confidence !== undefined)
      .map((a) => a.confidence);

    if (validConfidences.length === 0) {
      return 0;
    }

    // Use geometric mean for confidence (penalizes low confidence more)
    const product = validConfidences.reduce((acc, c) => acc * c, 1);
    const geometricMean = Math.pow(product, 1 / validConfidences.length);

    return Number(geometricMean.toFixed(2));
  }

  /**
   * Calculate validity duration based on scope configuration
   */
  calculateValidUntil(assessedAt: Date, staleHours: number = 24): Date {
    const validUntil = new Date(assessedAt);
    validUntil.setHours(validUntil.getHours() + staleHours);
    return validUntil;
  }

  /**
   * Recalculate a composite score after debate adjustment
   */
  recalculateWithDebate(
    originalResult: AggregationResult,
    debateAdjustment: number,
  ): AggregationResult & { preDebateScore: number } {
    const finalScore = this.applyDebateAdjustment(
      originalResult.overallScore,
      debateAdjustment,
    );

    return {
      ...originalResult,
      overallScore: finalScore,
      preDebateScore: originalResult.overallScore,
    };
  }
}

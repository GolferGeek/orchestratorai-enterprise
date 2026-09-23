import { Logger } from '@nestjs/common';
import type { RiskStoreService } from '../risk-store.service';
import type {
  DecisionRiskState,
  DimensionAssessment,
  RiskDimension,
} from '../decision-risk.state';

/**
 * Combine the dimension scores into one number.
 *
 * Deterministic on purpose. The weights live in the database and sum to 1.0
 * within a scope, so this is a weighted mean and nothing more — no model is
 * asked to "consider everything and give an overall score", because that
 * produces a number nobody can reconstruct or argue with.
 */
export function createAggregateNode(deps: {
  store: RiskStoreService;
  logger: Logger;
}) {
  return async (
    state: DecisionRiskState,
  ): Promise<Partial<DecisionRiskState>> => {
    const { assessments, dimensions, subjectId, executionContext } = state;

    if (!subjectId) {
      throw new Error('aggregate ran without a subject.');
    }
    if (assessments.length !== dimensions.length) {
      throw new Error(
        `Expected ${dimensions.length} assessments, have ${assessments.length}. ` +
          `Refusing to composite a partial radar.`,
      );
    }

    const { score, confidence, dimensionScores } = compositeOf(
      assessments,
      dimensions,
    );

    await deps.store.supersedePreviousScores(subjectId);
    const compositeScoreId = await deps.store.recordCompositeScore({
      subjectId,
      conversationId: executionContext.conversationId,
      overallScore: score,
      dimensionScores,
      confidence,
    });

    deps.logger.log(`Composite ${score} (confidence ${confidence.toFixed(2)})`);

    return {
      compositeScoreId,
      overallScore: score,
      overallConfidence: confidence,
    };
  };
}

/**
 * Weighted mean of scores, and of confidences.
 *
 * Exported because it is the arithmetic the whole product rests on and it is
 * worth testing directly, without a database or a model.
 */
export function compositeOf(
  assessments: DimensionAssessment[],
  dimensions: RiskDimension[],
): {
  score: number;
  confidence: number;
  dimensionScores: Record<string, number>;
} {
  const weightBySlug = new Map(dimensions.map((d) => [d.slug, d.weight]));
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);

  if (totalWeight <= 0) {
    throw new Error('Dimension weights sum to zero; cannot composite.');
  }

  let weightedScore = 0;
  let weightedConfidence = 0;
  const dimensionScores: Record<string, number> = {};

  for (const assessment of assessments) {
    const weight = weightBySlug.get(assessment.dimensionSlug);
    if (weight === undefined) {
      throw new Error(
        `Assessment for unknown dimension '${assessment.dimensionSlug}'.`,
      );
    }
    weightedScore += assessment.score * weight;
    weightedConfidence += assessment.confidence * weight;
    dimensionScores[assessment.dimensionSlug] = assessment.score;
  }

  return {
    score: Math.round(weightedScore / totalWeight),
    // Two decimals: risk.composite_scores.confidence is NUMERIC(3,2).
    confidence:
      Math.round((weightedConfidence / totalWeight) * 100) / 100,
    dimensionScores,
  };
}

/**
 * Learning Impact Tracking Service
 *
 * Sprint 5: Phase 4.8 - Track impact of learnings on prediction accuracy
 *
 * Tracks which learnings were applied to predictions and measures their
 * impact on accuracy. Provides metrics for:
 * - Per-learning accuracy impact
 * - Learning effectiveness over time
 * - Recommendations for learning promotion/demotion
 */

import { Injectable, Logger } from '@nestjs/common';
import { LearningRepository } from '../repositories/learning.repository';
import { PredictionRepository } from '../repositories/prediction.repository';
import { SnapshotRepository } from '../repositories/snapshot.repository';
import { Prediction } from '../interfaces/prediction.interface';
import { LearningSnapshot } from '../interfaces/snapshot.interface';

/**
 * Impact metrics for a single learning
 */
export interface LearningImpactMetrics {
  learningId: string;
  learningTitle: string;
  learningType: string;
  scopeLevel: string;
  // Application stats
  timesApplied: number;
  predictionsAffected: number;
  // Accuracy impact
  predictionAccuracyWithLearning: number | null;
  predictionAccuracyBaseline: number | null;
  accuracyDelta: number | null;
  // Confidence impact
  averageConfidenceWithLearning: number;
  // Time metrics
  firstAppliedAt: string | null;
  lastAppliedAt: string | null;
  // Effectiveness score (0-1)
  effectivenessScore: number | null;
  // Status recommendation
  recommendation:
    | 'promote'
    | 'maintain'
    | 'review'
    | 'demote'
    | 'insufficient_data';
}

/**
 * Summary of learning impact across the system
 */
export interface LearningImpactSummary {
  totalLearnings: number;
  activeLearnings: number;
  totalApplications: number;
  predictionsWithLearnings: number;
  // Aggregate metrics
  averageAccuracyImpact: number | null;
  topPerformers: LearningImpactMetrics[];
  underperformers: LearningImpactMetrics[];
  // By type breakdown
  byType: Record<string, { count: number; avgImpact: number | null }>;
  // By scope breakdown
  byScope: Record<string, { count: number; avgImpact: number | null }>;
}

/**
 * Prediction with learning application details
 */
interface PredictionWithLearnings {
  predictionId: string;
  targetId: string;
  direction: string;
  confidence: number;
  status: string;
  outcomeValue: number | null;
  learningsApplied: string[];
}

@Injectable()
export class LearningImpactService {
  private readonly logger = new Logger(LearningImpactService.name);

  // Thresholds for recommendations
  private readonly PROMOTE_THRESHOLD = 0.15; // 15% accuracy improvement
  private readonly DEMOTE_THRESHOLD = -0.1; // 10% accuracy decrease
  private readonly MIN_APPLICATIONS = 5; // Minimum applications for statistical significance

  constructor(
    private readonly learningRepository: LearningRepository,
    private readonly predictionRepository: PredictionRepository,
    private readonly snapshotRepository: SnapshotRepository,
  ) {}

  /**
   * Calculate impact metrics for a specific learning
   */
  async getLearningImpact(
    learningId: string,
  ): Promise<LearningImpactMetrics | null> {
    const learning = await this.learningRepository.findById(learningId);
    if (!learning) {
      return null;
    }

    // Get all predictions that applied this learning from snapshots
    const predictionsWithLearning =
      await this.getPredictionsWithLearning(learningId);

    // Calculate metrics
    const timesApplied = learning.times_applied ?? 0;
    const predictionsAffected = predictionsWithLearning.length;

    // Calculate accuracy for predictions with this learning
    const resolved = predictionsWithLearning.filter(
      (p) => p.status === 'resolved',
    );
    let accuracyWithLearning: number | null = null;
    let avgConfidence = 0;

    if (resolved.length > 0) {
      const correct = resolved.filter((p) => this.isPredictionCorrect(p));
      accuracyWithLearning = correct.length / resolved.length;
      avgConfidence =
        predictionsWithLearning.reduce((sum, p) => sum + p.confidence, 0) /
        predictionsWithLearning.length;
    }

    // Get baseline accuracy (predictions without this learning in same scope)
    const baselineAccuracy = await this.getBaselineAccuracy(
      learning.scope_level,
      learning.target_id,
      learningId,
    );

    // Calculate delta
    const accuracyDelta =
      accuracyWithLearning !== null && baselineAccuracy !== null
        ? accuracyWithLearning - baselineAccuracy
        : null;

    // Calculate effectiveness score
    const effectivenessScore = this.calculateEffectivenessScore(
      timesApplied,
      accuracyDelta,
      learning.times_helpful ?? 0,
      learning.times_applied ?? 0,
    );

    // Determine recommendation
    const recommendation = this.getRecommendation(
      timesApplied,
      accuracyDelta,
      effectivenessScore,
    );

    // Get time metrics from predictions
    const sortedPredictions = [...predictionsWithLearning].sort((a, b) =>
      a.predictionId.localeCompare(b.predictionId),
    );
    const firstPrediction = sortedPredictions[0];
    const lastPrediction = sortedPredictions[sortedPredictions.length - 1];
    const firstAppliedAt = firstPrediction?.predictionId ?? null;
    const lastAppliedAt = lastPrediction?.predictionId ?? null;

    return {
      learningId,
      learningTitle: learning.title,
      learningType: learning.learning_type,
      scopeLevel: learning.scope_level,
      timesApplied,
      predictionsAffected,
      predictionAccuracyWithLearning: accuracyWithLearning,
      predictionAccuracyBaseline: baselineAccuracy,
      accuracyDelta,
      averageConfidenceWithLearning: avgConfidence,
      firstAppliedAt,
      lastAppliedAt,
      effectivenessScore,
      recommendation,
    };
  }

  /**
   * Get impact summary across all learnings
   */
  async getImpactSummary(
    scopeLevel?: string,
    targetId?: string,
  ): Promise<LearningImpactSummary> {
    // Get all active learnings in scope
    const learnings = await this.learningRepository.findByScope(
      scopeLevel ?? 'runner',
      undefined,
      undefined,
      targetId,
      'active',
    );

    const totalLearnings = learnings.length;
    const activeLearnings = learnings.filter(
      (l) => l.status === 'active',
    ).length;

    // Calculate metrics for each learning
    const metricsPromises = learnings.map((l) => this.getLearningImpact(l.id));
    const allMetrics = (await Promise.all(metricsPromises)).filter(
      (m): m is LearningImpactMetrics => m !== null,
    );

    // Aggregate stats
    const totalApplications = allMetrics.reduce(
      (sum, m) => sum + m.timesApplied,
      0,
    );
    const predictionsWithLearnings = allMetrics.reduce(
      (sum, m) => sum + m.predictionsAffected,
      0,
    );

    // Calculate average accuracy impact (only for learnings with data)
    const withImpactData = allMetrics.filter((m) => m.accuracyDelta !== null);
    const averageAccuracyImpact =
      withImpactData.length > 0
        ? withImpactData.reduce((sum, m) => sum + (m.accuracyDelta ?? 0), 0) /
          withImpactData.length
        : null;

    // Find top performers and underperformers
    const sortedByImpact = [...withImpactData].sort(
      (a, b) => (b.accuracyDelta ?? 0) - (a.accuracyDelta ?? 0),
    );
    const topPerformers = sortedByImpact.slice(0, 5);
    const underperformers = sortedByImpact.slice(-5).reverse();

    // Group by type
    const byType: Record<string, { count: number; avgImpact: number | null }> =
      {};
    for (const m of allMetrics) {
      if (!byType[m.learningType]) {
        byType[m.learningType] = { count: 0, avgImpact: null };
      }
      const typeEntry = byType[m.learningType];
      if (typeEntry) {
        typeEntry.count++;
        if (m.accuracyDelta !== null) {
          const current = typeEntry.avgImpact ?? 0;
          typeEntry.avgImpact = (current + m.accuracyDelta) / 2;
        }
      }
    }

    // Group by scope
    const byScope: Record<string, { count: number; avgImpact: number | null }> =
      {};
    for (const m of allMetrics) {
      if (!byScope[m.scopeLevel]) {
        byScope[m.scopeLevel] = { count: 0, avgImpact: null };
      }
      const scopeEntry = byScope[m.scopeLevel];
      if (scopeEntry) {
        scopeEntry.count++;
        if (m.accuracyDelta !== null) {
          const current = scopeEntry.avgImpact ?? 0;
          scopeEntry.avgImpact = (current + m.accuracyDelta) / 2;
        }
      }
    }

    return {
      totalLearnings,
      activeLearnings,
      totalApplications,
      predictionsWithLearnings,
      averageAccuracyImpact,
      topPerformers,
      underperformers,
      byType,
      byScope,
    };
  }

  /**
   * Get learnings that should be reviewed based on impact
   */
  async getLearningsForReview(): Promise<LearningImpactMetrics[]> {
    const learnings = await this.learningRepository.findByScope(
      'runner',
      undefined,
      undefined,
      undefined,
      'active',
    );

    const metricsPromises = learnings.map((l) => this.getLearningImpact(l.id));
    const allMetrics = (await Promise.all(metricsPromises)).filter(
      (m): m is LearningImpactMetrics => m !== null,
    );

    // Return learnings that need review (demote or review recommendation)
    return allMetrics.filter(
      (m) => m.recommendation === 'review' || m.recommendation === 'demote',
    );
  }

  /**
   * Track that a learning was applied to a prediction
   */
  async trackLearningApplication(
    predictionId: string,
    learningIds: string[],
  ): Promise<void> {
    for (const learningId of learningIds) {
      try {
        await this.learningRepository.incrementApplication(learningId);
        this.logger.debug(
          `Tracked learning ${learningId} application to prediction ${predictionId}`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to track learning application: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  /**
   * Record feedback on learning helpfulness after prediction resolution
   */
  async recordLearningFeedback(
    predictionId: string,
    learningId: string,
    wasHelpful: boolean,
  ): Promise<void> {
    await this.learningRepository.incrementApplication(learningId, wasHelpful);
    this.logger.log(
      `Recorded feedback for learning ${learningId}: helpful=${wasHelpful}`,
    );
  }

  // Private helper methods

  private async getPredictionsWithLearning(
    learningId: string,
  ): Promise<PredictionWithLearnings[]> {
    // Query predictions and check their snapshots for learning application
    // Since we don't have a direct query, we'll check resolved predictions
    const predictions: PredictionWithLearnings[] = [];

    // Get recent resolved predictions and check their snapshots
    // This is a simplified approach - in production, you'd want a more efficient query
    const learning = await this.learningRepository.findById(learningId);
    if (!learning) return [];

    // Get predictions by target if learning is target-scoped
    let targetPredictions: Prediction[] = [];
    if (learning.target_id) {
      targetPredictions = await this.predictionRepository.findByTarget(
        learning.target_id,
        'resolved',
      );
    }

    for (const prediction of targetPredictions) {
      const snapshot = await this.snapshotRepository.findByPredictionId(
        prediction.id,
      );
      if (snapshot) {
        const learningsApplied = this.extractLearningIds(
          snapshot.learnings_applied,
        );
        if (learningsApplied.includes(learningId)) {
          predictions.push({
            predictionId: prediction.id,
            targetId: prediction.target_id,
            direction: prediction.direction,
            confidence: prediction.confidence,
            status: prediction.status,
            outcomeValue: prediction.outcome_value,
            learningsApplied,
          });
        }
      }
    }

    return predictions;
  }

  private extractLearningIds(learningsApplied: LearningSnapshot[]): string[] {
    if (!learningsApplied || !Array.isArray(learningsApplied)) {
      return [];
    }
    return learningsApplied.map((l) => l.learning_id);
  }

  private async getBaselineAccuracy(
    scopeLevel: string,
    targetId: string | null,
    excludeLearningId: string,
  ): Promise<number | null> {
    // Get resolved predictions in the same scope that didn't use this learning
    let predictions: Prediction[] = [];
    if (targetId) {
      predictions = await this.predictionRepository.findByTarget(
        targetId,
        'resolved',
      );
    }

    // Filter out predictions that used the learning we're measuring
    const withoutLearning: PredictionWithLearnings[] = [];
    for (const p of predictions) {
      const snapshot = await this.snapshotRepository.findByPredictionId(p.id);
      const learningsUsed = snapshot
        ? this.extractLearningIds(snapshot.learnings_applied)
        : [];

      if (!learningsUsed.includes(excludeLearningId)) {
        withoutLearning.push({
          predictionId: p.id,
          targetId: p.target_id,
          direction: p.direction,
          confidence: p.confidence,
          status: p.status,
          outcomeValue: p.outcome_value,
          learningsApplied: learningsUsed,
        });
      }
    }

    if (withoutLearning.length === 0) {
      return null;
    }

    const correct = withoutLearning.filter((p) => this.isPredictionCorrect(p));
    return correct.length / withoutLearning.length;
  }

  private isPredictionCorrect(prediction: PredictionWithLearnings): boolean {
    if (prediction.outcomeValue === null) return false;
    const actualDirection = prediction.outcomeValue > 0 ? 'up' : 'down';
    return prediction.direction === actualDirection;
  }

  private calculateEffectivenessScore(
    applications: number,
    accuracyDelta: number | null,
    helpfulCount: number,
    totalCount: number,
  ): number | null {
    if (applications < this.MIN_APPLICATIONS) {
      return null;
    }

    let score = 0.5; // Base score

    // Add accuracy component (0-0.4)
    if (accuracyDelta !== null) {
      score += Math.min(0.4, Math.max(-0.4, accuracyDelta * 2));
    }

    // Add helpfulness component (0-0.2)
    if (totalCount > 0) {
      const helpfulRatio = helpfulCount / totalCount;
      score += (helpfulRatio - 0.5) * 0.4;
    }

    return Math.min(1, Math.max(0, score));
  }

  private getRecommendation(
    applications: number,
    accuracyDelta: number | null,
    effectivenessScore: number | null,
  ): 'promote' | 'maintain' | 'review' | 'demote' | 'insufficient_data' {
    if (applications < this.MIN_APPLICATIONS) {
      return 'insufficient_data';
    }

    if (accuracyDelta === null) {
      return 'insufficient_data';
    }

    if (accuracyDelta >= this.PROMOTE_THRESHOLD) {
      return 'promote';
    }

    if (accuracyDelta <= this.DEMOTE_THRESHOLD) {
      return 'demote';
    }

    if (effectivenessScore !== null && effectivenessScore < 0.4) {
      return 'review';
    }

    return 'maintain';
  }
}

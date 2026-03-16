/**
 * Learning Promotion Service
 *
 * Handles promotion of test learnings to production.
 * Uses predictionDashboardService with entity='learning-promotion'.
 *
 * IMPORTANT: This service uses A2A dashboard mode, NOT REST endpoints.
 * All data access is through POST /agent-to-agent/:orgSlug/prediction-runner/tasks
 */

import { predictionDashboardService } from './predictionDashboardService';
import type { DashboardResponsePayload } from '@orchestrator-ai/transport-types';

// ============================================================================
// TYPES
// ============================================================================

export interface PromotionCandidate {
  id: string;
  title: string;
  description: string;
  learning_type: string;
  scope_level: string;
  domain?: string;
  status: string;
  times_applied: number;
  times_helpful: number;
  is_test: boolean;
  created_at: string;
  validationMetrics: {
    timesApplied: number;
    timesHelpful: number;
    successRate: number;
  };
  readyForPromotion: boolean;
}

export interface ValidationResult {
  learningId: string;
  isValid: boolean;
  checks: {
    isTestLearning: boolean;
    isActive: boolean;
    notAlreadyPromoted: boolean;
    hasValidationMetrics: boolean;
    meetsMinApplications?: boolean;
    meetsMinSuccessRate?: boolean;
  };
  validationMetrics?: {
    timesApplied: number;
    timesHelpful: number;
    successRate: number;
  };
  errors: string[];
  warnings?: string[];
}

export interface PromotionHistory {
  id: string;
  testLearningId: string;
  productionLearningId: string;
  testLearningTitle: string;
  productionLearningTitle: string;
  promotedBy: string;
  promotedByEmail?: string;
  promotedByName?: string;
  promotedAt: string;
  validationMetrics?: Record<string, unknown>;
  backtestResult?: Record<string, unknown>;
  reviewerNotes?: string;
  scenarioRuns?: string[];
}

export interface PromotionStats {
  totalTestLearnings: number;
  totalPromoted: number;
  totalRejected: number;
  pendingReview: number;
  avgTimesApplied: number;
  avgSuccessRate: number;
}

export interface BacktestResult {
  backtestId: string;
  learningId: string;
  passed: boolean;
  metrics: {
    baselineAccuracy: number;
    withLearningAccuracy: number;
    accuracyLift: number;
    baselineFalsePositiveRate: number;
    withLearningFalsePositiveRate: number;
    falsePositiveDelta: number;
    predictionsAffected: number;
    predictionsImproved: number;
    predictionsDegraded: number;
    statisticalSignificance: number;
  };
  executedAt: string;
  executionTimeMs: number;
}

// ============================================================================
// SERVICE
// ============================================================================

class LearningPromotionService {
  /**
   * Get promotion candidates - test learnings ready for promotion
   */
  async getPromotionCandidates(
    page?: number,
    pageSize?: number
  ): Promise<DashboardResponsePayload<PromotionCandidate[]>> {
    const result = await predictionDashboardService.getPromotionCandidates(page, pageSize);
    return result as DashboardResponsePayload<PromotionCandidate[]>;
  }

  /**
   * Validate a learning for promotion
   */
  async validateLearning(
    learningId: string
  ): Promise<DashboardResponsePayload<ValidationResult>> {
    const result = await predictionDashboardService.validateLearning(learningId);
    return result as DashboardResponsePayload<ValidationResult>;
  }

  /**
   * Promote a learning to production
   */
  async promoteLearning(
    learningId: string,
    reviewerNotes?: string,
    backtestResult?: BacktestResult,
    scenarioRunIds?: string[]
  ): Promise<DashboardResponsePayload<{
    success: boolean;
    productionLearningId: string;
    promotionHistoryId: string;
  }>> {
    return await predictionDashboardService.promoteLearning({
      learningId,
      reviewerNotes,
      backtestResult: backtestResult as unknown as Record<string, unknown> | undefined,
      scenarioRunIds,
    });
  }

  /**
   * Reject a learning with reason
   */
  async rejectLearning(
    learningId: string,
    reason: string
  ): Promise<DashboardResponsePayload<{ success: boolean }>> {
    return await predictionDashboardService.rejectLearning({
      learningId,
      reason,
    });
  }

  /**
   * Get promotion history
   */
  async getPromotionHistory(
    page?: number,
    pageSize?: number
  ): Promise<DashboardResponsePayload<PromotionHistory[]>> {
    const result = await predictionDashboardService.getPromotionHistory(page, pageSize);
    return result as DashboardResponsePayload<PromotionHistory[]>;
  }

  /**
   * Get promotion statistics
   */
  async getPromotionStats(): Promise<DashboardResponsePayload<PromotionStats>> {
    const result = await predictionDashboardService.getPromotionStats();
    return result as DashboardResponsePayload<PromotionStats>;
  }

  /**
   * Run a backtest on a learning
   */
  async runBacktest(
    learningId: string,
    windowDays?: number
  ): Promise<DashboardResponsePayload<BacktestResult>> {
    const result = await predictionDashboardService.runBacktest({
      learningId,
      windowDays,
    });
    return result as DashboardResponsePayload<BacktestResult>;
  }
}

export const learningPromotionService = new LearningPromotionService();

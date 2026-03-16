/**
 * Evaluation Dashboard Handler
 *
 * Sprint 5: Phase 4.7 - Manual Evaluation Override
 *
 * Handles dashboard mode requests for prediction evaluations.
 * Allows viewing evaluation results and manually overriding auto-evaluation scores.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { PredictionRepository } from '../../repositories/prediction.repository';
import {
  EvaluationService,
  EvaluationResult,
} from '../../services/evaluation.service';
import { Prediction } from '../../interfaces/prediction.interface';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';

interface EvaluationFilters {
  targetId?: string;
  universeId?: string;
  fromDate?: string;
  toDate?: string;
  directionCorrect?: boolean;
  minScore?: number;
  maxScore?: number;
}

interface EvaluationParams {
  id?: string;
  predictionId?: string;
  filters?: EvaluationFilters;
  page?: number;
  pageSize?: number;
}

interface EvaluationOverrideData {
  predictionId: string;
  overrideType: 'direction' | 'magnitude' | 'timing' | 'overall';
  overrideValue: number | boolean;
  reason: string;
  reviewerNotes?: string;
}

// Stored evaluation record structure
interface StoredEvaluation {
  id: string;
  prediction_id: string;
  direction_score: number;
  magnitude_score: number;
  timing_score: number;
  overall_score: number;
  evaluated_at: string;
  has_override?: boolean;
  override_reason?: string;
  override_by?: string;
  override_at?: string;
}

// In-memory cache for evaluations (in production, this would be a database table)
const evaluationCache = new Map<string, StoredEvaluation>();

@Injectable()
export class EvaluationHandler implements IDashboardHandler {
  private readonly logger = new Logger(EvaluationHandler.name);
  private readonly supportedActions = ['list', 'get', 'evaluate', 'override'];

  constructor(
    private readonly predictionRepository: PredictionRepository,
    private readonly evaluationService: EvaluationService,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[EVALUATION-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as EvaluationParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params);
      case 'get':
        return this.handleGet(params);
      case 'evaluate':
        return this.handleEvaluate(params);
      case 'override':
        return this.handleOverride(payload, context);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  /**
   * List predictions with their evaluation results
   */
  private async handleList(
    params?: EvaluationParams,
  ): Promise<DashboardActionResult> {
    try {
      // Get resolved predictions
      const targetId = params?.filters?.targetId;
      let predictions: Prediction[];

      if (targetId) {
        predictions = await this.predictionRepository.findByTarget(
          targetId,
          'resolved',
        );
      } else {
        // Get all resolved predictions - we need to filter by status
        // For now, use an empty target query that returns resolved predictions
        predictions = [];
        // In production, add a findByStatus method to the repository
      }

      // Apply date filters
      let filtered = predictions;

      if (params?.filters?.fromDate) {
        const fromDate = new Date(params.filters.fromDate);
        filtered = filtered.filter((p) => new Date(p.predicted_at) >= fromDate);
      }

      if (params?.filters?.toDate) {
        const toDate = new Date(params.filters.toDate);
        filtered = filtered.filter((p) => new Date(p.predicted_at) <= toDate);
      }

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedItems = filtered.slice(startIndex, startIndex + pageSize);

      // Transform to include evaluation summary
      const results = paginatedItems.map((prediction) => {
        const cachedEval = evaluationCache.get(prediction.id);
        return {
          id: prediction.id,
          targetId: prediction.target_id,
          direction: prediction.direction,
          confidence: prediction.confidence,
          predictedAt: prediction.predicted_at,
          outcomeValue: prediction.outcome_value,
          status: prediction.status,
          evaluation: cachedEval ?? null,
        };
      });

      return buildDashboardSuccess(
        results,
        buildPaginationMetadata(filtered.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list evaluations: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list evaluations',
      );
    }
  }

  /**
   * Get detailed evaluation for a specific prediction
   */
  private async handleGet(
    params?: EvaluationParams,
  ): Promise<DashboardActionResult> {
    const predictionId = params?.predictionId || params?.id;

    if (!predictionId) {
      return buildDashboardError(
        'MISSING_ID',
        'Prediction ID is required (use predictionId or id)',
      );
    }

    try {
      const prediction = await this.predictionRepository.findById(predictionId);
      if (!prediction) {
        return buildDashboardError(
          'NOT_FOUND',
          `Prediction not found: ${predictionId}`,
        );
      }

      // Get evaluation from cache
      const evaluation = evaluationCache.get(predictionId) ?? null;

      return buildDashboardSuccess({
        prediction: {
          id: prediction.id,
          targetId: prediction.target_id,
          direction: prediction.direction,
          magnitude: prediction.magnitude,
          confidence: prediction.confidence,
          timeframeHours: prediction.timeframe_hours,
          predictedAt: prediction.predicted_at,
          status: prediction.status,
          outcomeValue: prediction.outcome_value,
          resolutionNotes: prediction.resolution_notes,
        },
        evaluation: evaluation
          ? {
              id: evaluation.id,
              directionScore: evaluation.direction_score,
              magnitudeScore: evaluation.magnitude_score,
              timingScore: evaluation.timing_score,
              overallScore: evaluation.overall_score,
              evaluatedAt: evaluation.evaluated_at,
              hasOverride: evaluation.has_override ?? false,
              overrideReason: evaluation.override_reason ?? null,
              overrideBy: evaluation.override_by ?? null,
              overrideAt: evaluation.override_at ?? null,
            }
          : null,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get evaluation: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get evaluation',
      );
    }
  }

  /**
   * Trigger evaluation for a resolved prediction
   */
  private async handleEvaluate(
    params?: EvaluationParams,
  ): Promise<DashboardActionResult> {
    const predictionId = params?.predictionId || params?.id;

    if (!predictionId) {
      return buildDashboardError(
        'MISSING_ID',
        'Prediction ID is required (use predictionId or id)',
      );
    }

    try {
      const result: EvaluationResult =
        await this.evaluationService.evaluatePrediction(predictionId);

      // Store in cache
      const storedEval: StoredEvaluation = {
        id: `eval-${predictionId}-${Date.now()}`,
        prediction_id: predictionId,
        direction_score: result.directionCorrect ? 1.0 : 0.0,
        magnitude_score: result.magnitudeAccuracy,
        timing_score: result.timingAccuracy,
        overall_score: result.overallScore,
        evaluated_at: new Date().toISOString(),
      };
      evaluationCache.set(predictionId, storedEval);

      return buildDashboardSuccess({
        predictionId,
        evaluation: {
          directionCorrect: result.directionCorrect,
          magnitudeAccuracy: result.magnitudeAccuracy,
          timingAccuracy: result.timingAccuracy,
          overallScore: result.overallScore,
          actualDirection: result.actualDirection,
          actualMagnitude: result.actualMagnitude,
        },
        details: result.details,
      });
    } catch (error) {
      this.logger.error(
        `Failed to evaluate prediction: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'EVALUATE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to evaluate prediction',
      );
    }
  }

  /**
   * Override auto-evaluation result with manual assessment
   *
   * Sprint 5: Phase 4.7 - Manual Evaluation Override
   *
   * Allows human reviewers to override specific scores when
   * auto-evaluation doesn't capture the full context.
   */
  private async handleOverride(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const data = payload.params as unknown as EvaluationOverrideData;

    if (
      !data.predictionId ||
      !data.overrideType ||
      data.overrideValue === undefined
    ) {
      return buildDashboardError(
        'INVALID_DATA',
        'predictionId, overrideType, and overrideValue are required',
      );
    }

    if (!data.reason || data.reason.trim().length < 10) {
      return buildDashboardError(
        'INVALID_REASON',
        'A reason of at least 10 characters is required for evaluation override',
      );
    }

    const validTypes = ['direction', 'magnitude', 'timing', 'overall'];
    if (!validTypes.includes(data.overrideType)) {
      return buildDashboardError(
        'INVALID_TYPE',
        `Invalid override type: ${data.overrideType}. Must be one of: ${validTypes.join(', ')}`,
      );
    }

    // Validate override value based on type
    if (data.overrideType === 'direction') {
      if (typeof data.overrideValue !== 'boolean') {
        return buildDashboardError(
          'INVALID_VALUE',
          'Direction override must be a boolean (true = correct, false = incorrect)',
        );
      }
    } else {
      if (
        typeof data.overrideValue !== 'number' ||
        data.overrideValue < 0 ||
        data.overrideValue > 1
      ) {
        return buildDashboardError(
          'INVALID_VALUE',
          `${data.overrideType} override must be a number between 0 and 1`,
        );
      }
    }

    try {
      // Get prediction
      const prediction = await this.predictionRepository.findById(
        data.predictionId,
      );
      if (!prediction) {
        return buildDashboardError(
          'NOT_FOUND',
          `Prediction not found: ${data.predictionId}`,
        );
      }

      // Get existing evaluation from cache
      const existingEval = evaluationCache.get(data.predictionId);
      if (!existingEval) {
        return buildDashboardError(
          'NO_EVALUATION',
          'Prediction has not been evaluated yet. Run evaluate first.',
        );
      }

      // Apply the specific override
      const overrideAt = new Date().toISOString();
      const updatedEval: StoredEvaluation = {
        ...existingEval,
        has_override: true,
        override_reason: data.reason,
        override_by: context.userId,
        override_at: overrideAt,
      };

      switch (data.overrideType) {
        case 'direction':
          updatedEval.direction_score = data.overrideValue ? 1.0 : 0.0;
          break;
        case 'magnitude':
          updatedEval.magnitude_score = data.overrideValue as number;
          break;
        case 'timing':
          updatedEval.timing_score = data.overrideValue as number;
          break;
        case 'overall':
          updatedEval.overall_score = data.overrideValue as number;
          break;
      }

      // Update the cache
      evaluationCache.set(data.predictionId, updatedEval);

      this.logger.log(
        `Evaluation override applied: ${data.predictionId} ${data.overrideType}=${String(data.overrideValue)} by ${context.userId}`,
      );

      return buildDashboardSuccess({
        predictionId: data.predictionId,
        evaluationId: existingEval.id,
        overrideApplied: {
          type: data.overrideType,
          value: data.overrideValue,
          reason: data.reason,
          by: context.userId,
          at: overrideAt,
        },
        message: `${data.overrideType} score overridden successfully`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to override evaluation: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'OVERRIDE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to override evaluation',
      );
    }
  }
}

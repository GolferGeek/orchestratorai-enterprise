/**
 * Prediction Dashboard Handler
 *
 * Handles dashboard mode requests for predictions.
 * Predictions are the final output of the system - forecasts for targets.
 * Includes snapshot access for full explainability.
 *
 * Updated: Added 'generate' action for manual predictor-to-prediction conversion
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import { v4 as uuidv4 } from 'uuid';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '../../../shared/types/forge-types';
// Note: forceGenerate param is kept for potential future use but not yet implemented
import { PredictionRepository } from '../../repositories/prediction.repository';
import { PredictorRepository } from '../../repositories/predictor.repository';
import type { Predictor } from '../../interfaces/predictor.interface';
import { SignalRepository } from '../../repositories/signal.repository';
import { SignalFingerprintRepository } from '../../repositories/signal-fingerprint.repository';
import { TargetRepository } from '../../repositories/target.repository';
import { SnapshotService } from '../../services/snapshot.service';
import { PredictionGenerationService } from '../../services/prediction-generation.service';
import { UserPositionService } from '../../services/user-position.service';
import { PortfolioRepository } from '../../repositories/portfolio.repository';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import { PredictionStatus } from '../../interfaces/prediction.interface';

interface PredictionFilters {
  targetId?: string;
  universeId?: string;
  status?: PredictionStatus;
  direction?: string;
  fromDate?: string;
  toDate?: string;
  includeTestData?: boolean;
  /** Filter by outcome: 'correct', 'incorrect', or 'pending' (not yet evaluated) */
  outcome?: 'correct' | 'incorrect' | 'pending';
  /** Filter closed positions by start date (closedPositions action) */
  startDate?: string;
  /** Filter closed positions by end date (closedPositions action) */
  endDate?: string;
  /** Filter closed positions by symbol (closedPositions action) */
  symbol?: string;
  /** Limit number of closed positions returned (closedPositions action) */
  limit?: number;
}

interface PredictionParams {
  id?: string;
  ids?: string[];
  targetId?: string;
  universeId?: string;
  filters?: PredictionFilters;
  page?: number;
  pageSize?: number;
  includeSnapshot?: boolean;
  /** Force generation even if thresholds not met (default: false) */
  forceGenerate?: boolean;
  /** Quantity for position creation (use action) */
  quantity?: number;
  /** Entry price override for position creation (use action) */
  entryPrice?: number;
  /** Exit price for closing a position (closePosition action) */
  exitPrice?: number;
  /** Trade queue entry ID (cancelQueuedTrade action) */
  tradeId?: string;
}

@Injectable()
export class PredictionHandler implements IDashboardHandler {
  private readonly logger = new Logger(PredictionHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'getSnapshot',
    'getDeepDive',
    'compare',
    'generate',
    'use',
    'calculateSize',
    'portfolio',
    'closedPositions',
    'closePosition',
    'queue',
    'getQueue',
    'cancelQueuedTrade',
  ];

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly predictionRepository: PredictionRepository,
    private readonly predictorRepository: PredictorRepository,
    private readonly signalRepository: SignalRepository,
    private readonly signalFingerprintRepository: SignalFingerprintRepository,
    private readonly targetRepository: TargetRepository,
    private readonly snapshotService: SnapshotService,
    private readonly predictionGenerationService: PredictionGenerationService,
    private readonly userPositionService: UserPositionService,
    private readonly portfolioRepository: PortfolioRepository,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[PREDICTION-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as PredictionParams | undefined;
    // Merge filters from payload.filters into params.filters for list operations
    const filters = payload.filters as PredictionFilters | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params, filters, context);
      case 'get':
        return this.handleGet(params);
      case 'getsnapshot':
      case 'get-snapshot':
      case 'snapshot':
        return this.handleGetSnapshot(params);
      case 'getdeepdive':
      case 'get-deep-dive':
      case 'deep-dive':
      case 'deepdive':
        return this.handleGetDeepDive(params);
      case 'compare':
        return this.handleCompare(params);
      case 'generate':
        return this.handleGenerate(params, context);
      case 'use':
        return this.handleUse(params, context);
      case 'calculatesize':
      case 'calculate-size':
        return this.handleCalculateSize(params, context);
      case 'portfolio':
        return this.handlePortfolio(context);
      case 'closedpositions':
      case 'closed-positions':
        return this.handleClosedPositions(params, context);
      case 'closeposition':
      case 'close-position':
        return this.handleClosePosition(params, context);
      case 'queue':
        return this.handleQueue(params, context);
      case 'getqueue':
      case 'get-queue':
        return this.handleGetQueue(context);
      case 'cancelqueuedtrade':
      case 'cancel-queued-trade':
        return this.handleCancelQueuedTrade(params);
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

  private async handleList(
    params?: PredictionParams,
    filters?: PredictionFilters,
    context?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    // Merge filters from both sources (params.filters and payload.filters)
    const mergedFilters = { ...params?.filters, ...filters };
    const targetId = params?.targetId || mergedFilters?.targetId;
    const universeId = mergedFilters?.universeId;

    this.logger.debug(
      `[PREDICTION-HANDLER] handleList - targetId: ${targetId}, universeId: ${universeId}, agentSlug: ${context?.agentSlug}, filters: ${JSON.stringify(mergedFilters)}`,
    );

    try {
      let predictions;
      // Track universe_id for enrichment
      let knownUniverseId: string | undefined = universeId;
      // Build test data filter from merged filters
      const testDataFilter = {
        includeTestData: mergedFilters?.includeTestData ?? false,
      };

      // Get valid universe IDs for this agent (for filtering)
      let validUniverseIds: Set<string> | undefined;
      if (context?.agentSlug && context?.orgSlug) {
        // Get universes that belong to this agent
        const { data: universes } = (await this.db
          .from('prediction', 'universes')
          .select('id')
          .eq('agent_slug', context.agentSlug)
          .eq('organization_slug', context.orgSlug)
          .eq('is_active', true)) as QueryResult<unknown>;

        const universeRows = (universes ?? []) as Array<{ id: string }>;
        if (universeRows.length > 0) {
          validUniverseIds = new Set(
            universeRows.map((u: { id: string }) => u.id),
          );
          this.logger.debug(
            `[PREDICTION-HANDLER] Agent ${context.agentSlug} has ${validUniverseIds.size} valid universes`,
          );
        } else {
          this.logger.debug(
            `[PREDICTION-HANDLER] Agent ${context.agentSlug} has no universes - returning empty results`,
          );
          // No universes for this agent means no predictions
          return buildDashboardSuccess([], buildPaginationMetadata(0, 1, 20));
        }
      }

      if (targetId) {
        // Filter by target
        predictions = await this.predictionRepository.findByTarget(
          targetId,
          mergedFilters?.status,
          testDataFilter,
        );
        // Get universe_id from the target
        const target = await this.targetRepository.findById(targetId);
        if (target) {
          knownUniverseId = target.universe_id;
        }
      } else if (universeId) {
        // Filter by universe (portfolio)
        predictions = await this.predictionRepository.findByUniverse(
          universeId,
          mergedFilters?.status,
          testDataFilter,
        );
      } else if (mergedFilters?.status === 'active') {
        // Get all active predictions
        predictions =
          await this.predictionRepository.findActivePredictions(testDataFilter);
      } else {
        // Default: get active predictions
        predictions =
          await this.predictionRepository.findActivePredictions(testDataFilter);
      }

      this.logger.debug(
        `[PREDICTION-HANDLER] Found ${predictions.length} predictions (before agent filtering)`,
      );

      // Apply additional filters
      let filtered = predictions;

      // Filter predictions by valid universe IDs (agent-based filtering)
      if (validUniverseIds) {
        // We need to look up target -> universe relationship for each prediction
        // Get all unique target IDs
        const predictionTargetIds = [
          ...new Set(predictions.map((p) => p.target_id)),
        ];

        // Fetch target -> universe mappings
        const { data: targets } = (await this.db
          .from('prediction', 'targets')
          .select('id, universe_id')
          .in('id', predictionTargetIds)) as QueryResult<unknown>;

        const targetToUniverse = new Map<string, string>();
        const targetRows = (targets ?? []) as Array<{
          id: string;
          universe_id: string;
        }>;
        targetRows.forEach((t: { id: string; universe_id: string }) => {
          targetToUniverse.set(t.id, t.universe_id);
        });

        // Filter predictions to only those whose target belongs to a valid universe
        filtered = filtered.filter((p) => {
          const targetUniverseId = targetToUniverse.get(p.target_id);
          return targetUniverseId && validUniverseIds.has(targetUniverseId);
        });

        this.logger.debug(
          `[PREDICTION-HANDLER] After agent filtering: ${filtered.length} predictions`,
        );
      }

      if (mergedFilters?.direction) {
        filtered = filtered.filter(
          (p) => p.direction === mergedFilters.direction,
        );
      }

      if (mergedFilters?.fromDate) {
        const fromDate = new Date(mergedFilters.fromDate);
        filtered = filtered.filter((p) => new Date(p.predicted_at) >= fromDate);
      }

      if (mergedFilters?.toDate) {
        const toDate = new Date(mergedFilters.toDate);
        filtered = filtered.filter((p) => new Date(p.predicted_at) <= toDate);
      }

      // Apply outcome filter (correct/incorrect/pending)
      if (mergedFilters?.outcome) {
        filtered = filtered.filter((p) => {
          // Pending: no outcome value yet (not resolved)
          if (mergedFilters.outcome === 'pending') {
            return p.outcome_value === null || p.outcome_value === undefined;
          }

          // Must have an outcome value to be correct or incorrect
          if (p.outcome_value === null || p.outcome_value === undefined) {
            return false;
          }

          // Determine if direction was correct based on outcome_value
          // outcome_value is percentage change: positive = price went up, negative = price went down
          const actualDirection =
            p.outcome_value > 0 ? 'up' : p.outcome_value < 0 ? 'down' : 'flat';
          const wasCorrect = p.direction === actualDirection;

          return mergedFilters.outcome === 'correct' ? wasCorrect : !wasCorrect;
        });
      }

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedPredictions = filtered.slice(
        startIndex,
        startIndex + pageSize,
      );

      // Enrich predictions with target details and transform to frontend format
      // Look up target info for all predictions
      const targetIds = [
        ...new Set(paginatedPredictions.map((p) => p.target_id)),
      ];
      const targetMap = new Map<
        string,
        { universe_id: string; symbol: string; name: string }
      >();

      await Promise.all(
        targetIds.map(async (tid) => {
          const target = await this.targetRepository.findById(tid);
          if (target) {
            targetMap.set(tid, {
              universe_id: target.universe_id,
              symbol: target.symbol,
              name: target.name,
            });
          }
        }),
      );

      // Transform predictions to frontend format (camelCase + enriched data)
      const enrichedPredictions = paginatedPredictions.map((p) => {
        const target = targetMap.get(p.target_id);

        // Extract analyst assessments from analyst_ensemble for arbitrator predictions
        // The analyst_ensemble contains individual analyst assessments in the 'assessments' array
        // New format includes three forks per analyst: user_fork, ai_fork, arbitrator_fork
        // Data structure: { assessments: [{ analyst_slug, analyst_name, direction, confidence, reasoning,
        //   user_fork: { direction, confidence, reasoning },
        //   ai_fork: { direction, confidence, reasoning },
        //   arbitrator_fork: { direction, confidence, reasoning }
        // }], ... }
        const analystEnsembleData = p.analyst_ensemble as {
          assessments?: Array<{
            analyst_slug?: string;
            analyst_name?: string;
            analyst?: { slug?: string; name?: string }; // Legacy format
            direction?: string;
            confidence?: number;
            reasoning?: string;
            user_fork?: {
              direction: string;
              confidence: number;
              reasoning?: string;
              is_flat?: boolean;
            };
            ai_fork?: {
              direction: string;
              confidence: number;
              reasoning?: string;
              is_flat?: boolean;
            };
            arbitrator_fork?: {
              direction: string;
              confidence: number;
              reasoning?: string;
              is_flat?: boolean;
            };
          }>;
          fork_metadata?: {
            totalAnalysts: number;
            userVsAiAgreement: number;
            arbitratorAgreesWithUser: number;
            arbitratorAgreesWithAi: number;
          };
        } | null;

        // Helper to convert analyst slug to display name
        const slugToDisplayName = (slug: string): string => {
          const nameMap: Record<string, string> = {
            'fundamental-fred': 'Fundamental Fred',
            'technical-tina': 'Technical Tina',
            'sentiment-sally': 'Sentiment Sally',
            'aggressive-alex': 'Aggressive Alex',
            'cautious-carl': 'Cautious Carl',
          };
          return (
            nameMap[slug] ||
            slug
              .split('-')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ')
          );
        };

        const analystAssessments =
          p.is_arbitrator && analystEnsembleData?.assessments
            ? analystEnsembleData.assessments.map((a) => {
                // Support both new format (analyst_slug) and legacy format (analyst.slug)
                const slug = a.analyst_slug || a.analyst?.slug || 'unknown';
                const name =
                  a.analyst_name || a.analyst?.name || slugToDisplayName(slug);
                return {
                  analystSlug: slug,
                  analystName: name,
                  direction: a.direction || 'neutral',
                  confidence: a.confidence || 0,
                  reasoning: a.reasoning,
                  // Include all three fork reasonings for the UI
                  userFork: a.user_fork
                    ? {
                        direction: a.user_fork.direction,
                        confidence: a.user_fork.confidence,
                        reasoning:
                          a.user_fork.reasoning ||
                          'No user fork reasoning provided',
                        is_flat: a.user_fork.is_flat,
                      }
                    : undefined,
                  aiFork: a.ai_fork
                    ? {
                        direction: a.ai_fork.direction,
                        confidence: a.ai_fork.confidence,
                        reasoning:
                          a.ai_fork.reasoning ||
                          'No AI fork reasoning provided',
                        is_flat: a.ai_fork.is_flat,
                      }
                    : undefined,
                  arbitratorFork: a.arbitrator_fork
                    ? {
                        direction: a.arbitrator_fork.direction,
                        confidence: a.arbitrator_fork.confidence,
                        reasoning:
                          a.arbitrator_fork.reasoning ||
                          'No arbitrator fork reasoning provided',
                        is_flat: a.arbitrator_fork.is_flat,
                      }
                    : undefined,
                };
              })
            : undefined;

        // Include fork metadata for UI display
        const forkMetadata = analystEnsembleData?.fork_metadata;

        return {
          // Core fields
          id: p.id,
          targetId: p.target_id,
          universeId: knownUniverseId || target?.universe_id || null,
          taskId: p.task_id,
          status: p.status,
          direction: p.direction,
          confidence: p.confidence,
          magnitude: p.magnitude,
          timeframe: p.timeframe_hours ? `${p.timeframe_hours}h` : undefined,
          timeframeHours: p.timeframe_hours,
          reasoning: p.reasoning,
          // Dates
          generatedAt: p.predicted_at,
          predictedAt: p.predicted_at,
          expiresAt: p.expires_at,
          resolvedAt: p.outcome_captured_at,
          // Entry/exit values
          entryValue: p.entry_price,
          exitValue: p.target_price,
          stopLoss: p.stop_loss,
          // Outcome
          outcomeValue: p.outcome_value,
          resolutionNotes: p.resolution_notes,
          // Enriched target info
          targetSymbol: target?.symbol || null,
          targetName: target?.name || null,
          // Test data flag
          isTest: p.is_test_data === true,
          // Ensemble data
          llmEnsembleResults: p.llm_ensemble || undefined,
          analystEnsemble: p.analyst_ensemble || undefined,
          // Per-analyst prediction fields
          analystSlug: p.analyst_slug || null,
          isArbitrator: p.is_arbitrator || false,
          // Analyst assessments for arbitrator predictions (expandable UI)
          analystAssessments,
          // Fork comparison metadata (how often user/ai/arbitrator agree)
          forkMetadata: forkMetadata
            ? {
                totalAnalysts: forkMetadata.totalAnalysts,
                userVsAiAgreement: forkMetadata.userVsAiAgreement,
                arbitratorAgreesWithUser: forkMetadata.arbitratorAgreesWithUser,
                arbitratorAgreesWithAi: forkMetadata.arbitratorAgreesWithAi,
              }
            : undefined,
        };
      });

      // Optionally include snapshots
      let results = enrichedPredictions;
      if (params?.includeSnapshot) {
        results = await Promise.all(
          enrichedPredictions.map(async (prediction) => {
            const snapshot = await this.snapshotService.getSnapshot(
              prediction.id,
            );
            return {
              ...prediction,
              snapshot: snapshot || null,
            };
          }),
        );
      }

      return buildDashboardSuccess(
        results,
        buildPaginationMetadata(filtered.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list predictions: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list predictions',
      );
    }
  }

  private async handleGet(
    params?: PredictionParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Prediction ID is required');
    }

    try {
      const prediction = await this.predictionRepository.findById(params.id);
      if (!prediction) {
        return buildDashboardError(
          'NOT_FOUND',
          `Prediction not found: ${params.id}`,
        );
      }

      // Include snapshot if requested
      if (params.includeSnapshot) {
        const snapshot = await this.snapshotService.getSnapshot(params.id);
        return buildDashboardSuccess({
          ...prediction,
          snapshot: snapshot || null,
        });
      }

      return buildDashboardSuccess(prediction);
    } catch (error) {
      this.logger.error(
        `Failed to get prediction: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get prediction',
      );
    }
  }

  private async handleGetSnapshot(
    params?: PredictionParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Prediction ID is required');
    }

    try {
      // First verify prediction exists
      const prediction = await this.predictionRepository.findById(params.id);
      if (!prediction) {
        return buildDashboardError(
          'NOT_FOUND',
          `Prediction not found: ${params.id}`,
        );
      }

      // Get the full snapshot for explainability
      const snapshot = await this.snapshotService.getSnapshot(params.id);
      if (!snapshot) {
        return buildDashboardError(
          'SNAPSHOT_NOT_FOUND',
          `Snapshot not found for prediction: ${params.id}`,
        );
      }

      // Return snapshot data directly (frontend expects snapshot object, not wrapped)
      // Field names match frontend PredictionSnapshot interface
      // Transform all nested objects from snake_case to camelCase

      // Transform predictors array
      const transformedPredictors = (snapshot.predictors || []).map((p) => ({
        id: p.predictor_id,
        direction: p.direction || 'unknown',
        strength: p.strength ?? 0,
        confidence: p.confidence ?? 0,
        reasoning: p.signal_content || '',
        signalId: p.predictor_id, // use predictor_id as fallback for signalId
        analystSlug: p.analyst_slug,
        createdAt: p.created_at,
      }));

      // Transform rejected signals array
      const transformedRejectedSignals = (snapshot.rejected_signals || []).map(
        (s) => ({
          id: s.signal_id,
          content: s.content,
          rejectionReason: s.rejection_reason,
          confidence: s.confidence,
          rejectedAt: s.rejected_at,
        }),
      );

      // Transform threshold evaluation (snake_case to camelCase)
      const thresholdEval = snapshot.threshold_evaluation || {};
      const transformedThresholdEvaluation = {
        minPredictors: thresholdEval.min_predictors ?? 0,
        actualPredictors: thresholdEval.actual_predictors ?? 0,
        minStrength: thresholdEval.min_combined_strength ?? 0,
        actualStrength: thresholdEval.actual_combined_strength ?? 0,
        minConsensus: thresholdEval.min_consensus ?? 0,
        actualConsensus: thresholdEval.actual_consensus ?? 0,
        passed: thresholdEval.passed ?? false,
      };

      // Transform learnings applied
      const transformedLearnings = (snapshot.learnings_applied || []).map(
        (l) => ({
          id: l.learning_id,
          type: l.type,
          content: l.content,
          scope: l.scope,
          appliedTo: l.applied_to,
        }),
      );

      // Transform LLM ensemble results
      const llmEnsemble = snapshot.llm_ensemble || {};
      const transformedLlmEnsemble = {
        tiersUsed: llmEnsemble.tiers_used || [],
        tierResults: llmEnsemble.tier_results || {},
        agreementLevel: llmEnsemble.agreement_level ?? 0,
      };

      return buildDashboardSuccess({
        id: snapshot.id,
        predictionId: snapshot.prediction_id,
        // All predictors that contributed (transformed to camelCase)
        predictors: transformedPredictors,
        // Signals considered but rejected (and why)
        rejectedSignals: transformedRejectedSignals,
        // Each analyst's individual assessment
        analystAssessments: snapshot.analyst_assessments || [],
        // Each LLM tier's assessment (frontend expects 'llmEnsembleResults')
        llmEnsembleResults: transformedLlmEnsemble,
        // Learnings that were applied
        appliedLearnings: transformedLearnings,
        // Threshold evaluation details (transformed to camelCase)
        thresholdEvaluation: transformedThresholdEvaluation,
        // Complete timeline
        timeline: snapshot.timeline || [],
        // Metadata
        createdAt: snapshot.created_at,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get snapshot: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'SNAPSHOT_FAILED',
        error instanceof Error ? error.message : 'Failed to get snapshot',
      );
    }
  }

  /**
   * Get full prediction deep-dive with lineage:
   * - Prediction details
   * - Source article references
   * - Signal fingerprints
   * - Analyst reasoning chain
   * - Contributing predictors with signals
   */
  private async handleGetDeepDive(
    params?: PredictionParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Prediction ID is required');
    }

    try {
      // Get prediction
      const prediction = await this.predictionRepository.findById(params.id);
      if (!prediction) {
        return buildDashboardError(
          'NOT_FOUND',
          `Prediction not found: ${params.id}`,
        );
      }

      // Get snapshot for predictor IDs and analyst assessments
      const snapshot = await this.snapshotService.getSnapshot(params.id);

      // Get predictors that contributed to this prediction
      // First try from snapshot, then fall back to direct query by consumed_by_prediction_id
      let validPredictors: Predictor[] = [];

      // Filter out undefined/null predictor IDs before attempting to fetch
      const predictorIds =
        snapshot?.predictors
          ?.map((p) => p.predictor_id)
          .filter((id): id is string => !!id) ?? [];

      if (predictorIds.length > 0) {
        // Snapshot has valid predictor IDs - fetch them
        const predictors = await Promise.all(
          predictorIds.map((id) => this.predictorRepository.findById(id)),
        );
        validPredictors = predictors.filter((p): p is Predictor => p !== null);
      }

      // If no predictors from snapshot, query directly by prediction ID
      if (validPredictors.length === 0) {
        validPredictors = await this.predictorRepository.findByPredictionId(
          params.id,
        );
      }

      // Note: Legacy predictors may not have article_id
      // For deep-dive lineage, we use article data when available
      const validSignals: Array<unknown> = []; // Legacy - no longer used

      // Note: Source articles from legacy prediction.source_seen_items table were removed
      // Articles now come from crawler.articles via source_subscriptions
      // For deep-dive lineage, signal metadata may contain article info

      // Build reasoning chain from analyst assessments
      // First, check if prediction has three-way fork data in analyst_ensemble
      // Two formats are supported:
      // 1. Legacy/arbitrator format: { assessments: [...] }
      // 2. Per-analyst format: { analyst_slug, analyst_name, user_fork, ai_fork, arbitrator_fork, ... }
      const analystEnsembleData = prediction.analyst_ensemble as {
        // Legacy format with assessments array
        assessments?: Array<{
          analyst_slug?: string;
          analyst_name?: string;
          direction?: string;
          confidence?: number;
          reasoning?: string;
          user_fork?: {
            direction: string;
            confidence: number;
            reasoning?: string;
            is_flat?: boolean;
          };
          ai_fork?: {
            direction: string;
            confidence: number;
            reasoning?: string;
            is_flat?: boolean;
          };
          arbitrator_fork?: {
            direction: string;
            confidence: number;
            reasoning?: string;
            is_flat?: boolean;
          };
        }>;
        fork_metadata?: {
          totalAnalysts: number;
          userVsAiAgreement: number;
          arbitratorAgreesWithUser: number;
          arbitratorAgreesWithAi: number;
        };
        // Per-analyst format (forks at top level)
        analyst_slug?: string;
        analyst_name?: string;
        key_factors?: string[];
        risks?: string[];
        tier?: string;
        user_fork?: {
          direction: string;
          confidence: number;
          reasoning?: string;
          is_flat?: boolean;
        };
        ai_fork?: {
          direction: string;
          confidence: number;
          reasoning?: string;
          is_flat?: boolean;
        };
        arbitrator_fork?: {
          direction: string;
          confidence: number;
          reasoning?: string;
          is_flat?: boolean;
        };
      } | null;

      // Helper to convert analyst slug to display name
      const slugToDisplayName = (slug: string): string => {
        const nameMap: Record<string, string> = {
          'fundamental-fred': 'Fundamental Fred',
          'technical-tina': 'Technical Tina',
          'sentiment-sally': 'Sentiment Sally',
          'aggressive-alex': 'Aggressive Alex',
          'cautious-carl': 'Cautious Carl',
        };
        return (
          nameMap[slug] ||
          slug
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        );
      };

      // Use prediction's analyst_ensemble if it has three-way fork data (new format)
      // Otherwise fall back to snapshot's analyst_assessments (legacy format)
      let reasoningChain: Array<{
        analystSlug: string;
        analystName?: string;
        tier?: string;
        direction: string;
        confidence: number;
        reasoning?: string;
        keyFactors?: string[];
        risks?: string[];
        learningsApplied?: string[];
        userFork?: {
          direction: string;
          confidence: number;
          reasoning?: string;
          is_flat?: boolean;
        };
        aiFork?: {
          direction: string;
          confidence: number;
          reasoning?: string;
          is_flat?: boolean;
        };
        arbitratorFork?: {
          direction: string;
          confidence: number;
          reasoning?: string;
          is_flat?: boolean;
        };
      }> = [];

      if (
        analystEnsembleData?.assessments &&
        analystEnsembleData.assessments.length > 0
      ) {
        // Legacy/arbitrator format: Use prediction's analyst_ensemble.assessments array
        reasoningChain = analystEnsembleData.assessments.map((a) => {
          const slug = a.analyst_slug || 'unknown';
          const name = a.analyst_name || slugToDisplayName(slug);
          return {
            analystSlug: slug,
            analystName: name,
            direction: a.direction || 'neutral',
            confidence: a.confidence || 0,
            reasoning: a.reasoning,
            // Include all three fork reasonings for the UI
            userFork: a.user_fork
              ? {
                  direction: a.user_fork.direction,
                  confidence: a.user_fork.confidence,
                  reasoning: a.user_fork.reasoning,
                  is_flat: a.user_fork.is_flat,
                }
              : undefined,
            aiFork: a.ai_fork
              ? {
                  direction: a.ai_fork.direction,
                  confidence: a.ai_fork.confidence,
                  reasoning: a.ai_fork.reasoning,
                  is_flat: a.ai_fork.is_flat,
                }
              : undefined,
            arbitratorFork: a.arbitrator_fork
              ? {
                  direction: a.arbitrator_fork.direction,
                  confidence: a.arbitrator_fork.confidence,
                  reasoning: a.arbitrator_fork.reasoning,
                  is_flat: a.arbitrator_fork.is_flat,
                }
              : undefined,
          };
        });
      } else if (
        analystEnsembleData?.analyst_slug &&
        (analystEnsembleData.user_fork ||
          analystEnsembleData.ai_fork ||
          analystEnsembleData.arbitrator_fork)
      ) {
        // Per-analyst format: forks are at the top level of analyst_ensemble
        // This is a single-analyst prediction with all three forks
        const slug = analystEnsembleData.analyst_slug;
        const name =
          analystEnsembleData.analyst_name || slugToDisplayName(slug);
        reasoningChain = [
          {
            analystSlug: slug,
            analystName: name,
            tier: analystEnsembleData.tier,
            direction:
              analystEnsembleData.arbitrator_fork?.direction ||
              prediction.direction,
            confidence:
              analystEnsembleData.arbitrator_fork?.confidence ||
              prediction.confidence,
            reasoning:
              analystEnsembleData.arbitrator_fork?.reasoning ||
              prediction.reasoning,
            keyFactors: analystEnsembleData.key_factors,
            risks: analystEnsembleData.risks,
            userFork: analystEnsembleData.user_fork
              ? {
                  direction: analystEnsembleData.user_fork.direction,
                  confidence: analystEnsembleData.user_fork.confidence,
                  reasoning: analystEnsembleData.user_fork.reasoning,
                  is_flat: analystEnsembleData.user_fork.is_flat,
                }
              : undefined,
            aiFork: analystEnsembleData.ai_fork
              ? {
                  direction: analystEnsembleData.ai_fork.direction,
                  confidence: analystEnsembleData.ai_fork.confidence,
                  reasoning: analystEnsembleData.ai_fork.reasoning,
                  is_flat: analystEnsembleData.ai_fork.is_flat,
                }
              : undefined,
            arbitratorFork: analystEnsembleData.arbitrator_fork
              ? {
                  direction: analystEnsembleData.arbitrator_fork.direction,
                  confidence: analystEnsembleData.arbitrator_fork.confidence,
                  reasoning: analystEnsembleData.arbitrator_fork.reasoning,
                  is_flat: analystEnsembleData.arbitrator_fork.is_flat,
                }
              : undefined,
          },
        ];
      } else if (snapshot?.analyst_assessments) {
        // Fall back to snapshot's analyst_assessments (legacy format)
        reasoningChain = snapshot.analyst_assessments.map((assessment) => ({
          analystSlug: assessment.analyst.slug,
          analystName: assessment.analyst.name,
          tier: assessment.tier,
          direction: assessment.direction,
          confidence: assessment.confidence,
          reasoning: assessment.reasoning,
          keyFactors: assessment.key_factors,
          risks: assessment.risks,
          learningsApplied: assessment.learnings_applied,
        }));
      }

      // Build complete lineage response
      return buildDashboardSuccess({
        prediction: {
          id: prediction.id,
          targetId: prediction.target_id,
          direction: prediction.direction,
          magnitude: prediction.magnitude,
          confidence: prediction.confidence,
          timeframeHours: prediction.timeframe_hours,
          status: prediction.status,
          predictedAt: prediction.predicted_at,
          expiresAt: prediction.expires_at,
          outcomeValue: prediction.outcome_value,
          resolutionNotes: prediction.resolution_notes,
          reasoning: prediction.reasoning,
        },
        lineage: {
          // Contributing predictors with their article sources
          predictors: validPredictors.map((predictor) => {
            // Note: signal_id removed - using article_id for new predictors

            return {
              id: predictor.id,
              direction: predictor.direction,
              strength: predictor.strength,
              confidence: predictor.confidence,
              reasoning: predictor.reasoning,
              analystSlug: predictor.analyst_slug,
              createdAt: predictor.created_at,
              // Legacy signal/fingerprint fields removed - predictors now link directly to articles
              signal: null,
              fingerprint: null,
              // Article ID for new predictors (links to crawler.articles)
              articleId: predictor.article_id,
            };
          }),
          // Analyst reasoning chain
          analystAssessments: reasoningChain,
          // LLM ensemble details
          llmEnsemble: snapshot?.llm_ensemble ?? null,
          // Threshold evaluation
          thresholdEvaluation: snapshot?.threshold_evaluation ?? null,
          // Timeline of events
          timeline: snapshot?.timeline ?? [],
        },
        // Summary stats
        stats: {
          predictorCount: validPredictors.length,
          signalCount: validSignals.length,
          analystCount: reasoningChain.length,
          averageConfidence:
            validPredictors.length > 0
              ? validPredictors.reduce((sum, p) => sum + p.confidence, 0) /
                validPredictors.length
              : 0,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get prediction deep-dive: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DEEPDIVE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get prediction deep-dive',
      );
    }
  }

  /**
   * Compare multiple predictions side by side
   *
   * Sprint 5: Phase 3.8 - Prediction comparison feature
   *
   * @param params - Must include ids array with 2+ prediction IDs
   * @returns Comparison data including predictions, accuracy stats, analyst assessments
   */
  private async handleCompare(
    params?: PredictionParams,
  ): Promise<DashboardActionResult> {
    const ids = params?.ids ?? [];

    if (ids.length < 2) {
      return buildDashboardError(
        'INVALID_IDS',
        'At least 2 prediction IDs are required for comparison',
        { received: ids.length },
      );
    }

    if (ids.length > 10) {
      return buildDashboardError(
        'TOO_MANY_IDS',
        'Maximum 10 predictions can be compared at once',
        { received: ids.length },
      );
    }

    try {
      // Fetch all predictions
      const predictions = await Promise.all(
        ids.map((id) => this.predictionRepository.findById(id)),
      );

      // Filter out null results
      const validPredictions = predictions.filter((p) => p !== null);

      if (validPredictions.length < 2) {
        return buildDashboardError(
          'INSUFFICIENT_PREDICTIONS',
          'At least 2 valid predictions are required for comparison',
          {
            requested: ids.length,
            found: validPredictions.length,
            missing: ids.filter((id, idx) => predictions[idx] === null),
          },
        );
      }

      // Get snapshots for each prediction
      const snapshots = await Promise.all(
        validPredictions.map((p) => this.snapshotService.getSnapshot(p.id)),
      );

      // Build comparison data for each prediction
      const comparisonItems = await Promise.all(
        validPredictions.map(async (prediction, idx) => {
          const snapshot = snapshots[idx];

          // Get predictors for this prediction
          // Filter out undefined/null predictor IDs
          const predictorIds =
            snapshot?.predictors
              ?.map((p) => p.predictor_id)
              .filter((id): id is string => !!id) ?? [];
          const predictors = await Promise.all(
            predictorIds
              .slice(0, 5)
              .map((id) => this.predictorRepository.findById(id)),
          );
          const validPredictors = predictors.filter((p) => p !== null);

          // Build analyst assessment summary
          const analystSummary =
            snapshot?.analyst_assessments?.map((a) => ({
              analystSlug: a.analyst.slug,
              tier: a.tier,
              direction: a.direction,
              confidence: a.confidence,
            })) ?? [];

          return {
            prediction: {
              id: prediction.id,
              targetId: prediction.target_id,
              direction: prediction.direction,
              magnitude: prediction.magnitude,
              confidence: prediction.confidence,
              timeframeHours: prediction.timeframe_hours,
              status: prediction.status,
              predictedAt: prediction.predicted_at,
              expiresAt: prediction.expires_at,
              outcomeValue: prediction.outcome_value,
            },
            stats: {
              predictorCount: predictorIds.length,
              analystCount: analystSummary.length,
              averageStrength:
                validPredictors.length > 0
                  ? validPredictors.reduce((sum, p) => sum + p.strength, 0) /
                    validPredictors.length
                  : 0,
              averageConfidence:
                validPredictors.length > 0
                  ? validPredictors.reduce((sum, p) => sum + p.confidence, 0) /
                    validPredictors.length
                  : 0,
            },
            analystAssessments: analystSummary,
            thresholdsMet: snapshot?.threshold_evaluation ?? null,
          };
        }),
      );

      // Calculate comparison summary
      const directionAgreement =
        this.calculateDirectionAgreement(comparisonItems);
      const confidenceRange = this.calculateConfidenceRange(comparisonItems);
      const outcomeComparison =
        this.calculateOutcomeComparison(comparisonItems);

      return buildDashboardSuccess({
        predictions: comparisonItems,
        comparison: {
          totalCompared: comparisonItems.length,
          directionAgreement,
          confidenceRange,
          outcomeComparison,
          // Group by target to show same-target predictions together
          byTarget: this.groupByTarget(comparisonItems),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to compare predictions: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'COMPARE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to compare predictions',
      );
    }
  }

  /**
   * Calculate direction agreement across predictions
   */
  private calculateDirectionAgreement(
    items: Array<{ prediction: { direction: string } }>,
  ): { unanimous: boolean; directions: Record<string, number> } {
    const directions: Record<string, number> = {};

    for (const item of items) {
      const dir = item.prediction.direction;
      directions[dir] = (directions[dir] || 0) + 1;
    }

    const unanimous = Object.keys(directions).length === 1;

    return { unanimous, directions };
  }

  /**
   * Calculate confidence range across predictions
   */
  private calculateConfidenceRange(
    items: Array<{ prediction: { confidence: number } }>,
  ): { min: number; max: number; average: number; spread: number } {
    const confidences = items.map((i) => i.prediction.confidence);
    const min = Math.min(...confidences);
    const max = Math.max(...confidences);
    const average =
      confidences.reduce((sum, c) => sum + c, 0) / confidences.length;

    return {
      min,
      max,
      average,
      spread: max - min,
    };
  }

  /**
   * Calculate outcome comparison for resolved predictions
   */
  private calculateOutcomeComparison(
    items: Array<{
      prediction: {
        status: string;
        outcomeValue: number | null;
        direction: string;
      };
    }>,
  ): {
    resolvedCount: number;
    correctCount: number;
    accuracyPct: number | null;
  } {
    const resolved = items.filter((i) => i.prediction.status === 'resolved');
    const resolvedCount = resolved.length;

    if (resolvedCount === 0) {
      return { resolvedCount: 0, correctCount: 0, accuracyPct: null };
    }

    const correct = resolved.filter((i) => {
      const outcome = i.prediction.outcomeValue;
      if (outcome === null) return false;
      const actualDirection = outcome > 0 ? 'up' : 'down';
      return i.prediction.direction === actualDirection;
    });

    const correctCount = correct.length;
    const accuracyPct = (correctCount / resolvedCount) * 100;

    return { resolvedCount, correctCount, accuracyPct };
  }

  /**
   * Group comparison items by target ID
   */
  private groupByTarget(
    items: Array<{ prediction: { targetId: string; id: string } }>,
  ): Record<string, string[]> {
    const byTarget: Record<string, string[]> = {};

    for (const item of items) {
      const targetId = item.prediction.targetId;
      if (!byTarget[targetId]) {
        byTarget[targetId] = [];
      }
      byTarget[targetId].push(item.prediction.id);
    }

    return byTarget;
  }

  /**
   * Manually generate predictions from active predictors
   * Evaluates predictor thresholds and generates predictions for targets
   *
   * This is useful for:
   * - Testing the predictor-to-prediction pipeline
   * - Manually triggering generation when cron jobs aren't running
   * - Generating predictions for specific targets on-demand
   */
  private async handleGenerate(
    params?: PredictionParams,
    baseContext?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    // Either targetId or universeId is required
    if (!params?.targetId && !params?.universeId) {
      return buildDashboardError(
        'MISSING_PARAMS',
        'Either targetId or universeId is required for prediction generation',
      );
    }

    this.logger.log(
      `[PREDICTION-HANDLER] Generating predictions - targetId: ${params.targetId}, universeId: ${params.universeId}, force: ${params.forceGenerate}`,
    );

    try {
      // Create execution context
      const ctx: ExecutionContext = baseContext
        ? {
            ...baseContext,
            agentSlug: 'manual-prediction-generator',
          }
        : {
            orgSlug: 'system',
            userId: 'system',
            conversationId: uuidv4(),
            agentSlug: 'manual-prediction-generator',
            agentType: 'context',
            provider: 'anthropic',
            model: 'claude-haiku-4-20250514',
          };

      const results: Array<{
        targetId: string;
        targetSymbol?: string;
        status:
          | 'prediction_generated'
          | 'threshold_not_met'
          | 'no_predictors'
          | 'error';
        predictionId?: string;
        direction?: string;
        confidence?: number;
        predictorCount?: number;
        error?: string;
      }> = [];

      let generated = 0;
      let skipped = 0;
      let errors = 0;

      // Get targets to process
      let targetsToProcess: Array<{
        id: string;
        symbol: string;
        universe_id: string;
      }> = [];

      if (params.targetId) {
        // Single target
        const target = await this.targetRepository.findById(params.targetId);
        if (!target) {
          return buildDashboardError(
            'NOT_FOUND',
            `Target not found: ${params.targetId}`,
          );
        }
        targetsToProcess = [target];
      } else if (params.universeId) {
        // All active targets in universe
        targetsToProcess = await this.targetRepository.findActiveByUniverse(
          params.universeId,
        );
      }

      // Process each target
      for (const target of targetsToProcess) {
        try {
          // Get active predictors for this target
          const activePredictors =
            await this.predictorRepository.findActiveByTarget(target.id, {
              includeTestData: params.filters?.includeTestData ?? false,
            });

          if (activePredictors.length === 0) {
            results.push({
              targetId: target.id,
              targetSymbol: target.symbol,
              status: 'no_predictors',
              predictorCount: 0,
            });
            skipped++;
            continue;
          }

          // Generate prediction via the service
          // Uses attemptPredictionGeneration which handles threshold evaluation internally
          const prediction =
            await this.predictionGenerationService.attemptPredictionGeneration(
              ctx,
              target.id,
            );

          if (prediction) {
            generated++;
            results.push({
              targetId: target.id,
              targetSymbol: target.symbol,
              status: 'prediction_generated',
              predictionId: prediction.id,
              direction: prediction.direction,
              confidence: prediction.confidence,
              predictorCount: activePredictors.length,
            });
          } else {
            skipped++;
            results.push({
              targetId: target.id,
              targetSymbol: target.symbol,
              status: 'threshold_not_met',
              predictorCount: activePredictors.length,
            });
          }
        } catch (error) {
          errors++;
          this.logger.error(
            `Error generating prediction for target ${target.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          results.push({
            targetId: target.id,
            targetSymbol: target.symbol,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return buildDashboardSuccess({
        generated,
        skipped,
        errors,
        results,
        message: `Processed ${targetsToProcess.length} targets: ${generated} predictions generated, ${skipped} skipped, ${errors} errors`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate predictions: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GENERATE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to generate predictions',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4: USER PORTFOLIO ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Mark a prediction as "used" and create a position in user's portfolio
   */
  private async handleUse(
    params: PredictionParams | undefined,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError(
        'MISSING_PREDICTION_ID',
        'Prediction ID is required to create a position',
      );
    }

    if (!params.quantity || params.quantity <= 0) {
      return buildDashboardError(
        'INVALID_QUANTITY',
        'A positive quantity is required to create a position',
      );
    }

    try {
      const result =
        await this.userPositionService.createPositionFromPrediction({
          userId: context.userId,
          orgSlug: context.orgSlug,
          predictionId: params.id,
          quantity: params.quantity,
          entryPrice: params.entryPrice,
        });

      this.logger.log(
        `Created position for user ${context.userId}: ${result.position.direction} ${result.position.quantity} ${result.position.symbol}`,
      );

      return buildDashboardSuccess({
        position: result.position,
        portfolio: {
          id: result.portfolio.id,
          currentBalance: result.portfolio.current_balance,
          totalRealizedPnl: result.portfolio.total_realized_pnl,
        },
        prediction: {
          id: result.prediction.id,
          direction: result.prediction.direction,
          confidence: result.prediction.confidence,
        },
        message: `Position created: ${result.position.direction} ${result.position.quantity} ${result.position.symbol} @ $${result.position.entry_price}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create position: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'USE_FAILED',
        error instanceof Error ? error.message : 'Failed to create position',
      );
    }
  }

  /**
   * Calculate recommended position size for a prediction
   */
  private async handleCalculateSize(
    params: PredictionParams | undefined,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError(
        'MISSING_PREDICTION_ID',
        'Prediction ID is required to calculate position size',
      );
    }

    try {
      // Get user's portfolio
      const portfolio = await this.userPositionService.getOrCreatePortfolio(
        context.userId,
        context.orgSlug,
      );

      // Get prediction to get target
      const prediction = await this.predictionRepository.findById(params.id);
      if (!prediction) {
        return buildDashboardError(
          'NOT_FOUND',
          `Prediction not found: ${params.id}`,
        );
      }

      // Get current price from target snapshot
      const target = await this.targetRepository.findById(prediction.target_id);
      if (!target) {
        return buildDashboardError(
          'NOT_FOUND',
          `Target not found: ${prediction.target_id}`,
        );
      }

      // Use entry price from params or get from target's cached current_price
      const currentPrice = params.entryPrice ?? target.current_price;
      if (!currentPrice) {
        return buildDashboardError(
          'NO_PRICE_DATA',
          `No entry price provided and no current price available for ${target.symbol}. Try refreshing market data.`,
        );
      }

      const recommendation =
        await this.userPositionService.calculateRecommendedSize(
          params.id,
          portfolio.current_balance,
          currentPrice,
        );

      return buildDashboardSuccess({
        predictionId: prediction.id,
        symbol: target.symbol,
        direction: prediction.direction === 'up' ? 'bullish' : 'bearish',
        currentPrice,
        recommendedQuantity: recommendation.recommendedQuantity,
        riskAmount: recommendation.riskAmount,
        riskRewardRatio: recommendation.riskRewardRatio,
        reasoning: recommendation.reasoning,
        // Additional details
        prediction: {
          id: prediction.id,
          direction: prediction.direction,
          confidence: prediction.confidence,
          magnitude: prediction.magnitude,
        },
        portfolio: {
          id: portfolio.id,
          currentBalance: portfolio.current_balance,
        },
        recommendation: {
          recommendedQuantity: recommendation.recommendedQuantity,
          reasoning: recommendation.reasoning,
          riskAmount: recommendation.riskAmount,
          entryPrice: recommendation.entryPrice,
          stopPrice: recommendation.stopPrice,
          targetPrice: recommendation.targetPrice,
          potentialProfit: recommendation.potentialProfit,
          potentialLoss: recommendation.potentialLoss,
          riskRewardRatio: recommendation.riskRewardRatio,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to calculate position size: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CALCULATE_SIZE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to calculate position size',
      );
    }
  }

  /**
   * Get user's portfolio summary with open positions
   */
  private async handlePortfolio(
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    try {
      const summary = await this.userPositionService.getPortfolioSummary(
        context.userId,
        context.orgSlug,
      );

      if (!summary.portfolio) {
        // Create a new portfolio for the user
        const portfolio = await this.userPositionService.getOrCreatePortfolio(
          context.userId,
          context.orgSlug,
        );

        return buildDashboardSuccess({
          portfolio: {
            id: portfolio.id,
            initialBalance: portfolio.initial_balance,
            currentBalance: portfolio.current_balance,
            totalRealizedPnl: portfolio.total_realized_pnl,
            totalUnrealizedPnl: portfolio.total_unrealized_pnl,
          },
          openPositions: [],
          summary: {
            totalUnrealizedPnl: 0,
            totalRealizedPnl: 0,
            winRate: 0,
            openPositionCount: 0,
          },
        });
      }

      return buildDashboardSuccess({
        portfolio: {
          id: summary.portfolio.id,
          initialBalance: summary.portfolio.initial_balance,
          currentBalance: summary.portfolio.current_balance,
          totalRealizedPnl: summary.portfolio.total_realized_pnl,
          totalUnrealizedPnl: summary.portfolio.total_unrealized_pnl,
        },
        openPositions: summary.openPositions.map((pos) => ({
          id: pos.id,
          symbol: pos.symbol,
          direction: pos.direction,
          quantity: pos.quantity,
          entryPrice: pos.entry_price,
          currentPrice: pos.current_price,
          unrealizedPnl: pos.unrealized_pnl,
          openedAt: pos.opened_at,
        })),
        summary: {
          totalUnrealizedPnl: summary.totalUnrealizedPnl,
          totalRealizedPnl: summary.totalRealizedPnl,
          winRate: summary.winRate,
          openPositionCount: summary.openPositions.length,
          totalTrades: summary.totalTrades,
          wins: summary.wins,
          losses: summary.losses,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get portfolio: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'PORTFOLIO_FAILED',
        error instanceof Error ? error.message : 'Failed to get portfolio',
      );
    }
  }

  /**
   * Handle closed positions history request
   * Returns list of closed positions with statistics
   */
  private async handleClosedPositions(
    params: PredictionParams | undefined,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    try {
      const result = await this.userPositionService.getClosedPositions(
        context.userId,
        context.orgSlug,
        {
          startDate: params?.filters?.startDate,
          endDate: params?.filters?.endDate,
          symbol: params?.filters?.symbol,
          limit: params?.filters?.limit,
        },
      );

      return buildDashboardSuccess({
        positions: result.positions.map((pos) => ({
          id: pos.id,
          symbol: pos.symbol,
          direction: pos.direction,
          quantity: pos.quantity,
          entryPrice: pos.entry_price,
          exitPrice: pos.exit_price,
          realizedPnl: pos.realized_pnl ?? 0,
          pnlPercent:
            pos.entry_price > 0
              ? ((pos.realized_pnl ?? 0) / (pos.entry_price * pos.quantity)) *
                100
              : 0,
          openedAt: pos.opened_at,
          closedAt: pos.closed_at,
          predictionId: pos.prediction_id,
          targetId: pos.target_id,
        })),
        statistics: result.statistics,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get closed positions: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CLOSED_POSITIONS_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get closed positions',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EOD TRADE QUEUE ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Queue a trade for end-of-day settlement
   * Instead of executing immediately, adds to the trade queue
   */
  private async handleQueue(
    params: PredictionParams | undefined,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError(
        'MISSING_PREDICTION_ID',
        'Prediction ID is required to queue a trade',
      );
    }

    if (!params.quantity || params.quantity <= 0) {
      return buildDashboardError(
        'INVALID_QUANTITY',
        'A positive quantity is required to queue a trade',
      );
    }

    try {
      // Get the prediction to extract target info
      const prediction = await this.predictionRepository.findById(params.id);
      if (!prediction) {
        return buildDashboardError(
          'NOT_FOUND',
          `Prediction not found: ${params.id}`,
        );
      }

      // Get the target for symbol
      const target = await this.targetRepository.findById(prediction.target_id);
      if (!target) {
        return buildDashboardError(
          'NOT_FOUND',
          `Target not found: ${prediction.target_id}`,
        );
      }

      // Get or create portfolio
      const portfolio = await this.userPositionService.getOrCreatePortfolio(
        context.userId,
        context.orgSlug,
      );

      // Create queue entry
      const queueEntry = await this.portfolioRepository.createTradeQueueEntry({
        user_id: context.userId,
        org_slug: context.orgSlug,
        portfolio_id: portfolio.id,
        prediction_id: prediction.id,
        target_id: prediction.target_id,
        symbol: target.symbol,
        direction: prediction.direction === 'up' ? 'long' : 'short',
        quantity: params.quantity,
      });

      this.logger.log(
        `Queued trade for user ${context.userId}: ${target.symbol} ${prediction.direction === 'up' ? 'long' : 'short'} x${params.quantity}`,
      );

      return buildDashboardSuccess({
        queueEntry: {
          id: queueEntry.id,
          symbol: queueEntry.symbol,
          direction: queueEntry.direction,
          quantity: queueEntry.quantity,
          status: queueEntry.status,
          queuedAt: queueEntry.queued_at,
        },
        message: `Trade queued for end-of-day settlement: ${prediction.direction === 'up' ? 'long' : 'short'} ${params.quantity} ${target.symbol}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to queue trade: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'QUEUE_FAILED',
        error instanceof Error ? error.message : 'Failed to queue trade',
      );
    }
  }

  /**
   * Get user's pending queued trades
   */
  private async handleGetQueue(
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    try {
      const queuedTrades =
        await this.portfolioRepository.getQueuedTradesForUser(
          context.userId,
          context.orgSlug,
        );

      return buildDashboardSuccess({
        trades: queuedTrades.map((t) => ({
          id: t.id,
          predictionId: t.prediction_id,
          symbol: t.symbol,
          direction: t.direction,
          quantity: t.quantity,
          status: t.status,
          queuedAt: t.queued_at,
        })),
        count: queuedTrades.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get trade queue: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_QUEUE_FAILED',
        error instanceof Error ? error.message : 'Failed to get trade queue',
      );
    }
  }

  /**
   * Cancel a pending queued trade
   */
  private async handleCancelQueuedTrade(
    params: PredictionParams | undefined,
  ): Promise<DashboardActionResult> {
    const tradeId = params?.tradeId || params?.id;
    if (!tradeId) {
      return buildDashboardError(
        'MISSING_TRADE_ID',
        'Trade ID is required to cancel a queued trade',
      );
    }

    try {
      await this.portfolioRepository.cancelQueuedTrade(tradeId);

      return buildDashboardSuccess({
        tradeId,
        message: 'Trade cancelled successfully',
      });
    } catch (error) {
      this.logger.error(
        `Failed to cancel queued trade: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CANCEL_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to cancel queued trade',
      );
    }
  }

  /**
   * Handle close position request
   * Closes an open position at the specified exit price
   */
  private async handleClosePosition(
    params: PredictionParams | undefined,
    _context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError(
        'MISSING_POSITION_ID',
        'Position ID is required to close a position',
      );
    }

    if (!params?.exitPrice) {
      return buildDashboardError(
        'MISSING_EXIT_PRICE',
        'Exit price is required to close a position',
      );
    }

    try {
      const result = await this.userPositionService.closePosition(
        params.id,
        params.exitPrice,
      );

      return buildDashboardSuccess({
        positionId: params.id,
        realizedPnl: result.realizedPnl,
        isWin: result.isWin,
        message: `Position closed with ${result.isWin ? 'profit' : 'loss'} of $${result.realizedPnl.toFixed(2)}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to close position: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CLOSE_POSITION_FAILED',
        error instanceof Error ? error.message : 'Failed to close position',
      );
    }
  }
}

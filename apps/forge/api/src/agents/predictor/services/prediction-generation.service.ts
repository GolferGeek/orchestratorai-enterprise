import { Injectable, Logger, Optional } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { PredictionRepository } from '../repositories/prediction.repository';
import { PortfolioRepository } from '../repositories/portfolio.repository';
import { TargetSnapshotRepository } from '../repositories/target-snapshot.repository';
import { PredictorManagementService } from './predictor-management.service';
import { SnapshotService } from './snapshot.service';
import { AnalystEnsembleService } from './analyst-ensemble.service';
import { TargetService } from './target.service';
import { AnalystPositionService } from './analyst-position.service';
import { TestPriceDataRouterService } from './test-price-data-router.service';
import { TestTargetMirrorService } from './test-target-mirror.service';
import { ObservabilityEventsService } from '@orchestratorai/planes/observability';
import { CompositeScoreRepository } from '../../risk-runner/repositories/composite-score.repository';
import { ActiveCompositeScoreView } from '../../risk-runner/interfaces/composite-score.interface';
import { AnalystAssessmentResult } from '../interfaces/ensemble.interface';
import { Target } from '../interfaces/target.interface';
import {
  Prediction,
  PredictionDirection,
  CreatePredictionData,
} from '../interfaces/prediction.interface';
import { Predictor } from '../interfaces/predictor.interface';
import {
  ThresholdConfig,
  ThresholdEvaluationResult,
  DEFAULT_THRESHOLD_CONFIG,
} from '../interfaces/threshold-evaluation.interface';
import {
  EnsembleInput,
  EnsembleResult,
} from '../interfaces/ensemble.interface';
import { ThreeWayForkEnsembleResult } from './analyst-ensemble.service';
import { SnapshotBuildInput } from '../interfaces/snapshot.interface';

/**
 * Tier 3: Prediction Generation Service
 *
 * Creates predictions when predictor threshold is met:
 * - Evaluates threshold conditions
 * - Runs final ensemble for prediction parameters
 * - Creates prediction record
 * - Consumes contributing predictors
 * - Creates snapshot for audit trail
 *
 * Prediction includes:
 * - Direction (up/down/flat)
 * - Magnitude estimate
 * - Time horizon
 * - Confidence level
 */
@Injectable()
export class PredictionGenerationService {
  private readonly logger = new Logger(PredictionGenerationService.name);

  /** Cached risk scores for the current batch run */
  private riskScoreCache: Map<string, ActiveCompositeScoreView> | null = null;

  constructor(
    private readonly predictionRepository: PredictionRepository,
    private readonly portfolioRepository: PortfolioRepository,
    private readonly targetSnapshotRepository: TargetSnapshotRepository,
    private readonly predictorManagementService: PredictorManagementService,
    private readonly snapshotService: SnapshotService,
    private readonly ensembleService: AnalystEnsembleService,
    private readonly targetService: TargetService,
    private readonly observabilityEventsService: ObservabilityEventsService,
    private readonly analystPositionService: AnalystPositionService,
    private readonly testPriceDataRouterService: TestPriceDataRouterService,
    private readonly testTargetMirrorService: TestTargetMirrorService,
    @Optional()
    private readonly compositeScoreRepository?: CompositeScoreRepository,
  ) {}

  /**
   * Attempt to generate or update predictions for a target.
   * Returns null if threshold not met.
   * If threshold is met, upserts per-analyst predictions (creates or updates).
   */
  async attemptPredictionGeneration(
    ctx: ExecutionContext,
    targetId: string,
    config?: ThresholdConfig,
  ): Promise<Prediction | null> {
    const effectiveConfig = { ...DEFAULT_THRESHOLD_CONFIG, ...config };

    this.logger.log(`Attempting prediction generation for target: ${targetId}`);

    // Evaluate threshold against active predictors
    const thresholdResult =
      await this.predictorManagementService.evaluateThreshold(
        targetId,
        effectiveConfig,
      );

    if (!thresholdResult.meetsThreshold) {
      this.logger.debug(
        `Threshold not met for ${targetId}: ` +
          `active=${thresholdResult.activeCount}, ` +
          `strength=${thresholdResult.combinedStrength}, ` +
          `consensus=${thresholdResult.directionConsensus.toFixed(2)}`,
      );
      return null;
    }

    // Threshold met - generate/update predictions (upsert per analyst)
    return this.generatePrediction(
      ctx,
      targetId,
      thresholdResult,
      effectiveConfig,
    );
  }

  // shouldRefreshPrediction and refreshPrediction removed - replaced by
  // per-analyst upsert logic in generatePrediction() + updateAnalystPrediction()

  /**
   * Update the analyst_ensemble JSONB field
   */
  private async updateAnalystEnsemble(
    predictionId: string,
    ensemble: {
      predictor_count: number;
      combined_strength: number;
      direction_consensus: number;
      versions?: Array<{
        timestamp: string;
        direction: string;
        confidence: number;
        magnitude: string;
        predictor_count: number;
      }>;
      last_refresh?: string;
    },
  ): Promise<void> {
    await this.predictionRepository.updateAnalystEnsemble(
      predictionId,
      ensemble,
    );
  }

  /**
   * Generate or update per-analyst predictions (upsert pattern).
   * For each analyst: if active prediction exists, UPDATE it; otherwise CREATE new.
   * Predictors are NOT consumed - they remain active for rolling re-evaluation.
   * Positions are NOT created here - they are created at end-of-day.
   */
  async generatePrediction(
    ctx: ExecutionContext,
    targetId: string,
    thresholdResult: ThresholdEvaluationResult,
    _config: ThresholdConfig,
  ): Promise<Prediction> {
    this.logger.log(
      `Generating/updating per-analyst predictions for target: ${targetId}`,
    );

    const target = await this.targetService.findByIdOrThrow(targetId);

    // Get active predictors (NOT consumed - they stay active for rolling re-evaluation)
    const predictors =
      await this.predictorManagementService.getActivePredictors(targetId);

    // Run final ensemble evaluation for prediction parameters
    const ensembleInput: EnsembleInput = {
      targetId,
      content: await this.buildPredictionContext(
        predictors,
        thresholdResult,
        targetId,
      ),
    };

    const threeWayResult = await this.ensembleService.runThreeWayForkEnsemble(
      ctx,
      target,
      ensembleInput,
    );

    const ensembleResult: EnsembleResult = threeWayResult.final;

    // Filter out flat-only analysts
    const filtered = this.filterFlatOnlyAnalysts(threeWayResult);

    if (filtered.arbitratorForkAssessments.length === 0) {
      this.logger.log(
        `All analysts are flat for ${target.symbol} — no predictions created/updated`,
      );
      return null as unknown as Prediction;
    }

    // Calculate common parameters
    const horizonHours = this.determineHorizon(predictors);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + horizonHours);

    // Capture context versions for traceability
    const contextVersions = await this.captureContextVersions(
      target.universe_id,
      targetId,
      ensembleResult,
    );

    // Track all upserted predictions
    const upsertedPredictions: Prediction[] = [];
    let createdCount = 0;
    let updatedCount = 0;

    // Upsert per-analyst predictions
    for (const assessment of filtered.arbitratorForkAssessments) {
      const userFork = filtered.userForkAssessments.find(
        (a) => a.analyst.slug === assessment.analyst.slug,
      );
      const aiFork = filtered.aiForkAssessments.find(
        (a) => a.analyst.slug === assessment.analyst.slug,
      );

      // Check if this analyst already has an active prediction for this target
      const existing = await this.predictionRepository.findByTargetAndAnalyst(
        targetId,
        assessment.analyst.slug,
        'active',
      );

      if (existing) {
        // UPDATE existing prediction
        const updated = await this.updateAnalystPrediction(
          existing,
          assessment,
          userFork,
          aiFork,
          horizonHours,
          expiresAt,
          predictors,
          thresholdResult,
        );
        upsertedPredictions.push(updated);
        updatedCount++;
      } else {
        // CREATE new prediction
        const created = await this.createAnalystPredictionWithForks(
          ctx,
          target,
          assessment,
          userFork,
          aiFork,
          horizonHours,
          expiresAt,
          contextVersions,
        );
        upsertedPredictions.push(created);
        createdCount++;
      }
    }

    this.logger.log(
      `Predictions for ${target.symbol}: ${createdCount} created, ${updatedCount} updated`,
    );

    const primaryPrediction = upsertedPredictions[0];

    // Create snapshot for audit trail (no predictor consumption)
    if (primaryPrediction) {
      await this.createPredictionSnapshot(
        primaryPrediction,
        predictors,
        thresholdResult,
        ensembleResult,
      );
    }

    // Emit observability event
    await this.observabilityEventsService.push({
      context: ctx,
      source_app: 'prediction-runner',
      hook_event_type: 'prediction.upserted',
      status: 'completed',
      message: `Predictions for ${target.symbol}: ${createdCount} created, ${updatedCount} updated (${upsertedPredictions.map((p) => p.analyst_slug).join(', ')})`,
      progress: null,
      step: 'prediction-upserted',
      payload: {
        targetId,
        targetSymbol: target.symbol,
        timeframeHours: horizonHours,
        expiresAt: expiresAt.toISOString(),
        predictorCount: predictors.length,
        combinedStrength: thresholdResult.combinedStrength,
        directionConsensus: thresholdResult.directionConsensus,
        createdCount,
        updatedCount,
        analystPredictions: upsertedPredictions.map((p) => ({
          id: p.id,
          analyst_slug: p.analyst_slug,
          direction: p.direction,
          confidence: p.confidence,
        })),
      },
      timestamp: Date.now(),
    });

    return primaryPrediction!;
  }

  /**
   * Update an existing analyst prediction with fresh assessment data.
   * Preserves version history in analyst_ensemble JSONB.
   */
  private async updateAnalystPrediction(
    existing: Prediction,
    arbitratorAssessment: AnalystAssessmentResult,
    userAssessment: AnalystAssessmentResult | undefined,
    aiAssessment: AnalystAssessmentResult | undefined,
    horizonHours: number,
    expiresAt: Date,
    predictors: Predictor[],
    thresholdResult: ThresholdEvaluationResult,
  ): Promise<Prediction> {
    const assessment = arbitratorAssessment;
    const direction = this.mapAnalystDirection(assessment.direction);
    const magnitude = assessment.confidence * 5;
    const magnitudeCategory = this.categorizeMagnitude(magnitude);

    // Build version history entry from current values
    const previousVersion = {
      timestamp: existing.updated_at || existing.created_at,
      direction: existing.direction,
      confidence: existing.confidence,
      magnitude: existing.magnitude || 'unknown',
      predictor_count: predictors.length,
    };

    // Get existing version history
    const existingEnsemble =
      (existing.analyst_ensemble as {
        versions?: Array<Record<string, unknown>>;
      }) || {};
    const versions = [...(existingEnsemble.versions || [])];
    versions.push(previousVersion);

    // Build updated analyst_ensemble with fork data + version history
    const updatedEnsemble: Record<string, unknown> = {
      analyst_slug: assessment.analyst.slug,
      analyst_name: assessment.analyst.name,
      key_factors: assessment.key_factors,
      risks: assessment.risks,
      tier: assessment.tier,
      user_fork: userAssessment
        ? {
            direction: userAssessment.direction,
            confidence: userAssessment.confidence,
            reasoning: userAssessment.reasoning,
            is_flat: this.isDirectionFlat(userAssessment.direction),
          }
        : undefined,
      ai_fork: aiAssessment
        ? {
            direction: aiAssessment.direction,
            confidence: aiAssessment.confidence,
            reasoning: aiAssessment.reasoning,
            is_flat: this.isDirectionFlat(aiAssessment.direction),
          }
        : undefined,
      arbitrator_fork: {
        direction: assessment.direction,
        confidence: assessment.confidence,
        reasoning: assessment.reasoning,
        is_flat: this.isDirectionFlat(assessment.direction),
      },
      active_forks: [
        ...(userAssessment && !this.isDirectionFlat(userAssessment.direction)
          ? ['user']
          : []),
        ...(aiAssessment && !this.isDirectionFlat(aiAssessment.direction)
          ? ['ai']
          : []),
        ...(!this.isDirectionFlat(assessment.direction) ? ['arbitrator'] : []),
      ],
      predictor_count: predictors.length,
      combined_strength: thresholdResult.combinedStrength,
      direction_consensus: thresholdResult.directionConsensus,
      versions,
      last_refresh: new Date().toISOString(),
    };

    // Update the prediction record
    const updated = await this.predictionRepository.update(existing.id, {
      predicted_at: new Date().toISOString(),
      direction,
      confidence: assessment.confidence,
      magnitude: magnitudeCategory,
      reasoning: assessment.reasoning,
      timeframe_hours: horizonHours,
      expires_at: expiresAt.toISOString(),
      analyst_ensemble: updatedEnsemble,
      llm_ensemble: {
        direction: assessment.direction,
        confidence: assessment.confidence,
        tier: assessment.tier,
      },
    });

    this.logger.debug(
      `Updated prediction ${existing.id} for ${assessment.analyst.slug}: ` +
        `${direction} (${(assessment.confidence * 100).toFixed(0)}% confidence), ` +
        `was ${existing.direction} (${(existing.confidence * 100).toFixed(0)}%)`,
    );

    return updated;
  }

  /**
   * Create a prediction for a specific analyst
   */
  private async createAnalystPrediction(
    ctx: ExecutionContext,
    target: { id: string; symbol: string; universe_id: string },
    assessment: EnsembleResult['assessments'][0],
    horizonHours: number,
    expiresAt: Date,
    contextVersions: {
      runnerContextVersionId?: string;
      universeContextVersionId?: string;
      targetContextVersionId?: string;
      analystContextVersionIds?: Record<string, string>;
    },
  ): Promise<Prediction> {
    // Map analyst direction to prediction direction
    const direction = this.mapAnalystDirection(assessment.direction);

    // Estimate magnitude from assessment confidence
    const magnitude = assessment.confidence * 5; // Scale to reasonable percentage
    const magnitudeCategory = this.categorizeMagnitude(magnitude);

    // Calculate position sizing for this analyst's prediction
    const positionSizing = await this.calculateRecommendedPositionSize(
      ctx,
      target,
      direction,
      assessment.confidence,
      magnitude,
    );

    const predictionData: CreatePredictionData = {
      target_id: target.id,
      direction,
      magnitude: magnitudeCategory,
      confidence: assessment.confidence,
      timeframe_hours: horizonHours,
      expires_at: expiresAt.toISOString(),
      reasoning: assessment.reasoning,
      analyst_ensemble: {
        analyst_slug: assessment.analyst.slug,
        analyst_name: assessment.analyst.name,
        key_factors: assessment.key_factors,
        risks: assessment.risks,
        tier: assessment.tier,
      },
      llm_ensemble: {
        direction: assessment.direction,
        confidence: assessment.confidence,
        tier: assessment.tier,
      },
      status: 'active',
      // Context version traceability
      runner_context_version_id: contextVersions.runnerContextVersionId,
      analyst_context_version_ids: contextVersions.analystContextVersionIds,
      universe_context_version_id: contextVersions.universeContextVersionId,
      target_context_version_id: contextVersions.targetContextVersionId,
      // Position sizing recommendation
      recommended_quantity: positionSizing.quantity,
      quantity_reasoning: positionSizing.reasoning,
      // Per-analyst identification
      analyst_slug: assessment.analyst.slug,
      is_arbitrator: false,
    };

    const prediction = await this.predictionRepository.create(predictionData);

    this.logger.debug(
      `Created analyst prediction ${prediction.id} for ${assessment.analyst.slug}: ` +
        `${direction} (${(assessment.confidence * 100).toFixed(0)}% confidence)`,
    );

    return prediction;
  }

  /**
   * Create a prediction for a specific analyst with all three fork assessments
   * Uses the arbitrator fork as the main assessment, with user and ai forks as metadata
   */
  private async createAnalystPredictionWithForks(
    ctx: ExecutionContext,
    target: { id: string; symbol: string; universe_id: string },
    arbitratorAssessment: AnalystAssessmentResult,
    userAssessment: AnalystAssessmentResult | undefined,
    aiAssessment: AnalystAssessmentResult | undefined,
    horizonHours: number,
    expiresAt: Date,
    contextVersions: {
      runnerContextVersionId?: string;
      universeContextVersionId?: string;
      targetContextVersionId?: string;
      analystContextVersionIds?: Record<string, string>;
    },
  ): Promise<Prediction> {
    // Use arbitrator assessment as the main assessment (it has combined context)
    const assessment = arbitratorAssessment;

    // Map analyst direction to prediction direction
    const direction = this.mapAnalystDirection(assessment.direction);

    // Estimate magnitude from assessment confidence
    const magnitude = assessment.confidence * 5; // Scale to reasonable percentage
    const magnitudeCategory = this.categorizeMagnitude(magnitude);

    // Calculate position sizing for this analyst's prediction
    const positionSizing = await this.calculateRecommendedPositionSize(
      ctx,
      target,
      direction,
      assessment.confidence,
      magnitude,
    );

    const predictionData: CreatePredictionData = {
      target_id: target.id,
      direction,
      magnitude: magnitudeCategory,
      confidence: assessment.confidence,
      timeframe_hours: horizonHours,
      expires_at: expiresAt.toISOString(),
      reasoning: assessment.reasoning,
      analyst_ensemble: {
        analyst_slug: assessment.analyst.slug,
        analyst_name: assessment.analyst.name,
        key_factors: assessment.key_factors,
        risks: assessment.risks,
        tier: assessment.tier,
        // Include all three fork assessments for comparison in UI
        user_fork: userAssessment
          ? {
              direction: userAssessment.direction,
              confidence: userAssessment.confidence,
              reasoning: userAssessment.reasoning,
              is_flat: this.isDirectionFlat(userAssessment.direction),
            }
          : undefined,
        ai_fork: aiAssessment
          ? {
              direction: aiAssessment.direction,
              confidence: aiAssessment.confidence,
              reasoning: aiAssessment.reasoning,
              is_flat: this.isDirectionFlat(aiAssessment.direction),
            }
          : undefined,
        arbitrator_fork: {
          direction: assessment.direction,
          confidence: assessment.confidence,
          reasoning: assessment.reasoning,
          is_flat: this.isDirectionFlat(assessment.direction),
        },
        // Track which forks are actively trading (non-flat)
        active_forks: [
          ...(userAssessment && !this.isDirectionFlat(userAssessment.direction)
            ? ['user']
            : []),
          ...(aiAssessment && !this.isDirectionFlat(aiAssessment.direction)
            ? ['ai']
            : []),
          ...(!this.isDirectionFlat(assessment.direction)
            ? ['arbitrator']
            : []),
        ],
      },
      llm_ensemble: {
        direction: assessment.direction,
        confidence: assessment.confidence,
        tier: assessment.tier,
      },
      status: 'active',
      // Context version traceability
      runner_context_version_id: contextVersions.runnerContextVersionId,
      analyst_context_version_ids: contextVersions.analystContextVersionIds,
      universe_context_version_id: contextVersions.universeContextVersionId,
      target_context_version_id: contextVersions.targetContextVersionId,
      // Position sizing recommendation
      recommended_quantity: positionSizing.quantity,
      quantity_reasoning: positionSizing.reasoning,
      // Per-analyst identification
      analyst_slug: assessment.analyst.slug,
      is_arbitrator: false,
    };

    const prediction = await this.predictionRepository.create(predictionData);

    this.logger.debug(
      `Created analyst prediction ${prediction.id} for ${assessment.analyst.slug}: ` +
        `${direction} (${(assessment.confidence * 100).toFixed(0)}% confidence) with 3-way forks`,
    );

    return prediction;
  }

  /**
   * Create the arbitrator prediction (synthesis of all analyst opinions)
   * Now includes all three fork assessments (user, ai, arbitrator) for each analyst
   */
  private async createArbitratorPrediction(
    ctx: ExecutionContext,
    target: { id: string; symbol: string; universe_id: string },
    thresholdResult: ThresholdEvaluationResult,
    ensembleResult: EnsembleResult,
    predictors: Predictor[],
    horizonHours: number,
    expiresAt: Date,
    contextVersions: {
      runnerContextVersionId?: string;
      universeContextVersionId?: string;
      targetContextVersionId?: string;
      analystContextVersionIds?: Record<string, string>;
    },
    threeWayResult?: ThreeWayForkEnsembleResult,
  ): Promise<Prediction> {
    // Map direction from predictor to prediction vocabulary
    const direction = this.mapPredictorToPredictonDirection(
      thresholdResult.dominantDirection,
    );

    // Calculate prediction parameters using aggregated result
    const magnitude = this.estimateMagnitude(predictors, ensembleResult);
    const magnitudeCategory = this.categorizeMagnitude(magnitude);

    // Use the highest confidence from analysts that agree with the consensus direction
    // This gives a more meaningful confidence than averaging opposing views
    const consensusDirection =
      direction === 'up'
        ? 'bullish'
        : direction === 'down'
          ? 'bearish'
          : 'neutral';
    const agreeingAnalysts = ensembleResult.assessments.filter(
      (a) => a.direction.toLowerCase() === consensusDirection,
    );
    const maxConfidence =
      agreeingAnalysts.length > 0
        ? Math.max(...agreeingAnalysts.map((a) => a.confidence))
        : ensembleResult.aggregated.confidence;
    const confidence = maxConfidence;

    // Calculate position sizing
    const positionSizing = await this.calculateRecommendedPositionSize(
      ctx,
      target,
      direction,
      confidence,
      magnitude,
    );

    // Build arbitrator reasoning summarizing analyst opinions
    const analystSummary = ensembleResult.assessments
      .map(
        (a) =>
          `${a.analyst.name}: ${a.direction} (${(a.confidence * 100).toFixed(0)}%)`,
      )
      .join('; ');

    // Find the strongest conviction analyst for the consensus direction
    const strongestAnalyst =
      agreeingAnalysts.length > 0
        ? agreeingAnalysts.reduce((max, a) =>
            a.confidence > max.confidence ? a : max,
          )
        : null;

    const arbitratorReasoning = strongestAnalyst
      ? `Consensus ${direction.toUpperCase()} led by ${strongestAnalyst.analyst.name} (${(strongestAnalyst.confidence * 100).toFixed(0)}% confidence). ` +
        `${agreeingAnalysts.length}/${ensembleResult.assessments.length} analysts agree. ` +
        `All views: ${analystSummary}.`
      : `Arbitrator synthesis based on ${ensembleResult.assessments.length} analysts: ` +
        `${analystSummary}. ` +
        `Consensus: ${(ensembleResult.aggregated.consensus_strength * 100).toFixed(0)}%. ` +
        ensembleResult.aggregated.reasoning;

    // Build assessments with all three fork reasonings per analyst
    const buildAssessmentsWithForks = (): Array<{
      analyst_slug: string;
      analyst_name: string;
      direction: string;
      confidence: number;
      reasoning?: string;
      user_fork?: { direction: string; confidence: number; reasoning?: string };
      ai_fork?: { direction: string; confidence: number; reasoning?: string };
      arbitrator_fork?: {
        direction: string;
        confidence: number;
        reasoning?: string;
      };
    }> => {
      if (!threeWayResult) {
        // Fallback to simple format if no three-way result
        return ensembleResult.assessments.map((a) => ({
          analyst_slug: a.analyst.slug,
          analyst_name: a.analyst.name,
          direction: a.direction,
          confidence: a.confidence,
          reasoning: a.reasoning,
        }));
      }

      // Build lookup maps by analyst slug
      const userBySlug = new Map(
        threeWayResult.userForkAssessments.map((a) => [a.analyst.slug, a]),
      );
      const aiBySlug = new Map(
        threeWayResult.aiForkAssessments.map((a) => [a.analyst.slug, a]),
      );
      const arbitratorBySlug = new Map(
        threeWayResult.arbitratorForkAssessments.map((a) => [
          a.analyst.slug,
          a,
        ]),
      );

      // Get unique analyst slugs
      const allSlugs = new Set([
        ...userBySlug.keys(),
        ...aiBySlug.keys(),
        ...arbitratorBySlug.keys(),
      ]);

      return Array.from(allSlugs).map((slug) => {
        const user = userBySlug.get(slug);
        const ai = aiBySlug.get(slug);
        const arbitrator = arbitratorBySlug.get(slug);

        // Use arbitrator as primary, fallback to user or ai
        const primary = arbitrator || user || ai;

        return {
          analyst_slug: slug,
          analyst_name: primary?.analyst.name || slug,
          direction: primary?.direction || 'neutral',
          confidence: primary?.confidence || 0,
          reasoning: primary?.reasoning,
          user_fork: user
            ? {
                direction: user.direction,
                confidence: user.confidence,
                reasoning: user.reasoning,
              }
            : undefined,
          ai_fork: ai
            ? {
                direction: ai.direction,
                confidence: ai.confidence,
                reasoning: ai.reasoning,
              }
            : undefined,
          arbitrator_fork: arbitrator
            ? {
                direction: arbitrator.direction,
                confidence: arbitrator.confidence,
                reasoning: arbitrator.reasoning,
              }
            : undefined,
        };
      });
    };

    const predictionData: CreatePredictionData = {
      target_id: target.id,
      direction,
      magnitude: magnitudeCategory,
      confidence,
      timeframe_hours: horizonHours,
      expires_at: expiresAt.toISOString(),
      reasoning: arbitratorReasoning,
      analyst_ensemble: {
        predictor_count: predictors.length,
        combined_strength: thresholdResult.combinedStrength,
        direction_consensus: thresholdResult.directionConsensus,
        assessments: buildAssessmentsWithForks(),
        // Include metadata about fork agreement
        fork_metadata: threeWayResult?.metadata,
      },
      llm_ensemble: {
        direction: ensembleResult.aggregated.direction,
        confidence: ensembleResult.aggregated.confidence,
        consensus_strength: ensembleResult.aggregated.consensus_strength,
      },
      status: 'active',
      // Context version traceability
      runner_context_version_id: contextVersions.runnerContextVersionId,
      analyst_context_version_ids: contextVersions.analystContextVersionIds,
      universe_context_version_id: contextVersions.universeContextVersionId,
      target_context_version_id: contextVersions.targetContextVersionId,
      // Position sizing recommendation
      recommended_quantity: positionSizing.quantity,
      quantity_reasoning: positionSizing.reasoning,
      // Arbitrator identification
      analyst_slug: 'arbitrator',
      is_arbitrator: true,
    };

    const prediction = await this.predictionRepository.create(predictionData);

    this.logger.log(
      `Created arbitrator prediction ${prediction.id} for ${target.symbol}: ` +
        `${direction} ${magnitude.toFixed(1)}% over ${horizonHours}h ` +
        `(confidence: ${(confidence * 100).toFixed(0)}%)`,
    );

    return prediction;
  }

  /**
   * Check if a direction string represents a flat/neutral/hold position
   */
  private isDirectionFlat(direction: string): boolean {
    const normalized = direction.toLowerCase();
    return (
      normalized === 'neutral' || normalized === 'flat' || normalized === 'hold'
    );
  }

  /**
   * Filter out analysts where BOTH user fork AND AI fork are flat/neutral.
   * Returns filtered assessment arrays with only analysts that have at least one directional fork.
   */
  private filterFlatOnlyAnalysts(threeWayResult: ThreeWayForkEnsembleResult): {
    userForkAssessments: AnalystAssessmentResult[];
    aiForkAssessments: AnalystAssessmentResult[];
    arbitratorForkAssessments: AnalystAssessmentResult[];
    filteredSlugs: string[];
  } {
    // Build lookup maps by analyst slug
    const userBySlug = new Map(
      threeWayResult.userForkAssessments.map((a) => [a.analyst.slug, a]),
    );
    const aiBySlug = new Map(
      threeWayResult.aiForkAssessments.map((a) => [a.analyst.slug, a]),
    );

    // Determine which analysts are flat-only (both user AND ai forks are flat)
    const allSlugs = new Set([...userBySlug.keys(), ...aiBySlug.keys()]);
    const filteredSlugs: string[] = [];

    for (const slug of allSlugs) {
      const userAssessment = userBySlug.get(slug);
      const aiAssessment = aiBySlug.get(slug);

      const userFlat =
        !userAssessment || this.isDirectionFlat(userAssessment.direction);
      const aiFlat =
        !aiAssessment || this.isDirectionFlat(aiAssessment.direction);

      if (userFlat && aiFlat) {
        filteredSlugs.push(slug);
      }
    }

    if (filteredSlugs.length > 0) {
      this.logger.log(
        `Filtering ${filteredSlugs.length} flat-only analyst(s): ${filteredSlugs.join(', ')}`,
      );
    }

    const keepSlug = (a: AnalystAssessmentResult) =>
      !filteredSlugs.includes(a.analyst.slug);

    return {
      userForkAssessments: threeWayResult.userForkAssessments.filter(keepSlug),
      aiForkAssessments: threeWayResult.aiForkAssessments.filter(keepSlug),
      arbitratorForkAssessments:
        threeWayResult.arbitratorForkAssessments.filter(keepSlug),
      filteredSlugs,
    };
  }

  /**
   * Map analyst direction (bullish/bearish/neutral) to prediction direction (up/down/flat)
   */
  private mapAnalystDirection(direction: string): PredictionDirection {
    const normalized = direction.toLowerCase();
    if (normalized === 'bullish' || normalized === 'up') return 'up';
    if (normalized === 'bearish' || normalized === 'down') return 'down';
    return 'flat';
  }

  /**
   * Create positions for all three forks (user, ai, arbitrator) from analyst assessments
   *
   * This method creates positions in the analyst portfolios based on each fork's assessment.
   * Each analyst has 3 portfolios (user, ai, arbitrator) and positions are created based on
   * their respective fork's assessment direction and confidence.
   *
   * @param ctx - Execution context
   * @param target - The target being predicted (full Target object)
   * @param threeWayResult - The three-way fork ensemble result containing all assessments
   * @param predictionId - The prediction ID to link positions to
   */
  private async createThreeWayForkPositions(
    ctx: ExecutionContext,
    target: Target,
    threeWayResult: ThreeWayForkEnsembleResult,
    predictionId: string,
  ): Promise<void> {
    // Get entry price for the target
    const entryPrice = await this.getEntryPriceForTarget(
      target.id,
      target.symbol,
      ctx.orgSlug,
    );

    if (!entryPrice) {
      this.logger.warn(
        `Cannot create positions for ${target.symbol}: no price data available`,
      );
      return;
    }

    this.logger.log(
      `Creating three-way fork positions for ${target.symbol} at $${entryPrice.toFixed(2)}`,
    );

    // Create positions for each fork type
    const forkTypes = ['user', 'ai', 'arbitrator'] as const;
    const assessmentsByFork = {
      user: threeWayResult.userForkAssessments,
      ai: threeWayResult.aiForkAssessments,
      arbitrator: threeWayResult.arbitratorForkAssessments,
    };

    let totalPositionsCreated = 0;

    for (const forkType of forkTypes) {
      const assessments = assessmentsByFork[forkType];

      for (const assessment of assessments) {
        try {
          // Skip flat/neutral forks — only directional forks create positions
          if (this.isDirectionFlat(assessment.direction)) {
            this.logger.debug(
              `Skipping ${forkType} position for ${assessment.analyst.slug}: direction is ${assessment.direction} (flat)`,
            );
            continue;
          }

          // Add fork_type to assessment for position service
          const assessmentWithFork: AnalystAssessmentResult = {
            ...assessment,
            fork_type: forkType,
          };

          const result =
            await this.analystPositionService.createPositionFromAssessment({
              assessment: assessmentWithFork,
              target,
              entryPrice,
              predictionId,
            });

          if (result) {
            totalPositionsCreated++;
            this.logger.debug(
              `Created ${forkType} position for ${assessment.analyst.slug}: ${result.position.direction} ${result.position.quantity} @ $${entryPrice}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to create ${forkType} position for ${assessment.analyst.slug}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    this.logger.log(
      `Created ${totalPositionsCreated} positions across all forks for ${target.symbol}`,
    );

    // Emit observability event for position creation
    await this.observabilityEventsService.push({
      context: ctx,
      source_app: 'prediction-runner',
      hook_event_type: 'positions.created',
      status: 'created',
      message: `Created ${totalPositionsCreated} analyst positions for ${target.symbol}`,
      progress: null,
      step: 'positions-created',
      payload: {
        targetId: target.id,
        targetSymbol: target.symbol,
        predictionId,
        entryPrice,
        positionsCreated: totalPositionsCreated,
        forkBreakdown: {
          user: threeWayResult.userForkAssessments.length,
          ai: threeWayResult.aiForkAssessments.length,
          arbitrator: threeWayResult.arbitratorForkAssessments.length,
        },
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Get entry price for a target
   *
   * Tries to get price from:
   * 1. Test price data (if target has a test mirror with T_ prefix)
   * 2. Target metadata (if available)
   *
   * @param targetId - The target ID
   * @param symbol - The target symbol
   * @param orgSlug - Organization slug for test data lookup
   * @returns The entry price or null if not available
   */
  private async getEntryPriceForTarget(
    targetId: string,
    symbol: string,
    orgSlug: string,
  ): Promise<number | null> {
    try {
      // First, try to get test symbol from mirror
      const testSymbol =
        await this.testTargetMirrorService.getTestSymbol(targetId);

      if (testSymbol) {
        // Get price from test price data
        const priceResult =
          await this.testPriceDataRouterService.getLatestPrice(
            testSymbol,
            orgSlug,
          );

        if (priceResult.data && !Array.isArray(priceResult.data)) {
          this.logger.debug(
            `Got test price for ${symbol} (${testSymbol}): $${priceResult.data.close}`,
          );
          return priceResult.data.close;
        }
      }

      // Fallback: try direct test symbol lookup (T_SYMBOL)
      const directTestSymbol = `T_${symbol}`;
      const directResult = await this.testPriceDataRouterService.getLatestPrice(
        directTestSymbol,
        orgSlug,
      );

      if (directResult.data && !Array.isArray(directResult.data)) {
        this.logger.debug(
          `Got direct test price for ${symbol}: $${directResult.data.close}`,
        );
        return directResult.data.close;
      }

      this.logger.warn(
        `No price data available for ${symbol} (tried ${testSymbol || directTestSymbol})`,
      );
      return null;
    } catch (error) {
      this.logger.error(
        `Error getting entry price for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Build context string from predictors for final ensemble
   * Includes market data when available for better-informed predictions
   */
  /**
   * Get risk score for a target symbol from the risk-runner system.
   * Caches scores for the duration of a batch run.
   */
  private async getRiskScoreForSymbol(
    symbol: string,
  ): Promise<ActiveCompositeScoreView | null> {
    if (!this.compositeScoreRepository) return null;

    try {
      // Load and cache all active risk scores on first call
      if (!this.riskScoreCache) {
        const allScores =
          await this.compositeScoreRepository.findAllActiveView();
        this.riskScoreCache = new Map();
        for (const score of allScores) {
          this.riskScoreCache.set(
            score.subject_identifier.toUpperCase(),
            score,
          );
        }
      }

      return this.riskScoreCache.get(symbol.toUpperCase()) ?? null;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch risk score for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /** Clear risk score cache (call at start of each batch run) */
  clearRiskScoreCache(): void {
    this.riskScoreCache = null;
  }

  private async buildPredictionContext(
    predictors: Predictor[],
    threshold: ThresholdEvaluationResult,
    targetId?: string,
  ): Promise<string> {
    const parts = [
      `Prediction Generation Context`,
      `Active Predictors: ${predictors.length}`,
      `Combined Strength: ${threshold.combinedStrength}`,
      `Direction Consensus: ${(threshold.directionConsensus * 100).toFixed(0)}%`,
    ];

    // Add market data if available
    if (targetId) {
      try {
        const latestSnapshot =
          await this.targetSnapshotRepository.findLatest(targetId);
        if (latestSnapshot) {
          const meta = latestSnapshot.metadata || {};
          parts.push('');
          parts.push('## Current Market Data');
          parts.push(`Current Price: $${latestSnapshot.value.toFixed(2)}`);
          if (meta.open) parts.push(`Open: $${meta.open.toFixed(2)}`);
          if (meta.high) parts.push(`High: $${meta.high.toFixed(2)}`);
          if (meta.low) parts.push(`Low: $${meta.low.toFixed(2)}`);
          if (meta.volume)
            parts.push(`Volume: ${meta.volume.toLocaleString()}`);
          if (meta.change_24h != null)
            parts.push(`24h Change: ${meta.change_24h.toFixed(2)}%`);
          parts.push(`Price As Of: ${latestSnapshot.captured_at}`);
        }
      } catch {
        // Non-critical - continue without market data
      }

      // Add risk assessment data if available
      try {
        const target = await this.targetService.findByIdOrThrow(targetId);
        const riskScore = await this.getRiskScoreForSymbol(target.symbol);
        if (riskScore) {
          parts.push('');
          parts.push('## Risk Assessment');
          parts.push(`Overall Risk Score: ${riskScore.overall_score}/100`);
          parts.push(
            `Risk Confidence: ${(riskScore.confidence * 100).toFixed(0)}%`,
          );
          if (riskScore.dimension_scores) {
            for (const [dimension, score] of Object.entries(
              riskScore.dimension_scores,
            )) {
              parts.push(`- ${dimension}: ${score}/100`);
            }
          }
          if (riskScore.debate_adjustment) {
            parts.push(
              `Debate Adjustment: ${riskScore.debate_adjustment > 0 ? '+' : ''}${riskScore.debate_adjustment}`,
            );
          }
        }
      } catch {
        // Non-critical - continue without risk data
      }
    }

    parts.push('');
    parts.push('Contributing Predictors:');

    for (const p of predictors) {
      parts.push(
        `- ${p.analyst_slug}${p.fork_type ? '/' + p.fork_type : ''}: ${p.direction} (strength: ${p.strength}, confidence: ${(p.confidence * 100).toFixed(0)}%)`,
      );
      if (p.reasoning) {
        parts.push(`  Reasoning: ${p.reasoning}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Map predictor direction vocabulary to prediction direction
   * Predictor: bullish/bearish/neutral
   * Prediction: up/down/flat
   */
  private mapPredictorToPredictonDirection(
    direction: 'bullish' | 'bearish' | 'neutral',
  ): PredictionDirection {
    switch (direction) {
      case 'bullish':
        return 'up';
      case 'bearish':
        return 'down';
      case 'neutral':
        return 'flat';
    }
  }

  /**
   * Estimate magnitude based on predictor strengths and ensemble confidence
   */
  private estimateMagnitude(
    predictors: Predictor[],
    ensemble: EnsembleResult,
  ): number {
    // Base magnitude from average predictor strength
    const avgStrength =
      predictors.reduce((sum, p) => sum + p.strength, 0) / predictors.length;

    // Scale by ensemble confidence
    // Max magnitude ~10% for perfect confidence and strength
    const baseMagnitude = avgStrength * 1.0; // 1% per strength point
    const scaledMagnitude = baseMagnitude * ensemble.aggregated.confidence;

    return Math.round(scaledMagnitude * 10) / 10; // Round to 1 decimal
  }

  /**
   * Determine prediction horizon based on predictor expiration
   */
  private determineHorizon(predictors: Predictor[]): number {
    // Use the earliest predictor expiration as the horizon
    // Default to 24 hours if no expiration set
    const now = Date.now();
    const expirations = predictors
      .filter((p) => p.expires_at)
      .map((p) => new Date(p.expires_at).getTime() - now);

    if (expirations.length === 0) {
      return 24;
    }

    // Convert to hours, minimum 1 hour
    const minExpirationMs = Math.min(...expirations);
    return Math.max(1, Math.round(minExpirationMs / (1000 * 60 * 60)));
  }

  /**
   * Calculate final confidence combining threshold and ensemble
   */
  private calculateFinalConfidence(
    threshold: ThresholdEvaluationResult,
    ensemble: EnsembleResult,
  ): number {
    // Weight: 40% consensus, 40% ensemble confidence, 20% predictor avg confidence
    const consensusWeight = threshold.directionConsensus * 0.4;
    const ensembleWeight = ensemble.aggregated.confidence * 0.4;
    const avgConfidenceWeight = threshold.details.avgConfidence * 0.2;

    return (
      Math.round(
        (consensusWeight + ensembleWeight + avgConfidenceWeight) * 100,
      ) / 100
    );
  }

  /**
   * Categorize numeric magnitude into small/medium/large
   */
  private categorizeMagnitude(magnitude: number): 'small' | 'medium' | 'large' {
    if (magnitude < 2.5) {
      return 'small';
    } else if (magnitude < 6) {
      return 'medium';
    }
    return 'large';
  }

  /**
   * Create snapshot capturing prediction state at creation time
   */
  private async createPredictionSnapshot(
    prediction: Prediction,
    predictors: Predictor[],
    threshold: ThresholdEvaluationResult,
    ensemble: EnsembleResult,
  ): Promise<void> {
    const snapshotInput: SnapshotBuildInput = {
      predictionId: prediction.id,
      predictorSnapshots: predictors.map((p) => ({
        predictor_id: p.id,
        signal_content: p.reasoning || '',
        direction: p.direction,
        strength: p.strength,
        confidence: p.confidence,
        analyst_slug: p.analyst_slug,
        created_at: p.created_at,
      })),
      rejectedSignals: [],
      analystAssessments: ensemble.assessments,
      llmEnsemble: {
        tiers_used: ensemble.assessments.map((a) => a.tier),
        tier_results: ensemble.assessments.reduce(
          (acc, a) => {
            acc[a.tier] = {
              direction: a.direction,
              confidence: a.confidence,
              model: 'ensemble',
              provider: 'mixed',
            };
            return acc;
          },
          {} as Record<
            string,
            {
              direction: string;
              confidence: number;
              model: string;
              provider: string;
            }
          >,
        ),
        agreement_level: ensemble.aggregated.consensus_strength,
      },
      learnings: ensemble.assessments.flatMap((a) =>
        a.learnings_applied.map((id) => ({
          learning_id: id,
          type: 'pattern',
          content: '',
          scope: 'target',
          applied_to: a.analyst.slug,
        })),
      ),
      thresholdEval: {
        min_predictors: 3,
        actual_predictors: threshold.activeCount,
        min_combined_strength: 15,
        actual_combined_strength: threshold.combinedStrength,
        min_consensus: 0.6,
        actual_consensus: threshold.directionConsensus,
        passed: threshold.meetsThreshold,
      },
      timeline: [
        {
          timestamp: new Date().toISOString(),
          event_type: 'prediction_generated',
          details: {
            prediction_id: prediction.id,
            direction: prediction.direction,
            confidence: prediction.confidence,
          },
        },
      ],
    };

    const snapshotData = this.snapshotService.buildSnapshotData(snapshotInput);
    await this.snapshotService.createSnapshot(snapshotData);

    this.logger.debug(`Created snapshot for prediction ${prediction.id}`);
  }

  /**
   * Calculate recommended position size based on confidence and risk management
   *
   * Position sizing formula:
   * quantity = (portfolio_balance * risk_percent) / (entry_price * stop_distance_percent)
   *
   * Risk percent scales with confidence:
   * - 80%+ confidence: 2% risk per trade
   * - 70-80% confidence: 1.5% risk per trade
   * - 60-70% confidence: 1% risk per trade
   * - Below 60%: 0.5% risk per trade
   *
   * Stop distance is based on magnitude:
   * - Large magnitude: 5% stop
   * - Medium magnitude: 3% stop
   * - Small magnitude: 2% stop
   */
  private async calculateRecommendedPositionSize(
    ctx: ExecutionContext,
    target: { symbol: string },
    direction: PredictionDirection,
    confidence: number,
    magnitudePercent: number,
  ): Promise<{ quantity: number; reasoning: string }> {
    try {
      // Skip portfolio lookup for system user (automated processes)
      // User portfolios require a valid UUID, not "system"
      if (ctx.userId === 'system' || !this.isValidUUID(ctx.userId)) {
        return {
          quantity: 0,
          reasoning:
            'Position sizing not available for system-generated predictions',
        };
      }

      // Get user's portfolio balance
      const portfolio = await this.portfolioRepository.getUserPortfolio(
        ctx.userId,
        ctx.orgSlug,
      );

      if (!portfolio) {
        return {
          quantity: 0,
          reasoning:
            'No portfolio found - create a portfolio to get position sizing recommendations',
        };
      }

      // Get current price (using a placeholder - in production this would come from price feed)
      const entryPrice = this.getCurrentPrice(target.symbol);
      if (!entryPrice || entryPrice <= 0) {
        return {
          quantity: 0,
          reasoning: 'Unable to determine current price for position sizing',
        };
      }

      // Determine risk percent based on confidence
      let riskPercent: number;
      let riskReason: string;
      if (confidence >= 0.8) {
        riskPercent = 0.02; // 2%
        riskReason = 'high confidence (80%+)';
      } else if (confidence >= 0.7) {
        riskPercent = 0.015; // 1.5%
        riskReason = 'good confidence (70-80%)';
      } else if (confidence >= 0.6) {
        riskPercent = 0.01; // 1%
        riskReason = 'moderate confidence (60-70%)';
      } else {
        riskPercent = 0.005; // 0.5%
        riskReason = 'lower confidence (<60%)';
      }

      // Determine stop distance based on magnitude
      let stopDistancePercent: number;
      let stopReason: string;
      if (magnitudePercent >= 6) {
        stopDistancePercent = 0.05; // 5%
        stopReason = 'large expected move';
      } else if (magnitudePercent >= 2.5) {
        stopDistancePercent = 0.03; // 3%
        stopReason = 'medium expected move';
      } else {
        stopDistancePercent = 0.02; // 2%
        stopReason = 'small expected move';
      }

      // Calculate position size
      // quantity = (balance * risk%) / (price * stop%)
      const riskAmount = portfolio.current_balance * riskPercent;
      const riskPerShare = entryPrice * stopDistancePercent;
      const quantity = riskAmount / riskPerShare;

      // Round to appropriate precision (whole shares for stocks, 8 decimals for crypto)
      const isCrypto = this.isCryptoAsset(target.symbol);
      const roundedQuantity = isCrypto
        ? Math.floor(quantity * 100000000) / 100000000
        : Math.floor(quantity);

      const reasoning = [
        `Position sizing for ${target.symbol} (${direction}):`,
        `- Portfolio balance: $${portfolio.current_balance.toLocaleString()}`,
        `- Risk per trade: ${(riskPercent * 100).toFixed(1)}% (${riskReason})`,
        `- Stop distance: ${(stopDistancePercent * 100).toFixed(0)}% (${stopReason})`,
        `- Entry price: $${entryPrice.toFixed(2)}`,
        `- Risk amount: $${riskAmount.toFixed(2)}`,
        `- Recommended quantity: ${roundedQuantity}`,
      ].join('\n');

      return {
        quantity: roundedQuantity,
        reasoning,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to calculate position size: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        quantity: 0,
        reasoning: `Position sizing unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get current price for a target
   * Uses the metadata.last_price field if available, or returns null
   * In production, this would integrate with a real-time price feed service
   */
  private getCurrentPrice(_symbol: string): number | null {
    // Try to get the latest price from the target's metadata
    // Price data is typically stored in metadata.last_price or metadata.current_price
    try {
      // We already have the target from the caller context, but need to get it here
      // In production, this would call a price feed service
      // For now, return null - the position sizing will indicate price unavailable
      // The actual price would be fetched when the user opens a position
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if symbol is a crypto asset (for decimal precision)
   */
  private isCryptoAsset(symbol: string): boolean {
    // Simple heuristic: check for common crypto suffixes or patterns
    const cryptoSuffixes = ['USD', 'USDT', 'BTC', 'ETH'];
    const upperSymbol = symbol.toUpperCase();
    return (
      cryptoSuffixes.some((suffix) => upperSymbol.endsWith(suffix)) ||
      upperSymbol.includes('-') || // e.g., BTC-USD
      upperSymbol.includes('/') // e.g., BTC/USD
    );
  }

  /**
   * Capture current context versions for traceability
   * Returns version IDs for runner, universe, target, and all analysts
   */
  private async captureContextVersions(
    universeId: string,
    targetId: string,
    ensembleResult: EnsembleResult,
  ): Promise<{
    runnerContextVersionId?: string;
    universeContextVersionId?: string;
    targetContextVersionId?: string;
    analystContextVersionIds?: Record<string, string>;
  }> {
    try {
      // Get current context versions in parallel
      const [
        runnerVersion,
        universeVersion,
        targetVersion,
        analystVersionsMap,
      ] = await Promise.all([
        this.portfolioRepository
          .getCurrentRunnerContextVersion('stock-predictor')
          .catch(() => null),
        this.portfolioRepository
          .getCurrentUniverseContextVersion(universeId)
          .catch(() => null),
        this.portfolioRepository
          .getCurrentTargetContextVersion(targetId)
          .catch(() => null),
        // Get user fork versions for predictions (user fork is the official version)
        this.portfolioRepository
          .getAllCurrentAnalystContextVersions('user')
          .catch(() => new Map<string, string>()),
      ]);

      // Build analyst context version IDs from the assessments
      const analystContextVersionIds: Record<string, string> = {};
      for (const assessment of ensembleResult.assessments) {
        const analystId = assessment.analyst.analyst_id;
        const versionId = analystVersionsMap.get(analystId);
        if (versionId) {
          analystContextVersionIds[analystId] = versionId;
        }
      }

      return {
        runnerContextVersionId: runnerVersion?.id,
        universeContextVersionId: universeVersion?.id,
        targetContextVersionId: targetVersion?.id,
        analystContextVersionIds:
          Object.keys(analystContextVersionIds).length > 0
            ? analystContextVersionIds
            : undefined,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to capture context versions: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Return empty - context versioning is optional
      return {};
    }
  }

  /**
   * Check if a string is a valid UUID
   */
  private isValidUUID(str: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }
}

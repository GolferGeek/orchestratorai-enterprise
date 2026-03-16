import { Injectable, Logger, Optional } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { ObservabilityWebhookService } from '@orchestratorai/planes/observability';
import { Signal } from '../interfaces/signal.interface';
import { Predictor } from '../interfaces/predictor.interface';
import { Prediction } from '../interfaces/prediction.interface';
import { SnapshotService } from './snapshot.service';

/**
 * Fast Path Processing Service
 *
 * Orchestrates the fast path flow for urgent signals (confidence >= 0.90).
 * Bypasses batch processing for immediate action:
 * Signal -> Predictor -> Prediction -> Snapshot -> Notification
 *
 * Key Features:
 * - Immediate predictor creation from urgent signals
 * - Relaxed thresholds for urgent signals
 * - Full explainability via snapshots
 * - Real-time observability events
 * - Optional notification service integration
 *
 * Phase: 5-7 (Fast Path Processing)
 */
@Injectable()
export class FastPathService {
  private readonly logger = new Logger(FastPathService.name);

  // Confidence threshold for fast path eligibility
  private readonly FAST_PATH_THRESHOLD = 0.9;

  constructor(
    @Optional() private readonly snapshotService: SnapshotService | null,
    @Optional()
    private readonly observabilityService: ObservabilityWebhookService | null,
    // TODO: Add these services when they are created in parallel tasks
    // private readonly signalDetectionService: SignalDetectionService,
    // private readonly predictorManagementService: PredictorManagementService,
    // private readonly predictionGenerationService: PredictionGenerationService,
    // @Optional() private readonly notificationService: NotificationService | null,
  ) {}

  /**
   * Check if a signal qualifies for fast path processing
   *
   * Fast path is triggered when signal confidence >= 0.90
   *
   * @param signal - The signal to evaluate
   * @param confidence - Analyst confidence score (0.00-1.00)
   * @returns true if signal should use fast path
   */
  shouldUseFastPath(signal: Signal, confidence: number): boolean {
    const qualifies = confidence >= this.FAST_PATH_THRESHOLD;

    if (qualifies) {
      this.logger.log(
        `Signal ${signal.id} qualifies for fast path (confidence: ${confidence})`,
      );
    }

    return qualifies;
  }

  /**
   * Process a signal through the fast path
   *
   * This is the main entry point for urgent signal processing.
   * The signal has already been detected as urgent (confidence >= 0.90).
   *
   * Flow:
   * 1. Create predictor from signal immediately
   * 2. Check if this triggers threshold for prediction (single urgent signal may be enough)
   * 3. Generate prediction if threshold met
   * 4. Create snapshot for full explainability
   * 5. Send notification (if notification service available)
   * 6. Emit observability events at each step
   *
   * @param context - Execution context (flows unchanged through system)
   * @param signal - The urgent signal to process
   * @returns Predictor and Prediction if successful, null if threshold not met
   */
  async processFastPath(
    context: ExecutionContext,
    signal: Signal,
  ): Promise<{ predictor: Predictor; prediction: Prediction } | null> {
    this.logger.log(
      `Starting fast path processing for signal ${signal.id} (target: ${signal.target_id})`,
    );

    try {
      // Step 1: Emit start event
      await this.emitProgress(
        context,
        'fast-path-started',
        `Fast path processing started for signal ${signal.id}`,
        0,
      );

      // Step 2: Create predictor from signal
      // TODO: Wire up SignalDetectionService and PredictorManagementService
      const predictor = this.createPredictorFromSignal(context, signal);

      if (!predictor) {
        this.logger.warn(
          `Failed to create predictor from signal ${signal.id} - aborting fast path`,
        );
        await this.emitProgress(
          context,
          'fast-path-aborted',
          'Failed to create predictor',
          100,
        );
        return null;
      }

      await this.emitProgress(
        context,
        'predictor-created',
        `Predictor ${predictor.id} created from signal`,
        25,
      );

      // Step 3: Check if threshold met for prediction
      // For fast path, we may have relaxed thresholds (even a single urgent signal may trigger)
      const shouldGeneratePrediction = this.checkPredictionThreshold(
        context,
        signal.target_id,
        predictor,
      );

      if (!shouldGeneratePrediction) {
        this.logger.log(
          `Predictor ${predictor.id} created but threshold not met for prediction - will be picked up by batch`,
        );
        await this.emitProgress(
          context,
          'fast-path-deferred',
          'Predictor created, awaiting additional signals',
          100,
        );
        return null;
      }

      await this.emitProgress(
        context,
        'threshold-met',
        'Prediction threshold met, generating prediction',
        50,
      );

      // Step 4: Generate prediction
      const prediction = this.generatePrediction(context, signal.target_id, [
        predictor,
      ]);

      if (!prediction) {
        this.logger.error(
          `Failed to generate prediction for predictor ${predictor.id}`,
        );
        await this.emitProgress(
          context,
          'fast-path-failed',
          'Failed to generate prediction',
          100,
        );
        return null;
      }

      await this.emitProgress(
        context,
        'prediction-generated',
        `Prediction ${prediction.id} generated`,
        75,
      );

      // Step 5: Create snapshot for explainability
      if (this.snapshotService) {
        try {
          await this.createFastPathSnapshot(prediction, predictor);
          await this.emitProgress(
            context,
            'snapshot-created',
            'Snapshot created for explainability',
            85,
          );
        } catch (error) {
          this.logger.error(
            `Failed to create snapshot for prediction ${prediction.id}:`,
            error instanceof Error ? error.message : String(error),
          );
          // Non-blocking - continue even if snapshot fails
        }
      }

      // Step 6: Send notification (placeholder for future NotificationService)
      // TODO: Implement when NotificationService is available

      // Step 7: Emit completion event
      await this.emitProgress(
        context,
        'fast-path-completed',
        `Fast path completed: prediction ${prediction.id}`,
        100,
      );

      this.logger.log(
        `Fast path completed successfully: signal ${signal.id} -> predictor ${predictor.id} -> prediction ${prediction.id}`,
      );

      return { predictor, prediction };
    } catch (error) {
      this.logger.error(
        `Fast path processing failed for signal ${signal.id}:`,
        error instanceof Error ? error.stack : String(error),
      );

      await this.emitProgress(
        context,
        'fast-path-error',
        `Fast path error: ${error instanceof Error ? error.message : String(error)}`,
        100,
      );

      // Rethrow to let caller handle
      throw error;
    }
  }

  /**
   * Create a snapshot for fast path prediction
   *
   * Captures the fast-path context including:
   * - Single urgent signal that triggered fast path
   * - Predictor details
   * - Relaxed threshold evaluation
   * - Fast path timeline
   *
   * @param prediction - The generated prediction
   * @param predictor - The predictor that triggered the prediction
   */
  private async createFastPathSnapshot(
    prediction: Prediction,
    predictor: Predictor,
  ): Promise<void> {
    if (!this.snapshotService) {
      return;
    }

    try {
      const snapshotData = this.snapshotService.buildSnapshotData({
        predictionId: prediction.id,
        predictorSnapshots: [
          {
            predictor_id: predictor.id,
            signal_content: predictor.reasoning || '',
            direction: predictor.direction,
            strength: predictor.strength,
            confidence: predictor.confidence,
            analyst_slug: predictor.analyst_slug,
            created_at: predictor.created_at,
          },
        ],
        rejectedSignals: [], // Fast path doesn't have rejected signals yet
        analystAssessments: [], // Fast path uses single analyst
        llmEnsemble: {
          tiers_used: ['fast-path'],
          tier_results: {
            'fast-path': {
              direction: prediction.direction,
              confidence: prediction.confidence,
              model: 'fast-path',
              provider: 'internal',
            },
          },
          agreement_level: 1.0, // Single predictor = full agreement
        },
        learnings: [], // Will be populated by learning service in future
        thresholdEval: {
          min_predictors: 1, // Fast path allows single predictor
          actual_predictors: 1,
          min_combined_strength: predictor.strength,
          actual_combined_strength: predictor.strength,
          min_consensus: 1.0,
          actual_consensus: 1.0,
          passed: true,
        },
        timeline: [
          {
            timestamp: new Date().toISOString(),
            event_type: 'signal_received',
            details: { note: 'Signal qualified for fast path processing' },
          },
          {
            timestamp: new Date().toISOString(),
            event_type: 'predictor_created',
            details: {
              predictor_id: predictor.id,
              article_id: predictor.article_id,
            },
          },
          {
            timestamp: new Date().toISOString(),
            event_type: 'prediction_generated',
            details: {
              prediction_id: prediction.id,
              via: 'fast-path',
            },
          },
        ],
      });

      await this.snapshotService.createSnapshot(snapshotData);
      this.logger.debug(
        `Fast path snapshot created for prediction ${prediction.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create fast path snapshot:`,
        error instanceof Error ? error.message : String(error),
      );
      // Non-blocking - don't throw
    }
  }

  /**
   * Emit progress event for observability
   *
   * @param context - Execution context
   * @param step - Current processing step
   * @param message - Progress message
   * @param progress - Progress percentage (0-100)
   */
  private async emitProgress(
    context: ExecutionContext,
    step: string,
    message: string,
    progress: number,
  ): Promise<void> {
    if (!this.observabilityService) {
      return;
    }

    try {
      await this.observabilityService.sendEvent({
        source_app: 'api',
        session_id: context.conversationId,
        hook_event_type: 'agent.stream.chunk',
        userId: context.userId,
        conversationId: context.conversationId,
        conversationId: context.conversationId,
        agentSlug: context.agentSlug,
        organizationSlug: context.orgSlug,
        mode: 'prediction',
        message,
        progress,
        step: `fast-path.${step}`,
        payload: {
          step,
          message,
          progress,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      // Non-blocking - log but don't throw
      this.logger.warn(
        `Failed to emit observability event:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Create predictor from signal
   * TODO: Wire up SignalDetectionService and PredictorManagementService
   *
   * @param _context - Execution context
   * @param _signal - The signal to convert
   * @returns Predictor or null if creation fails
   */
  private createPredictorFromSignal(
    _context: ExecutionContext,
    _signal: Signal,
  ): Predictor | null {
    // TODO: Implement when services are wired up
    // Call SignalDetectionService to evaluate signal
    // Call PredictorManagementService to create predictor
    this.logger.warn('createPredictorFromSignal not yet implemented');
    return null;
  }

  /**
   * Check if prediction threshold is met
   * For fast path, thresholds may be relaxed:
   * - Single urgent signal may be enough
   * - Lower total confidence required
   * - Shorter time window considered
   *
   * @param _context - Execution context
   * @param _targetId - Target being predicted
   * @param predictor - The new predictor
   * @returns true if threshold met
   */
  private checkPredictionThreshold(
    _context: ExecutionContext,
    _targetId: string,
    predictor: Predictor,
  ): boolean {
    // Fast path uses relaxed thresholds
    // For now, allow prediction if confidence >= 0.9 (urgent threshold)
    return predictor.confidence >= 0.9;
  }

  /**
   * Generate prediction
   * TODO: Wire up PredictionGenerationService
   *
   * @param _context - Execution context
   * @param _targetId - Target being predicted
   * @param _predictors - Predictors to include (may be just one for fast path)
   * @returns Prediction or null if generation fails
   */
  private generatePrediction(
    _context: ExecutionContext,
    _targetId: string,
    _predictors: Predictor[],
  ): Prediction | null {
    // TODO: Implement when PredictionGenerationService is wired up
    this.logger.warn('generatePrediction not yet implemented');
    return null;
  }
}

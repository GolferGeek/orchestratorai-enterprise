import { Injectable, Logger } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  ObservabilityEventsService,
  ObservabilityEventRecord,
} from '@orchestratorai/planes/observability';
import { Observable, filter, map } from 'rxjs';
import { Prediction } from '../interfaces/prediction.interface';

/**
 * Prediction progress metadata for streaming events
 */
export interface PredictionProgressMetadata {
  /** Current processing phase */
  phase:
    | 'signal_detection'
    | 'predictor_creation'
    | 'threshold_evaluation'
    | 'prediction_generation'
    | 'snapshot_creation'
    | 'notification';
  /** Processing step within the phase */
  step: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Processing status */
  status: 'in_progress' | 'completed' | 'failed';
  /** Target being predicted */
  targetId?: string;
  /** Target symbol (e.g., AAPL, BTC) */
  targetSymbol?: string;
  /** Prediction ID (once generated) */
  predictionId?: string;
  /** Direction (once determined) */
  direction?: string;
  /** Confidence (once calculated) */
  confidence?: number;
  /** Number of predictors considered */
  predictorCount?: number;
  /** Number of analysts evaluated */
  analystCount?: number;
  /** LLM tiers used */
  llmTiers?: string[];
  /** Additional context */
  metadata?: Record<string, unknown>;
}

/**
 * Event types emitted by the prediction streaming service
 */
export type PredictionStreamEventType =
  | 'agent.stream.chunk' // Progress update
  | 'agent.stream.complete' // Prediction finalized
  | 'agent.stream.error'; // Processing failure

/**
 * Prediction stream event payload
 */
export interface PredictionStreamEvent {
  type: PredictionStreamEventType;
  context: ExecutionContext;
  timestamp: string;
  /** Progress message */
  message: string;
  /** Metadata for chunk events */
  metadata?: PredictionProgressMetadata;
  /** Prediction data for complete events */
  prediction?: Prediction;
  /** Error message for error events */
  error?: string;
}

/**
 * PredictionStreamingService
 *
 * Phase 9: Notifications & Streaming
 *
 * Implements SSE streaming for prediction processing using the existing
 * ObservabilityEventsService infrastructure. Provides real-time updates
 * for signal detection, predictor creation, and prediction generation.
 *
 * Event Types:
 * - agent.stream.chunk: Progress updates during processing
 * - agent.stream.complete: Prediction finalized successfully
 * - agent.stream.error: Processing failure
 *
 * Uses the existing SSE endpoint:
 * GET /agent-to-agent/:orgSlug/:agentSlug/tasks/:taskId/stream
 */
@Injectable()
export class PredictionStreamingService {
  private readonly logger = new Logger(PredictionStreamingService.name);

  constructor(
    private readonly observabilityEvents: ObservabilityEventsService,
  ) {}

  /**
   * Emit a progress chunk event
   *
   * Called during prediction processing to update clients on progress.
   * Events are pushed to ObservabilityEventsService for SSE delivery.
   *
   * @param context - ExecutionContext (flows unchanged through system)
   * @param message - Human-readable progress message
   * @param metadata - Progress metadata
   */
  emitChunk(
    context: ExecutionContext,
    message: string,
    metadata: PredictionProgressMetadata,
  ): void {
    this.logger.debug(
      `Emitting chunk for conversationId ${context.conversationId}: ${message} (${metadata.phase}/${metadata.step})`,
    );

    const record: ObservabilityEventRecord = {
      context,
      source_app: 'prediction-runner',
      hook_event_type: 'agent.stream.chunk',
      status: metadata.status,
      message,
      progress: metadata.progress,
      step: `${metadata.phase}.${metadata.step}`,
      payload: {
        mode: 'prediction',
        phase: metadata.phase,
        step: metadata.step,
        status: metadata.status,
        targetId: metadata.targetId,
        targetSymbol: metadata.targetSymbol,
        predictionId: metadata.predictionId,
        direction: metadata.direction,
        confidence: metadata.confidence,
        predictorCount: metadata.predictorCount,
        analystCount: metadata.analystCount,
        llmTiers: metadata.llmTiers,
        ...metadata.metadata,
      },
      timestamp: Date.now(),
    };

    void this.observabilityEvents.push(record);
  }

  /**
   * Emit signal detection started
   */
  emitSignalDetectionStarted(
    context: ExecutionContext,
    targetId: string,
    targetSymbol?: string,
  ): void {
    this.emitChunk(
      context,
      `Starting signal detection for ${targetSymbol || targetId}`,
      {
        phase: 'signal_detection',
        step: 'started',
        progress: 0,
        status: 'in_progress',
        targetId,
        targetSymbol,
      },
    );
  }

  /**
   * Emit signal detection progress
   */
  emitSignalDetectionProgress(
    context: ExecutionContext,
    message: string,
    progress: number,
    metadata?: Partial<PredictionProgressMetadata>,
  ): void {
    this.emitChunk(context, message, {
      phase: 'signal_detection',
      step: 'processing',
      progress,
      status: 'in_progress',
      ...metadata,
    });
  }

  /**
   * Emit signal detection completed
   */
  emitSignalDetectionCompleted(
    context: ExecutionContext,
    targetId: string,
    signalCount: number,
    targetSymbol?: string,
  ): void {
    this.emitChunk(
      context,
      `Signal detection complete: ${signalCount} signals found`,
      {
        phase: 'signal_detection',
        step: 'completed',
        progress: 20,
        status: 'completed',
        targetId,
        targetSymbol,
        metadata: { signalCount },
      },
    );
  }

  /**
   * Emit predictor creation started
   */
  emitPredictorCreationStarted(
    context: ExecutionContext,
    targetId: string,
    analystCount: number,
    llmTiers: string[],
    targetSymbol?: string,
  ): void {
    this.emitChunk(
      context,
      `Evaluating with ${analystCount} analysts across ${llmTiers.length} LLM tiers`,
      {
        phase: 'predictor_creation',
        step: 'started',
        progress: 25,
        status: 'in_progress',
        targetId,
        targetSymbol,
        analystCount,
        llmTiers,
      },
    );
  }

  /**
   * Emit predictor creation progress (analyst evaluation)
   */
  emitAnalystEvaluation(
    context: ExecutionContext,
    analystSlug: string,
    tier: string,
    progress: number,
    targetId?: string,
    targetSymbol?: string,
  ): void {
    this.emitChunk(
      context,
      `Analyst ${analystSlug} evaluating on ${tier} tier`,
      {
        phase: 'predictor_creation',
        step: 'analyst_evaluation',
        progress,
        status: 'in_progress',
        targetId,
        targetSymbol,
        metadata: { analystSlug, tier },
      },
    );
  }

  /**
   * Emit predictor creation completed
   */
  emitPredictorCreationCompleted(
    context: ExecutionContext,
    targetId: string,
    predictorCount: number,
    targetSymbol?: string,
  ): void {
    this.emitChunk(
      context,
      `Predictor creation complete: ${predictorCount} predictors created`,
      {
        phase: 'predictor_creation',
        step: 'completed',
        progress: 50,
        status: 'completed',
        targetId,
        targetSymbol,
        predictorCount,
      },
    );
  }

  /**
   * Emit threshold evaluation started
   */
  emitThresholdEvaluationStarted(
    context: ExecutionContext,
    targetId: string,
    predictorCount: number,
    targetSymbol?: string,
  ): void {
    this.emitChunk(
      context,
      `Evaluating prediction threshold with ${predictorCount} predictors`,
      {
        phase: 'threshold_evaluation',
        step: 'started',
        progress: 55,
        status: 'in_progress',
        targetId,
        targetSymbol,
        predictorCount,
      },
    );
  }

  /**
   * Emit threshold not met (no prediction will be generated)
   */
  emitThresholdNotMet(
    context: ExecutionContext,
    targetId: string,
    reason: string,
    targetSymbol?: string,
  ): void {
    this.emitChunk(context, `Threshold not met: ${reason}`, {
      phase: 'threshold_evaluation',
      step: 'not_met',
      progress: 100,
      status: 'completed',
      targetId,
      targetSymbol,
      metadata: { reason, thresholdMet: false },
    });
  }

  /**
   * Emit threshold met (proceeding to prediction generation)
   */
  emitThresholdMet(
    context: ExecutionContext,
    targetId: string,
    targetSymbol?: string,
  ): void {
    this.emitChunk(context, 'Threshold met, generating prediction', {
      phase: 'threshold_evaluation',
      step: 'met',
      progress: 60,
      status: 'completed',
      targetId,
      targetSymbol,
      metadata: { thresholdMet: true },
    });
  }

  /**
   * Emit prediction generation started
   */
  emitPredictionGenerationStarted(
    context: ExecutionContext,
    targetId: string,
    direction: string,
    confidence: number,
    targetSymbol?: string,
  ): void {
    this.emitChunk(
      context,
      `Generating ${direction.toUpperCase()} prediction (${Math.round(confidence * 100)}% confidence)`,
      {
        phase: 'prediction_generation',
        step: 'started',
        progress: 65,
        status: 'in_progress',
        targetId,
        targetSymbol,
        direction,
        confidence,
      },
    );
  }

  /**
   * Emit prediction generation completed
   */
  emitPredictionGenerationCompleted(
    context: ExecutionContext,
    prediction: Prediction,
    targetSymbol?: string,
  ): void {
    this.emitChunk(
      context,
      `Prediction generated: ${prediction.direction.toUpperCase()} for ${targetSymbol || prediction.target_id}`,
      {
        phase: 'prediction_generation',
        step: 'completed',
        progress: 80,
        status: 'completed',
        targetId: prediction.target_id,
        targetSymbol,
        predictionId: prediction.id,
        direction: prediction.direction,
        confidence: prediction.confidence,
      },
    );
  }

  /**
   * Emit snapshot creation started
   */
  emitSnapshotCreationStarted(
    context: ExecutionContext,
    predictionId: string,
  ): void {
    this.emitChunk(context, 'Creating explainability snapshot', {
      phase: 'snapshot_creation',
      step: 'started',
      progress: 85,
      status: 'in_progress',
      predictionId,
    });
  }

  /**
   * Emit snapshot creation completed
   */
  emitSnapshotCreationCompleted(
    context: ExecutionContext,
    predictionId: string,
  ): void {
    this.emitChunk(context, 'Snapshot created', {
      phase: 'snapshot_creation',
      step: 'completed',
      progress: 90,
      status: 'completed',
      predictionId,
    });
  }

  /**
   * Emit notification sending started
   */
  emitNotificationStarted(
    context: ExecutionContext,
    predictionId: string,
    isUrgent: boolean,
  ): void {
    this.emitChunk(
      context,
      `Sending ${isUrgent ? 'urgent ' : ''}notification`,
      {
        phase: 'notification',
        step: 'started',
        progress: 95,
        status: 'in_progress',
        predictionId,
        metadata: { isUrgent },
      },
    );
  }

  /**
   * Emit notification sent
   */
  emitNotificationSent(
    context: ExecutionContext,
    predictionId: string,
    channels: string[],
  ): void {
    this.emitChunk(context, `Notification sent via ${channels.join(', ')}`, {
      phase: 'notification',
      step: 'completed',
      progress: 98,
      status: 'completed',
      predictionId,
      metadata: { channels },
    });
  }

  /**
   * Emit completion event
   *
   * Signals that prediction processing has completed successfully.
   *
   * @param context - ExecutionContext
   * @param prediction - The generated prediction
   */
  emitComplete(context: ExecutionContext, prediction: Prediction): void {
    this.logger.log(
      `Emitting complete for conversationId ${context.conversationId}: prediction ${prediction.id}`,
    );

    const record: ObservabilityEventRecord = {
      context,
      source_app: 'prediction-runner',
      hook_event_type: 'agent.stream.complete',
      status: 'completed',
      message: `Prediction ${prediction.id} completed: ${prediction.direction.toUpperCase()} (${Math.round(prediction.confidence * 100)}% confidence)`,
      progress: 100,
      step: 'complete',
      payload: {
        mode: 'prediction',
        predictionId: prediction.id,
        targetId: prediction.target_id,
        direction: prediction.direction,
        confidence: prediction.confidence,
        magnitude: prediction.magnitude,
        timeframeHours: prediction.timeframe_hours,
        status: prediction.status,
      },
      timestamp: Date.now(),
    };

    void this.observabilityEvents.push(record);
  }

  /**
   * Emit error event
   *
   * Signals that prediction processing has failed.
   *
   * @param context - ExecutionContext
   * @param error - Error message
   * @param phase - The phase where error occurred
   */
  emitError(
    context: ExecutionContext,
    error: string,
    phase?: PredictionProgressMetadata['phase'],
  ): void {
    this.logger.error(
      `Emitting error for conversationId ${context.conversationId}: ${error}`,
    );

    const record: ObservabilityEventRecord = {
      context,
      source_app: 'prediction-runner',
      hook_event_type: 'agent.stream.error',
      status: 'failed',
      message: error,
      progress: null,
      step: phase ? `${phase}.error` : 'error',
      payload: {
        mode: 'prediction',
        error,
        phase,
      },
      timestamp: Date.now(),
    };

    void this.observabilityEvents.push(record);
  }

  /**
   * Subscribe to prediction events for a specific task
   *
   * Creates an Observable that filters events for the given taskId.
   * Used by SSE endpoints to stream events to clients.
   *
   * @param taskId - Task ID to subscribe to
   * @returns Observable of prediction stream events
   */
  subscribeToTask(taskId: string): Observable<PredictionStreamEvent> {
    return this.observabilityEvents.events$.pipe(
      filter((event) => event.context.conversationId === taskId),
      filter(
        (event) =>
          event.source_app === 'prediction-runner' ||
          event.payload?.mode === 'prediction',
      ),
      map((event) => this.mapToStreamEvent(event)),
    );
  }

  /**
   * Subscribe to all prediction events for an organization
   *
   * Creates an Observable that filters events for the given org.
   *
   * @param orgSlug - Organization slug to subscribe to
   * @returns Observable of prediction stream events
   */
  subscribeToOrganization(orgSlug: string): Observable<PredictionStreamEvent> {
    return this.observabilityEvents.events$.pipe(
      filter((event) => event.context.orgSlug === orgSlug),
      filter(
        (event) =>
          event.source_app === 'prediction-runner' ||
          event.payload?.mode === 'prediction',
      ),
      map((event) => this.mapToStreamEvent(event)),
    );
  }

  /**
   * Map ObservabilityEventRecord to PredictionStreamEvent
   */
  private mapToStreamEvent(
    event: ObservabilityEventRecord,
  ): PredictionStreamEvent {
    const type = event.hook_event_type as PredictionStreamEventType;

    const streamEvent: PredictionStreamEvent = {
      type,
      context: event.context,
      timestamp: new Date(event.timestamp).toISOString(),
      message: event.message || '',
    };

    if (type === 'agent.stream.chunk') {
      streamEvent.metadata = {
        phase: event.payload?.phase as PredictionProgressMetadata['phase'],
        step: (event.payload?.step as string) || event.step || '',
        progress: event.progress || 0,
        status:
          (event.payload?.status as 'in_progress' | 'completed' | 'failed') ||
          'in_progress',
        targetId: event.payload?.targetId as string,
        targetSymbol: event.payload?.targetSymbol as string,
        predictionId: event.payload?.predictionId as string,
        direction: event.payload?.direction as string,
        confidence: event.payload?.confidence as number,
        predictorCount: event.payload?.predictorCount as number,
        analystCount: event.payload?.analystCount as number,
        llmTiers: event.payload?.llmTiers as string[],
      };
    } else if (type === 'agent.stream.error') {
      streamEvent.error =
        (event.payload?.error as string) || event.message || 'Unknown error';
    }

    return streamEvent;
  }
}

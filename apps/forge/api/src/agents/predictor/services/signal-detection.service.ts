import { Injectable, Logger } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { SignalRepository } from '../repositories/signal.repository';
import { PredictorRepository } from '../repositories/predictor.repository';
import { AnalystEnsembleService } from './analyst-ensemble.service';
import { TargetService } from './target.service';
import { ObservabilityEventsService } from '@/observability/observability-events.service';
import {
  Signal,
  SignalUrgency,
  SignalDirection,
} from '../interfaces/signal.interface';
import {
  SignalDetectionInput,
  SignalDetectionResult,
  SignalEvaluationOutput,
} from '../interfaces/signal-detection.interface';
import { EnsembleInput } from '../interfaces/ensemble.interface';
import { CreatePredictorData } from '../interfaces/predictor.interface';
import {
  ThresholdConfig,
  DEFAULT_THRESHOLD_CONFIG,
} from '../interfaces/threshold-evaluation.interface';

/**
 * Tier 1: Signal Detection Service
 *
 * Evaluates incoming signals using analyst ensemble to determine:
 * - Should this signal create a predictor?
 * - What is the urgency (urgent >= 0.90, notable >= 0.70, routine < 0.70)?
 * - What direction is indicated?
 *
 * Flow: Signal -> Ensemble Evaluation -> Predictor (if approved)
 */
@Injectable()
export class SignalDetectionService {
  private readonly logger = new Logger(SignalDetectionService.name);

  constructor(
    private readonly signalRepository: SignalRepository,
    private readonly predictorRepository: PredictorRepository,
    private readonly ensembleService: AnalystEnsembleService,
    private readonly targetService: TargetService,
    private readonly observabilityEventsService: ObservabilityEventsService,
  ) {}

  /**
   * Process a signal through Tier 1 evaluation
   * Determines if signal warrants creating a predictor
   */
  async processSignal(
    ctx: ExecutionContext,
    input: SignalDetectionInput,
    config?: ThresholdConfig,
  ): Promise<SignalDetectionResult> {
    const effectiveConfig = { ...DEFAULT_THRESHOLD_CONFIG, ...config };

    this.logger.log(
      `Processing signal ${input.signal.id} for target ${input.targetId}`,
    );

    // Get target for ensemble context
    const target = await this.targetService.findByIdOrThrow(input.targetId);

    // Build ensemble input from signal
    const ensembleInput: EnsembleInput = {
      targetId: input.targetId,
      content: this.buildSignalContent(input.signal),
      direction: input.signal.direction,
      metadata: input.signal.metadata,
    };

    // Run ensemble evaluation
    const ensembleResult = await this.ensembleService.runEnsemble(
      ctx,
      target,
      ensembleInput,
    );

    // Extract evaluation from ensemble
    const evaluation = this.evaluateEnsembleResult(ensembleResult);

    // Determine urgency based on confidence thresholds
    const urgency = this.determineUrgency(evaluation.confidence);

    // Update signal with evaluation results
    // Use predictor_created for accepted, rejected for rejected
    await this.signalRepository.update(input.signal.id, {
      disposition: evaluation.shouldCreatePredictor
        ? 'predictor_created'
        : 'rejected',
      urgency,
      evaluation_result: {
        confidence: evaluation.confidence,
        analyst_slug: ctx.agentSlug,
        reasoning: evaluation.reasoning,
      },
    });

    // If approved, create predictor
    if (evaluation.shouldCreatePredictor) {
      await this.createPredictorFromSignal(
        input.signal,
        evaluation,
        urgency,
        effectiveConfig,
      );
    }

    // Emit signal.detected event for observability
    // Extract article title from metadata if available
    const articleTitle =
      (input.signal.metadata?.title as string) ||
      (input.signal.metadata?.headline as string) ||
      null;

    await this.observabilityEventsService.push({
      context: ctx,
      source_app: 'prediction-runner',
      hook_event_type: 'signal.detected',
      status: evaluation.shouldCreatePredictor ? 'approved' : 'rejected',
      message: evaluation.shouldCreatePredictor
        ? `Signal approved - creating predictor (${evaluation.direction}, confidence: ${(evaluation.confidence * 100).toFixed(0)}%)`
        : `Signal rejected (confidence: ${(evaluation.confidence * 100).toFixed(0)}%)`,
      progress: null,
      step: 'signal-detected',
      payload: {
        signalId: input.signal.id,
        targetId: input.targetId,
        targetSymbol: target.symbol,
        direction: evaluation.direction,
        confidence: evaluation.confidence,
        urgency,
        shouldCreatePredictor: evaluation.shouldCreatePredictor,
        keyFactors: evaluation.key_factors,
        risks: evaluation.risks,
        // Article information
        url: input.signal.url,
        title: articleTitle,
        content: input.signal.content,
        sourceName: input.signal.metadata?.source_name as string | undefined,
      },
      timestamp: Date.now(),
    });

    return {
      signal: input.signal,
      shouldCreatePredictor: evaluation.shouldCreatePredictor,
      urgency,
      confidence: evaluation.confidence,
      reasoning: evaluation.reasoning,
      analystSlug: ctx.agentSlug,
      key_factors: evaluation.key_factors,
      risks: evaluation.risks,
    };
  }

  /**
   * Build content string from signal for ensemble evaluation
   */
  private buildSignalContent(signal: Signal): string {
    const parts = [
      `Source: ${signal.source_id}`,
      `Direction: ${signal.direction || 'unknown'}`,
      `Content: ${signal.content}`,
    ];

    if (signal.metadata) {
      parts.push(`Context: ${JSON.stringify(signal.metadata)}`);
    }

    return parts.join('\n');
  }

  /**
   * Evaluate ensemble result to make signal decision
   */
  private evaluateEnsembleResult(
    result: ReturnType<typeof this.ensembleService.runEnsemble> extends Promise<
      infer T
    >
      ? T
      : never,
  ): SignalEvaluationOutput {
    const { aggregated } = result;

    // Convert ensemble direction to signal direction
    const direction = this.mapDirection(aggregated.direction);

    // Determine if we should create a predictor
    // Threshold: confidence >= 0.5 and consensus_strength >= 0.6
    const shouldCreatePredictor =
      aggregated.confidence >= 0.5 && aggregated.consensus_strength >= 0.6;

    return {
      shouldCreatePredictor,
      urgency: this.determineUrgency(aggregated.confidence),
      direction,
      confidence: aggregated.confidence,
      reasoning: aggregated.reasoning,
      key_factors: this.extractKeyFactors(result),
      risks: this.extractRisks(result),
    };
  }

  /**
   * Map ensemble direction to signal direction type
   */
  private mapDirection(direction: string): SignalDirection {
    const normalized = direction.toLowerCase();
    if (normalized === 'bullish' || normalized === 'up') return 'bullish';
    if (normalized === 'bearish' || normalized === 'down') return 'bearish';
    return 'neutral';
  }

  /**
   * Determine urgency based on confidence score
   * Urgency thresholds: urgent >= 0.90, notable >= 0.70, routine < 0.70
   */
  private determineUrgency(confidence: number): SignalUrgency {
    if (confidence >= 0.9) return 'urgent';
    if (confidence >= 0.7) return 'notable';
    return 'routine';
  }

  /**
   * Extract key factors from ensemble assessments
   */
  private extractKeyFactors(result: {
    assessments: Array<{ key_factors: string[] }>;
  }): string[] {
    const allFactors = result.assessments.flatMap((a) => a.key_factors);
    // Deduplicate and take top 5
    return [...new Set(allFactors)].slice(0, 5);
  }

  /**
   * Extract risks from ensemble assessments
   */
  private extractRisks(result: {
    assessments: Array<{ risks: string[] }>;
  }): string[] {
    const allRisks = result.assessments.flatMap((a) => a.risks);
    // Deduplicate and take top 5
    return [...new Set(allRisks)].slice(0, 5);
  }

  /**
   * Create a predictor from an approved signal
   */
  private async createPredictorFromSignal(
    signal: Signal,
    evaluation: SignalEvaluationOutput,
    urgency: SignalUrgency,
    config: ThresholdConfig,
  ): Promise<void> {
    // Calculate strength from confidence (1-10 scale)
    const strength = Math.round(evaluation.confidence * 10);

    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + config.predictor_ttl_hours);

    const predictorData: CreatePredictorData = {
      target_id: signal.target_id,
      // Legacy signal flow - no article_id available
      direction: evaluation.direction,
      strength,
      confidence: evaluation.confidence,
      reasoning: evaluation.reasoning,
      analyst_slug: 'ensemble',
      analyst_assessment: {
        direction: evaluation.direction,
        confidence: evaluation.confidence,
        reasoning: evaluation.reasoning,
        key_factors: evaluation.key_factors,
        risks: evaluation.risks,
      },
      status: 'active',
      expires_at: expiresAt.toISOString(),
      // INV-03: Predictor must inherit is_test from source signal
      is_test: signal.is_test,
    };

    const predictor = await this.predictorRepository.create(predictorData);

    this.logger.log(
      `Created predictor ${predictor.id} from signal ${signal.id} ` +
        `(direction: ${evaluation.direction}, strength: ${strength}, urgency: ${urgency})`,
    );
  }
}

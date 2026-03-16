import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { createSystemTriggeredContext } from '../../../automation-context/automation-context';
import { SignalRepository } from '../repositories/signal.repository';
import { TargetRepository } from '../repositories/target.repository';
import { UniverseRepository } from '../repositories/universe.repository';
import { SignalDetectionService } from '../services/signal-detection.service';
import { FastPathService } from '../services/fast-path.service';
import { LlmTierResolverService } from '../services/llm-tier-resolver.service';
import { ObservabilityEventsService } from '@orchestratorai/planes/observability';
import { Signal } from '../interfaces/signal.interface';

/**
 * Batch Signal Processor Runner - Phase 7, Step 7-2
 *
 * Processes pending signals through Tier 1 (Signal Detection)
 * to create predictors.
 *
 * Schedule: Every 15 minutes
 *
 * Features:
 * - Atomic signal claiming with FOR UPDATE SKIP LOCKED pattern
 * - Fast path for urgent signals (confidence >= 0.90)
 * - Article-centric processing: process all targets for each article before moving on
 * - Worker ID tracking for debugging
 *
 * Fair Processing:
 * For each article/signal, we process ALL targets that have pending signals
 * for that article before moving to the next article. This ensures all
 * instruments (targets) are evaluated for each piece of news.
 */
@Injectable()
export class BatchSignalProcessorRunner {
  private readonly logger = new Logger(BatchSignalProcessorRunner.name);
  private readonly workerId = uuidv4(); // UUID required by processing_worker column
  // Total signals to process per batch run
  private readonly batchSize = 200;
  private isRunning = false;

  constructor(
    private readonly signalRepository: SignalRepository,
    private readonly targetRepository: TargetRepository,
    private readonly universeRepository: UniverseRepository,
    private readonly signalDetectionService: SignalDetectionService,
    private readonly fastPathService: FastPathService,
    private readonly llmTierResolver: LlmTierResolverService,
    private readonly observabilityEventsService: ObservabilityEventsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create execution context for observability events
   */
  private createObservabilityContext(): ExecutionContext {
    return createSystemTriggeredContext({
      orgSlug: 'system',
      agentSlug: 'batch-signal-processor',
      provider: 'none',
      model: 'none',
    });
  }

  /**
   * Check if batch signal processing is disabled via master environment variable
   */
  private isDisabled(): boolean {
    return (
      this.configService.get<string>('DISABLE_SCHEDULED_PREDICTION') === 'true' ||
      this.configService.get<string>('DISABLE_PREDICTION_RUNNERS') === 'true'
    );
  }

  /**
   * Run batch signal processing using article-centric approach.
   * For each article (URL), process all target signals before moving to next article.
   */
  async runBatchProcessing(): Promise<{
    processed: number;
    predictorsCreated: number;
    rejected: number;
    fastPathTriggered: number;
    errors: number;
  }> {
    if (this.isRunning) {
      this.logger.warn('Skipping batch run - previous run still in progress');
      return {
        processed: 0,
        predictorsCreated: 0,
        rejected: 0,
        fastPathTriggered: 0,
        errors: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    this.logger.log(
      `Starting batch signal processing (worker: ${this.workerId})`,
    );

    let processed = 0;
    let predictorsCreated = 0;
    let rejected = 0;
    let fastPathTriggered = 0;
    let errors = 0;

    try {
      // Get pending signals grouped by URL (article)
      // This ensures we process all targets for each article before moving on
      const signalGroups =
        await this.signalRepository.findPendingSignalsGroupedByUrl(
          this.batchSize,
        );

      this.logger.log(`Processing ${signalGroups.length} article groups`);

      for (const group of signalGroups) {
        // Process all signals for this article (one per target)
        for (const signal of group.signals) {
          try {
            // Claim the signal atomically
            const claimed = await this.signalRepository.claimSignal(
              signal.id,
              this.workerId,
            );

            if (!claimed) {
              // Signal was claimed by another worker
              continue;
            }

            // Process the signal
            const result = await this.processSignal(claimed, signal.target_id);
            processed++;

            if (result.shouldCreatePredictor) {
              predictorsCreated++;

              // Check for fast path
              if (result.urgency === 'urgent') {
                fastPathTriggered++;
                await this.triggerFastPath(claimed);
              }
            } else {
              rejected++;
            }
          } catch (error) {
            errors++;
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(
              `Error processing signal ${signal.id}: ${errorMessage}`,
            );

            // Reset failed signal back to pending so it can be retried
            try {
              await this.signalRepository.update(signal.id, {
                disposition: 'pending',
                processing_worker: null,
              });
            } catch {
              // Ignore reset errors
            }
          }
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Batch signal processing complete: ${processed} processed, ` +
          `${predictorsCreated} predictors created, ${rejected} rejected, ` +
          `${fastPathTriggered} fast-path, ${errors} errors (${duration}ms)`,
      );

      // Emit batch completion event for observability
      if (processed > 0 || errors > 0) {
        const ctx = this.createObservabilityContext();
        await this.observabilityEventsService.push({
          context: ctx,
          source_app: 'prediction-runner',
          hook_event_type: 'signal.processing.completed',
          status: errors > 0 ? 'partial' : 'completed',
          message: `Processed ${processed} signals: ${predictorsCreated} predictors, ${rejected} rejected, ${errors} errors`,
          progress: 100,
          step: 'batch-complete',
          payload: {
            processed,
            predictorsCreated,
            rejected,
            fastPathTriggered,
            errors,
            durationMs: duration,
            workerId: this.workerId,
          },
          timestamp: Date.now(),
        });
      }

      return {
        processed,
        predictorsCreated,
        rejected,
        fastPathTriggered,
        errors,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process all pending signals for a specific target
   */
  private async processTargetSignals(targetId: string): Promise<{
    processed: number;
    predictorsCreated: number;
    rejected: number;
    fastPathTriggered: number;
    errors: number;
  }> {
    let processed = 0;
    let predictorsCreated = 0;
    let rejected = 0;
    let fastPathTriggered = 0;
    let errors = 0;

    // Get pending signals for this target
    const pendingSignals = await this.signalRepository.findPendingSignals(
      targetId,
      this.batchSize,
    );

    if (pendingSignals.length === 0) {
      return {
        processed: 0,
        predictorsCreated: 0,
        rejected: 0,
        fastPathTriggered: 0,
        errors: 0,
      };
    }

    this.logger.debug(
      `Processing ${pendingSignals.length} pending signals for target ${targetId}`,
    );

    for (const signal of pendingSignals) {
      try {
        // Claim the signal atomically
        const claimed = await this.signalRepository.claimSignal(
          signal.id,
          this.workerId,
        );

        if (!claimed) {
          // Signal was claimed by another worker
          continue;
        }

        // Process the signal
        const result = await this.processSignal(claimed, targetId);
        processed++;

        if (result.shouldCreatePredictor) {
          predictorsCreated++;

          // Check for fast path
          if (result.urgency === 'urgent') {
            fastPathTriggered++;
            await this.triggerFastPath(claimed);
          }
        } else {
          rejected++;
        }
      } catch (error) {
        errors++;
        this.logger.error(
          `Error processing signal ${signal.id}: ` +
            `${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return {
      processed,
      predictorsCreated,
      rejected,
      fastPathTriggered,
      errors,
    };
  }

  /**
   * Process a single signal through signal detection
   */
  private async processSignal(
    signal: Signal,
    targetId: string,
  ): Promise<{ shouldCreatePredictor: boolean; urgency: string }> {
    // Resolve LLM provider/model from tier resolver (respects DEFAULT_LLM env vars)
    const resolved = await this.llmTierResolver.resolveTier('silver');

    // Create execution context for this processing
    const ctx: ExecutionContext = createSystemTriggeredContext({
      orgSlug: 'system',
      agentSlug: 'batch-signal-processor',
      provider: resolved.provider,
      model: resolved.model,
    });

    const result = await this.signalDetectionService.processSignal(ctx, {
      signal,
      targetId,
    });

    return {
      shouldCreatePredictor: result.shouldCreatePredictor,
      urgency: result.urgency,
    };
  }

  /**
   * Trigger fast path processing for urgent signals
   */
  private async triggerFastPath(signal: Signal): Promise<void> {
    try {
      // Resolve LLM provider/model from tier resolver (respects DEFAULT_LLM env vars)
      const resolved = await this.llmTierResolver.resolveTier('silver');

      const ctx: ExecutionContext = createSystemTriggeredContext({
        orgSlug: 'system',
        agentSlug: 'fast-path-processor',
        provider: resolved.provider,
        model: resolved.model,
      });

      await this.fastPathService.processFastPath(ctx, signal);
    } catch (error) {
      this.logger.error(
        `Fast path processing failed for signal ${signal.id}: ` +
          `${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Manually trigger processing for a specific target
   */
  async processTargetManually(targetId: string): Promise<{
    processed: number;
    predictorsCreated: number;
    rejected: number;
    fastPathTriggered: number;
    errors: number;
  }> {
    return this.processTargetSignals(targetId);
  }
}

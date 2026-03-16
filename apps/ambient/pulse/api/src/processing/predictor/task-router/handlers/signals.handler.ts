/**
 * Signals Dashboard Handler
 *
 * Handles dashboard mode requests for signals.
 * Signals are raw data inputs (news, events, social media) detected by sources.
 * Provides filtered access to signals for dashboard analysis.
 *
 * Sprint 4, Task s4-2
 * Updated: Added 'process' action for manual signal-to-predictor conversion
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { NIL_UUID } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '../../../../shared/pulse-types';
import { SignalRepository } from '../../repositories/signal.repository';
import { TargetRepository } from '../../repositories/target.repository';
import { UniverseRepository } from '../../repositories/universe.repository';
import { SignalDetectionService } from '../../services/signal-detection.service';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import { SignalDisposition } from '../../interfaces/signal.interface';
import { TestDataFilter } from '../../interfaces/test-data.interface';

interface SignalParams {
  id?: string;
  targetId?: string;
  /** Process signals for all active targets in a universe */
  universeId?: string;
  disposition?: SignalDisposition;
  limit?: number;
  offset?: number;
  page?: number;
  pageSize?: number;
  includeTest?: boolean;
  /** Maximum signals to process in one batch per target for 'process' action (default: 10) */
  batchSize?: number;
}

@Injectable()
export class SignalsHandler implements IDashboardHandler {
  private readonly logger = new Logger(SignalsHandler.name);
  private readonly supportedActions = ['list', 'get', 'process'];

  constructor(
    private readonly signalRepository: SignalRepository,
    private readonly targetRepository: TargetRepository,
    private readonly universeRepository: UniverseRepository,
    private readonly signalDetectionService: SignalDetectionService,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[SIGNALS-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as SignalParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params);
      case 'get':
        return this.handleGet(params);
      case 'process':
        return this.handleProcess(params, context);
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
   * List signals for a target with filtering and pagination
   * Supports filtering by disposition and test data inclusion
   */
  private async handleList(
    params?: SignalParams,
  ): Promise<DashboardActionResult> {
    if (!params?.targetId) {
      return buildDashboardError('MISSING_TARGET_ID', 'Target ID is required');
    }

    try {
      // Build test data filter
      const testDataFilter: TestDataFilter = {
        includeTestData: params.includeTest ?? false,
      };

      // Fetch signals based on disposition filter
      let signals;
      if (params.disposition) {
        signals = await this.signalRepository.findByTargetAndDisposition(
          params.targetId,
          params.disposition,
          testDataFilter,
        );
      } else {
        // If no disposition specified, get pending signals (most common use case)
        signals = await this.signalRepository.findPendingSignals(
          params.targetId,
          1000, // Large limit to get all, we'll paginate in-memory
          testDataFilter,
        );
      }

      // Simple pagination
      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? 20;
      const offset = params.offset ?? 0;
      const startIndex = offset > 0 ? offset : (page - 1) * pageSize;
      const paginatedSignals = signals.slice(startIndex, startIndex + pageSize);

      return buildDashboardSuccess(
        paginatedSignals,
        buildPaginationMetadata(signals.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list signals: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list signals',
      );
    }
  }

  /**
   * Get a single signal by ID
   */
  private async handleGet(
    params?: SignalParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Signal ID is required');
    }

    try {
      const signal = await this.signalRepository.findById(params.id);
      if (!signal) {
        return buildDashboardError(
          'NOT_FOUND',
          `Signal not found: ${params.id}`,
        );
      }

      return buildDashboardSuccess(signal);
    } catch (error) {
      this.logger.error(
        `Failed to get signal: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get signal',
      );
    }
  }

  /**
   * Manually process pending signals for a target or all targets in a universe
   * Converts signals to predictors through the Signal Detection Service
   *
   * This is useful for:
   * - Testing the signal-to-predictor pipeline
   * - Manually triggering evaluation when cron jobs aren't running
   * - Processing specific signals on-demand
   *
   * @param params.targetId - Process signals for a single target
   * @param params.universeId - Process signals for all active targets in a universe
   * @param params.batchSize - Max signals to process per target (default: 10)
   */
  private async handleProcess(
    params?: SignalParams,
    baseContext?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const targetId = params?.targetId;
    let universeId = params?.universeId;

    // Auto-detect universe from agent context if not provided
    if (!targetId && !universeId && baseContext?.agentSlug) {
      this.logger.debug(
        `[SIGNALS-HANDLER] No targetId/universeId provided, looking up from agent: ${baseContext.agentSlug}`,
      );

      const universes = await this.universeRepository.findByAgentSlug(
        baseContext.agentSlug,
        baseContext.orgSlug,
      );

      const firstUniverse = universes[0];
      if (firstUniverse) {
        // Use the first active universe for this agent
        universeId = firstUniverse.id;
        this.logger.log(
          `[SIGNALS-HANDLER] Auto-detected universeId: ${universeId} from agent: ${baseContext.agentSlug}`,
        );
      }
    }

    if (!targetId && !universeId) {
      return buildDashboardError(
        'MISSING_TARGET_OR_UNIVERSE',
        'Either targetId or universeId is required for signal processing (and could not auto-detect from agent context)',
      );
    }

    const batchSize = params?.batchSize ?? 10;
    const testDataFilter: TestDataFilter = {
      includeTestData: params?.includeTest ?? false,
    };

    // If universeId provided, process all active targets in the universe
    if (universeId) {
      return this.handleProcessUniverse(
        universeId,
        batchSize,
        testDataFilter,
        baseContext,
      );
    }

    // Process single target
    return this.handleProcessTarget(
      targetId!,
      batchSize,
      testDataFilter,
      baseContext,
    );
  }

  /**
   * Process signals for all active targets in a universe
   */
  private async handleProcessUniverse(
    universeId: string,
    batchSize: number,
    testDataFilter: TestDataFilter,
    baseContext?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.log(
      `[SIGNALS-HANDLER] Processing signals for universe: ${universeId}, batchSize: ${batchSize}`,
    );

    try {
      // Get all active targets in the universe
      // Note: testDataFilter is applied at signal level, not target level
      const targets =
        await this.targetRepository.findActiveByUniverse(universeId);

      if (targets.length === 0) {
        return buildDashboardSuccess({
          targetsProcessed: 0,
          totalProcessed: 0,
          totalPredictorsCreated: 0,
          totalRejected: 0,
          totalErrors: 0,
          targetResults: [],
          message: 'No active targets found in universe',
        });
      }

      this.logger.log(
        `[SIGNALS-HANDLER] Found ${targets.length} active targets to process`,
      );

      let totalProcessed = 0;
      let totalPredictorsCreated = 0;
      let totalRejected = 0;
      let totalErrors = 0;
      const targetResults: Array<{
        targetId: string;
        targetSymbol: string;
        processed: number;
        predictorsCreated: number;
        rejected: number;
        errors: number;
      }> = [];

      // Process each target
      for (const target of targets) {
        const result = await this.processTargetSignals(
          target.id,
          batchSize,
          testDataFilter,
          baseContext,
        );

        totalProcessed += result.processed;
        totalPredictorsCreated += result.predictorsCreated;
        totalRejected += result.rejected;
        totalErrors += result.errors;

        targetResults.push({
          targetId: target.id,
          targetSymbol: target.symbol,
          processed: result.processed,
          predictorsCreated: result.predictorsCreated,
          rejected: result.rejected,
          errors: result.errors,
        });
      }

      return buildDashboardSuccess({
        targetsProcessed: targets.length,
        totalProcessed,
        totalPredictorsCreated,
        totalRejected,
        totalErrors,
        targetResults,
        message: `Processed ${totalProcessed} signals across ${targets.length} targets: ${totalPredictorsCreated} predictors created, ${totalRejected} rejected, ${totalErrors} errors`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to process universe signals: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'PROCESS_FAILED',
        error instanceof Error ? error.message : 'Failed to process signals',
      );
    }
  }

  /**
   * Process signals for a single target (returns result object for aggregation)
   */
  private async handleProcessTarget(
    targetId: string,
    batchSize: number,
    testDataFilter: TestDataFilter,
    baseContext?: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.log(
      `[SIGNALS-HANDLER] Processing signals for target: ${targetId}, batchSize: ${batchSize}`,
    );

    try {
      const result = await this.processTargetSignals(
        targetId,
        batchSize,
        testDataFilter,
        baseContext,
      );

      return buildDashboardSuccess({
        processed: result.processed,
        predictorsCreated: result.predictorsCreated,
        rejected: result.rejected,
        errors: result.errors,
        results: result.results,
        message: result.message,
      });
    } catch (error) {
      this.logger.error(
        `Failed to process signals: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'PROCESS_FAILED',
        error instanceof Error ? error.message : 'Failed to process signals',
      );
    }
  }

  /**
   * Core signal processing logic for a target
   */
  private async processTargetSignals(
    targetId: string,
    batchSize: number,
    testDataFilter: TestDataFilter,
    baseContext?: ExecutionContext,
  ): Promise<{
    processed: number;
    predictorsCreated: number;
    rejected: number;
    errors: number;
    results: Array<{
      signalId: string;
      status: 'predictor_created' | 'rejected' | 'error';
      confidence?: number;
      direction?: string;
      error?: string;
    }>;
    message: string;
  }> {
    // Get pending signals to process
    const pendingSignals = await this.signalRepository.findPendingSignals(
      targetId,
      batchSize,
      testDataFilter,
    );

    if (pendingSignals.length === 0) {
      return {
        processed: 0,
        predictorsCreated: 0,
        rejected: 0,
        errors: 0,
        results: [],
        message: 'No pending signals to process',
      };
    }

    this.logger.log(
      `[SIGNALS-HANDLER] Found ${pendingSignals.length} pending signals for target ${targetId}`,
    );

    // Process each signal
    let processed = 0;
    let predictorsCreated = 0;
    let rejected = 0;
    let errors = 0;
    const results: Array<{
      signalId: string;
      status: 'predictor_created' | 'rejected' | 'error';
      confidence?: number;
      direction?: string;
      error?: string;
    }> = [];

    for (const signal of pendingSignals) {
      try {
        // Claim the signal first (use UUID as processing_worker column requires UUID)
        const manualWorkerId = uuidv4();
        const claimed = await this.signalRepository.claimSignal(
          signal.id,
          manualWorkerId,
        );

        if (!claimed) {
          this.logger.warn(
            `Signal ${signal.id} already claimed by another worker`,
          );
          continue;
        }

        // Create execution context for this processing
        const ctx: ExecutionContext = baseContext
          ? {
              ...baseContext,
              taskId: uuidv4(),
              agentSlug: 'manual-signal-processor',
            }
          : {
              orgSlug: 'system',
              userId: 'system',
              conversationId: NIL_UUID,
              taskId: uuidv4(),
              planId: NIL_UUID,
              deliverableId: NIL_UUID,
              agentSlug: 'manual-signal-processor',
              agentType: 'context',
              provider: 'anthropic',
              model: 'claude-haiku-4-20250514',
            };

        // Process through signal detection service
        const result = await this.signalDetectionService.processSignal(ctx, {
          signal: claimed,
          targetId,
        });

        processed++;

        if (result.shouldCreatePredictor) {
          predictorsCreated++;
          results.push({
            signalId: signal.id,
            status: 'predictor_created',
            confidence: result.confidence,
            direction: result.reasoning?.split(' ')[0], // Extract direction hint
          });
        } else {
          rejected++;
          results.push({
            signalId: signal.id,
            status: 'rejected',
            confidence: result.confidence,
          });
        }
      } catch (error) {
        errors++;
        this.logger.error(
          `Error processing signal ${signal.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        results.push({
          signalId: signal.id,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      processed,
      predictorsCreated,
      rejected,
      errors,
      results,
      message: `Processed ${processed} signals: ${predictorsCreated} predictors created, ${rejected} rejected, ${errors} errors`,
    };
  }
}

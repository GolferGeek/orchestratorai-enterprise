/**
 * Test Scenario Batch Execution Service
 *
 * Implements batch scenario execution for Phase 6.9 of the prediction system.
 * Allows running multiple test scenarios in parallel with configurable concurrency,
 * progress tracking, and aggregated results.
 *
 * Part of Sprint 6 (s6-2): Batch Scenario Execution
 */

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { ScenarioRunService } from './scenario-run.service';
import { TestScenarioRepository } from '../repositories/test-scenario.repository';
import { TestAuditLogRepository } from '../repositories/test-audit-log.repository';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import { ObservabilityEventsService } from '@/observability/observability-events.service';

/**
 * Status of a batch execution
 */
export type BatchStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Status of an individual scenario within a batch
 */
export type BatchScenarioStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

/**
 * Parameters for executing a batch of scenarios
 */
export interface BatchExecuteParams {
  /** Array of scenario IDs to execute */
  scenarioIds?: string[];

  /** Scenario configuration variations (alternative to scenarioIds) */
  scenarioVariations?: Array<{
    /** Base scenario ID to clone */
    baseScenarioId: string;
    /** Variation parameters */
    variationConfig: Record<string, unknown>;
  }>;

  /** Maximum number of scenarios to run concurrently */
  concurrencyLimit?: number;

  /** Optional batch name for tracking */
  batchName?: string;

  /** Optional version info for all runs */
  versionInfo?: Record<string, unknown>;
}

/**
 * Individual scenario result within a batch
 */
export interface BatchScenarioResult {
  scenarioId: string;
  scenarioName: string;
  runId: string;
  status: BatchScenarioStatus;
  startedAt: string;
  completedAt?: string;
  signals_generated: number;
  predictors_generated: number;
  predictions_generated: number;
  outcome_match: boolean;
  errors: string[];
  duration_ms: number;
}

/**
 * Batch execution record
 */
export interface BatchExecution {
  id: string;
  organization_slug: string;
  batch_name?: string;
  status: BatchStatus;
  total_scenarios: number;
  completed_scenarios: number;
  failed_scenarios: number;
  concurrency_limit: number;
  version_info: Record<string, unknown>;
  scenario_ids: string[];
  triggered_by: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

/**
 * Summary of batch execution results
 */
export interface BatchExecutionSummary {
  batchId: string;
  batchName?: string;
  status: BatchStatus;
  totalScenarios: number;
  completedScenarios: number;
  failedScenarios: number;
  runningScenarios: number;
  pendingScenarios: number;
  startedAt?: string;
  completedAt?: string;
  duration_ms?: number;
  results: BatchScenarioResult[];
  aggregates: {
    total_signals: number;
    total_predictors: number;
    total_predictions: number;
    scenarios_with_outcome_match: number;
    scenarios_with_errors: number;
    average_duration_ms: number;
  };
}

/**
 * Service for batch execution of test scenarios
 */
@Injectable()
export class TestScenarioBatchService {
  private readonly logger = new Logger(TestScenarioBatchService.name);

  // In-memory tracking of active batches
  private activeBatches = new Map<
    string,
    {
      execution: BatchExecution;
      results: BatchScenarioResult[];
      startTime: number;
    }
  >();

  constructor(
    private readonly scenarioRunService: ScenarioRunService,
    private readonly testScenarioRepository: TestScenarioRepository,
    private readonly testAuditLogRepository: TestAuditLogRepository,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly observabilityEventsService: ObservabilityEventsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Execute multiple scenarios in parallel with configurable concurrency
   */
  async executeBatch(
    ctx: ExecutionContext,
    params: BatchExecuteParams,
  ): Promise<BatchExecutionSummary> {
    const startTime = Date.now();

    // Validate parameters
    if (!params.scenarioIds || params.scenarioIds.length === 0) {
      throw new Error('At least one scenario ID is required');
    }

    const concurrencyLimit = params.concurrencyLimit ?? 3; // Default to 3 concurrent runs
    const batchId = this.generateBatchId();

    this.logger.log(
      `Starting batch execution ${batchId} with ${params.scenarioIds.length} scenarios (concurrency: ${concurrencyLimit})`,
    );

    // Send observability event for batch start
    await this.observabilityEventsService.push({
      context: ctx,
      source_app: 'prediction-runner',
      hook_event_type: 'batch.started',
      status: 'running',
      message: `Batch execution started with ${params.scenarioIds.length} scenarios`,
      progress: 0,
      step: 'initialization',
      payload: {
        batch_id: batchId,
        batch_name: params.batchName,
        scenario_count: params.scenarioIds.length,
        concurrency_limit: concurrencyLimit,
      },
      timestamp: Date.now(),
    });

    // Validate all scenarios exist
    const scenarios = await this.validateScenarios(
      params.scenarioIds,
      ctx.orgSlug,
    );

    // Create batch execution record
    const batchExecution: BatchExecution = {
      id: batchId,
      organization_slug: ctx.orgSlug,
      batch_name: params.batchName,
      status: 'running',
      total_scenarios: scenarios.length,
      completed_scenarios: 0,
      failed_scenarios: 0,
      concurrency_limit: concurrencyLimit,
      version_info: params.versionInfo ?? {},
      scenario_ids: params.scenarioIds,
      triggered_by: ctx.userId,
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    // Track batch in memory
    this.activeBatches.set(batchId, {
      execution: batchExecution,
      results: [],
      startTime,
    });

    // Log to audit trail
    await this.testAuditLogRepository.log({
      organization_slug: ctx.orgSlug,
      user_id: ctx.userId,
      action: 'batch_execution_started',
      resource_type: 'batch_execution',
      resource_id: batchId,
      details: {
        batch_name: params.batchName,
        scenario_count: scenarios.length,
        concurrency_limit: concurrencyLimit,
        scenario_ids: params.scenarioIds,
      },
    });

    try {
      // Execute scenarios with concurrency control
      const results = await this.executeWithConcurrency(
        scenarios,
        ctx,
        batchId,
        concurrencyLimit,
        params.versionInfo,
      );

      // Update batch status
      const batch = this.activeBatches.get(batchId);
      if (batch) {
        batch.execution.status = 'completed';
        batch.execution.completed_at = new Date().toISOString();
        batch.execution.completed_scenarios = results.filter(
          (r) => r.status === 'completed',
        ).length;
        batch.execution.failed_scenarios = results.filter(
          (r) => r.status === 'failed',
        ).length;
      }

      // Calculate aggregates
      const aggregates = this.calculateAggregates(results);

      const summary: BatchExecutionSummary = {
        batchId,
        batchName: params.batchName,
        status: 'completed',
        totalScenarios: scenarios.length,
        completedScenarios: results.filter((r) => r.status === 'completed')
          .length,
        failedScenarios: results.filter((r) => r.status === 'failed').length,
        runningScenarios: 0,
        pendingScenarios: 0,
        startedAt: batchExecution.started_at,
        completedAt: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        results,
        aggregates,
      };

      // Send observability event for batch completion
      await this.observabilityEventsService.push({
        context: ctx,
        source_app: 'prediction-runner',
        hook_event_type: 'batch.completed',
        status: 'completed',
        message: `Batch execution completed: ${summary.completedScenarios}/${summary.totalScenarios} scenarios succeeded`,
        progress: 100,
        step: 'completed',
        payload: {
          batch_id: batchId,
          summary: summary as unknown as Record<string, unknown>,
        },
        timestamp: Date.now(),
      });

      // Log completion to audit trail
      await this.testAuditLogRepository.log({
        organization_slug: ctx.orgSlug,
        user_id: ctx.userId,
        action: 'batch_execution_completed',
        resource_type: 'batch_execution',
        resource_id: batchId,
        details: {
          total_scenarios: summary.totalScenarios,
          completed_scenarios: summary.completedScenarios,
          failed_scenarios: summary.failedScenarios,
          duration_ms: summary.duration_ms,
          aggregates,
        },
      });

      this.logger.log(
        `Batch execution ${batchId} completed: ${summary.completedScenarios}/${summary.totalScenarios} succeeded in ${summary.duration_ms}ms`,
      );

      return summary;
    } catch (error) {
      // Handle batch-level failure
      const batch = this.activeBatches.get(batchId);
      if (batch) {
        batch.execution.status = 'failed';
        batch.execution.completed_at = new Date().toISOString();
      }

      // Send observability event for batch failure
      await this.observabilityEventsService.push({
        context: ctx,
        source_app: 'prediction-runner',
        hook_event_type: 'batch.failed',
        status: 'failed',
        message: `Batch execution failed: ${error instanceof Error ? error.message : String(error)}`,
        progress: 0,
        step: 'error',
        payload: {
          batch_id: batchId,
          error: error instanceof Error ? error.message : String(error),
        },
        timestamp: Date.now(),
      });

      // Log failure to audit trail
      await this.testAuditLogRepository.log({
        organization_slug: ctx.orgSlug,
        user_id: ctx.userId,
        action: 'batch_execution_failed',
        resource_type: 'batch_execution',
        resource_id: batchId,
        details: {
          error_message: error instanceof Error ? error.message : String(error),
        },
      });

      this.logger.error(
        `Batch execution ${batchId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      throw error;
    }
  }

  /**
   * Execute scenarios with concurrency control
   */
  private async executeWithConcurrency(
    scenarios: Array<{ id: string; name: string }>,
    ctx: ExecutionContext,
    batchId: string,
    concurrencyLimit: number,
    versionInfo?: Record<string, unknown>,
  ): Promise<BatchScenarioResult[]> {
    const results: BatchScenarioResult[] = [];
    const queue = [...scenarios]; // Clone array
    const running = new Map<string, Promise<void>>();

    while (queue.length > 0 || running.size > 0) {
      // Start new scenarios up to concurrency limit
      while (queue.length > 0 && running.size < concurrencyLimit) {
        const scenario = queue.shift();
        if (!scenario) break;

        const promise = this.executeScenario(
          scenario,
          ctx,
          batchId,
          versionInfo,
        ).then((result) => {
          results.push(result);
          running.delete(scenario.id);

          // Update progress
          const batch = this.activeBatches.get(batchId);
          if (batch) {
            batch.results = results;
            const progress = Math.round(
              (results.length / scenarios.length) * 100,
            );

            // Send progress event (fire-and-forget)
            this.observabilityEventsService
              .push({
                context: ctx,
                source_app: 'prediction-runner',
                hook_event_type: 'batch.progress',
                status: 'running',
                message: `Completed ${results.length}/${scenarios.length} scenarios`,
                progress,
                step: 'execution',
                payload: {
                  batch_id: batchId,
                  completed: results.length,
                  total: scenarios.length,
                },
                timestamp: Date.now(),
              })
              .catch((err: unknown) => {
                const errorMessage =
                  err instanceof Error ? err.message : String(err);
                this.logger.warn(
                  `Failed to send progress event: ${errorMessage}`,
                );
              });
          }
        });

        running.set(scenario.id, promise);
      }

      // Wait for at least one to complete
      if (running.size > 0) {
        await Promise.race(Array.from(running.values()));
      }
    }

    return results;
  }

  /**
   * Execute a single scenario within a batch
   */
  private async executeScenario(
    scenario: { id: string; name: string },
    ctx: ExecutionContext,
    batchId: string,
    versionInfo?: Record<string, unknown>,
  ): Promise<BatchScenarioResult> {
    const startTime = Date.now();
    const startedAt = new Date().toISOString();

    this.logger.debug(
      `Starting scenario ${scenario.id} (${scenario.name}) in batch ${batchId}`,
    );

    try {
      // Start the scenario run
      const run = await this.scenarioRunService.startRun(
        scenario.id,
        ctx.userId,
        {
          ...versionInfo,
          batch_id: batchId,
        },
      );

      // Execute the run
      const executionResult = await this.scenarioRunService.executeRun(run.id);

      const result: BatchScenarioResult = {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        runId: run.id,
        status: executionResult.success ? 'completed' : 'failed',
        startedAt,
        completedAt: new Date().toISOString(),
        signals_generated: executionResult.signals_generated,
        predictors_generated: executionResult.predictors_generated,
        predictions_generated: executionResult.predictions_generated,
        outcome_match: executionResult.outcome_match,
        errors: executionResult.errors,
        duration_ms: Date.now() - startTime,
      };

      this.logger.debug(
        `Completed scenario ${scenario.id} in batch ${batchId}: ${result.status}`,
      );

      return result;
    } catch (error) {
      const result: BatchScenarioResult = {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        runId: '', // No run created
        status: 'failed',
        startedAt,
        completedAt: new Date().toISOString(),
        signals_generated: 0,
        predictors_generated: 0,
        predictions_generated: 0,
        outcome_match: false,
        errors: [error instanceof Error ? error.message : String(error)],
        duration_ms: Date.now() - startTime,
      };

      this.logger.error(
        `Failed scenario ${scenario.id} in batch ${batchId}: ${error instanceof Error ? error.message : String(error)}`,
      );

      return result;
    }
  }

  /**
   * Validate that all scenarios exist and belong to the organization
   */
  private async validateScenarios(
    scenarioIds: string[],
    organizationSlug: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const scenarios = await Promise.all(
      scenarioIds.map((id) => this.testScenarioRepository.findById(id)),
    );

    const validated: Array<{ id: string; name: string }> = [];

    for (let i = 0; i < scenarioIds.length; i++) {
      const scenario = scenarios[i];
      const scenarioId = scenarioIds[i];

      if (!scenario) {
        throw new NotFoundException(`Scenario ${scenarioId} not found`);
      }

      if (scenario.organization_slug !== organizationSlug) {
        throw new Error(
          `Scenario ${scenarioId} does not belong to organization ${organizationSlug}`,
        );
      }

      validated.push({
        id: scenario.id,
        name: scenario.name,
      });
    }

    return validated;
  }

  /**
   * Calculate aggregate statistics from batch results
   */
  private calculateAggregates(
    results: BatchScenarioResult[],
  ): BatchExecutionSummary['aggregates'] {
    return {
      total_signals: results.reduce((sum, r) => sum + r.signals_generated, 0),
      total_predictors: results.reduce(
        (sum, r) => sum + r.predictors_generated,
        0,
      ),
      total_predictions: results.reduce(
        (sum, r) => sum + r.predictions_generated,
        0,
      ),
      scenarios_with_outcome_match: results.filter((r) => r.outcome_match)
        .length,
      scenarios_with_errors: results.filter((r) => r.errors.length > 0).length,
      average_duration_ms:
        results.length > 0
          ? Math.round(
              results.reduce((sum, r) => sum + r.duration_ms, 0) /
                results.length,
            )
          : 0,
    };
  }

  /**
   * Generate a unique batch ID
   */
  private generateBatchId(): string {
    return `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH STATUS AND QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the status of a batch execution
   */
  getBatchStatus(
    ctx: ExecutionContext,
    batchId: string,
  ): BatchExecutionSummary {
    const batch = this.activeBatches.get(batchId);

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    // Validate organization
    if (batch.execution.organization_slug !== ctx.orgSlug) {
      throw new Error(
        `Batch ${batchId} does not belong to organization ${ctx.orgSlug}`,
      );
    }

    const completedScenarios = batch.results.filter(
      (r) => r.status === 'completed',
    ).length;
    const failedScenarios = batch.results.filter(
      (r) => r.status === 'failed',
    ).length;
    const runningScenarios =
      batch.execution.total_scenarios - batch.results.length;

    const aggregates = this.calculateAggregates(batch.results);

    const summary: BatchExecutionSummary = {
      batchId: batch.execution.id,
      batchName: batch.execution.batch_name,
      status: batch.execution.status,
      totalScenarios: batch.execution.total_scenarios,
      completedScenarios,
      failedScenarios,
      runningScenarios,
      pendingScenarios: Math.max(
        0,
        runningScenarios - batch.execution.concurrency_limit,
      ),
      startedAt: batch.execution.started_at,
      completedAt: batch.execution.completed_at,
      duration_ms: batch.execution.completed_at
        ? new Date(batch.execution.completed_at).getTime() - batch.startTime
        : Date.now() - batch.startTime,
      results: batch.results,
      aggregates,
    };

    return summary;
  }

  /**
   * List recent batch executions for an organization
   */
  listBatches(ctx: ExecutionContext): BatchExecution[] {
    const batches = Array.from(this.activeBatches.values())
      .filter((batch) => batch.execution.organization_slug === ctx.orgSlug)
      .map((batch) => batch.execution)
      .sort((a, b) => {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return bTime - aTime; // Most recent first
      });

    return batches;
  }

  /**
   * Clean up completed batches older than the specified age (in hours)
   */
  cleanupOldBatches(maxAgeHours = 24): number {
    const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;
    let cleanedCount = 0;

    for (const [batchId, batch] of this.activeBatches.entries()) {
      if (
        (batch.execution.status === 'completed' ||
          batch.execution.status === 'failed') &&
        batch.startTime < cutoffTime
      ) {
        this.activeBatches.delete(batchId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} old batch executions`);
    }

    return cleanedCount;
  }
}

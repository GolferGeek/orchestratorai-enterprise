/**
 * Replay Test Dashboard Handler
 *
 * Handles dashboard mode requests for historical replay tests.
 * Part of Phase 8 - Historical Replay in Test Lab
 *
 * Supports:
 * - CRUD operations on replay tests
 * - Preview affected records before running
 * - Running replay tests
 * - Getting comparison results
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { HistoricalReplayService } from '../../services/historical-replay.service';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import {
  CreateReplayTestData,
  RollbackDepth,
} from '../../interfaces/test-data.interface';

interface ReplayTestParams {
  id?: string;
  page?: number;
  pageSize?: number;
}

interface PreviewParams {
  rollbackDepth: RollbackDepth;
  rollbackTo: string;
  universeId: string;
  targetIds?: string[];
}

interface CreateReplayParams {
  name: string;
  description?: string;
  rollbackDepth: RollbackDepth;
  rollbackTo: string;
  universeId: string;
  targetIds?: string[];
  config?: Record<string, unknown>;
}

@Injectable()
export class ReplayTestHandler implements IDashboardHandler {
  private readonly logger = new Logger(ReplayTestHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'create',
    'delete',
    'preview',
    'run',
    'results',
  ];

  constructor(
    private readonly historicalReplayService: HistoricalReplayService,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[REPLAY-TEST-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as
      | ReplayTestParams
      | PreviewParams
      | CreateReplayParams
      | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(context, params as ReplayTestParams);
      case 'get':
        return this.handleGet(params as ReplayTestParams);
      case 'create':
        return this.handleCreate(context, params as CreateReplayParams);
      case 'delete':
        return this.handleDelete(params as ReplayTestParams);
      case 'preview':
        return this.handlePreview(params as PreviewParams);
      case 'run':
        return this.handleRun(params as ReplayTestParams);
      case 'results':
        return this.handleResults(params as ReplayTestParams);
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

  // =============================================================================
  // CRUD Operations
  // =============================================================================

  private async handleList(
    context: ExecutionContext,
    params?: ReplayTestParams,
  ): Promise<DashboardActionResult> {
    try {
      const tests = await this.historicalReplayService.getReplayTests(
        context.orgSlug,
      );

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedTests = tests.slice(startIndex, startIndex + pageSize);

      return buildDashboardSuccess(
        paginatedTests,
        buildPaginationMetadata(tests.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list replay tests: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list replay tests',
      );
    }
  }

  private async handleGet(
    params?: ReplayTestParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Replay test ID is required');
    }

    try {
      const test = await this.historicalReplayService.getReplayTestById(
        params.id,
      );
      if (!test) {
        return buildDashboardError(
          'NOT_FOUND',
          `Replay test not found: ${params.id}`,
        );
      }

      return buildDashboardSuccess(test);
    } catch (error) {
      this.logger.error(
        `Failed to get replay test: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get replay test',
      );
    }
  }

  private async handleCreate(
    context: ExecutionContext,
    params?: CreateReplayParams,
  ): Promise<DashboardActionResult> {
    if (
      !params?.name ||
      !params?.rollbackDepth ||
      !params?.rollbackTo ||
      !params?.universeId
    ) {
      return buildDashboardError(
        'INVALID_DATA',
        'name, rollbackDepth, rollbackTo, and universeId are required',
      );
    }

    try {
      const createDto: CreateReplayTestData = {
        name: params.name,
        description: params.description,
        organization_slug: context.orgSlug,
        rollback_depth: params.rollbackDepth,
        rollback_to: params.rollbackTo,
        universe_id: params.universeId,
        target_ids: params.targetIds,
        config: params.config,
        created_by: context.userId,
      };

      const test =
        await this.historicalReplayService.createReplayTest(createDto);
      return buildDashboardSuccess(test);
    } catch (error) {
      this.logger.error(
        `Failed to create replay test: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CREATE_FAILED',
        error instanceof Error ? error.message : 'Failed to create replay test',
      );
    }
  }

  private async handleDelete(
    params?: ReplayTestParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Replay test ID is required');
    }

    try {
      await this.historicalReplayService.deleteReplayTest(params.id);
      return buildDashboardSuccess({ deleted: true, id: params.id });
    } catch (error) {
      this.logger.error(
        `Failed to delete replay test: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_FAILED',
        error instanceof Error ? error.message : 'Failed to delete replay test',
      );
    }
  }

  // =============================================================================
  // Preview & Execution
  // =============================================================================

  private async handlePreview(
    params?: PreviewParams,
  ): Promise<DashboardActionResult> {
    if (!params?.rollbackDepth || !params?.rollbackTo || !params?.universeId) {
      return buildDashboardError(
        'INVALID_DATA',
        'rollbackDepth, rollbackTo, and universeId are required',
      );
    }

    try {
      const affectedRecords =
        await this.historicalReplayService.previewAffectedRecords(
          params.rollbackDepth,
          params.rollbackTo,
          params.universeId,
          params.targetIds,
        );

      const totalRecords = affectedRecords.reduce(
        (sum, r) => sum + r.row_count,
        0,
      );

      return buildDashboardSuccess({
        rollback_depth: params.rollbackDepth,
        rollback_to: params.rollbackTo,
        universe_id: params.universeId,
        target_ids: params.targetIds,
        total_records: totalRecords,
        by_table: affectedRecords,
      });
    } catch (error) {
      this.logger.error(
        `Failed to preview affected records: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'PREVIEW_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to preview affected records',
      );
    }
  }

  private async handleRun(
    params?: ReplayTestParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Replay test ID is required');
    }

    try {
      const result = await this.historicalReplayService.runReplayTest(
        params.id,
      );
      return buildDashboardSuccess(result);
    } catch (error) {
      this.logger.error(
        `Failed to run replay test: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'RUN_FAILED',
        error instanceof Error ? error.message : 'Failed to run replay test',
      );
    }
  }

  private async handleResults(
    params?: ReplayTestParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Replay test ID is required');
    }

    try {
      const results = await this.historicalReplayService.getReplayTestResults(
        params.id,
      );

      return buildDashboardSuccess({
        replay_test_id: params.id,
        count: results.length,
        results,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get replay test results: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'RESULTS_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get replay test results',
      );
    }
  }
}

/**
 * Test Target Mirror Dashboard Handler
 *
 * Handles dashboard mode requests for test target mirrors.
 * Part of Phase 3: Test Data Management UI.
 *
 * Test target mirrors map real (production) targets to test targets.
 * This enables test data isolation while referencing real targets.
 *
 * Supports:
 * - List mirrors with optional target details
 * - Get mirror by ID, real target, or test target
 * - Create new mirrors
 * - Delete mirrors
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import {
  TestTargetMirrorRepository,
  TestTargetMirror,
  CreateTestTargetMirrorData,
} from '../../repositories/test-target-mirror.repository';
import { TargetRepository } from '../../repositories/target.repository';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';

interface TestTargetMirrorParams {
  id?: string;
  realTargetId?: string;
  testTargetId?: string;
  includeTargetDetails?: boolean;
  page?: number;
  pageSize?: number;
}

interface CreateMirrorParams {
  real_target_id: string;
  test_target_id: string;
}

interface MirrorWithTarget extends TestTargetMirror {
  real_target?: {
    id: string;
    name: string;
    symbol: string;
    universe_id: string;
    target_type: string;
  };
  test_target?: {
    id: string;
    name: string;
    symbol: string;
    universe_id: string;
    target_type: string;
  };
}

@Injectable()
export class TestTargetMirrorHandler implements IDashboardHandler {
  private readonly logger = new Logger(TestTargetMirrorHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'get-by-real-target',
    'get-by-test-target',
    'create',
    'delete',
    'list-with-targets',
  ];

  constructor(
    private readonly testTargetMirrorRepository: TestTargetMirrorRepository,
    private readonly targetRepository: TargetRepository,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[TEST-TARGET-MIRROR-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as TestTargetMirrorParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params);
      case 'get':
        return this.handleGet(params);
      case 'get-by-real-target':
      case 'getbyrealtarget':
        return this.handleGetByRealTarget(params);
      case 'get-by-test-target':
      case 'getbytesttarget':
        return this.handleGetByTestTarget(params);
      case 'create':
        return this.handleCreate(payload);
      case 'delete':
        return this.handleDelete(params);
      case 'list-with-targets':
      case 'listwithtargets':
        return this.handleListWithTargets(params);
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

  // ═══════════════════════════════════════════════════════════════════════════
  // List Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleList(
    params?: TestTargetMirrorParams,
  ): Promise<DashboardActionResult> {
    try {
      const mirrors = await this.testTargetMirrorRepository.findAll();

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 50;
      const startIndex = (page - 1) * pageSize;
      const paginatedMirrors = mirrors.slice(startIndex, startIndex + pageSize);

      return buildDashboardSuccess(
        paginatedMirrors,
        buildPaginationMetadata(mirrors.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list test target mirrors: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to list test target mirrors',
      );
    }
  }

  private async handleListWithTargets(
    params?: TestTargetMirrorParams,
  ): Promise<DashboardActionResult> {
    try {
      const mirrors = await this.testTargetMirrorRepository.findAll();

      // Enrich with target details
      const mirrorsWithTargets: MirrorWithTarget[] = await Promise.all(
        mirrors.map(async (mirror) => {
          try {
            const [realTarget, testTarget] = await Promise.all([
              this.targetRepository.findById(mirror.real_target_id),
              this.targetRepository.findById(mirror.test_target_id),
            ]);
            return {
              ...mirror,
              real_target: realTarget
                ? {
                    id: realTarget.id,
                    name: realTarget.name,
                    symbol: realTarget.symbol,
                    universe_id: realTarget.universe_id,
                    target_type: realTarget.target_type,
                  }
                : undefined,
              test_target: testTarget
                ? {
                    id: testTarget.id,
                    name: testTarget.name,
                    symbol: testTarget.symbol,
                    universe_id: testTarget.universe_id,
                    target_type: testTarget.target_type,
                  }
                : undefined,
            };
          } catch {
            // If target fetch fails, return mirror without target details
            return mirror;
          }
        }),
      );

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 50;
      const startIndex = (page - 1) * pageSize;
      const paginatedMirrors = mirrorsWithTargets.slice(
        startIndex,
        startIndex + pageSize,
      );

      return buildDashboardSuccess(
        paginatedMirrors,
        buildPaginationMetadata(mirrorsWithTargets.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list test target mirrors with targets: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_WITH_TARGETS_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to list test target mirrors with targets',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Get Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleGet(
    params?: TestTargetMirrorParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Mirror ID is required');
    }

    try {
      const mirror = await this.testTargetMirrorRepository.findById(params.id);
      if (!mirror) {
        return buildDashboardError(
          'NOT_FOUND',
          `Mirror not found: ${params.id}`,
        );
      }

      // Optionally include target details
      if (params.includeTargetDetails) {
        const [realTarget, testTarget] = await Promise.all([
          this.targetRepository.findById(mirror.real_target_id),
          this.targetRepository.findById(mirror.test_target_id),
        ]);
        const mirrorWithTarget: MirrorWithTarget = {
          ...mirror,
          real_target: realTarget
            ? {
                id: realTarget.id,
                name: realTarget.name,
                symbol: realTarget.symbol,
                universe_id: realTarget.universe_id,
                target_type: realTarget.target_type,
              }
            : undefined,
          test_target: testTarget
            ? {
                id: testTarget.id,
                name: testTarget.name,
                symbol: testTarget.symbol,
                universe_id: testTarget.universe_id,
                target_type: testTarget.target_type,
              }
            : undefined,
        };
        return buildDashboardSuccess(mirrorWithTarget);
      }

      return buildDashboardSuccess(mirror);
    } catch (error) {
      this.logger.error(
        `Failed to get test target mirror: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get test target mirror',
      );
    }
  }

  private async handleGetByRealTarget(
    params?: TestTargetMirrorParams,
  ): Promise<DashboardActionResult> {
    if (!params?.realTargetId) {
      return buildDashboardError(
        'MISSING_REAL_TARGET_ID',
        'realTargetId is required',
      );
    }

    try {
      const mirror = await this.testTargetMirrorRepository.findByRealTarget(
        params.realTargetId,
      );

      if (!mirror) {
        return buildDashboardError(
          'NOT_FOUND',
          `No mirror found for real target: ${params.realTargetId}`,
        );
      }

      return buildDashboardSuccess(mirror);
    } catch (error) {
      this.logger.error(
        `Failed to get mirror by real target: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_BY_REAL_TARGET_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get mirror by real target',
      );
    }
  }

  private async handleGetByTestTarget(
    params?: TestTargetMirrorParams,
  ): Promise<DashboardActionResult> {
    if (!params?.testTargetId) {
      return buildDashboardError(
        'MISSING_TEST_TARGET_ID',
        'testTargetId is required',
      );
    }

    try {
      const mirror = await this.testTargetMirrorRepository.findByTestTarget(
        params.testTargetId,
      );

      if (!mirror) {
        return buildDashboardError(
          'NOT_FOUND',
          `No mirror found for test target: ${params.testTargetId}`,
        );
      }

      return buildDashboardSuccess(mirror);
    } catch (error) {
      this.logger.error(
        `Failed to get mirror by test target: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_BY_TEST_TARGET_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get mirror by test target',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Create Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleCreate(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const data = payload.params as unknown as CreateMirrorParams;

    if (!data.real_target_id || !data.test_target_id) {
      return buildDashboardError(
        'INVALID_DATA',
        'real_target_id and test_target_id are required',
      );
    }

    try {
      // Verify real target exists
      const realTarget = await this.targetRepository.findById(
        data.real_target_id,
      );
      if (!realTarget) {
        return buildDashboardError(
          'REAL_TARGET_NOT_FOUND',
          `Real target not found: ${data.real_target_id}`,
        );
      }

      // Verify test target exists
      const testTarget = await this.targetRepository.findById(
        data.test_target_id,
      );
      if (!testTarget) {
        return buildDashboardError(
          'TEST_TARGET_NOT_FOUND',
          `Test target not found: ${data.test_target_id}`,
        );
      }

      // Validate test target has T_ prefix
      if (!testTarget.symbol.startsWith('T_')) {
        return buildDashboardError(
          'INVALID_TEST_TARGET',
          'test_target symbol must start with T_ prefix',
        );
      }

      // Check if mirror already exists for this real target
      const existing = await this.testTargetMirrorRepository.findByRealTarget(
        data.real_target_id,
      );
      if (existing) {
        return buildDashboardError(
          'MIRROR_EXISTS',
          `Mirror already exists for real target: ${data.real_target_id}`,
          { existing_mirror: existing },
        );
      }

      const createData: CreateTestTargetMirrorData = {
        real_target_id: data.real_target_id,
        test_target_id: data.test_target_id,
      };

      const mirror = await this.testTargetMirrorRepository.create(createData);
      return buildDashboardSuccess(mirror);
    } catch (error) {
      this.logger.error(
        `Failed to create test target mirror: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CREATE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to create test target mirror',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Delete Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleDelete(
    params?: TestTargetMirrorParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Mirror ID is required');
    }

    try {
      // Verify mirror exists
      const mirror = await this.testTargetMirrorRepository.findById(params.id);
      if (!mirror) {
        return buildDashboardError(
          'NOT_FOUND',
          `Mirror not found: ${params.id}`,
        );
      }

      await this.testTargetMirrorRepository.delete(params.id);
      return buildDashboardSuccess({
        deleted: true,
        id: params.id,
        real_target_id: mirror.real_target_id,
        test_target_id: mirror.test_target_id,
      });
    } catch (error) {
      this.logger.error(
        `Failed to delete test target mirror: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to delete test target mirror',
      );
    }
  }
}

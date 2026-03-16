/**
 * Dimension Handler
 *
 * Dashboard handler for risk dimension operations.
 * Supports listing and viewing dimensions configured for a scope.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import { DimensionRepository } from '../../repositories/dimension.repository';

@Injectable()
export class DimensionHandler implements IDashboardHandler {
  private readonly logger = new Logger(DimensionHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'getBySlug',
    'by-slug',
    'create',
    'update',
    'delete',
  ];

  constructor(private readonly dimensionRepo: DimensionRepository) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    _context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(`Executing dimension action: ${action}`);

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(payload);
      case 'get':
        return this.handleGet(payload);
      case 'getbyslug':
      case 'by-slug':
        return this.handleGetBySlug(payload);
      case 'create':
        return this.handleCreate(payload);
      case 'update':
        return this.handleUpdate(payload);
      case 'delete':
        return this.handleDelete(payload);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported dimension action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  /**
   * List all dimensions for a scope
   */
  private async handleList(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;

    if (!scopeId) {
      return buildDashboardError('MISSING_SCOPE_ID', 'Scope ID is required');
    }

    const includeTest = params?.includeTest as boolean | undefined;
    const testScenarioId = params?.testScenarioId as string | undefined;

    const dimensions = await this.dimensionRepo.findByScope(scopeId, {
      includeTest,
      testScenarioId,
    });

    // Apply pagination
    const page = payload.pagination?.page ?? 1;
    const pageSize = payload.pagination?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const paginatedDimensions = dimensions.slice(start, start + pageSize);

    return buildDashboardSuccess(
      paginatedDimensions,
      buildPaginationMetadata(dimensions.length, page, pageSize),
    );
  }

  /**
   * Get a specific dimension by ID
   */
  private async handleGet(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Dimension ID is required');
    }

    const dimension = await this.dimensionRepo.findById(id);

    if (!dimension) {
      return buildDashboardError('NOT_FOUND', `Dimension not found: ${id}`);
    }

    return buildDashboardSuccess(dimension);
  }

  /**
   * Get a dimension by slug within a scope
   */
  private async handleGetBySlug(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;
    const slug = params?.slug as string | undefined;

    if (!scopeId) {
      return buildDashboardError('MISSING_SCOPE_ID', 'Scope ID is required');
    }

    if (!slug) {
      return buildDashboardError('MISSING_SLUG', 'Dimension slug is required');
    }

    const dimension = await this.dimensionRepo.findBySlug(scopeId, slug);

    if (!dimension) {
      return buildDashboardError(
        'NOT_FOUND',
        `Dimension not found with slug: ${slug}`,
      );
    }

    return buildDashboardSuccess(dimension);
  }

  /**
   * Create a new dimension
   */
  private async handleCreate(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const data = (payload.params as Record<string, unknown>) ?? {};

    if (!data.scope_id && !data.scopeId) {
      return buildDashboardError('MISSING_SCOPE_ID', 'Scope ID is required');
    }

    if (!data.slug) {
      return buildDashboardError('MISSING_SLUG', 'Dimension slug is required');
    }

    if (!data.name) {
      return buildDashboardError('MISSING_NAME', 'Dimension name is required');
    }

    try {
      const dimension = await this.dimensionRepo.create({
        scope_id: (data.scope_id || data.scopeId) as string,
        slug: data.slug as string,
        name: data.name as string,
        description: data.description as string | undefined,
        weight: (data.weight as number) ?? 1.0,
        display_order: (data.display_order ?? data.displayOrder) as
          | number
          | undefined,
        is_active: (data.is_active ?? data.isActive ?? true) as boolean,
        is_test: (data.is_test ?? data.isTest ?? false) as boolean,
        test_scenario_id: (data.test_scenario_id ?? data.testScenarioId) as
          | string
          | undefined,
      });

      return buildDashboardSuccess(dimension, {
        message: `Created dimension: ${dimension.name}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create dimension: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CREATE_FAILED',
        error instanceof Error ? error.message : 'Failed to create dimension',
      );
    }
  }

  /**
   * Update an existing dimension
   */
  private async handleUpdate(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Dimension ID is required');
    }

    const data = { ...params };
    delete data.id;

    try {
      const dimension = await this.dimensionRepo.update(id, {
        slug: data.slug as string | undefined,
        name: data.name as string | undefined,
        description: data.description as string | undefined,
        weight: data.weight as number | undefined,
        display_order: (data.display_order ?? data.displayOrder) as
          | number
          | undefined,
        is_active: (data.is_active ?? data.isActive) as boolean | undefined,
      });

      return buildDashboardSuccess(dimension, {
        message: `Updated dimension: ${dimension.name}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to update dimension: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'UPDATE_FAILED',
        error instanceof Error ? error.message : 'Failed to update dimension',
      );
    }
  }

  /**
   * Delete a dimension
   */
  private async handleDelete(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Dimension ID is required');
    }

    try {
      await this.dimensionRepo.delete(id);
      return buildDashboardSuccess(
        { deleted: true, id },
        { message: `Deleted dimension: ${id}` },
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete dimension: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_FAILED',
        error instanceof Error ? error.message : 'Failed to delete dimension',
      );
    }
  }
}

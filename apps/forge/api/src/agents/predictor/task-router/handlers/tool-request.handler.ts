/**
 * Tool Request Dashboard Handler
 *
 * Handles dashboard mode requests for tool/source requests.
 * Tool requests are a wishlist of sources suggested from missed opportunity analysis.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { ToolRequestService } from '../../services/tool-request.service';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import type {
  ToolRequest,
  CreateToolRequestData,
  ToolRequestType,
  ToolRequestPriority,
  ToolRequestStatus,
} from '../../interfaces/tool-request.interface';

interface ToolRequestFilters {
  universeId?: string;
  status?: string;
  type?: string;
  priority?: string;
}

interface ToolRequestParams {
  id?: string;
  universeId?: string;
  filters?: ToolRequestFilters;
  page?: number;
  pageSize?: number;
}

interface CreateToolRequestParams {
  universe_id: string;
  missed_opportunity_id?: string;
  type: string;
  name: string;
  description: string;
  rationale: string;
  suggested_url?: string;
  suggested_config?: Record<string, unknown>;
  priority?: string;
  status?: string;
}

interface UpdateStatusData {
  id: string;
  status: ToolRequestStatus;
  notes?: string;
}

@Injectable()
export class ToolRequestHandler implements IDashboardHandler {
  private readonly logger = new Logger(ToolRequestHandler.name);
  private readonly supportedActions = ['list', 'get', 'create', 'updateStatus'];

  constructor(private readonly toolRequestService: ToolRequestService) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[TOOL-REQUEST-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as ToolRequestParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params);
      case 'get':
        return this.handleGet(params);
      case 'create':
        return this.handleCreate(payload, context);
      case 'updatestatus':
      case 'update-status':
        return this.handleUpdateStatus(payload, context);
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

  private async handleList(
    params?: ToolRequestParams,
  ): Promise<DashboardActionResult> {
    try {
      const universeId = params?.universeId || params?.filters?.universeId;
      const status = params?.filters?.status as ToolRequestStatus | undefined;

      // Get requests - use findByStatus if status filter is provided, otherwise findAll
      let requests: ToolRequest[];
      if (status) {
        requests = await this.toolRequestService.findByStatus(
          status,
          universeId,
        );
      } else {
        requests = await this.toolRequestService.findAll(universeId);
      }

      // Apply additional filters (status already applied above if provided)
      let filtered = requests;

      if (params?.filters?.type) {
        filtered = filtered.filter((r) => r.type === params.filters!.type);
      }

      if (params?.filters?.priority) {
        filtered = filtered.filter(
          (r) => r.priority === params.filters!.priority,
        );
      }

      // Sort by priority and created date
      filtered.sort((a, b) => {
        const priorityOrder: Record<string, number> = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3,
        };
        const priorityA = priorityOrder[a.priority] ?? 2;
        const priorityB = priorityOrder[b.priority] ?? 2;

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedRequests = filtered.slice(
        startIndex,
        startIndex + pageSize,
      );

      return buildDashboardSuccess(
        paginatedRequests,
        buildPaginationMetadata(filtered.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list tool requests: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list tool requests',
      );
    }
  }

  private async handleGet(
    params?: ToolRequestParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Tool request ID is required');
    }

    try {
      const request = await this.toolRequestService.findById(params.id);
      if (!request) {
        return buildDashboardError(
          'NOT_FOUND',
          `Tool request not found: ${params.id}`,
        );
      }

      return buildDashboardSuccess(request);
    } catch (error) {
      this.logger.error(
        `Failed to get tool request: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get tool request',
      );
    }
  }

  private async handleCreate(
    payload: DashboardRequestPayload,
    _context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const data = payload.params as unknown as CreateToolRequestParams;

    if (
      !data.universe_id ||
      !data.name ||
      !data.description ||
      !data.rationale ||
      !data.type
    ) {
      return buildDashboardError(
        'INVALID_DATA',
        'universe_id, name, description, rationale, and type are required',
      );
    }

    try {
      const createData: CreateToolRequestData = {
        universe_id: data.universe_id,
        missed_opportunity_id: data.missed_opportunity_id,
        type: data.type as ToolRequestType,
        name: data.name,
        description: data.description,
        rationale: data.rationale,
        suggested_url: data.suggested_url,
        suggested_config: data.suggested_config,
        priority: (data.priority as ToolRequestPriority) || 'medium',
        status: (data.status as ToolRequestStatus) || 'wishlist',
      };

      const request = await this.toolRequestService.create(createData);
      return buildDashboardSuccess(request);
    } catch (error) {
      this.logger.error(
        `Failed to create tool request: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CREATE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to create tool request',
      );
    }
  }

  /**
   * Update tool request status
   * Tracks progress from wishlist -> planned -> in_progress -> done/rejected
   */
  private async handleUpdateStatus(
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const data = payload.params as unknown as UpdateStatusData;

    if (!data.id || !data.status) {
      return buildDashboardError('INVALID_DATA', 'id and status are required');
    }

    try {
      const validStatuses: ToolRequestStatus[] = [
        'wishlist',
        'planned',
        'in_progress',
        'done',
        'rejected',
      ];
      if (!validStatuses.includes(data.status)) {
        return buildDashboardError(
          'INVALID_STATUS',
          `Invalid status: ${data.status}. Must be one of: ${validStatuses.join(', ')}`,
        );
      }

      const request = await this.toolRequestService.updateStatus(
        data.id,
        data.status,
        context.userId,
        data.notes,
      );

      return buildDashboardSuccess({
        request,
        message: `Tool request status updated to ${data.status}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to update tool request status: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'UPDATE_STATUS_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to update tool request status',
      );
    }
  }
}

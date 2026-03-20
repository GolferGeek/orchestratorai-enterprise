/**
 * Audit Log Dashboard Handler
 *
 * Sprint 7 Task s7-4: Create audit-log.handler
 * PRD Phase 8.3: Audit Log Dashboard
 *
 * Handles dashboard mode requests for audit logs.
 * Provides read-only access to system audit trail.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '../../../shared/types/forge-types';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: { message: string } | null;
};

interface AuditLogFilters {
  action?: string;
  resourceType?: string;
  resourceId?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}

interface AuditLogParams {
  id?: string;
  filters?: AuditLogFilters;
  page?: number;
  pageSize?: number;
}

interface AuditLogRecord {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  user_id: string | null;
  org_slug: string | null;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class AuditLogHandler implements IDashboardHandler {
  private readonly logger = new Logger(AuditLogHandler.name);
  private readonly schema = 'prediction';
  private readonly supportedActions = ['list', 'get', 'summary'];

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[AUDIT-LOG-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as AuditLogParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params, context);
      case 'get':
        return this.handleGet(params);
      case 'summary':
        return this.handleSummary(params);
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
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleList(
    params: AuditLogParams | undefined,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    try {
      let query = this.db
        .from(this.schema, 'audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply org filter if available
      if (context.orgSlug) {
        query = query.eq('org_slug', context.orgSlug);
      }

      // Apply filters
      if (params?.filters?.action) {
        query = query.eq('action', params.filters.action);
      }

      if (params?.filters?.resourceType) {
        query = query.eq('resource_type', params.filters.resourceType);
      }

      if (params?.filters?.resourceId) {
        query = query.eq('resource_id', params.filters.resourceId);
      }

      if (params?.filters?.userId) {
        query = query.eq('user_id', params.filters.userId);
      }

      if (params?.filters?.startDate) {
        query = query.gte('created_at', params.filters.startDate);
      }

      if (params?.filters?.endDate) {
        query = query.lte('created_at', params.filters.endDate);
      }

      // Pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 50;
      const offset = (page - 1) * pageSize;

      query = query.range(offset, offset + pageSize - 1);

      const { data, error } =
        (await query) as SupabaseSelectListResponse<AuditLogRecord>;

      if (error) {
        this.logger.error(`Failed to list audit logs: ${error.message}`);
        return buildDashboardError('LIST_FAILED', error.message);
      }

      // Get total count for pagination
      let countQuery = this.db
        .from(this.schema, 'audit_logs')
        .select('id', { count: 'exact', head: true });

      if (context.orgSlug) {
        countQuery = countQuery.eq('org_slug', context.orgSlug);
      }

      const { count } = await countQuery;

      return buildDashboardSuccess(
        data ?? [],
        buildPaginationMetadata(count ?? 0, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list audit logs: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list audit logs',
      );
    }
  }

  private async handleGet(
    params: AuditLogParams | undefined,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Audit log ID is required');
    }

    try {
      const { data, error } = (await this.db
        .from(this.schema, 'audit_logs')
        .select('*')
        .eq('id', params.id)
        .single()) as SupabaseSelectResponse<AuditLogRecord>;

      if (error) {
        this.logger.error(`Failed to get audit log: ${error.message}`);
        return buildDashboardError(
          'NOT_FOUND',
          `Audit log not found: ${params.id}`,
        );
      }

      return buildDashboardSuccess(data);
    } catch (error) {
      this.logger.error(
        `Failed to get audit log: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get audit log',
      );
    }
  }

  private async handleSummary(
    params: AuditLogParams | undefined,
  ): Promise<DashboardActionResult> {
    try {
      // Get counts by action type
      const { data: logs, error } = (await this.db
        .from(this.schema, 'audit_logs')
        .select(
          'action, resource_type, created_at',
        )) as SupabaseSelectListResponse<{
        action: string;
        resource_type: string;
        created_at: string;
      }>;

      if (error) {
        this.logger.error(`Failed to get audit log summary: ${error.message}`);
        return buildDashboardError('SUMMARY_FAILED', error.message);
      }

      const allLogs = logs ?? [];

      // Calculate time range
      const startDate = params?.filters?.startDate
        ? new Date(params.filters.startDate)
        : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default 24 hours

      const filteredLogs = allLogs.filter(
        (log) => new Date(log.created_at) >= startDate,
      );

      // Count by action
      const byAction: Record<string, number> = {};
      for (const log of filteredLogs) {
        byAction[log.action] = (byAction[log.action] || 0) + 1;
      }

      // Count by resource type
      const byResourceType: Record<string, number> = {};
      for (const log of filteredLogs) {
        byResourceType[log.resource_type] =
          (byResourceType[log.resource_type] || 0) + 1;
      }

      // Count by hour
      const byHour: Record<string, number> = {};
      for (const log of filteredLogs) {
        const hour = log.created_at.slice(0, 13); // YYYY-MM-DDTHH
        byHour[hour] = (byHour[hour] || 0) + 1;
      }

      return buildDashboardSuccess({
        totalLogs: filteredLogs.length,
        timeRange: {
          start: startDate.toISOString(),
          end: new Date().toISOString(),
        },
        byAction,
        byResourceType,
        byHour,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get audit log summary: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'SUMMARY_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get audit log summary',
      );
    }
  }
}

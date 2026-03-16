/**
 * Dashboard Handler Interface
 * Defines the contract for prediction dashboard mode handlers
 */

import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';

/**
 * Result from a dashboard action
 */
export interface DashboardActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  metadata?: {
    totalCount?: number;
    page?: number;
    pageSize?: number;
    hasMore?: boolean;
  };
}

/**
 * Dashboard handler interface
 * Each entity handler implements this interface
 */
export interface IDashboardHandler {
  /**
   * Execute a dashboard action
   * @param action - The action to perform (e.g., 'list', 'get', 'create', 'update', 'delete')
   * @param payload - The request payload with params, filters, pagination
   * @param context - ExecutionContext capsule
   */
  execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult>;

  /**
   * Get supported actions for this handler
   */
  getSupportedActions(): string[];
}

/**
 * Dashboard handler dependencies interface
 * Services required by dashboard handlers
 */
export type DashboardHandlerDependencies = Record<string, unknown>;

/**
 * Helper to build a successful dashboard response
 */
export function buildDashboardSuccess<T>(
  data: T,
  metadata?: DashboardActionResult['metadata'],
): DashboardActionResult<T> {
  return {
    success: true,
    data,
    metadata,
  };
}

/**
 * Helper to build a failed dashboard response
 */
export function buildDashboardError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): DashboardActionResult<never> {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}

/**
 * Helper to build paginated metadata
 */
export function buildPaginationMetadata(
  totalCount: number,
  page?: number,
  pageSize?: number,
): DashboardActionResult['metadata'] {
  const effectivePage = page ?? 1;
  const effectivePageSize = pageSize ?? 20;
  const hasMore = totalCount > effectivePage * effectivePageSize;

  return {
    totalCount,
    page: effectivePage,
    pageSize: effectivePageSize,
    hasMore,
  };
}

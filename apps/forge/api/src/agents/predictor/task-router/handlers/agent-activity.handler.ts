/**
 * Agent Activity Dashboard Handler
 *
 * Phase 3 - Analyst Motivation System: Agent Self-Modification Notifications
 *
 * Handles dashboard mode requests for agent activity (self-modifications).
 * This is the HITL informational feed - notifications only, no approval required.
 * Users can view and acknowledge agent modifications to maintain full visibility
 * into what the agent fork is doing autonomously.
 *
 * Actions:
 * - list: Get all agent modifications with filtering
 * - get: Get a single modification by ID
 * - acknowledge: Mark a modification as acknowledged (info only)
 * - stats: Get summary statistics of agent activity
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { PortfolioRepository } from '../../repositories/portfolio.repository';
import { AnalystRepository } from '../../repositories/analyst.repository';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import type {
  AgentSelfModificationLog,
  ModificationType,
} from '../../interfaces/portfolio.interface';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AgentActivityFilters {
  analystId?: string;
  modificationType?: ModificationType;
  acknowledged?: boolean;
  startDate?: string;
  endDate?: string;
}

interface AgentActivityParams {
  id?: string;
  filters?: AgentActivityFilters;
  page?: number;
  pageSize?: number;
}

interface AgentActivityStats {
  total: number;
  unacknowledged: number;
  byType: Record<ModificationType, number>;
  byAnalyst: Record<string, { name: string; count: number }>;
  recentActivity: AgentSelfModificationLog[];
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class AgentActivityHandler implements IDashboardHandler {
  private readonly logger = new Logger(AgentActivityHandler.name);
  private readonly supportedActions = ['list', 'get', 'acknowledge', 'stats'];

  constructor(
    private readonly portfolioRepository: PortfolioRepository,
    private readonly analystRepository: AnalystRepository,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[AGENT-ACTIVITY-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as AgentActivityParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(params);
      case 'get':
        return this.handleGet(params);
      case 'acknowledge':
        return this.handleAcknowledge(params);
      case 'stats':
        return this.handleStats();
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

  /**
   * List agent modifications with filtering and pagination
   */
  private async handleList(
    params?: AgentActivityParams,
  ): Promise<DashboardActionResult> {
    try {
      // Get all modifications (we'll filter in memory for now)
      // In a production system, you'd want to add filters to the repository
      const modifications =
        await this.portfolioRepository.getUnacknowledgedModifications();

      // Get all analysts for enrichment
      const analysts = await this.analystRepository.getActive();
      const analystMap = new Map(analysts.map((a) => [a.id, a]));

      // Enrich with analyst info
      const enriched = modifications.map((mod) => ({
        ...mod,
        analyst_name: analystMap.get(mod.analyst_id)?.name ?? 'Unknown',
        analyst_slug: analystMap.get(mod.analyst_id)?.slug ?? 'unknown',
      }));

      // Apply filters
      let filtered = enriched;

      if (params?.filters?.analystId) {
        filtered = filtered.filter(
          (m) => m.analyst_id === params.filters!.analystId,
        );
      }

      if (params?.filters?.modificationType) {
        filtered = filtered.filter(
          (m) => m.modification_type === params.filters!.modificationType,
        );
      }

      if (params?.filters?.acknowledged !== undefined) {
        filtered = filtered.filter(
          (m) => m.acknowledged === params.filters!.acknowledged,
        );
      }

      if (params?.filters?.startDate) {
        const start = new Date(params.filters.startDate);
        filtered = filtered.filter((m) => new Date(m.created_at) >= start);
      }

      if (params?.filters?.endDate) {
        const end = new Date(params.filters.endDate);
        filtered = filtered.filter((m) => new Date(m.created_at) <= end);
      }

      // Sort by created_at descending (most recent first)
      filtered.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      // Pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedItems = filtered.slice(startIndex, startIndex + pageSize);

      return buildDashboardSuccess(
        paginatedItems,
        buildPaginationMetadata(filtered.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list agent activity: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to list agent activity',
      );
    }
  }

  /**
   * Get a single modification by ID
   */
  private async handleGet(
    params?: AgentActivityParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Modification ID is required');
    }

    try {
      // Get all unacknowledged modifications and find the one we want
      // In production, you'd add a findById method to the repository
      const modifications =
        await this.portfolioRepository.getUnacknowledgedModifications();
      const modification = modifications.find((m) => m.id === params.id);

      if (!modification) {
        return buildDashboardError(
          'NOT_FOUND',
          `Modification not found: ${params.id}`,
        );
      }

      // Enrich with analyst info
      const analyst = await this.analystRepository.findById(
        modification.analyst_id,
      );

      return buildDashboardSuccess({
        ...modification,
        analyst_name: analyst?.name ?? 'Unknown',
        analyst_slug: analyst?.slug ?? 'unknown',
      });
    } catch (error) {
      this.logger.error(
        `Failed to get modification: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get modification',
      );
    }
  }

  /**
   * Acknowledge a modification (informational only - no approval)
   */
  private async handleAcknowledge(
    params?: AgentActivityParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Modification ID is required');
    }

    try {
      await this.portfolioRepository.acknowledgeModification(params.id);

      return buildDashboardSuccess({
        id: params.id,
        acknowledged: true,
        message: 'Modification acknowledged',
      });
    } catch (error) {
      this.logger.error(
        `Failed to acknowledge modification: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'ACKNOWLEDGE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to acknowledge modification',
      );
    }
  }

  /**
   * Get summary statistics of agent activity
   */
  private async handleStats(): Promise<DashboardActionResult> {
    try {
      const modifications =
        await this.portfolioRepository.getUnacknowledgedModifications();

      // Get all analysts for enrichment
      const analysts = await this.analystRepository.getActive();
      const analystMap = new Map(analysts.map((a) => [a.id, a]));

      // Calculate stats
      const byType: Record<string, number> = {};
      const byAnalyst: Record<string, { name: string; count: number }> = {};

      for (const mod of modifications) {
        // Count by type
        byType[mod.modification_type] =
          (byType[mod.modification_type] || 0) + 1;

        // Count by analyst
        if (!byAnalyst[mod.analyst_id]) {
          const analyst = analystMap.get(mod.analyst_id);
          byAnalyst[mod.analyst_id] = {
            name: analyst?.name ?? 'Unknown',
            count: 0,
          };
        }
        const analystEntry = byAnalyst[mod.analyst_id];
        if (analystEntry) {
          analystEntry.count++;
        }
      }

      // Get recent activity (last 10)
      const recentActivity = modifications
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 10)
        .map((mod) => ({
          ...mod,
          analyst_name: analystMap.get(mod.analyst_id)?.name ?? 'Unknown',
        }));

      const stats: AgentActivityStats = {
        total: modifications.length,
        unacknowledged: modifications.filter((m) => !m.acknowledged).length,
        byType: byType as Record<ModificationType, number>,
        byAnalyst,
        recentActivity,
      };

      return buildDashboardSuccess(stats);
    } catch (error) {
      this.logger.error(
        `Failed to get agent activity stats: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'STATS_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get agent activity stats',
      );
    }
  }
}

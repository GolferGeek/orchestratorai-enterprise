/**
 * Risk Runner Service (Dashboard Adapter)
 *
 * Entry point for the risk runner agent in Forge.
 * Forge is dashboard-only — routes dashboard requests to RiskDashboardRouter.
 * Processing and batch runners live in Pulse (internal ambient automation).
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '../shared/types/forge-types';
import { RiskDashboardRouter } from './task-router/risk-dashboard.router';

export interface RiskRunnerInput {
  context: ExecutionContext;
  userMessage?: string;
  mode?: string;
  action?: string;
  payload?: DashboardRequestPayload;
}

export interface RiskRunnerResult {
  status: 'completed' | 'failed';
  response?: unknown;
  error?: string;
  duration: number;
}

@Injectable()
export class RiskRunnerService {
  private readonly logger = new Logger(RiskRunnerService.name);

  constructor(
    private readonly dashboardRouter: RiskDashboardRouter,
  ) {}

  /**
   * Primary entry point for the risk runner agent in Forge.
   * Dashboard mode only — processing happens in Pulse.
   */
  async process(input: RiskRunnerInput): Promise<RiskRunnerResult> {
    const startTime = Date.now();
    const { context, action, payload, mode } = input;

    this.logger.log(
      `[RISK-RUNNER] process() - mode: ${mode}, action: ${action}, org: ${context.orgSlug}`,
    );

    try {
      // Dashboard mode: route through the dashboard router
      if (mode === 'dashboard' && action && payload) {
        const result = await this.dashboardRouter.route(action, payload, context);
        return {
          status: result.success ? 'completed' : 'failed',
          response: result.success ? result.content : undefined,
          error: result.error?.message,
          duration: Date.now() - startTime,
        };
      }

      // Default: return agent info
      return {
        status: 'completed',
        response: {
          agent: 'investment-risk-agent',
          capabilities: ['dashboard'],
          note: 'Processing and runners have moved to Pulse (port 6500)',
          dashboardEntities: this.dashboardRouter.getSupportedEntities(),
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error(
        `[RISK-RUNNER] Error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      };
    }
  }
}

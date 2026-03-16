/**
 * Runner Handler (Dashboard Proxy)
 *
 * Runner execution has moved to Pulse (internal ambient automation).
 * This handler proxies runner trigger requests from the Forge dashboard
 * to Pulse's A2A endpoint.
 *
 * Actions:
 * - runner.fetchPrices: Proxy to Pulse predictor runner
 * - runner.createBaselines: Proxy to Pulse predictor runner
 * - runner.processArticles: Proxy to Pulse predictor runner
 * - runner.resolveOutcomes: Proxy to Pulse predictor runner
 * - runner.status: Returns runner availability info
 * - runner.runAll: Proxy to Pulse predictor runner
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '../../../shared/types/forge-types';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
} from '../dashboard-handler.interface';

@Injectable()
export class RunnerHandler implements IDashboardHandler {
  private readonly logger = new Logger(RunnerHandler.name);
  private readonly supportedActions = [
    'fetchPrices',
    'createBaselines',
    'resolveOutcomes',
    'processArticles',
    'status',
    'runAll',
  ];

  private readonly pulsePort = process.env['PULSE_API_PORT'] ?? '6500';

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[RUNNER-HANDLER] Proxying action: ${action} to Pulse for org: ${context.orgSlug}`,
    );

    if (action.toLowerCase() === 'status') {
      return buildDashboardSuccess({
        action: 'status',
        message: 'Runners execute in Pulse (internal ambient automation)',
        pulsePort: this.pulsePort,
        availableRunners: this.supportedActions.filter((a) => a !== 'status'),
      });
    }

    if (!this.supportedActions.includes(action)) {
      return buildDashboardError(
        'UNSUPPORTED_ACTION',
        `Unsupported action: ${action}`,
        { supportedActions: this.supportedActions },
      );
    }

    // Proxy to Pulse via internal A2A
    return this.proxyToPulse(action, payload, context);
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  /**
   * Proxy runner request to Pulse's predictor service via A2A.
   */
  private async proxyToPulse(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const a2aRequest = {
      jsonrpc: '2.0' as const,
      id: `runner-proxy-${Date.now()}`,
      method: 'runner.execute',
      params: {
        context,
        mode: 'runner',
        userMessage: `Dashboard trigger: ${action}`,
        payload: {
          ...payload,
          action,
        },
      },
    };

    const targetUrl = `http://localhost:${this.pulsePort}/agent-to-agent/internal/tasks`;

    try {
      const serviceKey = process.env['INTERNAL_SERVICE_KEY'];
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (serviceKey) {
        headers['x-internal-service-key'] = serviceKey;
      }

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(a2aRequest),
      });

      const responseData = (await response.json()) as Record<string, unknown>;

      if (response.ok) {
        return buildDashboardSuccess({
          action,
          proxiedTo: 'pulse',
          result: responseData,
        });
      }

      return buildDashboardError(
        'PULSE_RUNNER_FAILED',
        `Pulse runner returned error for ${action}`,
        { pulseResponse: responseData },
      );
    } catch (error) {
      this.logger.error(
        `Failed to proxy runner "${action}" to Pulse: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return buildDashboardError(
        'PULSE_UNAVAILABLE',
        `Could not reach Pulse API at port ${this.pulsePort}. Ensure Pulse is running.`,
        { action },
      );
    }
  }
}

/**
 * Risk Runner Service (Enterprise Adapter)
 *
 * Entry point for the risk runner agent in the enterprise Forge API.
 * Routes dashboard requests to RiskDashboardRouter and runner requests
 * to individual cron runners.
 *
 * This service is registered in the LanggraphAgentRunnerService serviceRegistry
 * so the A2A gateway can invoke it by agent slug.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext, DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { RiskDashboardRouter, DashboardRouterResponse } from './task-router/risk-dashboard.router';
import { RiskAnalysisRunner } from './runners/risk-analysis.runner';
import { RiskEvaluationRunner } from './runners/risk-evaluation.runner';
import { RiskLearningRunner } from './runners/risk-learning.runner';
import { RiskAlertRunner } from './runners/risk-alert.runner';

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
    private readonly analysisRunner: RiskAnalysisRunner,
    private readonly evaluationRunner: RiskEvaluationRunner,
    private readonly learningRunner: RiskLearningRunner,
    private readonly alertRunner: RiskAlertRunner,
  ) {}

  /**
   * Primary entry point for the risk runner agent.
   * Called by LanggraphAgentRunnerService when the agent slug matches.
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

      // Runner trigger mode: manually trigger a specific runner
      if (mode === 'runner' && action) {
        return this.triggerRunner(action, startTime);
      }

      // Default: return agent info
      return {
        status: 'completed',
        response: {
          agent: 'investment-risk-agent',
          capabilities: ['dashboard', 'runner'],
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

  /**
   * Manually trigger a specific runner
   */
  private async triggerRunner(
    runnerName: string,
    startTime: number,
  ): Promise<RiskRunnerResult> {
    switch (runnerName) {
      case 'analysis':
        await this.analysisRunner.runBatchAnalysis();
        break;
      case 'evaluation':
        await this.evaluationRunner.runEvaluationBatch();
        break;
      case 'learning':
        await this.learningRunner.runLearningBatch();
        break;
      case 'alert':
        await this.alertRunner.runBatchAlertCheck();
        break;
      default:
        return {
          status: 'failed',
          error: `Unknown runner: ${runnerName}. Available: analysis, evaluation, learning, alert`,
          duration: Date.now() - startTime,
        };
    }

    return {
      status: 'completed',
      response: { triggered: runnerName },
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Predictor Service (Enterprise Adapter)
 *
 * Entry point for the prediction runner agent in the enterprise Forge API.
 * Routes dashboard requests to PredictionDashboardRouter and runner requests
 * to individual cron runners.
 *
 * This service is registered in the LanggraphAgentRunnerService serviceRegistry
 * so the A2A gateway can invoke it by agent slug.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext, DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { PredictionDashboardRouter, DashboardRouterResponse } from './task-router/prediction-dashboard.router';
import { SignalGeneratorRunner } from './runners/signal-generator.runner';
import { BatchPredictionGeneratorRunner } from './runners/batch-prediction-generator.runner';
import { OutcomeTrackingRunner } from './runners/outcome-tracking.runner';
import { EvaluationRunner } from './runners/evaluation.runner';

export interface PredictorInput {
  context: ExecutionContext;
  userMessage?: string;
  mode?: string;
  action?: string;
  payload?: DashboardRequestPayload;
}

export interface PredictorResult {
  status: 'completed' | 'failed';
  response?: unknown;
  error?: string;
  duration: number;
}

@Injectable()
export class PredictorService {
  private readonly logger = new Logger(PredictorService.name);

  constructor(
    private readonly dashboardRouter: PredictionDashboardRouter,
    private readonly signalGeneratorRunner: SignalGeneratorRunner,
    private readonly batchPredictionRunner: BatchPredictionGeneratorRunner,
    private readonly outcomeTrackingRunner: OutcomeTrackingRunner,
    private readonly evaluationRunner: EvaluationRunner,
  ) {}

  /**
   * Primary entry point for the prediction agent.
   * Called by LanggraphAgentRunnerService when the agent slug matches.
   */
  async process(input: PredictorInput): Promise<PredictorResult> {
    const startTime = Date.now();
    const { context, action, payload, mode } = input;

    this.logger.log(
      `[PREDICTOR] process() - mode: ${mode}, action: ${action}, org: ${context.orgSlug}`,
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
        return this.triggerRunner(action, startTime, payload);
      }

      // Default: return agent info
      return {
        status: 'completed',
        response: {
          agent: 'us-tech-stocks',
          capabilities: ['dashboard', 'runner'],
          dashboardEntities: this.dashboardRouter.getSupportedEntities(),
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error(
        `[PREDICTOR] Error: ${error instanceof Error ? error.message : String(error)}`,
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
    payload?: DashboardRequestPayload,
  ): Promise<PredictorResult> {
    switch (runnerName) {
      case 'signal-generator':
        await this.signalGeneratorRunner.generatePredictorsForAllTargets();
        break;
      case 'batch-prediction':
        await this.batchPredictionRunner.runBatchGeneration();
        break;
      case 'outcome-tracking':
        await this.outcomeTrackingRunner.runOutcomeTracking();
        break;
      case 'evaluation':
        await this.evaluationRunner.runEvaluationBatch();
        break;

      // Event-driven runners (triggered by Pulse DB watchers)
      case 'process-article': {
        const articleId = this.extractArticleId(payload);
        if (!articleId) {
          return {
            status: 'failed',
            error: 'process-article requires articleId in payload or event.new.id',
            duration: Date.now() - startTime,
          };
        }
        const result = await this.signalGeneratorRunner.processArticleById(articleId);
        return {
          status: 'completed',
          response: { triggered: runnerName, articleId, ...result },
          duration: Date.now() - startTime,
        };
      }
      case 'evaluate-predictor': {
        const predictorId = this.extractPredictorId(payload);
        if (!predictorId) {
          return {
            status: 'failed',
            error: 'evaluate-predictor requires predictorId in payload or event.new.id',
            duration: Date.now() - startTime,
          };
        }
        const result = await this.batchPredictionRunner.evaluatePredictorForImmediatePrediction(predictorId);
        return {
          status: 'completed',
          response: { triggered: runnerName, predictorId, ...result },
          duration: Date.now() - startTime,
        };
      }

      default:
        return {
          status: 'failed',
          error: `Unknown runner: ${runnerName}. Available: signal-generator, batch-prediction, outcome-tracking, evaluation, process-article, evaluate-predictor`,
          duration: Date.now() - startTime,
        };
    }

    return {
      status: 'completed',
      response: { triggered: runnerName },
      duration: Date.now() - startTime,
    };
  }

  /**
   * Extract article ID from payload — supports both direct and DB event formats.
   * Direct: { articleId: '...' }
   * DB event: { event: { new: { id: '...' } } }
   */
  private extractArticleId(payload?: DashboardRequestPayload): string | null {
    if (!payload) return null;
    const p = payload as unknown as Record<string, unknown>;
    if (typeof p.articleId === 'string') return p.articleId;
    const event = p.event as Record<string, unknown> | undefined;
    const newRow = event?.new as Record<string, unknown> | undefined;
    if (typeof newRow?.id === 'string') return newRow.id;
    return null;
  }

  /**
   * Extract predictor ID from payload — supports both direct and DB event formats.
   */
  private extractPredictorId(payload?: DashboardRequestPayload): string | null {
    if (!payload) return null;
    const p = payload as unknown as Record<string, unknown>;
    if (typeof p.predictorId === 'string') return p.predictorId;
    const event = p.event as Record<string, unknown> | undefined;
    const newRow = event?.new as Record<string, unknown> | undefined;
    if (typeof newRow?.id === 'string') return newRow.id;
    return null;
  }
}

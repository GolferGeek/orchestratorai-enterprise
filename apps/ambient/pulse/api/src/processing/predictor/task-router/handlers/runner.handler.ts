/**
 * Runner Handler
 *
 * Handles manual trigger of prediction system runners via dashboard mode.
 * Allows triggering price fetching, baseline predictions, article processing,
 * and outcome resolution.
 *
 * Actions:
 * - runner.fetchPrices: Fetch prices for all active targets
 * - runner.createBaselines: Create baseline predictions for uncovered targets
 * - runner.processArticles: Process articles to create predictors (new unified flow)
 * - runner.resolveOutcomes: Trigger outcome tracking for pending predictions
 * - runner.status: Get status of all runners
 * - runner.runAll: Run complete daily flow (fetch → baselines → resolve)
 *
 * NOTE: processSignals is DEPRECATED - use processArticles instead.
 * The signals intermediate layer has been removed.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { OutcomeTrackingRunner } from '../../runners/outcome-tracking.runner';
import { BaselinePredictionRunner } from '../../runners/baseline-prediction.runner';
import { ArticleProcessorService } from '../../services/article-processor.service';
import { TargetSnapshotService } from '../../services/target-snapshot.service';
import { TargetRepository } from '../../repositories/target.repository';
import { UniverseRepository } from '../../repositories/universe.repository';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
} from '../dashboard-handler.interface';

interface RunnerParams {
  date?: string; // YYYY-MM-DD format
  universeId?: string;
  domain?: 'stocks' | 'crypto' | 'polymarket' | 'elections';
  targetId?: string; // For processing specific target's articles
  batchSize?: number; // Max articles to process
}

@Injectable()
export class RunnerHandler implements IDashboardHandler {
  private readonly logger = new Logger(RunnerHandler.name);
  private readonly supportedActions = [
    'fetchPrices',
    'createBaselines',
    'resolveOutcomes',
    'processArticles', // New unified flow
    'processSignals', // Deprecated - redirects to processArticles
    'status',
    'runAll',
  ];

  constructor(
    private readonly outcomeTrackingRunner: OutcomeTrackingRunner,
    private readonly baselinePredictionRunner: BaselinePredictionRunner,
    private readonly articleProcessorService: ArticleProcessorService,
    private readonly targetSnapshotService: TargetSnapshotService,
    private readonly targetRepository: TargetRepository,
    private readonly universeRepository: UniverseRepository,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[RUNNER-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as RunnerParams | undefined;

    switch (action.toLowerCase()) {
      case 'fetchprices':
        return this.handleFetchPrices(params);
      case 'createbaselines':
        return this.handleCreateBaselines(params);
      case 'resolveoutcomes':
        return this.handleResolveOutcomes();
      case 'processarticles':
        return this.handleProcessArticles(params);
      case 'processsignals':
        // Deprecated - redirect to processArticles
        this.logger.warn(
          'processSignals is deprecated - use processArticles instead',
        );
        return this.handleProcessArticles(params);
      case 'status':
        return this.handleStatus();
      case 'runall':
        return this.handleRunAll(params);
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

  /**
   * Fetch prices for ALL active targets (not just those with predictions)
   */
  private async handleFetchPrices(
    params?: RunnerParams,
  ): Promise<DashboardActionResult> {
    this.logger.log('Manual price fetch triggered');

    try {
      // Get all active targets, optionally filtered by domain
      let targets;
      if (params?.universeId) {
        targets = await this.targetRepository.findActiveByUniverse(
          params.universeId,
        );
      } else if (params?.domain) {
        targets = await this.getTargetsByDomain(params.domain);
      } else {
        targets = await this.targetRepository.findAllActive();
      }

      this.logger.log(`Fetching prices for ${targets.length} targets`);

      let captured = 0;
      let errors = 0;
      const results: Array<{
        targetId: string;
        symbol: string;
        price: number | null;
        error?: string;
      }> = [];

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i]!;
        try {
          const snapshot =
            await this.targetSnapshotService.fetchAndCaptureValue(target.id);
          if (snapshot) {
            captured++;
            results.push({
              targetId: target.id,
              symbol: target.symbol,
              price: snapshot.value,
            });
          } else {
            results.push({
              targetId: target.id,
              symbol: target.symbol,
              price: null,
              error: 'No data returned',
            });
          }

          // Rate limiting: wait 15 seconds between API calls to avoid Polygon 429 errors
          if (i < targets.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 15000));
          }
        } catch (error) {
          errors++;
          results.push({
            targetId: target.id,
            symbol: target.symbol,
            price: null,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      this.logger.log(
        `Price fetch complete: ${captured} captured, ${errors} errors`,
      );

      return buildDashboardSuccess({
        action: 'fetchPrices',
        captured,
        errors,
        totalTargets: targets.length,
        results,
      });
    } catch (error) {
      this.logger.error(
        `Price fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return buildDashboardError(
        'FETCH_PRICES_FAILED',
        error instanceof Error ? error.message : 'Failed to fetch prices',
      );
    }
  }

  /**
   * Create baseline "flat" predictions for uncovered targets
   */
  private async handleCreateBaselines(
    params?: RunnerParams,
  ): Promise<DashboardActionResult> {
    const date = params?.date || new Date().toISOString().slice(0, 10);
    this.logger.log(`Manual baseline creation triggered for ${date}`);

    try {
      const result = await this.baselinePredictionRunner.manualRun(
        date,
        params?.universeId,
      );

      if (!result) {
        return buildDashboardError(
          'RUNNER_BUSY',
          'Baseline creation runner is already running',
        );
      }

      return buildDashboardSuccess({
        action: 'createBaselines',
        date,
        ...result,
      });
    } catch (error) {
      this.logger.error(
        `Baseline creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return buildDashboardError(
        'CREATE_BASELINES_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to create baseline predictions',
      );
    }
  }

  /**
   * Process crawler articles to create predictors directly.
   * This is the new unified flow that replaces signals.
   *
   * Articles are analyzed for instrument relevance, then run through
   * the analyst ensemble to create predictors.
   */
  private async handleProcessArticles(
    _params?: RunnerParams,
  ): Promise<DashboardActionResult> {
    this.logger.log('Manual article processing triggered');

    try {
      // Process articles for all targets (the service handles filtering)
      const result = await this.articleProcessorService.processAllTargets();

      return buildDashboardSuccess({
        action: 'processArticles',
        articlesProcessed: result.articles_processed,
        predictorsCreated: result.predictors_created,
        targetsAnalyzed: result.targets_affected,
        errors: result.errors.length,
        message: `Processed ${result.articles_processed} articles, created ${result.predictors_created} predictors for ${result.targets_affected} targets`,
      });
    } catch (error) {
      this.logger.error(
        `Article processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return buildDashboardError(
        'PROCESS_ARTICLES_FAILED',
        error instanceof Error ? error.message : 'Failed to process articles',
      );
    }
  }

  /**
   * Trigger outcome tracking (resolve pending predictions)
   */
  private async handleResolveOutcomes(): Promise<DashboardActionResult> {
    this.logger.log('Manual outcome resolution triggered');

    try {
      const result = await this.outcomeTrackingRunner.runOutcomeTracking();

      return buildDashboardSuccess({
        action: 'resolveOutcomes',
        ...result,
      });
    } catch (error) {
      this.logger.error(
        `Outcome resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return buildDashboardError(
        'RESOLVE_OUTCOMES_FAILED',
        error instanceof Error ? error.message : 'Failed to resolve outcomes',
      );
    }
  }

  /**
   * Get status of all runners
   */
  private handleStatus(): DashboardActionResult {
    try {
      const baselineStatus = this.baselinePredictionRunner.getStatus();

      return buildDashboardSuccess({
        action: 'status',
        runners: {
          baselinePrediction: baselineStatus,
          outcomeTracking: { isRunning: false }, // Would need to expose this
        },
      });
    } catch (error) {
      return buildDashboardError(
        'STATUS_FAILED',
        error instanceof Error ? error.message : 'Failed to get runner status',
      );
    }
  }

  /**
   * Run complete daily flow: fetch prices → create baselines → resolve outcomes
   */
  private async handleRunAll(
    params?: RunnerParams,
  ): Promise<DashboardActionResult> {
    const date = params?.date || new Date().toISOString().slice(0, 10);
    this.logger.log(`Running complete daily flow for ${date}`);

    const results: {
      fetchPrices?: {
        captured: number;
        errors: number;
        totalTargets: number;
      };
      createBaselines?: {
        created: number;
        skipped: number;
        errors: number;
        targets: string[];
      };
      resolveOutcomes?: {
        snapshotsCaptured: number;
        predictionsResolved: number;
        predictionsExpired: number;
        errors: number;
      };
      errors: string[];
    } = { errors: [] };

    try {
      // Step 1: Fetch prices for all active targets
      this.logger.log('Step 1: Fetching prices...');
      const priceResult = await this.handleFetchPrices(params);
      if (priceResult.success && priceResult.data) {
        const data = priceResult.data as {
          captured: number;
          errors: number;
          totalTargets: number;
        };
        results.fetchPrices = {
          captured: data.captured,
          errors: data.errors,
          totalTargets: data.totalTargets,
        };
      } else {
        results.errors.push(
          `Price fetch: ${priceResult.error?.message || 'Unknown error'}`,
        );
      }

      // Step 2: Create baseline predictions
      this.logger.log('Step 2: Creating baseline predictions...');
      const baselineResult = await this.handleCreateBaselines(params);
      if (baselineResult.success && baselineResult.data) {
        const data = baselineResult.data as {
          created: number;
          skipped: number;
          errors: number;
          targets: string[];
        };
        results.createBaselines = {
          created: data.created,
          skipped: data.skipped,
          errors: data.errors,
          targets: data.targets,
        };
      } else {
        results.errors.push(
          `Baseline creation: ${baselineResult.error?.message || 'Unknown error'}`,
        );
      }

      // Step 3: Resolve outcomes
      this.logger.log('Step 3: Resolving outcomes...');
      const outcomeResult = await this.handleResolveOutcomes();
      if (outcomeResult.success && outcomeResult.data) {
        const data = outcomeResult.data as {
          snapshotsCaptured: number;
          predictionsResolved: number;
          predictionsExpired: number;
          errors: number;
        };
        results.resolveOutcomes = {
          snapshotsCaptured: data.snapshotsCaptured,
          predictionsResolved: data.predictionsResolved,
          predictionsExpired: data.predictionsExpired,
          errors: data.errors,
        };
      } else {
        results.errors.push(
          `Outcome resolution: ${outcomeResult.error?.message || 'Unknown error'}`,
        );
      }

      this.logger.log('Complete daily flow finished');

      return buildDashboardSuccess({
        action: 'runAll',
        date,
        ...results,
      });
    } catch (error) {
      this.logger.error(
        `Daily flow failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return buildDashboardError(
        'RUN_ALL_FAILED',
        error instanceof Error ? error.message : 'Failed to run daily flow',
        { partialResults: results },
      );
    }
  }

  /**
   * Get targets for a specific domain
   */
  private async getTargetsByDomain(
    domain: 'stocks' | 'crypto' | 'polymarket' | 'elections',
  ): Promise<
    Array<{
      id: string;
      symbol: string;
      universe_id: string;
      is_active: boolean;
    }>
  > {
    const universes = await this.universeRepository.findByDomain(domain);
    const allTargets: Array<{
      id: string;
      symbol: string;
      universe_id: string;
      is_active: boolean;
    }> = [];

    for (const universe of universes) {
      const targets = await this.targetRepository.findActiveByUniverse(
        universe.id,
      );
      allTargets.push(
        ...targets.map((t) => ({
          id: t.id,
          symbol: t.symbol,
          universe_id: t.universe_id,
          is_active: t.is_active,
        })),
      );
    }

    return allTargets;
  }
}

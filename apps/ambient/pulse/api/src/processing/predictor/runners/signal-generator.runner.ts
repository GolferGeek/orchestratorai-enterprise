import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArticleProcessorService } from '../services/article-processor.service';
import { ObservabilityEventsService } from '@/observability/observability-events.service';
import { ExecutionContext, NIL_UUID } from '@orchestrator-ai/transport-types';

/**
 * SignalGeneratorRunner - Process articles and create predictors
 *
 * NOTE: This runner's name is historical. It now creates PREDICTORS directly
 * from articles, skipping the signals layer entirely.
 *
 * Flow:
 * 1. Pull new articles from crawler.articles via subscriptions
 * 2. Analyze which instruments each article affects
 * 3. Run ensemble evaluation for relevant instruments
 * 4. Create predictors directly (no signals intermediate step)
 *
 * Schedule: Every 5 minutes
 */
@Injectable()
export class SignalGeneratorRunner {
  private readonly logger = new Logger(SignalGeneratorRunner.name);
  private isRunning = false;

  constructor(
    private readonly articleProcessorService: ArticleProcessorService,
    private readonly observabilityEventsService: ObservabilityEventsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if processing is disabled via environment variable
   * Checks both individual flag and master DISABLE_PREDICTION_RUNNERS flag
   */
  private isDisabled(): boolean {
    return (
      this.configService.get<string>('DISABLE_SIGNAL_GENERATION') === 'true' ||
      this.configService.get<string>('DISABLE_SCHEDULED_PREDICTION') === 'true' ||
      this.configService.get<string>('DISABLE_PREDICTION_RUNNERS') === 'true'
    );
  }

  /**
   * Generate predictors from articles for all active targets
   */
  async generatePredictorsForAllTargets(): Promise<{
    articles_processed: number;
    predictors_created: number;
    targets_affected: number;
    errors: string[];
  }> {
    // Prevent overlapping runs
    if (this.isRunning) {
      this.logger.warn(
        'Skipping predictor generation - previous run still in progress',
      );
      return {
        articles_processed: 0,
        predictors_created: 0,
        targets_affected: 0,
        errors: [],
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    // Create execution context for observability
    const ctx: ExecutionContext = {
      orgSlug: 'system',
      userId: NIL_UUID,
      conversationId: `predictor-gen-${Date.now()}`,
      agentSlug: 'predictor-generator',
      agentType: 'runner',
      provider: NIL_UUID,
      model: NIL_UUID,
    };

    this.logger.log('Starting predictor generation from crawler articles');

    await this.observabilityEventsService.push({
      context: ctx,
      source_app: 'prediction-runner',
      hook_event_type: 'predictor.generation.started',
      status: 'started',
      message: 'Starting predictor generation from crawler articles',
      progress: 0,
      step: 'predictor-gen-started',
      payload: {},
      timestamp: Date.now(),
    });

    try {
      // Process all articles across all targets
      const result = await this.articleProcessorService.processAllTargets();

      const duration = Date.now() - startTime;
      this.logger.log(
        `Predictor generation complete: ${result.articles_processed} articles processed, ` +
          `${result.predictors_created} predictors created (${duration}ms)`,
      );

      await this.observabilityEventsService.push({
        context: ctx,
        source_app: 'prediction-runner',
        hook_event_type: 'predictor.generation.completed',
        status: 'completed',
        message: `Predictor generation complete: ${result.predictors_created} predictors from ${result.articles_processed} articles`,
        progress: 100,
        step: 'predictor-gen-completed',
        payload: {
          articles_processed: result.articles_processed,
          predictors_created: result.predictors_created,
          targets_affected: result.targets_affected,
          errors_count: result.errors.length,
          durationMs: duration,
        },
        timestamp: Date.now(),
      });

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process a single article by ID — event-driven path.
   * Called by Pulse DB watcher when a new article is inserted into crawler.articles.
   * Fetches the article from the DB and runs it through the same pipeline
   * as the batch processor, but for just one article.
   */
  async processArticleById(articleId: string): Promise<{
    articles_processed: number;
    predictors_created: number;
    targets_affected: number;
    errors: string[];
  }> {
    this.logger.log(`Processing single article: ${articleId}`);

    const startTime = Date.now();
    const ctx: ExecutionContext = {
      orgSlug: 'system',
      userId: NIL_UUID,
      conversationId: `article-event-${articleId}-${Date.now()}`,
      agentSlug: 'predictor-generator',
      agentType: 'runner',
      provider: NIL_UUID,
      model: NIL_UUID,
    };

    try {
      const result = await this.articleProcessorService.processArticleById(articleId);

      const duration = Date.now() - startTime;
      this.logger.log(
        `Single article processing complete: article=${articleId}, ` +
          `${result.predictors_created} predictors created (${duration}ms)`,
      );

      await this.observabilityEventsService.push({
        context: ctx,
        source_app: 'prediction-runner',
        hook_event_type: 'predictor.generation.single-article',
        status: 'completed',
        message: `Single article processed: ${result.predictors_created} predictors from article ${articleId}`,
        progress: 100,
        step: 'single-article-processed',
        payload: {
          articleId,
          predictors_created: result.predictors_created,
          targets_affected: result.targets_affected,
          durationMs: duration,
        },
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to process article ${articleId}: ${message}`);
      return {
        articles_processed: 0,
        predictors_created: 0,
        targets_affected: 0,
        errors: [message],
      };
    }
  }

  /**
   * Manually trigger predictor generation for a specific target
   * @deprecated Legacy method, use generatePredictorsForAllTargets instead
   */
  async generateSignalsForTarget(targetId: string): Promise<{
    articles_processed: number;
    signals_created: number;
    errors: string[];
  }> {
    try {
      const result = await this.articleProcessorService.processTarget(targetId);
      return {
        articles_processed: result.articles_processed,
        signals_created: result.predictors_created, // Map to old field name for compatibility
        errors: result.errors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { articles_processed: 0, signals_created: 0, errors: [message] };
    }
  }

  /**
   * Legacy method name mapping
   * @deprecated Use generatePredictorsForAllTargets
   */
  async generateSignalsForAllTargets() {
    return this.generatePredictorsForAllTargets();
  }
}

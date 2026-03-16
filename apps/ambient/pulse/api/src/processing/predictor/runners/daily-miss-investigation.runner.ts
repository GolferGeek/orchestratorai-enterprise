import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MissInvestigationService } from '../services/miss-investigation.service';
import { SourceResearchService } from '../services/source-research.service';
import { LearningQueueRepository } from '../repositories/learning-queue.repository';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  MissInvestigation,
  DailyInvestigationSummary,
} from '../interfaces/miss-investigation.interface';

/**
 * Daily Miss Investigation Runner
 *
 * Orchestrates the end-of-day investigation process:
 * 1. Identify all misses (missed opportunities + wrong predictions)
 * 2. Investigate each miss (check predictors → signals)
 * 3. Batch misses needing source research → Gemini
 * 4. Generate learnings → queue for human review
 * 5. Store results in missed_opportunities table
 *
 * Schedule: Runs daily at 5:00 PM ET (after market close + buffer)
 */
@Injectable()
export class DailyMissInvestigationRunner {
  private readonly logger = new Logger(DailyMissInvestigationRunner.name);
  private isRunning = false;

  constructor(
    private readonly missInvestigationService: MissInvestigationService,
    private readonly sourceResearchService: SourceResearchService,
    private readonly learningQueueRepository: LearningQueueRepository,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  private isDisabled(): boolean {
    return (
      this.configService.get<string>('DISABLE_SCHEDULED_PREDICTION') === 'true' ||
      this.configService.get<string>('DISABLE_PREDICTION_RUNNERS') === 'true'
    );
  }

  /**
   * Run investigation for a specific date
   * Can be called manually for backtesting or re-running
   */
  async runInvestigationForDate(
    date: string,
    universeId?: string,
  ): Promise<DailyInvestigationSummary | null> {
    if (this.isRunning) {
      this.logger.warn(
        'Skipping investigation run - previous run still in progress',
      );
      return null;
    }

    this.isRunning = true;
    const startTime = Date.now();

    this.logger.log(`Starting daily miss investigation for ${date}`);

    try {
      // Step 1: Identify all misses
      const misses = await this.missInvestigationService.identifyMisses(
        date,
        universeId,
      );

      if (misses.length === 0) {
        this.logger.log(`No misses found for ${date}`);
        return {
          date,
          totalMisses: 0,
          byType: {
            missed_opportunity: 0,
            direction_wrong: 0,
            magnitude_wrong: 0,
            false_positive: 0,
          },
          byLevel: {
            predictor: 0,
            signal: 0,
            source: 0,
            unpredictable: 0,
          },
          learningsSuggested: 0,
          topSourceGaps: [],
        };
      }

      this.logger.log(`Found ${misses.length} misses, investigating...`);

      // Step 2: Investigate each miss (predictors → signals)
      const investigations: MissInvestigation[] = [];

      for (const miss of misses) {
        const investigation =
          await this.missInvestigationService.investigateMiss(
            miss.prediction,
            miss.missType,
            miss.actualDirection,
            miss.actualMagnitude,
          );
        investigations.push(investigation);
      }

      // Step 3: Batch misses that need source research
      const needsResearch = investigations.filter(
        (inv) => inv.investigationLevel === 'source',
      );

      if (needsResearch.length > 0) {
        this.logger.log(
          `${needsResearch.length} misses need source research, calling Gemini...`,
        );

        const researchResults =
          await this.sourceResearchService.researchMissBatch(
            needsResearch,
            date,
          );

        // Update investigations with research results
        for (const inv of needsResearch) {
          const research = researchResults.get(inv.id);
          if (research) {
            inv.sourceResearch = research;
            inv.researchedAt = new Date().toISOString();

            // Generate source-level learning if applicable
            if (!inv.suggestedLearning) {
              inv.suggestedLearning =
                this.sourceResearchService.generateSourceLevelLearning(
                  inv,
                  research,
                ) || undefined;
            }

            // Update investigation level based on predictability
            if (research.predictability === 'unpredictable') {
              inv.investigationLevel = 'unpredictable';
            }
          }
        }
      }

      // Step 4: Queue suggested learnings for human review
      let learningsQueued = 0;
      for (const inv of investigations) {
        if (inv.suggestedLearning) {
          await this.queueLearning(inv);
          learningsQueued++;
        }
      }

      // Step 5: Store results in missed_opportunities table
      await this.storeMissedOpportunities(investigations);

      // Generate summary
      const summary = await this.missInvestigationService.generateDailySummary(
        date,
        investigations,
      );

      const duration = Date.now() - startTime;
      this.logger.log(
        `Daily investigation complete for ${date}: ` +
          `${summary.totalMisses} misses, ` +
          `${learningsQueued} learnings suggested, ` +
          `${summary.byLevel.source} researched (${duration}ms)`,
      );

      return summary;
    } catch (error) {
      this.logger.error(
        `Daily investigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Queue a suggested learning for human review
   */
  private async queueLearning(investigation: MissInvestigation): Promise<void> {
    const learning = investigation.suggestedLearning;
    if (!learning) return;

    try {
      await this.learningQueueRepository.create({
        suggested_learning_type: learning.type,
        suggested_title: learning.title,
        suggested_description: learning.description,
        suggested_scope_level: learning.scope,
        suggested_config: learning.config,
        source_evaluation_id: null, // Not from evaluation
        ai_reasoning: `Investigation level: ${investigation.investigationLevel}. ${learning.evidence.keyFindings.join(' ')}`,
        ai_confidence:
          investigation.investigationLevel === 'predictor' ? 0.8 : 0.6,
        status: 'pending',
      });

      this.logger.debug(
        `Queued learning: ${learning.title} (${learning.type})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue learning: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Store investigation results in missed_opportunities table
   */
  private async storeMissedOpportunities(
    investigations: MissInvestigation[],
  ): Promise<void> {
    for (const inv of investigations) {
      try {
        const record = {
          target_id: inv.prediction.target_id,
          move_type: this.mapMissTypeToMoveType(
            inv.missType,
            inv.actual.direction,
          ),
          move_start_at: inv.prediction.predicted_at,
          move_end_at:
            inv.prediction.outcome_captured_at || new Date().toISOString(),
          start_value: inv.prediction.entry_price,
          end_value: inv.prediction.entry_price
            ? inv.prediction.entry_price * (1 + inv.actual.magnitude / 100)
            : null,
          percent_change:
            inv.actual.magnitude * (inv.actual.direction === 'down' ? -1 : 1),
          detected_at: new Date().toISOString(),
          detected_method: 'daily_investigation',
          discovered_drivers: inv.sourceResearch?.discoveredDrivers || [],
          signals_we_had: this.extractSignalsWeHad(inv),
          signals_we_missed: inv.sourceResearch?.signalTypesNeeded || [],
          source_gaps: inv.sourceResearch?.suggestedSources || [],
          suggested_learnings: inv.suggestedLearning
            ? [inv.suggestedLearning]
            : [],
          analysis_status: inv.sourceResearch ? 'complete' : 'pending',
          // Store full investigation for reference
          investigation_data: {
            id: inv.id,
            missType: inv.missType,
            investigationLevel: inv.investigationLevel,
            predicted: inv.predicted,
            actual: inv.actual,
            unusedPredictorCount: inv.unusedPredictors.length,
            misreadSignalCount: inv.misreadSignals.length,
            predictability: inv.sourceResearch?.predictability,
          },
        };

        await this.db
          .from('prediction', 'missed_opportunities')
          .upsert(record, {
            onConflict: 'target_id,move_start_at',
          });
      } catch (error) {
        this.logger.error(
          `Failed to store missed opportunity for ${inv.prediction.target_id}: ` +
            `${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  /**
   * Map miss type to move type for missed_opportunities table
   */
  private mapMissTypeToMoveType(
    missType: string,
    actualDirection: string,
  ): string {
    if (missType === 'missed_opportunity' || missType === 'direction_wrong') {
      return actualDirection === 'up' ? 'significant_up' : 'significant_down';
    }
    if (missType === 'magnitude_wrong') {
      return actualDirection === 'up' ? 'breakout' : 'breakdown';
    }
    return 'unexpected_flat';
  }

  /**
   * Extract signals we had from investigation
   */
  private extractSignalsWeHad(
    inv: MissInvestigation,
  ): Array<{ content: string; direction: string; source: string }> {
    const signals: Array<{
      content: string;
      direction: string;
      source: string;
    }> = [];

    // From consumed predictors
    for (const predictor of inv.prediction.consumedPredictors || []) {
      if (predictor.signal) {
        signals.push({
          content: predictor.signal.content.slice(0, 500),
          direction: predictor.signal.direction,
          source: predictor.signal.source?.name || 'unknown',
        });
      }
    }

    // From unused predictors
    for (const unused of inv.unusedPredictors) {
      if (unused.predictor.signal) {
        signals.push({
          content: unused.predictor.signal.content.slice(0, 500),
          direction: unused.predictor.signal.direction,
          source: unused.predictor.signal.source?.name || 'unknown',
        });
      }
    }

    // From misread signals
    for (const misread of inv.misreadSignals) {
      signals.push({
        content: misread.signal.content.slice(0, 500),
        direction: misread.signal.direction,
        source: misread.signal.source?.name || 'unknown',
      });
    }

    return signals;
  }

  /**
   * Manually trigger investigation for a specific date
   * Useful for testing or re-running investigations
   */
  async manualRun(
    date: string,
    universeId?: string,
  ): Promise<DailyInvestigationSummary | null> {
    this.logger.log(`Manual investigation triggered for ${date}`);
    return this.runInvestigationForDate(date, universeId);
  }

  /**
   * Get investigation status
   */
  getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }
}

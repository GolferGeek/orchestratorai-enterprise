import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { ExecutionContext, NIL_UUID } from '@orchestrator-ai/transport-types';
import { TargetRepository } from '../repositories/target.repository';
import { UniverseRepository } from '../repositories/universe.repository';
import { MissedOpportunityDetectionService } from '../services/missed-opportunity-detection.service';
import { MissedOpportunityAnalysisService } from '../services/missed-opportunity-analysis.service';
import { MissedOpportunity } from '../interfaces/missed-opportunity.interface';

/**
 * Missed Opportunity Scanner Runner - Phase 7, Step 7-6
 *
 * Detects significant price moves that were not predicted
 * and triggers analysis to understand why.
 *
 * Schedule: Every 4 hours
 *
 * Responsibilities:
 * 1. Scan price history for significant moves
 * 2. Check if moves were covered by predictions
 * 3. Create missed opportunity records for uncovered moves
 * 4. Trigger analysis to identify drivers and source gaps
 */
@Injectable()
export class MissedOpportunityScannerRunner {
  private readonly logger = new Logger(MissedOpportunityScannerRunner.name);
  private isRunning = false;

  constructor(
    private readonly targetRepository: TargetRepository,
    private readonly universeRepository: UniverseRepository,
    private readonly missedOpportunityDetectionService: MissedOpportunityDetectionService,
    private readonly missedOpportunityAnalysisService: MissedOpportunityAnalysisService,
    private readonly configService: ConfigService,
  ) {}

  private isDisabled(): boolean {
    return (
      this.configService.get<string>('DISABLE_SCHEDULED_PREDICTION') === 'true' ||
      this.configService.get<string>('DISABLE_PREDICTION_RUNNERS') === 'true'
    );
  }

  /**
   * Run missed opportunity scan
   */
  async runScan(): Promise<{
    targetsScanned: number;
    missesDetected: number;
    analysesTriggered: number;
    errors: number;
  }> {
    if (this.isRunning) {
      this.logger.warn('Skipping scan - previous run still in progress');
      return {
        targetsScanned: 0,
        missesDetected: 0,
        analysesTriggered: 0,
        errors: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    this.logger.log('Starting missed opportunity scan');

    let targetsScanned = 0;
    let missesDetected = 0;
    let analysesTriggered = 0;
    let errors = 0;

    try {
      // Get all universes
      const universes = await this.universeRepository.findAllActive();

      for (const universe of universes) {
        // Get active targets in this universe
        const targets = await this.targetRepository.findActiveByUniverse(
          universe.id,
        );

        for (const target of targets) {
          try {
            targetsScanned++;

            // Detect missed opportunities
            const missedOpportunities =
              await this.missedOpportunityDetectionService.detectMissedOpportunities(
                target.id,
                {
                  lookback_hours: 96, // 4 days
                  min_move_percentage: 5.0, // 5% minimum move
                  max_prediction_gap_hours: 12, // 12 hour gap allowed
                },
              );

            missesDetected += missedOpportunities.length;

            // Trigger analysis for each missed opportunity
            for (const miss of missedOpportunities) {
              try {
                await this.triggerAnalysis(miss);
                analysesTriggered++;
              } catch (error) {
                this.logger.error(
                  `Failed to trigger analysis for miss ${miss.id}: ` +
                    `${error instanceof Error ? error.message : 'Unknown error'}`,
                );
              }
            }
          } catch (error) {
            errors++;
            this.logger.error(
              `Failed to scan target ${target.id}: ` +
                `${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Missed opportunity scan complete: ${targetsScanned} targets scanned, ` +
          `${missesDetected} misses detected, ${analysesTriggered} analyses triggered ` +
          `(${duration}ms)`,
      );

      return { targetsScanned, missesDetected, analysesTriggered, errors };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Trigger analysis for a missed opportunity
   */
  private async triggerAnalysis(miss: MissedOpportunity): Promise<void> {
    const ctx: ExecutionContext = {
      orgSlug: 'system',
      userId: 'system',
      conversationId: NIL_UUID,
      taskId: uuidv4(),
      planId: NIL_UUID,
      deliverableId: NIL_UUID,
      agentSlug: 'missed-opportunity-analyzer',
      agentType: 'context',
      provider: 'anthropic',
      model: 'claude-haiku-4-20250514',
    };

    this.logger.debug(`Triggering analysis for missed opportunity ${miss.id}`);

    await this.missedOpportunityAnalysisService.analyzeMissedOpportunity(
      miss.id,
      ctx,
    );
  }

  /**
   * Manually scan a specific target for missed opportunities
   */
  async scanTargetManually(
    targetId: string,
    options?: {
      lookback_hours?: number;
      min_move_percentage?: number;
    },
  ): Promise<{
    missesDetected: number;
    misses: MissedOpportunity[];
    error?: string;
  }> {
    try {
      const missedOpportunities =
        await this.missedOpportunityDetectionService.detectMissedOpportunities(
          targetId,
          {
            lookback_hours: options?.lookback_hours || 96,
            min_move_percentage: options?.min_move_percentage || 5.0,
            max_prediction_gap_hours: 12,
          },
        );

      return {
        missesDetected: missedOpportunities.length,
        misses: missedOpportunities,
      };
    } catch (error) {
      return {
        missesDetected: 0,
        misses: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Manually trigger analysis for a specific missed opportunity
   */
  async analyzeManually(missId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const ctx: ExecutionContext = {
        orgSlug: 'system',
        userId: 'system',
        conversationId: NIL_UUID,
        taskId: uuidv4(),
        planId: NIL_UUID,
        deliverableId: NIL_UUID,
        agentSlug: 'missed-opportunity-analyzer',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-haiku-4-20250514',
      };

      await this.missedOpportunityAnalysisService.analyzeMissedOpportunity(
        missId,
        ctx,
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get summary of recent missed opportunities
   */
  getMissedOpportunitySummary(): {
    total: number;
    byDirection: { up: number; down: number };
    avgMagnitude: number;
    pending: number;
    analyzed: number;
  } {
    // This would query the missed_opportunities table
    // For now, return placeholder
    return {
      total: 0,
      byDirection: { up: 0, down: 0 },
      avgMagnitude: 0,
      pending: 0,
      analyzed: 0,
    };
  }
}

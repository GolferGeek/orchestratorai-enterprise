import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EodSettlementService } from '../services/eod-settlement.service';
import { TargetSnapshotService } from '../services/target-snapshot.service';
import { TargetRepository } from '../repositories/target.repository';
import { PortfolioRepository } from '../repositories/portfolio.repository';
import { ObservabilityEventsService } from '@/observability/observability-events.service';
import { NIL_UUID } from '@orchestrator-ai/transport-types';

/**
 * EOD Settlement Runner
 *
 * Single consolidated end-of-day process that runs at 22:00 UTC (5 PM ET) Mon-Fri.
 * Executes all trading activities in order:
 *
 * 1. Capture closing prices for all active targets
 * 2. Execute queued user trades at closing price
 * 3. Create analyst positions for active directional predictions
 * 4. Resolve expired predictions and close their positions
 * 5. Update unrealized P&L for all remaining open positions
 * 6. Log settlement summary for next-morning review
 */
@Injectable()
export class EodSettlementRunner implements OnModuleInit {
  private readonly logger = new Logger(EodSettlementRunner.name);
  private isRunning = false;
  private static readonly MARKET_TIMEZONE = 'America/New_York';

  constructor(
    private readonly eodSettlementService: EodSettlementService,
    private readonly targetSnapshotService: TargetSnapshotService,
    private readonly targetRepository: TargetRepository,
    private readonly portfolioRepository: PortfolioRepository,
    private readonly observabilityEvents: ObservabilityEventsService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    // Run non-blocking startup catch-up check in case 5 PM ET cron was missed.
    void this.runStartupCatchupCheck();
  }

  private isDisabled(): boolean {
    return (
      this.configService.get<string>('DISABLE_SCHEDULED_PREDICTION') === 'true' ||
      this.configService.get<string>('DISABLE_PREDICTION_RUNNERS') === 'true'
    );
  }

  private getEtDateString(date: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: EodSettlementRunner.MARKET_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private getEtWeekday(date: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: EodSettlementRunner.MARKET_TIMEZONE,
      weekday: 'short',
    }).format(date);
  }

  private getEtHour(date: Date = new Date()): number {
    return Number.parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: EodSettlementRunner.MARKET_TIMEZONE,
        hour: '2-digit',
        hour12: false,
      }).format(date),
      10,
    );
  }

  private isEtWeekday(date: Date = new Date()): boolean {
    const weekday = this.getEtWeekday(date);
    return weekday !== 'Sat' && weekday !== 'Sun';
  }

  private async runStartupCatchupCheck(): Promise<void> {
    if (this.isDisabled()) {
      return;
    }

    const now = new Date();
    if (!this.isEtWeekday(now)) {
      return;
    }

    // Only catch up if startup happens after the intended 5 PM ET run.
    if (this.getEtHour(now) < 17) {
      return;
    }

    const etDate = this.getEtDateString(now);
    const hasSettlement =
      await this.portfolioRepository.hasSettlementForDate(etDate);
    if (hasSettlement) {
      this.logger.log(
        `[CATCHUP] Settlement already exists for ${etDate} (${EodSettlementRunner.MARKET_TIMEZONE})`,
      );
      return;
    }

    this.logger.warn(
      `[CATCHUP] Missing EOD settlement for ${etDate} after 5 PM ET; running immediate catch-up`,
    );
    await this.executeSettlement();
  }

  /**
   * Execute the full EOD settlement process.
   * Also callable manually (e.g., from RunnerHandler for testing).
   */
  async executeSettlement(): Promise<{
    queuedTradesExecuted: number;
    analystPositionsCreated: number;
    predictionsResolved: number;
    positionsClosed: number;
    unrealizedPnlUpdated: number;
    totalRealizedPnl: number;
    errors: string[];
    durationMs: number;
  }> {
    if (this.isRunning) {
      this.logger.warn('EOD Settlement already in progress - skipping');
      return {
        queuedTradesExecuted: 0,
        analystPositionsCreated: 0,
        predictionsResolved: 0,
        positionsClosed: 0,
        unrealizedPnlUpdated: 0,
        totalRealizedPnl: 0,
        errors: ['Settlement already in progress'],
        durationMs: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const startedAt = new Date().toISOString();
    const allErrors: string[] = [];
    let queueResult = { executed: 0, errors: [] as string[] };
    let analystResult = {
      positionsCreated: 0,
      positionsSkipped: 0,
      errors: [] as string[],
    };
    let resolveResult = {
      predictionsResolved: 0,
      positionsClosed: 0,
      totalPnl: 0,
      errors: [] as string[],
    };
    let pnlResult = { positionsUpdated: 0, errors: [] as string[] };

    try {
      this.logger.log('========================================');
      this.logger.log('  EOD SETTLEMENT START');
      this.logger.log('========================================');

      // Step 0: Capture closing prices
      this.logger.log('Step 0: Capturing closing prices...');
      let snapshotsCaptured = 0;
      try {
        const activeTargets = await this.targetRepository.findAllActive();
        for (let i = 0; i < activeTargets.length; i++) {
          const target = activeTargets[i]!;
          try {
            await this.targetSnapshotService.fetchAndCaptureValue(target.id);
            snapshotsCaptured++;
            // Rate limiting between API calls
            if (i < activeTargets.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 15000));
            }
          } catch (error) {
            this.logger.error(
              `Failed to capture snapshot for ${target.symbol}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        this.logger.log(
          `Step 0 complete: ${snapshotsCaptured}/${activeTargets.length} snapshots captured`,
        );
      } catch (error) {
        const msg = `Step 0 failed: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error(msg);
        allErrors.push(msg);
      }

      // Step 1: Execute queued user trades
      this.logger.log('Step 1: Executing queued trades...');
      queueResult = await this.eodSettlementService.executeQueuedTrades();
      allErrors.push(...queueResult.errors);
      this.logger.log(
        `Step 1 complete: ${queueResult.executed} trades executed, ${queueResult.errors.length} errors`,
      );

      // Step 2: Create analyst positions
      this.logger.log('Step 2: Creating analyst positions...');
      analystResult = await this.eodSettlementService.createAnalystPositions();
      allErrors.push(...analystResult.errors);
      this.logger.log(
        `Step 2 complete: ${analystResult.positionsCreated} created, ${analystResult.positionsSkipped} skipped`,
      );

      // Step 3: Resolve expired predictions & close positions
      this.logger.log('Step 3: Resolving predictions & closing positions...');
      resolveResult =
        await this.eodSettlementService.resolveAndClosePositions();
      allErrors.push(...resolveResult.errors);
      this.logger.log(
        `Step 3 complete: ${resolveResult.predictionsResolved} resolved, ${resolveResult.positionsClosed} positions closed, P&L: $${resolveResult.totalPnl.toFixed(2)}`,
      );

      // Step 4: Update unrealized P&L
      this.logger.log('Step 4: Updating unrealized P&L...');
      pnlResult = await this.eodSettlementService.updateUnrealizedPnl();
      allErrors.push(...pnlResult.errors);
      this.logger.log(
        `Step 4 complete: ${pnlResult.positionsUpdated} positions updated`,
      );

      const durationMs = Date.now() - startTime;

      // Step 5: Log settlement
      this.logger.log('Step 5: Writing settlement log...');
      try {
        await this.eodSettlementService.logSettlement(new Date(), {
          queuedTradesExecuted: queueResult.executed,
          analystPositionsCreated: analystResult.positionsCreated,
          predictionsResolved: resolveResult.predictionsResolved,
          positionsClosed: resolveResult.positionsClosed,
          unrealizedPnlUpdated: pnlResult.positionsUpdated,
          totalRealizedPnl: resolveResult.totalPnl,
          errors: allErrors,
          startedAt,
          durationMs,
        });
      } catch (error) {
        this.logger.error(
          `Failed to write settlement log: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      this.logger.log('========================================');
      this.logger.log(`  EOD SETTLEMENT COMPLETE (${durationMs}ms)`);
      this.logger.log(`  Queued trades: ${queueResult.executed}`);
      this.logger.log(`  Analyst positions: ${analystResult.positionsCreated}`);
      this.logger.log(
        `  Predictions resolved: ${resolveResult.predictionsResolved}`,
      );
      this.logger.log(`  Positions closed: ${resolveResult.positionsClosed}`);
      this.logger.log(`  P&L updated: ${pnlResult.positionsUpdated}`);
      this.logger.log(`  Errors: ${allErrors.length}`);
      this.logger.log('========================================');

      // Emit observability event
      try {
        await this.observabilityEvents.push({
          context: {
            orgSlug: '*',
            userId: NIL_UUID,
            conversationId: `eod-settlement-${Date.now()}`,
            agentSlug: 'eod-settlement-runner',
            agentType: 'system',
            provider: NIL_UUID,
            model: NIL_UUID,
          },
          source_app: 'prediction-runner',
          hook_event_type: 'eod_settlement',
          status: 'completed',
          message: `EOD settlement complete: ${queueResult.executed} trades, ${analystResult.positionsCreated} positions, ${resolveResult.predictionsResolved} resolved`,
          progress: 100,
          step: 'settlement',
          payload: {
            queuedTradesExecuted: queueResult.executed,
            analystPositionsCreated: analystResult.positionsCreated,
            predictionsResolved: resolveResult.predictionsResolved,
            positionsClosed: resolveResult.positionsClosed,
            unrealizedPnlUpdated: pnlResult.positionsUpdated,
            totalRealizedPnl: resolveResult.totalPnl,
            errorCount: allErrors.length,
            durationMs,
          },
          timestamp: Date.now(),
        });
      } catch {
        // Non-critical - don't fail settlement for observability
      }

      return {
        queuedTradesExecuted: queueResult.executed,
        analystPositionsCreated: analystResult.positionsCreated,
        predictionsResolved: resolveResult.predictionsResolved,
        positionsClosed: resolveResult.positionsClosed,
        unrealizedPnlUpdated: pnlResult.positionsUpdated,
        totalRealizedPnl: resolveResult.totalPnl,
        errors: allErrors,
        durationMs,
      };
    } finally {
      this.isRunning = false;
    }
  }
}

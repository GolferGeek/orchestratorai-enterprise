/**
 * Risk Alert Runner
 *
 * Cron-scheduled runner that checks all active subjects for alert conditions.
 * Runs more frequently than analysis runner (every 5 minutes) to catch threshold
 * breaches and rapid changes quickly.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RiskAlertService,
  AlertCheckResult,
} from '../services/risk-alert.service';
import { ScopeRepository } from '../repositories/scope.repository';

export interface AlertRunnerResult {
  totalSubjectsChecked: number;
  totalAlertsGenerated: number;
  criticalAlerts: number;
  warningAlerts: number;
  infoAlerts: number;
  scopesProcessed: number;
  duration: number;
  skipped: boolean;
}

@Injectable()
export class RiskAlertRunner {
  private readonly logger = new Logger(RiskAlertRunner.name);
  private isRunning = false;

  constructor(
    private readonly riskAlertService: RiskAlertService,
    private readonly scopeRepo: ScopeRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Manual trigger for batch alert check
   */
  async runBatchAlertCheck(): Promise<AlertRunnerResult> {
    if (this.isRunning) {
      this.logger.warn('Skipping - previous alert check run still in progress');
      return {
        totalSubjectsChecked: 0,
        totalAlertsGenerated: 0,
        criticalAlerts: 0,
        warningAlerts: 0,
        infoAlerts: 0,
        scopesProcessed: 0,
        duration: 0,
        skipped: true,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // Get count of active scopes for reporting
      const scopes = await this.scopeRepo.findAllActive();
      const nonTestScopes = scopes.filter((s) => !s.is_test);

      // Run the batch check
      const summary = await this.riskAlertService.checkAllScopesForAlerts();

      const duration = Date.now() - startTime;

      this.logger.log(
        `Alert check complete: ${summary.totalAlertsGenerated} alerts generated ` +
          `for ${summary.totalSubjectsChecked} subjects in ${duration}ms`,
      );

      if (summary.criticalAlerts > 0) {
        this.logger.warn(
          `🚨 ${summary.criticalAlerts} CRITICAL alerts generated - immediate attention required`,
        );
      }

      return {
        totalSubjectsChecked: summary.totalSubjectsChecked,
        totalAlertsGenerated: summary.totalAlertsGenerated,
        criticalAlerts: summary.criticalAlerts,
        warningAlerts: summary.warningAlerts,
        infoAlerts: summary.infoAlerts,
        scopesProcessed: nonTestScopes.length,
        duration,
        skipped: false,
      };
    } catch (error) {
      this.logger.error(
        `Alert check failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        totalSubjectsChecked: 0,
        totalAlertsGenerated: 0,
        criticalAlerts: 0,
        warningAlerts: 0,
        infoAlerts: 0,
        scopesProcessed: 0,
        duration: Date.now() - startTime,
        skipped: false,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check alerts for a single scope (for manual triggers)
   */
  async checkScopeAlerts(scopeId: string): Promise<AlertCheckResult[]> {
    return this.riskAlertService.checkScopeForAlerts(scopeId);
  }

  /**
   * Check if runner is currently processing
   */
  isProcessing(): boolean {
    return this.isRunning;
  }
}

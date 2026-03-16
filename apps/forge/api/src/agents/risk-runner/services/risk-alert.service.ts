/**
 * Risk Alert Service
 *
 * Handles alert generation based on configurable thresholds:
 * - Threshold breach: Score exceeds critical/warning thresholds
 * - Rapid change: Score changed significantly in short time
 * - Dimension spike: Individual dimension score spiked
 * - Stale assessment: Assessment hasn't been updated in configured time
 */

import { Injectable, Logger } from '@nestjs/common';
import { AlertRepository, AlertFilter } from '../repositories/alert.repository';
import { CompositeScoreRepository } from '../repositories/composite-score.repository';
import { ScopeRepository } from '../repositories/scope.repository';
import { SubjectRepository } from '../repositories/subject.repository';
import {
  RiskAlert,
  CreateRiskAlertData,
  UnacknowledgedAlertView,
} from '../interfaces/alert.interface';
import { RiskCompositeScore } from '../interfaces/composite-score.interface';
import { RiskThresholdConfig, RiskScope } from '../interfaces/scope.interface';
import { RiskSubject } from '../interfaces/subject.interface';

/**
 * Default threshold values if not configured in scope
 */
const DEFAULT_THRESHOLDS: Required<RiskThresholdConfig> = {
  critical_threshold: 80,
  warning_threshold: 60,
  rapid_change_threshold: 15,
  stale_hours: 24,
};

/**
 * Result of alert check operations
 */
export interface AlertCheckResult {
  subjectId: string;
  subjectIdentifier: string;
  alertsGenerated: RiskAlert[];
  checksPerformed: string[];
}

/**
 * Batch alert check summary
 */
export interface BatchAlertCheckSummary {
  totalSubjectsChecked: number;
  totalAlertsGenerated: number;
  criticalAlerts: number;
  warningAlerts: number;
  infoAlerts: number;
  results: AlertCheckResult[];
}

@Injectable()
export class RiskAlertService {
  private readonly logger = new Logger(RiskAlertService.name);

  constructor(
    private readonly alertRepo: AlertRepository,
    private readonly compositeScoreRepo: CompositeScoreRepository,
    private readonly scopeRepo: ScopeRepository,
    private readonly subjectRepo: SubjectRepository,
  ) {}

  /**
   * Get effective thresholds by merging scope config with defaults
   */
  private getEffectiveThresholds(
    scopeThresholds: RiskThresholdConfig | null,
  ): Required<RiskThresholdConfig> {
    return {
      critical_threshold:
        scopeThresholds?.critical_threshold ??
        DEFAULT_THRESHOLDS.critical_threshold,
      warning_threshold:
        scopeThresholds?.warning_threshold ??
        DEFAULT_THRESHOLDS.warning_threshold,
      rapid_change_threshold:
        scopeThresholds?.rapid_change_threshold ??
        DEFAULT_THRESHOLDS.rapid_change_threshold,
      stale_hours:
        scopeThresholds?.stale_hours ?? DEFAULT_THRESHOLDS.stale_hours,
    };
  }

  /**
   * Check all active subjects in a scope for alert conditions
   */
  async checkScopeForAlerts(scopeId: string): Promise<AlertCheckResult[]> {
    const scope = await this.scopeRepo.findById(scopeId);
    if (!scope || !scope.is_active) {
      this.logger.warn(`Scope ${scopeId} not found or inactive`);
      return [];
    }

    const subjects = await this.subjectRepo.findByScope(scopeId);
    const activeSubjects = subjects.filter((s) => s.is_active && !s.is_test);

    const results: AlertCheckResult[] = [];

    for (const subject of activeSubjects) {
      const result = await this.checkSubjectForAlerts(subject, scope);
      results.push(result);
    }

    return results;
  }

  /**
   * Check all active scopes for alerts
   */
  async checkAllScopesForAlerts(): Promise<BatchAlertCheckSummary> {
    this.logger.log('Starting batch alert check for all active scopes');

    const scopes = await this.scopeRepo.findAllActive();
    const allResults: AlertCheckResult[] = [];

    for (const scope of scopes) {
      if (scope.is_test) continue;

      const scopeResults = await this.checkScopeForAlerts(scope.id);
      allResults.push(...scopeResults);
    }

    const summary = this.buildBatchSummary(allResults);

    this.logger.log(
      `Batch alert check complete: ${summary.totalSubjectsChecked} subjects, ` +
        `${summary.totalAlertsGenerated} alerts (${summary.criticalAlerts} critical, ` +
        `${summary.warningAlerts} warning, ${summary.infoAlerts} info)`,
    );

    return summary;
  }

  /**
   * Check a single subject for all alert conditions
   */
  async checkSubjectForAlerts(
    subject: RiskSubject,
    scope: RiskScope,
  ): Promise<AlertCheckResult> {
    const thresholds = this.getEffectiveThresholds(scope.thresholds);
    const checksPerformed: string[] = [];
    const alertsGenerated: RiskAlert[] = [];

    // Get current and previous composite scores
    const scores = await this.compositeScoreRepo.findHistory(subject.id, 2);
    const currentScore = scores[0];
    const previousScore = scores[1];

    // Check for stale assessment
    const staleAlert = await this.checkStaleAssessment(
      subject,
      currentScore,
      thresholds.stale_hours,
    );
    checksPerformed.push('stale_assessment');
    if (staleAlert) alertsGenerated.push(staleAlert);

    // If no current score, can't check other conditions
    if (!currentScore) {
      return {
        subjectId: subject.id,
        subjectIdentifier: subject.identifier,
        alertsGenerated,
        checksPerformed,
      };
    }

    // Check threshold breach
    const thresholdAlert = await this.checkThresholdBreach(
      subject,
      currentScore,
      thresholds,
    );
    checksPerformed.push('threshold_breach');
    if (thresholdAlert) alertsGenerated.push(thresholdAlert);

    // Check rapid change (only if we have previous score)
    if (previousScore) {
      const rapidChangeAlert = await this.checkRapidChange(
        subject,
        currentScore,
        previousScore,
        thresholds.rapid_change_threshold,
      );
      checksPerformed.push('rapid_change');
      if (rapidChangeAlert) alertsGenerated.push(rapidChangeAlert);
    }

    // Check dimension spikes
    if (previousScore) {
      const dimensionAlerts = await this.checkDimensionSpikes(
        subject,
        currentScore,
        previousScore,
        thresholds.rapid_change_threshold,
      );
      checksPerformed.push('dimension_spike');
      alertsGenerated.push(...dimensionAlerts);
    }

    return {
      subjectId: subject.id,
      subjectIdentifier: subject.identifier,
      alertsGenerated,
      checksPerformed,
    };
  }

  /**
   * Check if a score breaches critical or warning thresholds
   */
  private async checkThresholdBreach(
    subject: RiskSubject,
    score: RiskCompositeScore,
    thresholds: Required<RiskThresholdConfig>,
  ): Promise<RiskAlert | null> {
    // Check if we already have an unacknowledged threshold alert for this score
    const existingAlerts = await this.alertRepo.findUnacknowledgedBySubject(
      subject.id,
    );
    const hasExistingThresholdAlert = existingAlerts.some(
      (a) =>
        a.alert_type === 'threshold_breach' &&
        a.composite_score_id === score.id,
    );

    if (hasExistingThresholdAlert) {
      return null; // Don't duplicate alert
    }

    if (score.overall_score >= thresholds.critical_threshold) {
      return this.createAlert({
        subject_id: subject.id,
        composite_score_id: score.id,
        alert_type: 'threshold_breach',
        severity: 'critical',
        title: `Critical risk level for ${subject.identifier}`,
        message: `Risk score ${score.overall_score} exceeds critical threshold ${thresholds.critical_threshold}`,
        details: {
          threshold: thresholds.critical_threshold,
          actual_score: score.overall_score,
        },
      });
    }

    if (score.overall_score >= thresholds.warning_threshold) {
      return this.createAlert({
        subject_id: subject.id,
        composite_score_id: score.id,
        alert_type: 'threshold_breach',
        severity: 'warning',
        title: `Elevated risk level for ${subject.identifier}`,
        message: `Risk score ${score.overall_score} exceeds warning threshold ${thresholds.warning_threshold}`,
        details: {
          threshold: thresholds.warning_threshold,
          actual_score: score.overall_score,
        },
      });
    }

    return null;
  }

  /**
   * Check for rapid changes in composite score
   */
  private async checkRapidChange(
    subject: RiskSubject,
    currentScore: RiskCompositeScore,
    previousScore: RiskCompositeScore,
    rapidChangeThreshold: number,
  ): Promise<RiskAlert | null> {
    const changePercent = Math.abs(
      ((currentScore.overall_score - previousScore.overall_score) /
        previousScore.overall_score) *
        100,
    );

    if (changePercent < rapidChangeThreshold) {
      return null;
    }

    // Check for existing rapid change alert
    const existingAlerts = await this.alertRepo.findUnacknowledgedBySubject(
      subject.id,
    );
    const hasExistingRapidAlert = existingAlerts.some(
      (a) =>
        a.alert_type === 'rapid_change' &&
        a.composite_score_id === currentScore.id,
    );

    if (hasExistingRapidAlert) {
      return null;
    }

    // Calculate time window
    const currentTime = new Date(currentScore.created_at);
    const previousTime = new Date(previousScore.created_at);
    const timeWindowHours = Math.round(
      (currentTime.getTime() - previousTime.getTime()) / (1000 * 60 * 60),
    );

    const direction =
      currentScore.overall_score > previousScore.overall_score
        ? 'increased'
        : 'decreased';

    return this.createAlert({
      subject_id: subject.id,
      composite_score_id: currentScore.id,
      alert_type: 'rapid_change',
      severity: 'warning',
      title: `Rapid risk change for ${subject.identifier}`,
      message: `Risk score ${direction} by ${changePercent.toFixed(1)}% from ${previousScore.overall_score} to ${currentScore.overall_score} in ${timeWindowHours}h`,
      details: {
        previous_score: previousScore.overall_score,
        current_score: currentScore.overall_score,
        change_percent: changePercent,
        time_window_hours: timeWindowHours,
      },
    });
  }

  /**
   * Check for individual dimension spikes
   */
  private async checkDimensionSpikes(
    subject: RiskSubject,
    currentScore: RiskCompositeScore,
    previousScore: RiskCompositeScore,
    rapidChangeThreshold: number,
  ): Promise<RiskAlert[]> {
    const alerts: RiskAlert[] = [];

    const currentDimensions = currentScore.dimension_scores || {};
    const previousDimensions = previousScore.dimension_scores || {};

    for (const [dimension, currentValue] of Object.entries(currentDimensions)) {
      const previousValue = previousDimensions[dimension];

      if (previousValue === undefined || previousValue === 0) continue;

      const changePercent = Math.abs(
        ((currentValue - previousValue) / previousValue) * 100,
      );

      // Use higher threshold for dimension spikes (1.5x normal threshold)
      if (changePercent < rapidChangeThreshold * 1.5) continue;

      // Check for existing dimension spike alert
      const existingAlerts = await this.alertRepo.findUnacknowledgedBySubject(
        subject.id,
      );
      const hasExistingDimensionAlert = existingAlerts.some(
        (a) =>
          a.alert_type === 'dimension_spike' &&
          a.details?.dimension_slug === dimension &&
          a.composite_score_id === currentScore.id,
      );

      if (hasExistingDimensionAlert) continue;

      const alert = await this.createAlert({
        subject_id: subject.id,
        composite_score_id: currentScore.id,
        alert_type: 'dimension_spike',
        severity: 'info',
        title: `${dimension} risk spike for ${subject.identifier}`,
        message: `${dimension} dimension changed by ${changePercent.toFixed(1)}% from ${previousValue} to ${currentValue}`,
        details: {
          dimension_slug: dimension,
          dimension_score: currentValue,
          dimension_previous: previousValue,
          change_percent: changePercent,
        },
      });

      alerts.push(alert);
    }

    return alerts;
  }

  /**
   * Check for stale assessments
   */
  private async checkStaleAssessment(
    subject: RiskSubject,
    currentScore: RiskCompositeScore | undefined,
    staleHours: number,
  ): Promise<RiskAlert | null> {
    // If no score exists, that's a different problem (handled by UI)
    if (!currentScore) return null;

    const scoreAge =
      (Date.now() - new Date(currentScore.created_at).getTime()) /
      (1000 * 60 * 60);

    if (scoreAge < staleHours) {
      return null;
    }

    // Check for existing stale alert
    const existingAlerts = await this.alertRepo.findUnacknowledgedBySubject(
      subject.id,
    );
    const hasExistingStaleAlert = existingAlerts.some(
      (a) => a.alert_type === 'stale_assessment',
    );

    if (hasExistingStaleAlert) {
      return null;
    }

    return this.createAlert({
      subject_id: subject.id,
      composite_score_id: currentScore.id,
      alert_type: 'stale_assessment',
      severity: 'info',
      title: `Stale assessment for ${subject.identifier}`,
      message: `Last assessment was ${Math.round(scoreAge)}h ago (threshold: ${staleHours}h)`,
      details: {
        hours_since_assessment: Math.round(scoreAge),
        stale_threshold_hours: staleHours,
      },
    });
  }

  /**
   * Create an alert
   */
  private async createAlert(data: CreateRiskAlertData): Promise<RiskAlert> {
    this.logger.log(
      `Creating ${data.severity} alert: ${data.title} for subject ${data.subject_id}`,
    );
    return this.alertRepo.create(data);
  }

  /**
   * Build batch summary from results
   */
  private buildBatchSummary(
    results: AlertCheckResult[],
  ): BatchAlertCheckSummary {
    let criticalAlerts = 0;
    let warningAlerts = 0;
    let infoAlerts = 0;
    let totalAlertsGenerated = 0;

    for (const result of results) {
      for (const alert of result.alertsGenerated) {
        totalAlertsGenerated++;
        switch (alert.severity) {
          case 'critical':
            criticalAlerts++;
            break;
          case 'warning':
            warningAlerts++;
            break;
          case 'info':
            infoAlerts++;
            break;
        }
      }
    }

    return {
      totalSubjectsChecked: results.length,
      totalAlertsGenerated,
      criticalAlerts,
      warningAlerts,
      infoAlerts,
      results,
    };
  }

  // ─── QUERY METHODS ─────────────────────────────────────────────────────────

  /**
   * Get all alerts for a subject
   */
  async getAlertsBySubject(
    subjectId: string,
    filter?: AlertFilter,
  ): Promise<RiskAlert[]> {
    return this.alertRepo.findBySubject(subjectId, filter);
  }

  /**
   * Get unacknowledged alerts (using view with subject/scope info)
   */
  async getUnacknowledgedAlerts(
    filter?: AlertFilter,
  ): Promise<UnacknowledgedAlertView[]> {
    return this.alertRepo.findUnacknowledged(filter);
  }

  /**
   * Get unacknowledged alerts for a specific subject
   */
  async getUnacknowledgedBySubject(
    subjectId: string,
    filter?: AlertFilter,
  ): Promise<RiskAlert[]> {
    return this.alertRepo.findUnacknowledgedBySubject(subjectId, filter);
  }

  /**
   * Get an alert by ID
   */
  async getAlertById(id: string): Promise<RiskAlert | null> {
    return this.alertRepo.findById(id);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<RiskAlert> {
    this.logger.log(`Acknowledging alert ${alertId} by user ${userId}`);
    return this.alertRepo.acknowledge(alertId, userId);
  }

  /**
   * Count unacknowledged alerts by severity
   */
  async countUnacknowledgedBySeverity(
    filter?: AlertFilter,
  ): Promise<{ critical: number; warning: number; info: number }> {
    return this.alertRepo.countUnacknowledgedBySeverity(filter);
  }
}

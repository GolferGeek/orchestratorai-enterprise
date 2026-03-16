/**
 * Anomaly Detection Service
 *
 * Sprint 6 Task s6-6: Anomaly detection alerts
 * PRD Phase 7.6: Monitoring & Alerts
 *
 * Detects anomalies in signal generation and prediction accuracy.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import { ObservabilityEventsService } from '@/observability/observability-events.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  AlertService,
  AlertType,
  AlertSeverity,
  CreateAlertData,
} from './alert.service';

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE RESPONSE TYPE
// ═══════════════════════════════════════════════════════════════════════════

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AnomalyConfig {
  // Signal rate anomalies
  signal_rate_min_samples: number; // Minimum samples before detecting anomalies
  signal_rate_threshold_pct: number; // % deviation from baseline to trigger alert
  signal_rate_window_hours: number; // Time window for baseline calculation

  // Prediction accuracy anomalies
  accuracy_min_predictions: number; // Minimum predictions before detecting anomalies
  accuracy_threshold_pct: number; // % drop in accuracy to trigger alert
  accuracy_window_days: number; // Time window for baseline calculation
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyConfig = {
  signal_rate_min_samples: 10,
  signal_rate_threshold_pct: 50, // Alert if signal rate deviates >50% from baseline
  signal_rate_window_hours: 24,

  accuracy_min_predictions: 20,
  accuracy_threshold_pct: 20, // Alert if accuracy drops >20% from baseline
  accuracy_window_days: 7,
};

export interface SignalRateAnomaly {
  source_id: string;
  source_name: string;
  baseline_rate: number; // Signals per hour (baseline)
  current_rate: number; // Signals per hour (current)
  deviation_pct: number; // % deviation from baseline
  direction: 'increase' | 'decrease';
  severity: AlertSeverity;
}

export interface AccuracyAnomaly {
  target_id?: string;
  target_name?: string;
  baseline_accuracy: number; // % accuracy (baseline)
  current_accuracy: number; // % accuracy (current)
  deviation_pct: number; // % deviation from baseline
  total_predictions: number;
  severity: AlertSeverity;
}

export interface AnomalyDetectionResult {
  timestamp: string;
  signal_rate_anomalies: SignalRateAnomaly[];
  accuracy_anomalies: AccuracyAnomaly[];
  alerts_created: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);
  private readonly schema = 'prediction';

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly alertService: AlertService,
    private readonly observabilityEventsService: ObservabilityEventsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // ANOMALY DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Run full anomaly detection and create alerts
   */
  async detectAnomalies(
    ctx: ExecutionContext,
    config: AnomalyConfig = DEFAULT_ANOMALY_CONFIG,
  ): Promise<AnomalyDetectionResult> {
    this.logger.log('Starting anomaly detection');

    const timestamp = new Date().toISOString();
    let alertsCreated = 0;

    // Detect signal rate anomalies
    const signalRateAnomalies = await this.detectSignalRateAnomalies(config);

    // Create alerts for signal rate anomalies
    for (const anomaly of signalRateAnomalies) {
      const alert = await this.createSignalRateAlert(ctx, anomaly);
      if (alert) alertsCreated++;
    }

    // Detect accuracy anomalies
    const accuracyAnomalies = await this.detectAccuracyAnomalies(config);

    // Create alerts for accuracy anomalies
    for (const anomaly of accuracyAnomalies) {
      const alert = await this.createAccuracyAlert(ctx, anomaly);
      if (alert) alertsCreated++;
    }

    const result: AnomalyDetectionResult = {
      timestamp,
      signal_rate_anomalies: signalRateAnomalies,
      accuracy_anomalies: accuracyAnomalies,
      alerts_created: alertsCreated,
    };

    // Send observability event
    await this.observabilityEventsService.push({
      context: ctx,
      source_app: 'prediction-runner',
      hook_event_type: 'anomaly.detection.completed',
      status: 'completed',
      message: `Anomaly detection completed: ${signalRateAnomalies.length} signal rate anomalies, ${accuracyAnomalies.length} accuracy anomalies, ${alertsCreated} alerts created`,
      progress: 100,
      step: 'completed',
      payload: result as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });

    this.logger.log(
      `Anomaly detection completed: ${alertsCreated} alerts created`,
    );

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGNAL RATE ANOMALIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect anomalies in signal generation rates
   */
  async detectSignalRateAnomalies(
    config: AnomalyConfig,
  ): Promise<SignalRateAnomaly[]> {
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - config.signal_rate_window_hours * 60 * 60 * 1000,
    );
    const baselineStart = new Date(
      windowStart.getTime() - config.signal_rate_window_hours * 60 * 60 * 1000,
    );

    // Type for joined data
    type SignalWithSource = {
      source_id: string;
      sources: { id: string; name: string } | null;
    };

    // Get signal counts grouped by source for baseline period
    const { data: baselineData, error: baselineError } = (await this.db
      .from(this.schema, 'signals')
      .select('source_id, sources!inner(id, name)')
      .gte('detected_at', baselineStart.toISOString())
      .lt('detected_at', windowStart.toISOString())
      .eq('is_test', false)) as SupabaseSelectListResponse<SignalWithSource>;

    if (baselineError) {
      this.logger.error(
        `Failed to fetch baseline signals: ${baselineError.message}`,
      );
      return [];
    }

    // Get signal counts for current period
    const { data: currentData, error: currentError } = (await this.db
      .from(this.schema, 'signals')
      .select('source_id, sources!inner(id, name)')
      .gte('detected_at', windowStart.toISOString())
      .eq('is_test', false)) as SupabaseSelectListResponse<SignalWithSource>;

    if (currentError) {
      this.logger.error(
        `Failed to fetch current signals: ${currentError.message}`,
      );
      return [];
    }

    const baselineSignals = baselineData ?? [];
    const currentSignals = currentData ?? [];

    // Aggregate by source
    const baselineCounts = new Map<string, { count: number; name: string }>();
    for (const signal of baselineSignals) {
      const existing = baselineCounts.get(signal.source_id) ?? {
        count: 0,
        name: signal.sources?.name ?? 'Unknown',
      };
      existing.count++;
      baselineCounts.set(signal.source_id, existing);
    }

    const currentCounts = new Map<string, { count: number; name: string }>();
    for (const signal of currentSignals) {
      const existing = currentCounts.get(signal.source_id) ?? {
        count: 0,
        name: signal.sources?.name ?? 'Unknown',
      };
      existing.count++;
      currentCounts.set(signal.source_id, existing);
    }

    // Calculate rates and detect anomalies
    const anomalies: SignalRateAnomaly[] = [];
    const allSourceIds = new Set([
      ...baselineCounts.keys(),
      ...currentCounts.keys(),
    ]);

    for (const sourceId of allSourceIds) {
      const baseline = baselineCounts.get(sourceId);
      const current = currentCounts.get(sourceId);

      // Skip if not enough samples
      const totalSamples = (baseline?.count ?? 0) + (current?.count ?? 0);
      if (totalSamples < config.signal_rate_min_samples) continue;

      const baselineRate =
        (baseline?.count ?? 0) / config.signal_rate_window_hours;
      const currentRate =
        (current?.count ?? 0) / config.signal_rate_window_hours;

      // Calculate deviation
      const deviationPct =
        baselineRate > 0
          ? ((currentRate - baselineRate) / baselineRate) * 100
          : currentRate > 0
            ? 100
            : 0;

      // Check if deviation exceeds threshold
      if (Math.abs(deviationPct) >= config.signal_rate_threshold_pct) {
        const direction =
          deviationPct > 0 ? ('increase' as const) : ('decrease' as const);
        const severity = this.calculateSignalRateSeverity(
          Math.abs(deviationPct),
        );

        anomalies.push({
          source_id: sourceId,
          source_name: baseline?.name ?? current?.name ?? 'Unknown',
          baseline_rate: baselineRate,
          current_rate: currentRate,
          deviation_pct: deviationPct,
          direction,
          severity,
        });
      }
    }

    this.logger.debug(
      `Detected ${anomalies.length} signal rate anomalies across ${allSourceIds.size} sources`,
    );

    return anomalies;
  }

  /**
   * Calculate severity based on signal rate deviation
   */
  private calculateSignalRateSeverity(deviationPct: number): AlertSeverity {
    if (deviationPct >= 100) return 'critical';
    if (deviationPct >= 75) return 'warning';
    return 'info';
  }

  /**
   * Create alert for signal rate anomaly
   */
  private async createSignalRateAlert(
    ctx: ExecutionContext,
    anomaly: SignalRateAnomaly,
  ): Promise<boolean> {
    try {
      const alertData: CreateAlertData = {
        alert_type: 'anomaly.signal_rate' as AlertType,
        severity: anomaly.severity,
        source_id: anomaly.source_id,
        title: `Signal rate ${anomaly.direction} for ${anomaly.source_name}`,
        message: `Signal rate for "${anomaly.source_name}" has ${anomaly.direction}d by ${Math.abs(anomaly.deviation_pct).toFixed(1)}%. Baseline: ${anomaly.baseline_rate.toFixed(2)}/hr, Current: ${anomaly.current_rate.toFixed(2)}/hr`,
        details: {
          baseline_rate: anomaly.baseline_rate,
          current_rate: anomaly.current_rate,
          deviation_pct: anomaly.deviation_pct,
          direction: anomaly.direction,
        },
      };

      await this.alertService.createAlert(alertData);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to create signal rate alert: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCURACY ANOMALIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect anomalies in prediction accuracy
   */
  async detectAccuracyAnomalies(
    config: AnomalyConfig,
  ): Promise<AccuracyAnomaly[]> {
    const now = new Date();
    const windowEnd = now;
    const windowStart = new Date(
      now.getTime() - config.accuracy_window_days * 24 * 60 * 60 * 1000,
    );
    const baselineEnd = windowStart;
    const baselineStart = new Date(
      baselineEnd.getTime() - config.accuracy_window_days * 24 * 60 * 60 * 1000,
    );

    type PredictionRow = {
      id: string;
      direction: string;
      outcome_value: number | null;
      target_id: string;
    };

    // Get resolved predictions for baseline period
    const { data: baselineData, error: baselineError } = (await this.db
      .from(this.schema, 'predictions')
      .select('id, direction, outcome_value, target_id')
      .eq('status', 'resolved')
      .eq('is_test', false)
      .gte('predicted_at', baselineStart.toISOString())
      .lt(
        'predicted_at',
        baselineEnd.toISOString(),
      )) as SupabaseSelectListResponse<PredictionRow>;

    if (baselineError) {
      this.logger.error(
        `Failed to fetch baseline predictions: ${baselineError.message}`,
      );
      return [];
    }

    // Get resolved predictions for current period
    const { data: currentData, error: currentError } = (await this.db
      .from(this.schema, 'predictions')
      .select('id, direction, outcome_value, target_id')
      .eq('status', 'resolved')
      .eq('is_test', false)
      .gte('predicted_at', windowStart.toISOString())
      .lte(
        'predicted_at',
        windowEnd.toISOString(),
      )) as SupabaseSelectListResponse<PredictionRow>;

    if (currentError) {
      this.logger.error(
        `Failed to fetch current predictions: ${currentError.message}`,
      );
      return [];
    }

    const baselinePredictions = baselineData ?? [];
    const currentPredictions = currentData ?? [];

    // Calculate overall accuracy
    const baselineAccuracy = this.calculateAccuracy(baselinePredictions);
    const currentAccuracy = this.calculateAccuracy(currentPredictions);

    const anomalies: AccuracyAnomaly[] = [];

    // Check overall accuracy anomaly
    const totalPredictions =
      baselinePredictions.length + currentPredictions.length;
    if (totalPredictions >= config.accuracy_min_predictions) {
      const deviationPct =
        baselineAccuracy > 0
          ? ((currentAccuracy - baselineAccuracy) / baselineAccuracy) * 100
          : 0;

      // Only alert on accuracy drops (negative deviation)
      if (deviationPct <= -config.accuracy_threshold_pct) {
        const severity = this.calculateAccuracySeverity(Math.abs(deviationPct));

        anomalies.push({
          baseline_accuracy: baselineAccuracy,
          current_accuracy: currentAccuracy,
          deviation_pct: deviationPct,
          total_predictions: currentPredictions.length,
          severity,
        });
      }
    }

    this.logger.debug(
      `Detected ${anomalies.length} accuracy anomalies (baseline: ${baselineAccuracy.toFixed(1)}%, current: ${currentAccuracy.toFixed(1)}%)`,
    );

    return anomalies;
  }

  /**
   * Calculate accuracy from predictions
   */
  private calculateAccuracy(
    predictions: Array<{ direction: string; outcome_value: number | null }>,
  ): number {
    const resolved = predictions.filter((p) => p.outcome_value !== null);
    if (resolved.length === 0) return 0;

    const correct = resolved.filter((p) => {
      const outcomeDirection = (p.outcome_value ?? 0) > 0 ? 'up' : 'down';
      return p.direction === outcomeDirection;
    });

    return (correct.length / resolved.length) * 100;
  }

  /**
   * Calculate severity based on accuracy deviation
   */
  private calculateAccuracySeverity(deviationPct: number): AlertSeverity {
    if (deviationPct >= 40) return 'critical';
    if (deviationPct >= 30) return 'warning';
    return 'info';
  }

  /**
   * Create alert for accuracy anomaly
   */
  private async createAccuracyAlert(
    ctx: ExecutionContext,
    anomaly: AccuracyAnomaly,
  ): Promise<boolean> {
    try {
      const alertData: CreateAlertData = {
        alert_type: 'anomaly.prediction_accuracy' as AlertType,
        severity: anomaly.severity,
        target_id: anomaly.target_id,
        title: anomaly.target_name
          ? `Prediction accuracy drop for ${anomaly.target_name}`
          : 'Overall prediction accuracy drop',
        message: `Prediction accuracy has dropped by ${Math.abs(anomaly.deviation_pct).toFixed(1)}%. Baseline: ${anomaly.baseline_accuracy.toFixed(1)}%, Current: ${anomaly.current_accuracy.toFixed(1)}% (${anomaly.total_predictions} predictions)`,
        details: {
          baseline_accuracy: anomaly.baseline_accuracy,
          current_accuracy: anomaly.current_accuracy,
          deviation_pct: anomaly.deviation_pct,
          total_predictions: anomaly.total_predictions,
        },
      };

      await this.alertService.createAlert(alertData);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to create accuracy alert: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}

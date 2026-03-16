/**
 * Alert Service
 *
 * Sprint 6 Task s6-5: Crawl failure alert system
 * PRD Phase 7.6: Monitoring & Alerts
 *
 * Provides alert management for crawl failures and system anomalies.
 */

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import { ObservabilityEventsService } from '@/observability/observability-events.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE RESPONSE TYPE
// ═══════════════════════════════════════════════════════════════════════════

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: { message: string } | null;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type AlertType =
  | 'crawl.failure.threshold'
  | 'crawl.failure.resolved'
  | 'crawl.degraded'
  | 'anomaly.signal_rate'
  | 'anomaly.prediction_accuracy';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

/**
 * Alert record stored in database
 */
export interface Alert {
  id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  source_id?: string;
  target_id?: string;
  universe_id?: string;
  title: string;
  message: string;
  details: Record<string, unknown>;
  created_at: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolved_at?: string;
  resolved_by?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Data for creating a new alert
 */
export interface CreateAlertData {
  alert_type: AlertType;
  severity: AlertSeverity;
  source_id?: string;
  target_id?: string;
  universe_id?: string;
  title: string;
  message: string;
  details: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Filters for listing alerts
 */
export interface AlertFilters {
  alert_type?: AlertType | AlertType[];
  severity?: AlertSeverity | AlertSeverity[];
  status?: AlertStatus | AlertStatus[];
  source_id?: string;
  target_id?: string;
  universe_id?: string;
  created_after?: string;
  created_before?: string;
  limit?: number;
  offset?: number;
}

/**
 * Alert configuration for thresholds
 */
export interface AlertConfig {
  crawl_failure_threshold: number; // Consecutive failures before alert
  crawl_degraded_threshold: number; // Success rate % below which to alert
  crawl_degraded_window_hours: number; // Time window for success rate calculation
}

/**
 * Default alert configuration
 */
export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  crawl_failure_threshold: 3,
  crawl_degraded_threshold: 70, // Alert if success rate drops below 70%
  crawl_degraded_window_hours: 24,
};

/**
 * Crawl failure context for alert creation
 */
export interface CrawlFailureContext {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  targetId?: string;
  universeId?: string;
  consecutiveErrors: number;
  lastError: string;
  lastCrawlAt?: string;
}

/**
 * Crawl success context for resolving alerts
 */
export interface CrawlSuccessContext {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  previousConsecutiveErrors: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private readonly schema = 'prediction';

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly observabilityEventsService: ObservabilityEventsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CRAWL FAILURE ALERTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if a crawl failure alert should be created and create it
   *
   * Called after each crawl attempt to determine if threshold is exceeded
   */
  async checkAndCreateCrawlFailureAlert(
    ctx: ExecutionContext,
    failureContext: CrawlFailureContext,
    config: AlertConfig = DEFAULT_ALERT_CONFIG,
  ): Promise<Alert | null> {
    const { sourceId, sourceName, sourceType, consecutiveErrors, lastError } =
      failureContext;

    // Check if we've exceeded the threshold
    if (consecutiveErrors < config.crawl_failure_threshold) {
      this.logger.debug(
        `Source ${sourceId} has ${consecutiveErrors} consecutive errors (threshold: ${config.crawl_failure_threshold})`,
      );
      return null;
    }

    // Check if there's already an active alert for this source
    const existingAlert = await this.findActiveAlertForSource(
      sourceId,
      'crawl.failure.threshold',
    );

    if (existingAlert) {
      this.logger.debug(
        `Active alert already exists for source ${sourceId}: ${existingAlert.id}`,
      );
      return existingAlert;
    }

    // Determine severity based on consecutive errors
    let severity: AlertSeverity = 'warning';
    if (consecutiveErrors >= config.crawl_failure_threshold * 2) {
      severity = 'critical';
    }

    // Create the alert
    const alertData: CreateAlertData = {
      alert_type: 'crawl.failure.threshold',
      severity,
      source_id: sourceId,
      target_id: failureContext.targetId,
      universe_id: failureContext.universeId,
      title: `Crawl failures for ${sourceName}`,
      message: `Source "${sourceName}" (${sourceType}) has failed ${consecutiveErrors} consecutive times. Last error: ${lastError}`,
      details: {
        consecutive_errors: consecutiveErrors,
        last_error: lastError,
        source_type: sourceType,
        last_crawl_at: failureContext.lastCrawlAt,
        threshold: config.crawl_failure_threshold,
      },
    };

    const alert = await this.createAlert(alertData);

    // Send observability event
    await this.observabilityEventsService.push({
      context: ctx,
      source_app: 'prediction-runner',
      hook_event_type: 'alert.created',
      status: 'warning',
      message: alertData.message,
      progress: 0,
      step: 'alert_creation',
      payload: {
        alert_id: alert.id,
        alert_type: alertData.alert_type,
        severity: alertData.severity,
        source_id: sourceId,
      },
      timestamp: Date.now(),
    });

    this.logger.warn(
      `Created crawl failure alert ${alert.id} for source ${sourceId} (${consecutiveErrors} failures)`,
    );

    return alert;
  }

  /**
   * Resolve crawl failure alert when crawl succeeds
   */
  async resolveCrawlFailureAlert(
    ctx: ExecutionContext,
    successContext: CrawlSuccessContext,
  ): Promise<Alert | null> {
    const { sourceId, sourceName, previousConsecutiveErrors } = successContext;

    // Only resolve if there were previous errors
    if (previousConsecutiveErrors === 0) {
      return null;
    }

    // Find active alert for this source
    const existingAlert = await this.findActiveAlertForSource(
      sourceId,
      'crawl.failure.threshold',
    );

    if (!existingAlert) {
      return null;
    }

    // Resolve the alert
    const resolvedAlert = await this.resolveAlert(
      ctx,
      existingAlert.id,
      `Crawl succeeded for ${sourceName} after ${previousConsecutiveErrors} failures`,
    );

    // Create a resolution notification alert
    await this.createAlert({
      alert_type: 'crawl.failure.resolved',
      severity: 'info',
      source_id: sourceId,
      title: `Crawl recovered for ${sourceName}`,
      message: `Source "${sourceName}" is now crawling successfully after ${previousConsecutiveErrors} consecutive failures.`,
      details: {
        previous_consecutive_errors: previousConsecutiveErrors,
        resolved_alert_id: existingAlert.id,
      },
    });

    // Send observability event
    await this.observabilityEventsService.push({
      context: ctx,
      source_app: 'prediction-runner',
      hook_event_type: 'alert.resolved',
      status: 'completed',
      message: `Crawl recovered for ${sourceName}`,
      progress: 100,
      step: 'alert_resolution',
      payload: {
        alert_id: existingAlert.id,
        source_id: sourceId,
        previous_errors: previousConsecutiveErrors,
      },
      timestamp: Date.now(),
    });

    this.logger.log(
      `Resolved crawl failure alert ${existingAlert.id} for source ${sourceId}`,
    );

    return resolvedAlert;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERT CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new alert
   */
  async createAlert(data: CreateAlertData): Promise<Alert> {
    const { data: alert, error } = (await this.db
      .from(this.schema, 'alerts')
      .insert({
        alert_type: data.alert_type,
        severity: data.severity,
        status: 'active' as AlertStatus,
        source_id: data.source_id,
        target_id: data.target_id,
        universe_id: data.universe_id,
        title: data.title,
        message: data.message,
        details: data.details,
        metadata: data.metadata ?? {},
      })
      .select()
      .single()) as SupabaseSelectResponse<Alert>;

    if (error) {
      this.logger.error(`Failed to create alert: ${error.message}`);
      throw new Error(`Failed to create alert: ${error.message}`);
    }

    return alert as Alert;
  }

  /**
   * List alerts with optional filters
   */
  async listAlerts(
    ctx: ExecutionContext,
    filters: AlertFilters = {},
  ): Promise<Alert[]> {
    let query = this.db
      .from(this.schema, 'alerts')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.alert_type) {
      if (Array.isArray(filters.alert_type)) {
        query = query.in('alert_type', filters.alert_type);
      } else {
        query = query.eq('alert_type', filters.alert_type);
      }
    }

    if (filters.severity) {
      if (Array.isArray(filters.severity)) {
        query = query.in('severity', filters.severity);
      } else {
        query = query.eq('severity', filters.severity);
      }
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status);
      } else {
        query = query.eq('status', filters.status);
      }
    }

    if (filters.source_id) {
      query = query.eq('source_id', filters.source_id);
    }

    if (filters.target_id) {
      query = query.eq('target_id', filters.target_id);
    }

    if (filters.universe_id) {
      query = query.eq('universe_id', filters.universe_id);
    }

    if (filters.created_after) {
      query = query.gte('created_at', filters.created_after);
    }

    if (filters.created_before) {
      query = query.lte('created_at', filters.created_before);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(
        filters.offset,
        filters.offset + (filters.limit ?? 50) - 1,
      );
    }

    const { data, error } = (await query) as SupabaseSelectListResponse<Alert>;

    if (error) {
      this.logger.error(`Failed to list alerts: ${error.message}`);
      throw new Error(`Failed to list alerts: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Get alert by ID
   */
  async getAlertById(alertId: string): Promise<Alert> {
    const { data, error } = (await this.db
      .from(this.schema, 'alerts')
      .select('*')
      .eq('id', alertId)
      .single()) as SupabaseSelectResponse<Alert>;

    if (error) {
      this.logger.error(`Failed to get alert ${alertId}: ${error.message}`);
      throw new NotFoundException(`Alert ${alertId} not found`);
    }

    return data as Alert;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(
    ctx: ExecutionContext,
    alertId: string,
  ): Promise<Alert> {
    const { data, error } = (await this.db
      .from(this.schema, 'alerts')
      .update({
        status: 'acknowledged' as AlertStatus,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: ctx.userId,
      })
      .eq('id', alertId)
      .select()
      .single()) as SupabaseSelectResponse<Alert>;

    if (error) {
      this.logger.error(
        `Failed to acknowledge alert ${alertId}: ${error.message}`,
      );
      throw new Error(`Failed to acknowledge alert: ${error.message}`);
    }

    this.logger.log(`Alert ${alertId} acknowledged by ${ctx.userId}`);

    return data as Alert;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(
    ctx: ExecutionContext,
    alertId: string,
    resolutionNote?: string,
  ): Promise<Alert> {
    const updateData: Record<string, unknown> = {
      status: 'resolved' as AlertStatus,
      resolved_at: new Date().toISOString(),
      resolved_by: ctx.userId,
    };

    if (resolutionNote) {
      // Get existing metadata to merge
      const existing = await this.getAlertById(alertId);
      updateData.metadata = {
        ...existing.metadata,
        resolution_note: resolutionNote,
      };
    }

    const { data, error } = (await this.db
      .from(this.schema, 'alerts')
      .update(updateData)
      .eq('id', alertId)
      .select()
      .single()) as SupabaseSelectResponse<Alert>;

    if (error) {
      this.logger.error(`Failed to resolve alert ${alertId}: ${error.message}`);
      throw new Error(`Failed to resolve alert: ${error.message}`);
    }

    this.logger.log(`Alert ${alertId} resolved by ${ctx.userId}`);

    return data as Alert;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Find active alert for a source
   */
  private async findActiveAlertForSource(
    sourceId: string,
    alertType: AlertType,
  ): Promise<Alert | null> {
    const { data, error } = (await this.db
      .from(this.schema, 'alerts')
      .select('*')
      .eq('source_id', sourceId)
      .eq('alert_type', alertType)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as SupabaseSelectResponse<Alert>;

    if (error) {
      this.logger.error(
        `Failed to find active alert for source ${sourceId}: ${error.message}`,
      );
      return null;
    }

    return data;
  }

  /**
   * Get alert counts by status
   */
  async getAlertCounts(): Promise<{
    active: number;
    acknowledged: number;
    resolved: number;
    total: number;
  }> {
    const { data, error } = (await this.db
      .from(this.schema, 'alerts')
      .select('status')) as SupabaseSelectListResponse<{ status: AlertStatus }>;

    if (error) {
      this.logger.error(`Failed to get alert counts: ${error.message}`);
      throw new Error(`Failed to get alert counts: ${error.message}`);
    }

    const alerts = data ?? [];

    return {
      active: alerts.filter((a) => a.status === 'active').length,
      acknowledged: alerts.filter((a) => a.status === 'acknowledged').length,
      resolved: alerts.filter((a) => a.status === 'resolved').length,
      total: alerts.length,
    };
  }

  /**
   * Get active alerts for a universe
   */
  async getActiveAlertsForUniverse(universeId: string): Promise<Alert[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'alerts')
      .select('*')
      .eq('universe_id', universeId)
      .in('status', ['active', 'acknowledged'])
      .order('severity', { ascending: false })
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<Alert>;

    if (error) {
      this.logger.error(
        `Failed to get active alerts for universe ${universeId}: ${error.message}`,
      );
      throw new Error(`Failed to get active alerts: ${error.message}`);
    }

    return data ?? [];
  }
}

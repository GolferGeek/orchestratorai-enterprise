import { Injectable, Logger } from '@nestjs/common';
import { TestAuditLogRepository } from '../repositories/test-audit-log.repository';
import {
  TestAuditLogEntry,
  TestScenario,
  ScenarioRun,
  AuditLogFilter,
} from '../interfaces/test-data.interface';
import { LearningLineage } from '../interfaces/learning.interface';

/**
 * Service for audit logging in the test system
 * Part of Test Data Injection Framework (Phase 3)
 * Handles INV-07: Audit trail for all test system actions
 */
@Injectable()
export class TestAuditService {
  private readonly logger = new Logger(TestAuditService.name);

  constructor(private readonly auditLogRepository: TestAuditLogRepository) {}

  /**
   * Log a generic audit entry
   * Core method used by all convenience methods
   */
  async log(
    orgSlug: string,
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    details?: Record<string, unknown>,
  ): Promise<TestAuditLogEntry> {
    this.logger.debug(
      `Logging audit entry: ${action} on ${resourceType}:${resourceId} by user ${userId}`,
    );

    return this.auditLogRepository.log({
      organization_slug: orgSlug,
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details: details ?? {},
    });
  }

  /**
   * Log scenario created event
   */
  async logScenarioCreated(
    scenario: TestScenario,
    userId: string,
  ): Promise<TestAuditLogEntry> {
    return this.log(
      scenario.organization_slug,
      userId,
      'scenario_created',
      'test_scenario',
      scenario.id,
      {
        scenario_name: scenario.name,
        injection_points: scenario.injection_points,
        target_id: scenario.target_id,
        config: scenario.config,
      },
    );
  }

  /**
   * Log scenario updated event
   */
  async logScenarioUpdated(
    scenario: TestScenario,
    userId: string,
    changes: Record<string, unknown>,
  ): Promise<TestAuditLogEntry> {
    return this.log(
      scenario.organization_slug,
      userId,
      'scenario_updated',
      'test_scenario',
      scenario.id,
      {
        scenario_name: scenario.name,
        changes,
      },
    );
  }

  /**
   * Log scenario deleted event
   */
  async logScenarioDeleted(
    scenarioId: string,
    orgSlug: string,
    userId: string,
    scenarioName?: string,
  ): Promise<TestAuditLogEntry> {
    return this.log(
      orgSlug,
      userId,
      'scenario_deleted',
      'test_scenario',
      scenarioId,
      {
        scenario_name: scenarioName,
      },
    );
  }

  /**
   * Log scenario run started event
   */
  async logScenarioRunStarted(
    run: ScenarioRun,
    userId: string,
  ): Promise<TestAuditLogEntry> {
    return this.log(
      run.organization_slug,
      userId,
      'scenario_run_started',
      'scenario_run',
      run.id,
      {
        scenario_id: run.scenario_id,
        version_info: run.version_info,
        outcome_expected: run.outcome_expected,
      },
    );
  }

  /**
   * Log scenario run completed event
   */
  async logScenarioRunCompleted(
    run: ScenarioRun,
    userId: string,
  ): Promise<TestAuditLogEntry> {
    return this.log(
      run.organization_slug,
      userId,
      'scenario_run_completed',
      'scenario_run',
      run.id,
      {
        scenario_id: run.scenario_id,
        outcome_expected: run.outcome_expected,
        outcome_actual: run.outcome_actual,
        outcome_match: run.outcome_match,
        duration_ms:
          run.started_at && run.completed_at
            ? new Date(run.completed_at).getTime() -
              new Date(run.started_at).getTime()
            : null,
      },
    );
  }

  /**
   * Log scenario run failed event
   */
  async logScenarioRunFailed(
    run: ScenarioRun,
    userId: string,
  ): Promise<TestAuditLogEntry> {
    return this.log(
      run.organization_slug,
      userId,
      'scenario_run_failed',
      'scenario_run',
      run.id,
      {
        scenario_id: run.scenario_id,
        error_message: run.error_message,
      },
    );
  }

  /**
   * Log learning promoted from test to production
   */
  async logLearningPromoted(
    lineage: LearningLineage,
    userId: string,
  ): Promise<TestAuditLogEntry> {
    return this.log(
      lineage.organization_slug,
      userId,
      'learning_promoted',
      'learning',
      lineage.test_learning_id,
      {
        production_learning_id: lineage.production_learning_id,
        lineage_id: lineage.id,
        scenario_runs: lineage.scenario_runs,
        validation_metrics: lineage.validation_metrics,
        backtest_result: lineage.backtest_result,
        notes: lineage.notes,
      },
    );
  }

  /**
   * Log learning rejected (not promoted)
   */
  async logLearningRejected(
    learningId: string,
    orgSlug: string,
    userId: string,
    reason: string,
    additionalDetails?: Record<string, unknown>,
  ): Promise<TestAuditLogEntry> {
    return this.log(
      orgSlug,
      userId,
      'learning_rejected',
      'learning',
      learningId,
      {
        reason,
        ...additionalDetails,
      },
    );
  }

  /**
   * Log data injection event
   */
  async logDataInjected(
    scenarioId: string,
    orgSlug: string,
    userId: string,
    injectionDetails: {
      injection_points: string[];
      items_injected: Record<string, number>;
    },
  ): Promise<TestAuditLogEntry> {
    return this.log(
      orgSlug,
      userId,
      'data_injected',
      'test_scenario',
      scenarioId,
      injectionDetails,
    );
  }

  /**
   * Log data cleanup event
   */
  async logDataCleaned(
    scenarioId: string,
    orgSlug: string,
    userId: string,
    cleanupDetails: {
      tables_cleaned: Array<{ table_name: string; rows_deleted: number }>;
      total_deleted: number;
    },
  ): Promise<TestAuditLogEntry> {
    return this.log(
      orgSlug,
      userId,
      'data_cleaned',
      'test_scenario',
      scenarioId,
      cleanupDetails,
    );
  }

  /**
   * Get complete audit trail for a specific resource
   * Returns all actions performed on the resource in chronological order
   */
  async getAuditTrail(
    resourceType: string,
    resourceId: string,
  ): Promise<TestAuditLogEntry[]> {
    return this.auditLogRepository.getAuditTrail(resourceType, resourceId);
  }

  /**
   * Get user's actions within a date range
   */
  async getUserActions(
    userId: string,
    orgSlug: string,
    dateRange?: {
      start_date?: string;
      end_date?: string;
    },
    limit?: number,
  ): Promise<TestAuditLogEntry[]> {
    return this.auditLogRepository.findByUser(userId, orgSlug, {
      start_date: dateRange?.start_date,
      end_date: dateRange?.end_date,
      limit,
    });
  }

  /**
   * Get recent audit entries for an organization
   */
  async getRecentActions(
    orgSlug: string,
    limit: number = 50,
  ): Promise<TestAuditLogEntry[]> {
    return this.auditLogRepository.getRecent(orgSlug, limit);
  }

  /**
   * Find audit entries with flexible filtering
   */
  async findAuditEntries(
    orgSlug: string,
    filter?: AuditLogFilter,
  ): Promise<TestAuditLogEntry[]> {
    return this.auditLogRepository.find(orgSlug, filter);
  }

  /**
   * Get audit trail for a scenario and all its runs
   * Useful for understanding complete scenario lifecycle
   */
  async getScenarioAuditTrail(
    scenarioId: string,
    orgSlug: string,
  ): Promise<{
    scenario_events: TestAuditLogEntry[];
    run_events: TestAuditLogEntry[];
  }> {
    // Get all scenario events
    const scenario_events = await this.auditLogRepository.findByResource(
      'test_scenario',
      scenarioId,
    );

    // Get all scenario run events
    const run_events = await this.auditLogRepository.find(orgSlug, {
      resource_type: 'scenario_run',
    });

    // Filter run events that belong to this scenario
    const filtered_run_events = run_events.filter(
      (entry) =>
        entry.details &&
        'scenario_id' in entry.details &&
        entry.details.scenario_id === scenarioId,
    );

    return {
      scenario_events,
      run_events: filtered_run_events,
    };
  }

  /**
   * Get statistics about audit activity
   */
  async getAuditStatistics(
    orgSlug: string,
    dateRange?: {
      start_date?: string;
      end_date?: string;
    },
  ): Promise<{
    total_events: number;
    events_by_action: Record<string, number>;
    events_by_resource_type: Record<string, number>;
    unique_users: number;
    recent_activity: TestAuditLogEntry[];
  }> {
    const entries = await this.auditLogRepository.find(orgSlug, {
      start_date: dateRange?.start_date,
      end_date: dateRange?.end_date,
      limit: 1000, // Reasonable limit for statistics
    });

    const events_by_action: Record<string, number> = {};
    const events_by_resource_type: Record<string, number> = {};
    const unique_user_ids = new Set<string>();

    for (const entry of entries) {
      // Count by action
      events_by_action[entry.action] =
        (events_by_action[entry.action] ?? 0) + 1;

      // Count by resource type
      events_by_resource_type[entry.resource_type] =
        (events_by_resource_type[entry.resource_type] ?? 0) + 1;

      // Track unique users
      unique_user_ids.add(entry.user_id);
    }

    // Get 10 most recent entries
    const recent_activity = entries.slice(0, 10);

    return {
      total_events: entries.length,
      events_by_action,
      events_by_resource_type,
      unique_users: unique_user_ids.size,
      recent_activity,
    };
  }
}

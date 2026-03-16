import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  RiskAlert,
  CreateRiskAlertData,
  UpdateRiskAlertData,
  UnacknowledgedAlertView,
} from '../interfaces/alert.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

export interface AlertFilter {
  includeTest?: boolean;
  testScenarioId?: string;
}

@Injectable()
export class AlertRepository {
  private readonly logger = new Logger(AlertRepository.name);
  private readonly schema = 'risk';
  private readonly table = 'alerts';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  private applyTestFilter<T extends { eq: (col: string, val: unknown) => T }>(
    query: T,
    filter?: AlertFilter,
  ): T {
    if (filter?.testScenarioId) {
      query = query.eq('test_scenario_id', filter.testScenarioId);
    } else if (!filter?.includeTest) {
      query = query.eq('is_test', false);
    }
    return query;
  }

  async findBySubject(
    subjectId: string,
    filter?: AlertFilter,
  ): Promise<RiskAlert[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('subject_id', subjectId);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskAlert>;

    if (error) {
      this.logger.error(`Failed to fetch alerts: ${error.message}`);
      throw new Error(`Failed to fetch alerts: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find alerts by scope (via subjects in scope)
   * Phase 5: Portfolio-level alert retrieval
   */
  async findByScope(
    scopeId: string,
    filter?: AlertFilter,
  ): Promise<RiskAlert[]> {
    // Join alerts with subjects to filter by scope
    let query = this.db
      .from(this.schema, this.table)
      .select(
        `
        *,
        subjects!inner(scope_id)
      `,
      )
      .eq('subjects.scope_id', scopeId);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskAlert>;

    if (error) {
      this.logger.error(`Failed to fetch alerts by scope: ${error.message}`);
      throw new Error(`Failed to fetch alerts by scope: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find unacknowledged alerts using the view
   */
  async findUnacknowledged(
    _filter?: AlertFilter,
  ): Promise<UnacknowledgedAlertView[]> {
    // The view already filters for unacknowledged and non-test
    const { data, error } = (await this.db
      .from(this.schema, 'unacknowledged_alerts')
      .select('*')) as SupabaseSelectListResponse<UnacknowledgedAlertView>;

    if (error) {
      this.logger.error(
        `Failed to fetch unacknowledged alerts: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch unacknowledged alerts: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find unacknowledged alerts for a specific subject
   */
  async findUnacknowledgedBySubject(
    subjectId: string,
    filter?: AlertFilter,
  ): Promise<RiskAlert[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('subject_id', subjectId)
      .is('acknowledged_at', null);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskAlert>;

    if (error) {
      this.logger.error(
        `Failed to fetch unacknowledged alerts: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch unacknowledged alerts: ${error.message}`,
      );
    }

    return data ?? [];
  }

  async findById(id: string): Promise<RiskAlert | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<RiskAlert>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch alert: ${error.message}`);
      throw new Error(`Failed to fetch alert: ${error.message}`);
    }

    return data;
  }

  async findByIdOrThrow(id: string): Promise<RiskAlert> {
    const alert = await this.findById(id);
    if (!alert) {
      throw new NotFoundException(`Alert not found: ${id}`);
    }
    return alert;
  }

  async create(alertData: CreateRiskAlertData): Promise<RiskAlert> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(alertData)
      .select()
      .single()) as SupabaseSelectResponse<RiskAlert>;

    if (error) {
      this.logger.error(`Failed to create alert: ${error.message}`);
      throw new Error(`Failed to create alert: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no alert returned');
    }

    this.logger.log(
      `Created alert: ${data.id} (${data.severity}: ${data.title})`,
    );
    return data;
  }

  async update(
    id: string,
    updateData: UpdateRiskAlertData,
  ): Promise<RiskAlert> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<RiskAlert>;

    if (error) {
      this.logger.error(`Failed to update alert: ${error.message}`);
      throw new Error(`Failed to update alert: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no alert returned');
    }

    this.logger.log(`Updated alert: ${id}`);
    return data;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledge(id: string, userId: string): Promise<RiskAlert> {
    return this.update(id, {
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: userId,
    });
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete alert: ${error.message}`);
      throw new Error(`Failed to delete alert: ${error.message}`);
    }

    this.logger.log(`Deleted alert: ${id}`);
  }

  /**
   * Count unacknowledged alerts by severity
   */
  async countUnacknowledgedBySeverity(
    filter?: AlertFilter,
  ): Promise<{ critical: number; warning: number; info: number }> {
    const alerts = await this.findUnacknowledged(filter);

    return {
      critical: alerts.filter((a) => a.severity === 'critical').length,
      warning: alerts.filter((a) => a.severity === 'warning').length,
      info: alerts.filter((a) => a.severity === 'info').length,
    };
  }
}

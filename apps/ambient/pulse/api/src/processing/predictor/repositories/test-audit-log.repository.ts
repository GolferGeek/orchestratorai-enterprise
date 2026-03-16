import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  TestAuditLogEntry,
  CreateAuditLogData,
  AuditLogFilter,
} from '../interfaces/test-data.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

/**
 * Repository for test audit log (prediction.test_audit_log)
 * Part of the Test Data Injection Framework (Phase 3)
 * Tracks audit trail for all test operations
 */
@Injectable()
export class TestAuditLogRepository {
  private readonly logger = new Logger(TestAuditLogRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'test_audit_log';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Log a new audit entry
   */
  async log(data: CreateAuditLogData): Promise<TestAuditLogEntry> {
    const { data: result, error } = (await this.db
      .from(this.schema, this.table)
      .insert({
        ...data,
        details: data.details ?? {},
      })
      .select()
      .single()) as SupabaseSelectResponse<TestAuditLogEntry>;

    if (error) {
      this.logger.error(`Failed to create audit log entry: ${error.message}`);
      throw new Error(`Failed to create audit log entry: ${error.message}`);
    }

    if (!result) {
      throw new Error('Log succeeded but no audit entry returned');
    }

    this.logger.debug(
      `Logged audit entry: ${data.action} on ${data.resource_type}:${data.resource_id}`,
    );
    return result;
  }

  /**
   * Find audit log entries by resource
   */
  async findByResource(
    resourceType: string,
    resourceId: string,
    filter?: Omit<AuditLogFilter, 'resource_type' | 'resource_id'>,
  ): Promise<TestAuditLogEntry[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId);

    // Apply optional filters
    if (filter?.action) {
      query = query.eq('action', filter.action);
    }
    if (filter?.user_id) {
      query = query.eq('user_id', filter.user_id);
    }
    if (filter?.start_date) {
      query = query.gte('created_at', filter.start_date);
    }
    if (filter?.end_date) {
      query = query.lte('created_at', filter.end_date);
    }

    // Order by created_at descending
    query = query.order('created_at', { ascending: false });

    // Apply limit if specified
    if (filter?.limit) {
      query = query.limit(filter.limit);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<TestAuditLogEntry>;

    if (error) {
      this.logger.error(
        `Failed to fetch audit log entries by resource: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch audit log entries by resource: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find audit log entries by user
   */
  async findByUser(
    userId: string,
    organizationSlug: string,
    filter?: Omit<AuditLogFilter, 'user_id'>,
  ): Promise<TestAuditLogEntry[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('user_id', userId)
      .eq('organization_slug', organizationSlug);

    // Apply optional filters
    if (filter?.action) {
      query = query.eq('action', filter.action);
    }
    if (filter?.resource_type) {
      query = query.eq('resource_type', filter.resource_type);
    }
    if (filter?.resource_id) {
      query = query.eq('resource_id', filter.resource_id);
    }
    if (filter?.start_date) {
      query = query.gte('created_at', filter.start_date);
    }
    if (filter?.end_date) {
      query = query.lte('created_at', filter.end_date);
    }

    // Order by created_at descending
    query = query.order('created_at', { ascending: false });

    // Apply limit if specified
    if (filter?.limit) {
      query = query.limit(filter.limit);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<TestAuditLogEntry>;

    if (error) {
      this.logger.error(
        `Failed to fetch audit log entries by user: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch audit log entries by user: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find audit log entries by action
   */
  async findByAction(
    action: string,
    organizationSlug: string,
    filter?: Omit<AuditLogFilter, 'action'>,
  ): Promise<TestAuditLogEntry[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('action', action)
      .eq('organization_slug', organizationSlug);

    // Apply optional filters
    if (filter?.resource_type) {
      query = query.eq('resource_type', filter.resource_type);
    }
    if (filter?.resource_id) {
      query = query.eq('resource_id', filter.resource_id);
    }
    if (filter?.user_id) {
      query = query.eq('user_id', filter.user_id);
    }
    if (filter?.start_date) {
      query = query.gte('created_at', filter.start_date);
    }
    if (filter?.end_date) {
      query = query.lte('created_at', filter.end_date);
    }

    // Order by created_at descending
    query = query.order('created_at', { ascending: false });

    // Apply limit if specified
    if (filter?.limit) {
      query = query.limit(filter.limit);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<TestAuditLogEntry>;

    if (error) {
      this.logger.error(
        `Failed to fetch audit log entries by action: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch audit log entries by action: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Get complete audit trail for a specific resource
   * Includes all actions performed on the resource
   */
  async getAuditTrail(
    resourceType: string,
    resourceId: string,
  ): Promise<TestAuditLogEntry[]> {
    return this.findByResource(resourceType, resourceId);
  }

  /**
   * Find audit log entries with flexible filtering
   */
  async find(
    organizationSlug: string,
    filter?: AuditLogFilter,
  ): Promise<TestAuditLogEntry[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug);

    // Apply optional filters
    if (filter?.action) {
      query = query.eq('action', filter.action);
    }
    if (filter?.resource_type) {
      query = query.eq('resource_type', filter.resource_type);
    }
    if (filter?.resource_id) {
      query = query.eq('resource_id', filter.resource_id);
    }
    if (filter?.user_id) {
      query = query.eq('user_id', filter.user_id);
    }
    if (filter?.start_date) {
      query = query.gte('created_at', filter.start_date);
    }
    if (filter?.end_date) {
      query = query.lte('created_at', filter.end_date);
    }

    // Order by created_at descending
    query = query.order('created_at', { ascending: false });

    // Apply limit if specified (default to 100 if not specified)
    const limit = filter?.limit ?? 100;
    query = query.limit(limit);

    const { data, error } =
      (await query) as SupabaseSelectListResponse<TestAuditLogEntry>;

    if (error) {
      this.logger.error(`Failed to fetch audit log entries: ${error.message}`);
      throw new Error(`Failed to fetch audit log entries: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Get recent audit entries for an organization
   */
  async getRecent(
    organizationSlug: string,
    limit: number = 50,
  ): Promise<TestAuditLogEntry[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .order('created_at', { ascending: false })
      .limit(limit)) as SupabaseSelectListResponse<TestAuditLogEntry>;

    if (error) {
      this.logger.error(
        `Failed to fetch recent audit log entries: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch recent audit log entries: ${error.message}`,
      );
    }

    return data ?? [];
  }
}

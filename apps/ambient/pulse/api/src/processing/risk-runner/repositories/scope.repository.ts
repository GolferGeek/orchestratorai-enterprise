import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  RiskScope,
  CreateRiskScopeData,
  UpdateRiskScopeData,
} from '../interfaces/scope.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

export interface ScopeFilter {
  includeTest?: boolean;
  testScenarioId?: string;
}

@Injectable()
export class ScopeRepository {
  private readonly logger = new Logger(ScopeRepository.name);
  private readonly schema = 'risk';
  private readonly table = 'scopes';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  private applyTestFilter<T extends { eq: (col: string, val: unknown) => T }>(
    query: T,
    filter?: ScopeFilter,
  ): T {
    if (filter?.testScenarioId) {
      query = query.eq('test_scenario_id', filter.testScenarioId);
    } else if (!filter?.includeTest) {
      query = query.eq('is_test', false);
    }
    return query;
  }

  async findAll(
    organizationSlug: string,
    filter?: ScopeFilter,
  ): Promise<RiskScope[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .eq('is_active', true);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskScope>;

    if (error) {
      this.logger.error(`Failed to fetch scopes: ${error.message}`);
      throw new Error(`Failed to fetch scopes: ${error.message}`);
    }

    return data ?? [];
  }

  async findById(id: string): Promise<RiskScope | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<RiskScope>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch scope: ${error.message}`);
      throw new Error(`Failed to fetch scope: ${error.message}`);
    }

    return data;
  }

  async findByIdOrThrow(id: string): Promise<RiskScope> {
    const scope = await this.findById(id);
    if (!scope) {
      throw new NotFoundException(`Scope not found: ${id}`);
    }
    return scope;
  }

  async create(scopeData: CreateRiskScopeData): Promise<RiskScope> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(scopeData)
      .select()
      .single()) as SupabaseSelectResponse<RiskScope>;

    if (error) {
      this.logger.error(`Failed to create scope: ${error.message}`);
      throw new Error(`Failed to create scope: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no scope returned');
    }

    this.logger.log(`Created scope: ${data.id} (${data.name})`);
    return data;
  }

  async update(
    id: string,
    updateData: UpdateRiskScopeData,
  ): Promise<RiskScope> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<RiskScope>;

    if (error) {
      this.logger.error(`Failed to update scope: ${error.message}`);
      throw new Error(`Failed to update scope: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no scope returned');
    }

    this.logger.log(`Updated scope: ${id}`);
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete scope: ${error.message}`);
      throw new Error(`Failed to delete scope: ${error.message}`);
    }

    this.logger.log(`Deleted scope: ${id}`);
  }

  /**
   * Find all active scopes across all organizations
   * Used by batch runners that process system-wide
   */
  async findAllActive(filter?: ScopeFilter): Promise<RiskScope[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('is_active', true);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskScope>;

    if (error) {
      this.logger.error(`Failed to fetch all active scopes: ${error.message}`);
      throw new Error(`Failed to fetch all active scopes: ${error.message}`);
    }

    return data ?? [];
  }

  async findByAgentSlug(
    agentSlug: string,
    organizationSlug: string,
    filter?: ScopeFilter,
  ): Promise<RiskScope[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .eq('agent_slug', agentSlug)
      .eq('is_active', true);

    query = this.applyTestFilter(query, filter);

    const { data, error } =
      (await query) as SupabaseSelectListResponse<RiskScope>;

    if (error) {
      this.logger.error(`Failed to fetch scopes by agent: ${error.message}`);
      throw new Error(`Failed to fetch scopes by agent: ${error.message}`);
    }

    return data ?? [];
  }

  async findByDomain(
    domain: string,
    organizationSlug: string,
    filter?: ScopeFilter,
  ): Promise<RiskScope[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .eq('domain', domain)
      .eq('is_active', true);

    query = this.applyTestFilter(query, filter);

    const { data, error } =
      (await query) as SupabaseSelectListResponse<RiskScope>;

    if (error) {
      this.logger.error(`Failed to fetch scopes by domain: ${error.message}`);
      throw new Error(`Failed to fetch scopes by domain: ${error.message}`);
    }

    return data ?? [];
  }
}

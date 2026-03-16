import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  RiskDimension,
  CreateRiskDimensionData,
  UpdateRiskDimensionData,
} from '../interfaces/dimension.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

export interface DimensionFilter {
  includeTest?: boolean;
  testScenarioId?: string;
}

@Injectable()
export class DimensionRepository {
  private readonly logger = new Logger(DimensionRepository.name);
  private readonly schema = 'risk';
  private readonly table = 'dimensions';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  private applyTestFilter<T extends { eq: (col: string, val: unknown) => T }>(
    query: T,
    filter?: DimensionFilter,
  ): T {
    if (filter?.testScenarioId) {
      query = query.eq('test_scenario_id', filter.testScenarioId);
    } else if (!filter?.includeTest) {
      query = query.eq('is_test', false);
    }
    return query;
  }

  async findByScope(
    scopeId: string,
    filter?: DimensionFilter,
  ): Promise<RiskDimension[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('scope_id', scopeId)
      .eq('is_active', true);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('display_order', {
      ascending: true,
    })) as SupabaseSelectListResponse<RiskDimension>;

    if (error) {
      this.logger.error(`Failed to fetch dimensions: ${error.message}`);
      throw new Error(`Failed to fetch dimensions: ${error.message}`);
    }

    return data ?? [];
  }

  async findById(id: string): Promise<RiskDimension | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<RiskDimension>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch dimension: ${error.message}`);
      throw new Error(`Failed to fetch dimension: ${error.message}`);
    }

    return data;
  }

  async findByIdOrThrow(id: string): Promise<RiskDimension> {
    const dimension = await this.findById(id);
    if (!dimension) {
      throw new NotFoundException(`Dimension not found: ${id}`);
    }
    return dimension;
  }

  async findBySlug(
    scopeId: string,
    slug: string,
  ): Promise<RiskDimension | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('scope_id', scopeId)
      .eq('slug', slug)
      .single()) as SupabaseSelectResponse<RiskDimension>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch dimension by slug: ${error.message}`);
      throw new Error(`Failed to fetch dimension by slug: ${error.message}`);
    }

    return data;
  }

  async create(dimensionData: CreateRiskDimensionData): Promise<RiskDimension> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(dimensionData)
      .select()
      .single()) as SupabaseSelectResponse<RiskDimension>;

    if (error) {
      this.logger.error(`Failed to create dimension: ${error.message}`);
      throw new Error(`Failed to create dimension: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no dimension returned');
    }

    this.logger.log(`Created dimension: ${data.id} (${data.slug})`);
    return data;
  }

  async update(
    id: string,
    updateData: UpdateRiskDimensionData,
  ): Promise<RiskDimension> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<RiskDimension>;

    if (error) {
      this.logger.error(`Failed to update dimension: ${error.message}`);
      throw new Error(`Failed to update dimension: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no dimension returned');
    }

    this.logger.log(`Updated dimension: ${id}`);
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete dimension: ${error.message}`);
      throw new Error(`Failed to delete dimension: ${error.message}`);
    }

    this.logger.log(`Deleted dimension: ${id}`);
  }
}

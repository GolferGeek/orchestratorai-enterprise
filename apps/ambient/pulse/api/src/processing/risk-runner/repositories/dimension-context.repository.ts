import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  RiskDimensionContext,
  CreateDimensionContextData,
  UpdateDimensionContextData,
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

export interface DimensionContextFilter {
  includeTest?: boolean;
  testScenarioId?: string;
}

@Injectable()
export class DimensionContextRepository {
  private readonly logger = new Logger(DimensionContextRepository.name);
  private readonly schema = 'risk';
  private readonly table = 'dimension_contexts';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  private applyTestFilter<T extends { eq: (col: string, val: unknown) => T }>(
    query: T,
    filter?: DimensionContextFilter,
  ): T {
    if (filter?.testScenarioId) {
      query = query.eq('test_scenario_id', filter.testScenarioId);
    } else if (!filter?.includeTest) {
      query = query.eq('is_test', false);
    }
    return query;
  }

  async findByDimension(
    dimensionId: string,
    filter?: DimensionContextFilter,
  ): Promise<RiskDimensionContext[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('dimension_id', dimensionId);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('version', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskDimensionContext>;

    if (error) {
      this.logger.error(`Failed to fetch dimension contexts: ${error.message}`);
      throw new Error(`Failed to fetch dimension contexts: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find the active context for a dimension (latest active version)
   */
  async findActiveForDimension(
    dimensionId: string,
    filter?: DimensionContextFilter,
  ): Promise<RiskDimensionContext | null> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('dimension_id', dimensionId)
      .eq('is_active', true);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query
      .order('version', { ascending: false })
      .limit(1)
      .single()) as SupabaseSelectResponse<RiskDimensionContext>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch active dimension context: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch active dimension context: ${error.message}`,
      );
    }

    return data;
  }

  async findById(id: string): Promise<RiskDimensionContext | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<RiskDimensionContext>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch dimension context: ${error.message}`);
      throw new Error(`Failed to fetch dimension context: ${error.message}`);
    }

    return data;
  }

  async findByIdOrThrow(id: string): Promise<RiskDimensionContext> {
    const context = await this.findById(id);
    if (!context) {
      throw new NotFoundException(`Dimension context not found: ${id}`);
    }
    return context;
  }

  async findByVersion(
    dimensionId: string,
    version: number,
  ): Promise<RiskDimensionContext | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('dimension_id', dimensionId)
      .eq('version', version)
      .single()) as SupabaseSelectResponse<RiskDimensionContext>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch dimension context by version: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch dimension context by version: ${error.message}`,
      );
    }

    return data;
  }

  async create(
    contextData: CreateDimensionContextData,
  ): Promise<RiskDimensionContext> {
    // If no version specified, get the next version
    if (!contextData.version) {
      const existing = await this.findByDimension(contextData.dimension_id);
      contextData.version =
        existing.length > 0
          ? Math.max(...existing.map((c) => c.version)) + 1
          : 1;
    }

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(contextData)
      .select()
      .single()) as SupabaseSelectResponse<RiskDimensionContext>;

    if (error) {
      this.logger.error(`Failed to create dimension context: ${error.message}`);
      throw new Error(`Failed to create dimension context: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no dimension context returned');
    }

    this.logger.log(`Created dimension context: ${data.id} (v${data.version})`);
    return data;
  }

  async update(
    id: string,
    updateData: UpdateDimensionContextData,
  ): Promise<RiskDimensionContext> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<RiskDimensionContext>;

    if (error) {
      this.logger.error(`Failed to update dimension context: ${error.message}`);
      throw new Error(`Failed to update dimension context: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no dimension context returned');
    }

    this.logger.log(`Updated dimension context: ${id}`);
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete dimension context: ${error.message}`);
      throw new Error(`Failed to delete dimension context: ${error.message}`);
    }

    this.logger.log(`Deleted dimension context: ${id}`);
  }

  /**
   * Get the latest version number for a dimension
   */
  async getLatestVersion(dimensionId: string): Promise<number> {
    const contexts = await this.findByDimension(dimensionId);
    if (contexts.length === 0) {
      return 0;
    }
    return Math.max(...contexts.map((c) => c.version));
  }
}

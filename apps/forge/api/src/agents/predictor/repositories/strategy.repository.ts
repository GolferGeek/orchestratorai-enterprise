import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  Strategy,
  StrategyParameters,
  CreateStrategyData,
  UpdateStrategyData,
} from '../interfaces/strategy.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

@Injectable()
export class StrategyRepository {
  private readonly logger = new Logger(StrategyRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'strategies';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  private mapDbRowToStrategy(
    row: Record<string, unknown> | null,
  ): Strategy | null {
    if (!row) return null;

    const thresholds =
      (row.thresholds as StrategyParameters | undefined) ??
      (row.parameters as StrategyParameters | undefined) ??
      {};

    return {
      ...(row as unknown as Strategy),
      parameters: thresholds,
    };
  }

  async findAll(): Promise<Strategy[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('is_active', true)
      .order('is_system', { ascending: false })
      .order('name', {
        ascending: true,
      })) as SupabaseSelectListResponse<Record<string, unknown>>;

    if (error) {
      this.logger.error(`Failed to fetch strategies: ${error.message}`);
      throw new Error(`Failed to fetch strategies: ${error.message}`);
    }

    return (data ?? [])
      .map((row) => this.mapDbRowToStrategy(row))
      .filter((row): row is Strategy => row !== null);
  }

  async findById(id: string): Promise<Strategy | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<Record<string, unknown>>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch strategy: ${error.message}`);
      throw new Error(`Failed to fetch strategy: ${error.message}`);
    }

    return this.mapDbRowToStrategy(data);
  }

  async findByIdOrThrow(id: string): Promise<Strategy> {
    const strategy = await this.findById(id);
    if (!strategy) {
      throw new NotFoundException(`Strategy not found: ${id}`);
    }
    return strategy;
  }

  async findBySlug(slug: string): Promise<Strategy | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('slug', slug)
      .single()) as SupabaseSelectResponse<Record<string, unknown>>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch strategy by slug: ${error.message}`);
      throw new Error(`Failed to fetch strategy by slug: ${error.message}`);
    }

    return this.mapDbRowToStrategy(data);
  }

  async findBySlugOrThrow(slug: string): Promise<Strategy> {
    const strategy = await this.findBySlug(slug);
    if (!strategy) {
      throw new NotFoundException(`Strategy not found: ${slug}`);
    }
    return strategy;
  }

  async findSystemStrategies(): Promise<Strategy[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('is_system', true)
      .eq('is_active', true)
      .order('name', {
        ascending: true,
      })) as SupabaseSelectListResponse<Record<string, unknown>>;

    if (error) {
      this.logger.error(`Failed to fetch system strategies: ${error.message}`);
      throw new Error(`Failed to fetch system strategies: ${error.message}`);
    }

    return (data ?? [])
      .map((row) => this.mapDbRowToStrategy(row))
      .filter((row): row is Strategy => row !== null);
  }

  async create(strategyData: CreateStrategyData): Promise<Strategy> {
    const payload: Record<string, unknown> = { ...strategyData };
    if (strategyData.parameters) {
      payload.thresholds = strategyData.parameters;
      delete payload.parameters;
    }

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(payload)
      .select()
      .single()) as SupabaseSelectResponse<Record<string, unknown>>;

    if (error) {
      this.logger.error(`Failed to create strategy: ${error.message}`);
      throw new Error(`Failed to create strategy: ${error.message}`);
    }

    const mapped = this.mapDbRowToStrategy(data);
    if (!mapped) {
      throw new Error('Create succeeded but no strategy returned');
    }

    return mapped;
  }

  async update(id: string, updateData: UpdateStrategyData): Promise<Strategy> {
    // Don't allow updating system strategies' core properties
    const existing = await this.findByIdOrThrow(id);
    if (existing.is_system) {
      // Only allow updating is_active for system strategies
      const allowedUpdates: UpdateStrategyData = {};
      if (updateData.is_active !== undefined) {
        allowedUpdates.is_active = updateData.is_active;
      }
      updateData = allowedUpdates;
    }

    const payload: Record<string, unknown> = { ...updateData };
    if (updateData.parameters) {
      payload.thresholds = updateData.parameters;
      delete payload.parameters;
    }

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(payload)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<Record<string, unknown>>;

    if (error) {
      this.logger.error(`Failed to update strategy: ${error.message}`);
      throw new Error(`Failed to update strategy: ${error.message}`);
    }

    const mapped = this.mapDbRowToStrategy(data);
    if (!mapped) {
      throw new Error('Update succeeded but no strategy returned');
    }

    return mapped;
  }

  async delete(id: string): Promise<void> {
    // Don't allow deleting system strategies
    const existing = await this.findByIdOrThrow(id);
    if (existing.is_system) {
      throw new Error('Cannot delete system strategies');
    }

    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete strategy: ${error.message}`);
      throw new Error(`Failed to delete strategy: ${error.message}`);
    }
  }
}

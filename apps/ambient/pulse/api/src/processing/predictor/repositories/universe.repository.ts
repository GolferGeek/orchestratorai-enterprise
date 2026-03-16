import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  Universe,
  CreateUniverseData,
  UpdateUniverseData,
} from '../interfaces/universe.interface';

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
export class UniverseRepository {
  private readonly logger = new Logger(UniverseRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'universes';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async findAll(organizationSlug: string): Promise<Universe[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .eq('is_active', true)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<Universe>;

    if (error) {
      this.logger.error(`Failed to fetch universes: ${error.message}`);
      throw new Error(`Failed to fetch universes: ${error.message}`);
    }

    return data ?? [];
  }

  async findById(id: string): Promise<Universe | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<Universe>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch universe: ${error.message}`);
      throw new Error(`Failed to fetch universe: ${error.message}`);
    }

    return data;
  }

  async findByIdOrThrow(id: string): Promise<Universe> {
    const universe = await this.findById(id);
    if (!universe) {
      throw new NotFoundException(`Universe not found: ${id}`);
    }
    return universe;
  }

  async create(universeData: CreateUniverseData): Promise<Universe> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(universeData)
      .select()
      .single()) as SupabaseSelectResponse<Universe>;

    if (error) {
      this.logger.error(`Failed to create universe: ${error.message}`);
      throw new Error(`Failed to create universe: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no universe returned');
    }

    return data;
  }

  async update(id: string, updateData: UpdateUniverseData): Promise<Universe> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<Universe>;

    if (error) {
      this.logger.error(`Failed to update universe: ${error.message}`);
      throw new Error(`Failed to update universe: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no universe returned');
    }

    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete universe: ${error.message}`);
      throw new Error(`Failed to delete universe: ${error.message}`);
    }
  }

  /**
   * Find all active universes across all organizations
   * Used by batch runners that process system-wide
   */
  async findAllActive(): Promise<Universe[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('is_active', true)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<Universe>;

    if (error) {
      this.logger.error(
        `Failed to fetch all active universes: ${error.message}`,
      );
      throw new Error(`Failed to fetch all active universes: ${error.message}`);
    }

    return data ?? [];
  }

  async findByAgentSlug(
    agentSlug: string,
    organizationSlug: string,
  ): Promise<Universe[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('organization_slug', organizationSlug)
      .eq('agent_slug', agentSlug)
      .eq('is_active', true)) as SupabaseSelectListResponse<Universe>;

    if (error) {
      this.logger.error(`Failed to fetch universes by agent: ${error.message}`);
      throw new Error(`Failed to fetch universes by agent: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find all active universes for a specific domain
   * Used by batch runners for domain-specific operations
   */
  async findByDomain(
    domain: 'stocks' | 'crypto' | 'polymarket' | 'elections',
  ): Promise<Universe[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('domain', domain)
      .eq('is_active', true)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<Universe>;

    if (error) {
      this.logger.error(
        `Failed to fetch universes by domain: ${error.message}`,
      );
      throw new Error(`Failed to fetch universes by domain: ${error.message}`);
    }

    return data ?? [];
  }
}

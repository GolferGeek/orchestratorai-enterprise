import type { JsonObject } from '@orchestrator-ai/transport-types';
import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';

export interface PlanVersionRecord {
  id: string;
  plan_id: string;
  version_number: number;
  content: string;
  format: 'markdown' | 'json' | 'text';
  created_by_type: 'agent' | 'user';
  created_by_id: string | null;
  task_id: string | null;
  metadata: JsonObject;
  is_current_version: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePlanVersionData {
  plan_id: string;
  version_number: number;
  content: string;
  format: 'markdown' | 'json' | 'text';
  created_by_type: 'agent' | 'user';
  created_by_id?: string;
  task_id?: string;
  metadata?: JsonObject;
  is_current_version: boolean;
}

@Injectable()
export class PlanVersionsRepository {
  private readonly logger = new Logger(PlanVersionsRepository.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Create a new plan version
   */
  async create(data: CreatePlanVersionData): Promise<PlanVersionRecord> {
    const response = await this.db
      .from(null, 'plan_versions')
      .insert([data])
      .select('*')
      .single();

    const result: unknown = response.data;
    const error: unknown = response.error;

    if (error) {
      throw new BadRequestException(
        `Failed to create plan version: ${(error as { message?: string })?.message}`,
      );
    }

    const versionData = result as PlanVersionRecord | null;
    if (!versionData) {
      throw new BadRequestException(
        'No data returned from plan version creation',
      );
    }

    return versionData;
  }

  /**
   * Find version by ID
   */
  async findById(versionId: string): Promise<PlanVersionRecord | null> {
    const response = await this.db
      .from(null, 'plan_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    const result: unknown = response.data;
    const error: unknown = response.error;

    if (error) {
      if ((error as { code?: string })?.code === 'PGRST116') {
        return null;
      }
      throw new BadRequestException(
        `Failed to find plan version: ${(error as { message?: string })?.message}`,
      );
    }

    return (result as PlanVersionRecord | null) ?? null;
  }

  /**
   * Find all versions for a plan
   */
  async findByPlanId(planId: string): Promise<PlanVersionRecord[]> {
    const { data: result, error } = (await this.db
      .from(null, 'plan_versions')
      .select('*')
      .eq('plan_id', planId)
      .order('version_number', { ascending: true })) as QueryResult<unknown>;

    if (error) {
      throw new BadRequestException(
        `Failed to find plan versions: ${error.message}`,
      );
    }

    return (result as PlanVersionRecord[] | null) ?? [];
  }

  /**
   * Get current version for a plan
   */
  async getCurrentVersion(planId: string): Promise<PlanVersionRecord | null> {
    const response = await this.db
      .from(null, 'plan_versions')
      .select('*')
      .eq('plan_id', planId)
      .eq('is_current_version', true)
      .maybeSingle();

    const result: unknown = response.data;
    const error: unknown = response.error;

    if (error) {
      throw new BadRequestException(
        `Failed to get current plan version: ${(error as { message?: string })?.message}`,
      );
    }

    return (result as PlanVersionRecord | null) ?? null;
  }

  /**
   * Get next version number for a plan
   */
  async getNextVersionNumber(planId: string): Promise<number> {
    const { data: result, error } = (await this.db
      .from(null, 'plan_versions')
      .select('version_number')
      .eq('plan_id', planId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()) as QueryResult<unknown>;

    if (error) {
      throw new BadRequestException(
        `Failed to get next version number: ${error.message}`,
      );
    }

    const versionData = result as { version_number: number } | null;
    return versionData ? versionData.version_number + 1 : 1;
  }

  /**
   * Mark a version as current
   */
  async markAsCurrent(versionId: string): Promise<PlanVersionRecord> {
    const response = await this.db
      .from(null, 'plan_versions')
      .update({ is_current_version: true })
      .eq('id', versionId)
      .select('*')
      .single();

    const result: unknown = response.data;
    const error: unknown = response.error;

    if (error) {
      throw new BadRequestException(
        `Failed to mark version as current: ${(error as { message?: string })?.message}`,
      );
    }

    const versionData = result as PlanVersionRecord | null;
    if (!versionData) {
      throw new BadRequestException('No data returned from mark as current');
    }

    return versionData;
  }

  /**
   * Mark all versions as not current for a plan
   */
  async markAllAsNotCurrent(planId: string) {
    const { error } = await this.db
      .from(null, 'plan_versions')
      .update({ is_current_version: false })
      .eq('plan_id', planId);

    if (error) {
      throw new BadRequestException(
        `Failed to mark versions as not current: ${error.message}`,
      );
    }
  }

  /**
   * Delete a specific version
   */
  async deleteVersion(versionId: string) {
    const { error } = await this.db
      .from(null, 'plan_versions')
      .delete()
      .eq('id', versionId);

    if (error) {
      throw new BadRequestException(
        `Failed to delete plan version: ${error.message}`,
      );
    }
  }
}

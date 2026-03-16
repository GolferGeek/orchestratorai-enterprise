import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  LearningQueue,
  LearningQueueStatus,
} from '../interfaces/learning.interface';

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
export class LearningQueueRepository {
  private readonly logger = new Logger(LearningQueueRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'learning_queue';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async findById(id: string): Promise<LearningQueue | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<LearningQueue>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch learning queue item: ${error.message}`,
      );
      throw new Error(`Failed to fetch learning queue item: ${error.message}`);
    }

    return data;
  }

  async findByIdOrThrow(id: string): Promise<LearningQueue> {
    const item = await this.findById(id);
    if (!item) {
      throw new NotFoundException(`Learning queue item not found: ${id}`);
    }
    return item;
  }

  async create(queueData: Partial<LearningQueue>): Promise<LearningQueue> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(queueData)
      .select()
      .single()) as SupabaseSelectResponse<LearningQueue>;

    if (error) {
      this.logger.error(
        `Failed to create learning queue item: ${error.message}`,
      );
      throw new Error(`Failed to create learning queue item: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no learning queue item returned');
    }

    return data;
  }

  async update(
    id: string,
    updateData: Partial<LearningQueue>,
  ): Promise<LearningQueue> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<LearningQueue>;

    if (error) {
      this.logger.error(
        `Failed to update learning queue item: ${error.message}`,
      );
      throw new Error(`Failed to update learning queue item: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no learning queue item returned');
    }

    return data;
  }

  async findByStatus(status: LearningQueueStatus): Promise<LearningQueue[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('status', status)
      .order('ai_confidence', { ascending: false })
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<LearningQueue>;

    if (error) {
      this.logger.error(
        `Failed to find learning queue items by status: ${error.message}`,
      );
      throw new Error(
        `Failed to find learning queue items by status: ${error.message}`,
      );
    }

    return data ?? [];
  }

  async findPending(limit?: number): Promise<LearningQueue[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('status', 'pending')
      .order('ai_confidence', { ascending: false })
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<LearningQueue>;

    if (error) {
      this.logger.error(
        `Failed to find pending learning queue items: ${error.message}`,
      );
      throw new Error(
        `Failed to find pending learning queue items: ${error.message}`,
      );
    }

    return data ?? [];
  }

  async findBySourceEvaluation(evaluationId: string): Promise<LearningQueue[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('source_evaluation_id', evaluationId)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<LearningQueue>;

    if (error) {
      this.logger.error(
        `Failed to find learning queue items by evaluation: ${error.message}`,
      );
      throw new Error(
        `Failed to find learning queue items by evaluation: ${error.message}`,
      );
    }

    return data ?? [];
  }

  async findBySourceMissedOpportunity(
    missedOpportunityId: string,
  ): Promise<LearningQueue[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('source_missed_opportunity_id', missedOpportunityId)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<LearningQueue>;

    if (error) {
      this.logger.error(
        `Failed to find learning queue items by missed opportunity: ${error.message}`,
      );
      throw new Error(
        `Failed to find learning queue items by missed opportunity: ${error.message}`,
      );
    }

    return data ?? [];
  }
}

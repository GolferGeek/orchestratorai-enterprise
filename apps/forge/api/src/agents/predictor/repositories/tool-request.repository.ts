import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  ToolRequest,
  CreateToolRequestData,
  UpdateToolRequestData,
  ToolRequestStatus,
  ToolRequestPriority,
} from '../interfaces/tool-request.interface';

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
export class ToolRequestRepository {
  private readonly logger = new Logger(ToolRequestRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'tool_requests';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async findAll(universeId?: string): Promise<ToolRequest[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (universeId) {
      query = query.eq('universe_id', universeId);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<ToolRequest>;

    if (error) {
      this.logger.error(`Failed to fetch tool requests: ${error.message}`);
      throw new Error(`Failed to fetch tool requests: ${error.message}`);
    }

    return data ?? [];
  }

  async findById(id: string): Promise<ToolRequest | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<ToolRequest>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch tool request: ${error.message}`);
      throw new Error(`Failed to fetch tool request: ${error.message}`);
    }

    return data;
  }

  async findByIdOrThrow(id: string): Promise<ToolRequest> {
    const request = await this.findById(id);
    if (!request) {
      throw new NotFoundException(`Tool request not found: ${id}`);
    }
    return request;
  }

  async findByStatus(
    status: ToolRequestStatus,
    universeId?: string,
  ): Promise<ToolRequest[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('status', status)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (universeId) {
      query = query.eq('universe_id', universeId);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<ToolRequest>;

    if (error) {
      this.logger.error(
        `Failed to fetch tool requests by status: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch tool requests by status: ${error.message}`,
      );
    }

    return data ?? [];
  }

  async findByMissedOpportunity(
    missedOpportunityId: string,
  ): Promise<ToolRequest[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('missed_opportunity_id', missedOpportunityId)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<ToolRequest>;

    if (error) {
      this.logger.error(
        `Failed to fetch tool requests by missed opportunity: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch tool requests by missed opportunity: ${error.message}`,
      );
    }

    return data ?? [];
  }

  async findWishlist(universeId?: string): Promise<ToolRequest[]> {
    return this.findByStatus('wishlist', universeId);
  }

  async findByPriority(
    priority: ToolRequestPriority,
    universeId?: string,
  ): Promise<ToolRequest[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('priority', priority)
      .order('created_at', { ascending: false });

    if (universeId) {
      query = query.eq('universe_id', universeId);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<ToolRequest>;

    if (error) {
      this.logger.error(
        `Failed to fetch tool requests by priority: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch tool requests by priority: ${error.message}`,
      );
    }

    return data ?? [];
  }

  async create(requestData: CreateToolRequestData): Promise<ToolRequest> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert({
        ...requestData,
        status: requestData.status || 'wishlist',
        priority: requestData.priority || 'medium',
      })
      .select()
      .single()) as SupabaseSelectResponse<ToolRequest>;

    if (error) {
      this.logger.error(`Failed to create tool request: ${error.message}`);
      throw new Error(`Failed to create tool request: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no tool request returned');
    }

    return data;
  }

  async update(
    id: string,
    updateData: UpdateToolRequestData,
  ): Promise<ToolRequest> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<ToolRequest>;

    if (error) {
      this.logger.error(`Failed to update tool request: ${error.message}`);
      throw new Error(`Failed to update tool request: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no tool request returned');
    }

    return data;
  }

  async updateStatus(
    id: string,
    status: ToolRequestStatus,
    userId?: string,
    notes?: string,
  ): Promise<ToolRequest> {
    const updateData: UpdateToolRequestData = { status };

    if (status === 'done' || status === 'rejected') {
      updateData.resolved_at = new Date().toISOString();
      if (userId) {
        updateData.resolved_by_user_id = userId;
      }
      if (notes) {
        updateData.resolution_notes = notes;
      }
    }

    return this.update(id, updateData);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete tool request: ${error.message}`);
      throw new Error(`Failed to delete tool request: ${error.message}`);
    }
  }

  /**
   * Get statistics for tool requests
   */
  async getStats(universeId?: string): Promise<{
    total: number;
    by_status: Record<ToolRequestStatus, number>;
    by_priority: Record<ToolRequestPriority, number>;
  }> {
    let query = this.db
      .from(this.schema, this.table)
      .select('status, priority');

    if (universeId) {
      query = query.eq('universe_id', universeId);
    }

    const { data, error } = (await query) as SupabaseSelectListResponse<{
      status: ToolRequestStatus;
      priority: ToolRequestPriority;
    }>;

    if (error) {
      this.logger.error(`Failed to fetch tool request stats: ${error.message}`);
      throw new Error(`Failed to fetch tool request stats: ${error.message}`);
    }

    const requests = data ?? [];

    const byStatus: Record<ToolRequestStatus, number> = {
      wishlist: 0,
      planned: 0,
      in_progress: 0,
      done: 0,
      rejected: 0,
    };

    const byPriority: Record<ToolRequestPriority, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const request of requests) {
      byStatus[request.status]++;
      byPriority[request.priority]++;
    }

    return {
      total: requests.length,
      by_status: byStatus,
      by_priority: byPriority,
    };
  }
}

import { Injectable, Logger, Inject } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import {
  MEDIA_STORAGE_PROVIDER,
  type MediaStorageProvider,
} from '@/agent2agent/services/media-storage-provider.interface';
import {
  AgentConversation,
  AgentConversationWithStats,
  CreateAgentConversationDto,
  AgentConversationQueryParams,
  AgentType,
} from '@/agent2agent/types/agent-conversations.types';

interface AgentConversationDbRecord {
  id: string;
  user_id: string;
  agent_name: string;
  agent_type: string;
  organization_slug?: string | null;
  started_at?: string;
  ended_at?: string;
  last_active_at?: string;
  metadata?: Record<string, unknown>;
  primary_work_product_type?: string;
  primary_work_product_id?: string;
  created_at: string;
  updated_at: string;
}

interface AgentConversationWithStatsDbRecord extends AgentConversationDbRecord {
  task_count: string | number;
  completed_tasks: string | number;
  failed_tasks: string | number;
  active_tasks: string | number;
}

@Injectable()
export class AgentConversationsService {
  private readonly logger = new Logger(AgentConversationsService.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    @Inject(MEDIA_STORAGE_PROVIDER)
    private readonly mediaStorage: MediaStorageProvider,
  ) {}

  /**
   * Validate agent type matches database constraints
   */
  private validateAgentType(agentType: string): AgentType {
    // Ensure the type is one of the allowed values
    // Note: langgraph and risk agents don't use conversations (they use workflows/dashboards)
    const validTypes: AgentType[] = [
      'context',
      'api',
      'external',
      'orchestrator',
      'media',
      'rag-runner',
      'prediction',
    ];
    // Allow file-based types
    if (validTypes.includes(agentType)) {
      return agentType;
    }

    // Allow organization slugs (contain hyphens, underscores, or end with -org)
    if (
      agentType.includes('-') ||
      agentType.includes('_') ||
      agentType.endsWith('org')
    ) {
      return agentType;
    }

    // NO FALLBACKS - fail fast with clear error instead of defaulting
    throw new Error(
      `Invalid agentType '${agentType}'. ` +
        `Must be a valid file-based type (${validTypes.join(', ')}) ` +
        `or an organization slug (e.g., 'my-org', 'company-name'). ` +
        `No default agentType is provided - explicit configuration required.`,
    );
  }

  /**
   * Create a new agent conversation
   */
  async createConversation(
    userId: string,
    dto: CreateAgentConversationDto,
  ): Promise<AgentConversation> {
    try {
      const validatedAgentType = this.validateAgentType(dto.agentType);

      this.logger.log(
        `Creating conversation: userId=${userId}, agentName=${dto.agentName}, agentType=${validatedAgentType}, organization=${dto.organization || 'null'}`,
      );

      const now = new Date().toISOString();
      const insertData = {
        ...(dto.conversationId && { id: dto.conversationId }), // Use frontend-provided UUID as record id
        user_id: userId,
        agent_name: dto.agentName,
        agent_type: validatedAgentType,
        organization_slug: dto.organization || null, // Store organization slug for database agents
        started_at: now,
        last_active_at: now,
        metadata: dto.metadata || {},
        ...(dto.workProduct && {
          primary_work_product_type: dto.workProduct.type,
          primary_work_product_id: dto.workProduct.id,
        }),
      };

      this.logger.debug(`Insert data: ${JSON.stringify(insertData)}`);

      const result = await this.db
        .from(null, 'conversations')
        .insert(insertData)
        .select()
        .single();

      if (result.error) {
        this.logger.error(
          `Failed to create conversation: ${result.error.message}`,
          result.error,
        );
        throw new Error(
          `Failed to create conversation: ${result.error.message} (code: ${result.error.code || 'unknown'})`,
        );
      }

      return this.mapToAgentConversation(
        result.data as AgentConversationDbRecord,
      );
    } catch (error) {
      this.logger.error(
        `Error in createConversation: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversationById(
    conversationId: string,
    userId: string,
  ): Promise<AgentConversation | null> {
    const result = await this.db
      .from(null, 'conversations')
      .select()
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    if (result.error && result.error.code !== 'PGRST116') {
      // PGRST116 is "no rows found"
      throw new Error(`Failed to fetch conversation: ${result.error.message}`);
    }

    return result.data
      ? this.mapToAgentConversation(result.data as AgentConversationDbRecord)
      : null;
  }

  /**
   * Get or create a conversation for an agent
   */
  async getOrCreateConversation(
    userId: string,
    agentName: string,
    agentType: AgentType,
    existingConversationId?: string | null,
  ): Promise<AgentConversation> {
    // If a conversation ID was provided, validate it exists and belongs to the user
    if (existingConversationId) {
      const { data: existingResult } = (await this.db
        .from(null, 'conversations')
        .select()
        .eq('id', existingConversationId)
        .eq('user_id', userId)
        .eq('agent_name', agentName)
        .eq('agent_type', agentType)
        .single()) as QueryResult<unknown>;

      const existing = existingResult as AgentConversationDbRecord | null;

      if (existing) {
        return this.mapToAgentConversation(existing);
      }

      // If provided conversation ID doesn't exist or doesn't match, log warning and create new
    }

    // First try to find an active conversation
    const { data: result } = (await this.db
      .from(null, 'conversations')
      .select()
      .eq('user_id', userId)
      .eq('agent_name', agentName)
      .eq('agent_type', agentType)
      .is('ended_at', null)
      .order('last_active_at', { ascending: false })
      .limit(1)) as QueryResult<unknown>;

    const existing = result as AgentConversationDbRecord[] | null;

    if (existing && existing.length > 0 && existing[0]) {
      return this.mapToAgentConversation(existing[0]);
    }

    // Create new conversation if none exists
    return this.createConversation(userId, {
      agentName,
      agentType,
    });
  }

  /**
   * List conversations with optional filters
   */
  async listConversations(
    params: AgentConversationQueryParams,
  ): Promise<{ conversations: AgentConversationWithStats[]; total: number }> {
    let query = this.db
      .from(null, 'conversations_with_stats')
      .select('*', { count: 'exact' });

    // Apply filters
    if (params.userId) {
      query = query.eq('user_id', params.userId);
    }
    if (params.agentName) {
      query = query.eq('agent_name', params.agentName);
    }
    if (params.agentType) {
      query = query.eq('agent_type', params.agentType);
    }
    if (params.activeOnly) {
      query = query.is('ended_at', null);
    }

    // Apply pagination
    const limit = params.limit || 50;
    const offset = params.offset || 0;
    query = query
      .order('last_active_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const {
      data: result,
      error,
      count,
    } = (await query) as QueryResult<unknown>;

    const data = result as AgentConversationWithStatsDbRecord[] | null;

    if (error) {
      throw new Error(`Failed to list conversations: ${error.message}`);
    }

    return {
      conversations: (data || []).map((item) =>
        this.mapToAgentConversationWithStats(item),
      ),
      total: count || 0,
    };
  }

  /**
   * End a conversation
   */
  async endConversation(conversationId: string, userId: string): Promise<void> {
    const { error } = (await this.db
      .from(null, 'conversations')
      .update({
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('user_id', userId)) as QueryResult<unknown>;

    if (error) {
      throw new Error(`Failed to end conversation: ${error.message}`);
    }
  }

  /**
   * Delete a conversation and all related tasks
   */
  async deleteConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    // First verify the conversation exists and belongs to the user
    const conversation = await this.getConversationById(conversationId, userId);

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Clean up media assets (images/videos) and their storage files BEFORE deleting conversation
    // This ensures storage files don't become orphaned
    await this.cleanupConversationAssets(conversationId);

    // Delete related LLM usage records first to avoid foreign key constraint violation
    const { error: llmUsageDeleteError } = (await this.db
      .from(null, 'llm_usage')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)) as QueryResult<unknown>;

    if (llmUsageDeleteError) {
      throw new Error(
        `Failed to delete LLM usage records: ${llmUsageDeleteError.message}`,
      );
    }

    // Delete deliverables (deliverable_versions will cascade delete)
    // UI enforces that deliverables are always deleted with their conversations
    const { error: deliverablesDeleteError } = (await this.db
      .from(null, 'deliverables')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)) as QueryResult<unknown>;

    if (deliverablesDeleteError) {
      throw new Error(
        `Failed to delete deliverables: ${deliverablesDeleteError.message}`,
      );
    }

    // Delete related tasks (if any)
    const { error: tasksError } = (await this.db
      .from(null, 'tasks')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)) as QueryResult<unknown>;

    if (tasksError) {
      throw new Error(
        `Failed to delete conversation tasks: ${tasksError.message}`,
      );
    }

    // Delete the conversation
    const { error } = (await this.db
      .from(null, 'conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId)) as QueryResult<unknown>;

    if (error) {
      throw new Error(`Failed to delete conversation: ${error.message}`);
    }
  }

  /**
   * Clean up media assets (images/videos) and their storage files for a conversation.
   * This prevents orphaned storage files when a conversation is deleted.
   */
  private async cleanupConversationAssets(
    conversationId: string,
  ): Promise<void> {
    try {
      // Find all assets linked to this conversation
      const { data: assets, error: fetchError } = (await this.db
        .from(null, 'assets')
        .select('id, bucket, object_key')
        .eq('conversation_id', conversationId)) as QueryResult<unknown>;

      if (fetchError) {
        this.logger.warn(
          `Failed to fetch assets for conversation ${conversationId}: ${fetchError.message}`,
        );
        return;
      }

      const assetRows = (assets ?? []) as Array<{
        id: string;
        bucket: string;
        object_key: string;
      }>;

      if (assetRows.length === 0) {
        this.logger.debug(
          `No assets to clean up for conversation ${conversationId}`,
        );
        return;
      }

      this.logger.log(
        `Cleaning up ${assetRows.length} asset(s) for conversation ${conversationId}`,
      );

      // Group assets by bucket for efficient deletion
      const assetsByBucket = assetRows.reduce(
        (acc: Record<string, string[]>, asset) => {
          const bucket = asset.bucket || 'media';
          if (!acc[bucket]) {
            acc[bucket] = [];
          }
          acc[bucket].push(asset.object_key);
          return acc;
        },
        {} as Record<string, string[]>,
      );

      // Delete storage files from each bucket via provider
      for (const [bucket, objectKeys] of Object.entries(assetsByBucket)) {
        const result = await this.mediaStorage.deleteStorageObjects(
          bucket,
          objectKeys,
        );

        if (result.errors.length > 0) {
          this.logger.warn(
            `Failed to delete storage files from bucket ${bucket}: ${result.errors.join(', ')}`,
          );
          // Continue with other buckets even if one fails
        } else {
          this.logger.debug(
            `Deleted ${result.deleted} file(s) from bucket ${bucket}`,
          );
        }
      }

      // Delete asset records from database
      const assetIds = assetRows.map((a) => a.id);
      const { error: deleteError } = (await this.db
        .from(null, 'assets')
        .delete()
        .in('id', assetIds)) as QueryResult<unknown>;

      if (deleteError) {
        this.logger.warn(
          `Failed to delete asset records: ${deleteError.message}`,
        );
      } else {
        this.logger.log(
          `Successfully cleaned up ${assetRows.length} asset(s) for conversation ${conversationId}`,
        );
      }
    } catch (error) {
      // Log but don't throw - we still want to delete the conversation
      this.logger.warn(
        `Failed to cleanup assets for conversation ${conversationId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  /**
   * Update conversation metadata
   */
  async updateConversationMetadata(
    conversationId: string,
    userId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const { error } = (await this.db
      .from(null, 'conversations')
      .update({
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('user_id', userId)) as QueryResult<unknown>;

    if (error) {
      throw new Error(
        `Failed to update conversation metadata: ${error.message}`,
      );
    }
  }

  /**
   * Get active conversations for a user
   */
  async getActiveConversations(userId: string): Promise<AgentConversation[]> {
    const { data: result, error } = (await this.db
      .from(null, 'conversations')
      .select()
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('last_active_at', { ascending: false })) as QueryResult<unknown>;

    const data = result as AgentConversationDbRecord[] | null;

    if (error) {
      throw new Error(`Failed to fetch active conversations: ${error.message}`);
    }

    return (data || []).map((item) => this.mapToAgentConversation(item));
  }

  /**
   * Helper: Find conversation by work product binding
   */
  async findByWorkProduct(
    userId: string,
    workProduct: { type: 'deliverable' | 'project'; id: string },
  ): Promise<AgentConversation | null> {
    const { data: rawData, error } = (await this.db
      .from(null, 'conversations')
      .select('*')
      .eq('user_id', userId)
      .eq('primary_work_product_type', workProduct.type)
      .eq('primary_work_product_id', workProduct.id)
      .limit(1)
      .maybeSingle()) as QueryResult<unknown>;

    const data = rawData as AgentConversationDbRecord | null;

    if (error && error.code !== 'PGRST116') {
      throw new Error(
        `Failed to find conversation by work product: ${error.message}`,
      );
    }

    return data ? this.mapToAgentConversation(data) : null;
  }

  /**
   * Set the primary work product for a conversation exactly once.
   * If already set to a different value, throw (immutability enforcement).
   */
  async setPrimaryWorkProduct(
    conversationId: string,
    userId: string,
    workProduct: { type: 'deliverable' | 'project'; id: string },
  ): Promise<void> {
    // Fetch existing values
    const { data: result, error: fetchError } = (await this.db
      .from(null, 'conversations')
      .select('id, user_id, primary_work_product_type, primary_work_product_id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single()) as QueryResult<unknown>;

    const existing = result as Pick<
      AgentConversationDbRecord,
      'id' | 'user_id' | 'primary_work_product_type' | 'primary_work_product_id'
    > | null;

    if (fetchError || !existing) {
      throw new Error('Conversation not found or access denied');
    }

    const existingType = existing.primary_work_product_type as
      | 'deliverable'
      | 'project'
      | null;
    const existingId = existing.primary_work_product_id as string | null;

    if (
      existingType &&
      existingId &&
      (existingType !== workProduct.type || existingId !== workProduct.id)
    ) {
      throw new Error('Primary work product is immutable once set');
    }

    if (
      existingType === workProduct.type &&
      existingId === workProduct.id &&
      existingType !== null &&
      existingId !== null
    ) {
      return; // no-op
    }

    const { error: updateError } = (await this.db
      .from(null, 'conversations')
      .update({
        primary_work_product_type: workProduct.type,
        primary_work_product_id: workProduct.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('user_id', userId)) as QueryResult<unknown>;

    if (updateError) {
      throw new Error(
        updateError.message || 'Could not set primary work product',
      );
    }
  }

  /**
   * Map database record to AgentConversation type
   */
  private mapToAgentConversation(
    data: AgentConversationDbRecord,
  ): AgentConversation {
    return {
      id: data.id,
      userId: data.user_id,
      agentName: data.agent_name,
      agentType: data.agent_type,
      organizationSlug: data.organization_slug || null, // Add organization slug
      startedAt: data.started_at
        ? new Date(data.started_at)
        : new Date(data.created_at),
      endedAt: data.ended_at ? new Date(data.ended_at) : undefined,
      lastActiveAt: data.last_active_at
        ? new Date(data.last_active_at)
        : new Date(data.created_at),
      metadata: data.metadata,
      workProduct:
        data.primary_work_product_type === 'deliverable' &&
        data.primary_work_product_id
          ? {
              type: 'deliverable' as const,
              id: data.primary_work_product_id,
            }
          : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  /**
   * Map database record to AgentConversationWithStats type
   */
  private mapToAgentConversationWithStats(
    data: AgentConversationWithStatsDbRecord,
  ): AgentConversationWithStats {
    return {
      ...this.mapToAgentConversation(data),
      taskCount: parseInt(String(data.task_count)) || 0,
      completedTasks: parseInt(String(data.completed_tasks)) || 0,
      failedTasks: parseInt(String(data.failed_tasks)) || 0,
      activeTasks: parseInt(String(data.active_tasks)) || 0,
    };
  }
}

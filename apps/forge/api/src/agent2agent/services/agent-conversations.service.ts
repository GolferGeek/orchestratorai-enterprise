import { Injectable, Logger, Inject } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
// No AgentType import needed - we treat agent_type as a simple string

/**
 * Database record type for conversations table
 */
interface ConversationDbRecord {
  id: string;
  user_id: string;
  agent_name: string;
  agent_type: string;
  title: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  started_at?: string;
  last_active_at?: string;
}

/**
 * Agent2Agent-specific Conversations Service
 * Handles conversation management for A2A Google protocol agents
 * Isolated from legacy file-based agent system
 */
@Injectable()
export class Agent2AgentConversationsService {
  private readonly logger = new Logger(Agent2AgentConversationsService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Create a new conversation
   * A2A protocol: conversation initiation
   */
  async createConversation(
    params: {
      userId: string;
      orgSlug: string;
    },
    agentName: string,
    options?: {
      title?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{
    id: string;
    userId: string;
    agentName: string;
    organization: string;
    title: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }> {
    try {
      const now = new Date().toISOString();
      const insertData: Record<string, unknown> = {
        user_id: params.userId,
        agent_name: agentName,
        organization_slug: params.orgSlug, // Store organization in organization_slug column
        started_at: now,
        last_active_at: now,
        metadata: {
          ...options?.metadata,
          title:
            options?.title ||
            `${agentName} - ${new Date().toLocaleDateString()}`,
          protocol: 'a2a-google',
          source: 'agent2agent',
        },
      };

      const response = await this.db
        .from(null, 'conversations')
        .insert([insertData])
        .select('*')
        .single();

      const data: unknown = response.data;
      const error: unknown = response.error;
      const conversation = data as ConversationDbRecord | null;

      if (error || !conversation) {
        throw new Error(
          `Failed to create conversation: ${(error as { message?: string })?.message || 'No data returned'}`,
        );
      }

      this.logger.debug(
        `✅ Created A2A conversation ${conversation.id} for agent ${agentName}`,
      );

      return {
        id: conversation.id,
        userId: conversation.user_id,
        agentName: conversation.agent_name,
        organization: conversation.agent_type, // agent_type column stores the organization
        title: conversation.title,
        metadata: conversation.metadata,
        createdAt: new Date(conversation.created_at),
      };
    } catch (error) {
      this.logger.error('Failed to create A2A conversation:', error);
      throw error;
    }
  }

  /**
   * Get conversation by ID
   * Internal method for conversation context retrieval
   */
  async getConversationById(params: {
    conversationId: string;
    userId: string;
  }): Promise<{
    id: string;
    userId: string;
    agentName: string;
    organization: string;
    title: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    try {
      const response = await this.db
        .from(null, 'conversations')
        .select('*')
        .eq('id', params.conversationId)
        .eq('user_id', params.userId)
        .single();

      const data: unknown = response.data;
      const error: unknown = response.error;
      const conversation = data as ConversationDbRecord | null;

      if (error || !conversation) {
        return null;
      }

      return {
        id: conversation.id,
        userId: conversation.user_id,
        agentName: conversation.agent_name,
        organization: conversation.agent_type, // agent_type column stores the organization
        title: conversation.title,
        metadata: conversation.metadata,
        createdAt: new Date(conversation.created_at),
        updatedAt: new Date(conversation.updated_at),
      };
    } catch (error) {
      this.logger.error(
        `Failed to get A2A conversation ${params.conversationId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Get or create conversation
   * Internal method: ensure conversation exists for task execution
   */
  async getOrCreateConversation(
    params: {
      userId: string;
      orgSlug: string;
      conversationId?: string;
    },
    agentName: string,
  ): Promise<{
    id: string;
    userId: string;
    agentName: string;
    organization: string;
    title: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }> {
    // If conversationId provided, try to get it
    if (params.conversationId) {
      const existing = await this.getConversationById({
        conversationId: params.conversationId,
        userId: params.userId,
      });
      if (existing) {
        return {
          id: existing.id,
          userId: existing.userId,
          agentName: existing.agentName,
          organization: existing.organization,
          title: existing.title,
          metadata: existing.metadata,
          createdAt: existing.createdAt,
        };
      }

      this.logger.warn(
        `Conversation ${params.conversationId} not found, creating new one`,
      );
    }

    // Create new conversation
    return this.createConversation(
      { userId: params.userId, orgSlug: params.orgSlug },
      agentName,
    );
  }

  /**
   * Update conversation metadata
   * Internal method: conversation state updates
   */
  async updateConversation(
    params: {
      conversationId: string;
      userId: string;
    },
    updates: {
      title?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (updates.title) {
        updateData.title = updates.title;
      }

      if (updates.metadata) {
        // Merge metadata
        const { data } = (await this.db
          .from(null, 'conversations')
          .select('metadata')
          .eq('id', params.conversationId)
          .eq('user_id', params.userId)
          .single()) as QueryResult<unknown>;

        const current = data as Pick<ConversationDbRecord, 'metadata'> | null;

        updateData.metadata = {
          ...(current?.metadata || {}),
          ...updates.metadata,
          protocol: 'a2a-google',
        };
      }

      const { error } = await this.db
        .from(null, 'conversations')
        .update(updateData)
        .eq('id', params.conversationId)
        .eq('user_id', params.userId);

      if (error) {
        throw new Error(`Failed to update conversation: ${error.message}`);
      }

      this.logger.debug(`✅ Updated A2A conversation ${params.conversationId}`);
    } catch (error) {
      this.logger.error(
        `Failed to update A2A conversation ${params.conversationId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * List conversations for a user and agent
   * A2A protocol: conversation history
   */
  async listConversations(
    userId: string,
    agentName?: string,
    organization?: string,
  ): Promise<unknown[]> {
    try {
      let query = this.db
        .from(null, 'conversations')
        .select('*')
        .eq('user_id', userId);

      if (agentName) {
        query = query.eq('agent_name', agentName);
      }

      if (organization) {
        query = query.eq('agent_type', organization);
      }

      const { data: conversations, error } = (await query.order('updated_at', {
        ascending: false,
      })) as QueryResult<unknown>;

      if (error) {
        throw new Error(`Failed to list conversations: ${error.message}`);
      }

      return (conversations as unknown[]) || [];
    } catch (error) {
      this.logger.error('Failed to list A2A conversations:', error);
      return [];
    }
  }

  /**
   * Delete a conversation
   * A2A protocol: conversation cleanup
   */
  async deleteConversation(context: ExecutionContext): Promise<void> {
    try {
      const { error } = await this.db
        .from(null, 'conversations')
        .delete()
        .eq('id', context.conversationId)
        .eq('user_id', context.userId);

      if (error) {
        throw new Error(`Failed to delete conversation: ${error.message}`);
      }

      this.logger.log(`🗑️ Deleted A2A conversation ${context.conversationId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete A2A conversation ${context.conversationId}:`,
        error,
      );
      throw error;
    }
  }
}

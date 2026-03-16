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
  organization_slug?: string | null;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

/**
 * Database record type for tasks table
 */
interface TaskDbRecord {
  id: string;
  conversation_id: string;
  user_id: string;
  method?: string;
  prompt?: string;
  status: string;
  params: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  created_at: string;
  updated_at: string;
}

/**
 * LLM Selection configuration interface
 */
export interface LlmSelection {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

/**
 * Conversation history message interface
 */
export interface ConversationMessage {
  role: string;
  content: string;
  timestamp?: string;
  [key: string]: unknown;
}

/**
 * Task parameters interface
 */
export interface TaskParams {
  method: string;
  prompt: string;
  conversationId?: string;
  metadata?: {
    protocol?: string;
    llmSelection?: LlmSelection;
    conversationHistory?: ConversationMessage[];
    [key: string]: unknown;
  };
}

/**
 * Task data for database insertion
 */
interface TaskData {
  id?: string;
  user_id: string;
  conversation_id: string;
  method: string;
  prompt: string;
  status: string;
  params: TaskParams;
}

/**
 * Task record from database
 */
export interface TaskRecord {
  id: string;
  user_id: string;
  conversation_id: string;
  method: string;
  prompt: string;
  status: string;
  params: TaskParams;
  result?: Record<string, unknown>;
  error?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Agent2Agent-specific Tasks Service
 * Handles task creation and management for A2A Google protocol agents
 * Isolated from legacy file-based agent system
 */
@Injectable()
export class Agent2AgentTasksService {
  private readonly logger = new Logger(Agent2AgentTasksService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Get or create a task for an A2A agent
   * If taskId is provided and task exists, returns the existing task
   * Otherwise creates a new task
   */
  async getOrCreateTask(
    taskContext: {
      userId: string;
      orgSlug: string;
      conversationId?: string;
    },
    agentName: string,
    params: {
      method: string;
      prompt: string;
      taskId?: string;
      metadata?: Record<string, unknown>;
      llmSelection?: LlmSelection;
      conversationHistory?: ConversationMessage[];
    },
  ): Promise<{
    id: string;
    userId: string;
    agentName: string;
    organization: string | null;
    agentConversationId: string | null;
    status: string;
    params: TaskParams;
    createdAt: Date;
  }> {
    // If taskId provided, check if task already exists
    if (params.taskId) {
      const existing = await this.getTaskById({
        taskId: params.taskId,
        userId: taskContext.userId,
      });
      if (existing) {
        this.logger.debug(`✅ Found existing task ${params.taskId}`);
        return {
          id: existing.id,
          userId: existing.userId,
          agentName: existing.agentName,
          organization: existing.organization,
          agentConversationId: existing.agentConversationId,
          status: existing.status,
          params: existing.params,
          createdAt: existing.createdAt,
        };
      }
    }

    // Task doesn't exist, create it
    return this.createTask(taskContext, agentName, params);
  }

  /**
   * Create a task for an A2A agent
   * Conforms to A2A Google protocol standards
   */
  async createTask(
    taskContext: {
      userId: string;
      orgSlug: string;
      conversationId?: string;
    },
    agentName: string,
    params: {
      method: string;
      prompt: string;
      taskId?: string;
      metadata?: Record<string, unknown>;
      llmSelection?: LlmSelection;
      conversationHistory?: ConversationMessage[];
    },
  ): Promise<{
    id: string;
    userId: string;
    agentName: string;
    organization: string | null; // Organization slug from conversation (null for global agents)
    agentConversationId: string | null;
    status: string;
    params: TaskParams;
    createdAt: Date;
  }> {
    this.logger.debug(
      `🚨 [Agent2AgentTasksService.createTask] Received organizationSlug: "${taskContext.orgSlug}" for agent: ${agentName}`,
    );

    try {
      // If conversationId provided, validate it exists
      let conversationId = taskContext.conversationId || '';
      if (conversationId) {
        const { data } = (await this.db
          .from(null, 'conversations')
          .select('id')
          .eq('id', conversationId)
          .eq('user_id', taskContext.userId)
          .single()) as QueryResult<unknown>;

        const existingConv = data as Pick<ConversationDbRecord, 'id'> | null;

        if (!existingConv) {
          this.logger.warn(
            `Conversation ${conversationId} not found, will create new one`,
          );
          conversationId = '';
        }
      }

      // Create conversation if needed
      if (!conversationId) {
        this.logger.log(
          `🚨 [Agent2AgentTasksService] Creating conversation with organizationSlug: "${taskContext.orgSlug}"`,
        );

        const now = new Date().toISOString();
        const conversationData = {
          user_id: taskContext.userId,
          agent_name: agentName,
          organization_slug: taskContext.orgSlug, // Store organization slug properly
          started_at: now,
          last_active_at: now,
          metadata: {
            source: 'agent2agent',
            method: params.method,
            protocol: 'a2a-google',
            title: `${agentName} - ${new Date().toLocaleDateString()}`, // Store title in metadata
          },
        };

        this.logger.log(
          `🚨 [Agent2AgentTasksService] Conversation data:`,
          JSON.stringify(conversationData),
        );

        const { data, error: convError } = (await this.db
          .from(null, 'conversations')
          .insert([conversationData])
          .select('id')
          .single()) as QueryResult<unknown>;

        const newConv = data as Pick<ConversationDbRecord, 'id'> | null;

        if (convError || !newConv) {
          throw new Error(
            `Failed to create conversation: ${convError?.message || 'No data returned'}`,
          );
        }

        conversationId = newConv.id;
        this.logger.debug(
          `✅ Created new A2A conversation ${conversationId} for agent ${agentName}`,
        );
      }

      // At this point, conversationId is guaranteed to be a string
      if (!conversationId) {
        throw new Error('Conversation ID is required but was not created');
      }

      // Create task record (agent info is stored in the linked conversation)
      const taskData: TaskData = {
        user_id: taskContext.userId,
        conversation_id: conversationId,
        method: params.method,
        prompt: params.prompt,
        status: 'pending',
        params: {
          method: params.method,
          prompt: params.prompt,
          conversationId,
          metadata: {
            ...params.metadata,
            protocol: 'a2a-google',
            llmSelection: params.llmSelection,
            conversationHistory: params.conversationHistory,
          },
        },
      };

      // Store LLM selection in dedicated llm_metadata column for better querying
      if (params.llmSelection) {
        (
          taskData as typeof taskData & {
            llm_metadata: Record<string, unknown>;
          }
        ).llm_metadata = {
          originalLLMSelection: params.llmSelection,
          createdAt: new Date().toISOString(),
        };
      }

      // Store top-level metadata for task-level information
      // This is separate from params.metadata which is protocol-specific
      if (params.metadata && Object.keys(params.metadata).length > 0) {
        (
          taskData as typeof taskData & { metadata: Record<string, unknown> }
        ).metadata = {
          ...params.metadata,
          agentName,
          organizationSlug: taskContext.orgSlug,
          createdAt: new Date().toISOString(),
        };
      }

      // Only include id if taskId is provided (otherwise let DB generate it)
      if (params.taskId) {
        taskData.id = params.taskId;
      }

      const response = await this.db
        .from(null, 'tasks')
        .insert([taskData])
        .select('*')
        .single();

      const data: unknown = response.data;
      const taskError: unknown = response.error;
      let task = data as TaskDbRecord | null;

      if (taskError) {
        const pgError = taskError as { code?: string; message?: string };
        // Duplicate key (23505) = race condition or retry after Cloudflare timeout
        // Fetch the existing task instead of failing
        if (pgError.code === '23505' && params.taskId) {
          const existing = await this.db
            .from(null, 'tasks')
            .select('*')
            .eq('id', params.taskId)
            .single();
          task = existing.data as TaskDbRecord | null;
        }
        if (!task) {
          throw new Error(
            `Failed to create task: ${pgError.message || 'No data returned'}`,
          );
        }
      }

      if (!task) {
        throw new Error('Failed to create task: No data returned');
      }

      this.logger.debug(
        `✅ Created A2A task ${task.id} in conversation ${conversationId}`,
      );

      return {
        id: task.id,
        userId: task.user_id,
        agentName: agentName, // Use the parameter since it's not in the task record
        organization: taskContext.orgSlug, // Return the organization slug that was stored in the conversation
        agentConversationId: task.conversation_id,
        status: task.status,
        params: task.params as unknown as TaskParams,
        createdAt: new Date(task.created_at),
      };
    } catch (error) {
      this.logger.error('Failed to create A2A task:', error);
      throw error;
    }
  }

  /**
   * Get a task by ID
   * Internal method: task tracking and status queries
   */
  async getTaskById(params: { taskId: string; userId: string }): Promise<{
    id: string;
    userId: string;
    agentName: string;
    organization: string | null; // Organization slug from conversation (null for global agents)
    agentConversationId: string | null;
    status: string;
    params: TaskParams;
    result?: Record<string, unknown>;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    try {
      const response = await this.db
        .from(null, 'tasks')
        .select(
          `
          *,
          conversations!inner(agent_name, agent_type, organization_slug)
        `,
        )
        .eq('id', params.taskId)
        .eq('user_id', params.userId)
        .single();

      const data: unknown = response.data;
      const error: unknown = response.error;

      const task = data as
        | (TaskDbRecord & {
            conversations: Pick<
              ConversationDbRecord,
              'agent_name' | 'agent_type' | 'organization_slug'
            >;
          })
        | null;

      if (error || !task) {
        return null;
      }

      return {
        id: task.id,
        userId: task.user_id,
        agentName: task.conversations?.agent_name || 'unknown',
        organization: task.conversations?.organization_slug || null,
        agentConversationId: task.conversation_id,
        status: task.status,
        params: task.params as unknown as TaskParams,
        result: task.result,
        error: task.error,
        createdAt: new Date(task.created_at),
        updatedAt: new Date(task.updated_at),
      };
    } catch (error) {
      this.logger.error(`Failed to get A2A task ${params.taskId}:`, error);
      return null;
    }
  }

  /**
   * Get all tasks for a conversation
   * A2A protocol: conversation history and context
   */
  async getTasksByConversation(
    context: ExecutionContext,
  ): Promise<TaskRecord[]> {
    try {
      const { data, error } = (await this.db
        .from(null, 'tasks')
        .select('*')
        .eq('conversation_id', context.conversationId)
        .eq('user_id', context.userId)
        .order('created_at', { ascending: true })) as QueryResult<unknown>;

      const tasks = data as TaskDbRecord[] | null;

      if (error) {
        throw new Error(`Failed to get conversation tasks: ${error.message}`);
      }

      return (tasks || []).map((task) => {
        const taskParams = task.params as unknown as TaskParams;
        return {
          id: task.id,
          user_id: task.user_id,
          conversation_id: task.conversation_id,
          method: task.method || taskParams.method || '',
          prompt: task.prompt || taskParams.prompt || '',
          status: task.status,
          params: taskParams,
          result: task.result,
          error: task.error,
          created_at: task.created_at,
          updated_at: task.updated_at,
        };
      });
    } catch (error) {
      this.logger.error(
        `Failed to get tasks for conversation ${context.conversationId}:`,
        error,
      );
      return [];
    }
  }
}

import { Injectable, Logger, Inject } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { snakeToCamel } from '@/utils/case-converter';

export interface TaskMessage {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  messageType: 'progress' | 'status' | 'info' | 'warning' | 'error';
  progressPercentage?: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateTaskMessageDto {
  taskId: string;
  userId: string;
  content: string;
  messageType: 'progress' | 'status' | 'info' | 'warning' | 'error';
  progressPercentage?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskMessageQueryParams {
  taskId?: string;
  userId?: string;
  messageType?: string;
  limit?: number;
  offset?: number;
}

/**
 * Database record type for task_messages table
 */
interface TaskMessageDbRecord {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  message_type: string;
  progress_percentage?: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

@Injectable()
export class TaskMessageService {
  private readonly logger = new Logger(TaskMessageService.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a new task message
   */
  async createTaskMessage(dto: CreateTaskMessageDto): Promise<TaskMessage> {
    const taskMessageData = {
      task_id: dto.taskId,
      user_id: dto.userId,
      content: dto.content,
      message_type: dto.messageType,
      progress_percentage: dto.progressPercentage,
      metadata: dto.metadata || {},
    };

    const response = await this.db
      .from(null, 'task_messages')
      .insert(taskMessageData)
      .select()
      .single();

    const dataRaw: unknown = response.data;
    const errorRaw: unknown = response.error;
    const result = dataRaw as TaskMessageDbRecord | null;
    const error = errorRaw as { message?: string } | null;
    const data = result;

    if (error || !data) {
      throw new Error(
        `Failed to create task message: ${error?.message || 'No data returned'}`,
      );
    }

    const taskMessage = this.mapToTaskMessage(data);

    // Look up task to get conversation context for observability
    let conversationId: string | null = null;
    let organizationSlug: string | null = null;
    let agentSlug: string | null = null;

    try {
      const taskResponse = await this.db
        .from(null, 'tasks')
        .select('conversation_id, metadata')
        .eq('id', dto.taskId)
        .single();

      if (taskResponse.data) {
        const taskData = taskResponse.data as {
          conversation_id: string | null;
          metadata: Record<string, unknown> | null;
        };
        conversationId = taskData.conversation_id;
        const metadata = taskData.metadata as Record<string, unknown>;
        organizationSlug =
          (metadata?.organizationSlug as string) ||
          (metadata?.organization_slug as string) ||
          null;
        agentSlug =
          (metadata?.agentSlug as string) ||
          (metadata?.agent_slug as string) ||
          null;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch task context for observability: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Emit task message event for real-time updates with conversation context
    this.eventEmitter.emit('task.message', {
      taskId: dto.taskId,
      userId: dto.userId,
      conversationId,
      organizationSlug,
      agentSlug,
      message: taskMessage,
    });

    // Also emit progress event if this is a progress message
    if (
      dto.messageType === 'progress' &&
      dto.progressPercentage !== undefined
    ) {
      this.eventEmitter.emit('task.progress', {
        taskId: dto.taskId,
        userId: dto.userId,
        conversationId,
        organizationSlug,
        agentSlug,
        progress: dto.progressPercentage,
        message: dto.content,
      });
    }

    return taskMessage;
  }

  /**
   * Get messages for a specific task
   */
  async getTaskMessages(
    taskId: string,
    userId: string,
    params: TaskMessageQueryParams = {},
  ): Promise<{ messages: TaskMessage[]; total: number }> {
    try {
      let query = this.db
        .from(null, 'task_messages')
        .select('*', { count: 'exact' })
        .eq('task_id', taskId)
        .eq('user_id', userId);

      // Apply additional filters
      if (params.messageType) {
        query = query.eq('message_type', params.messageType);
      }

      // Apply pagination
      const limit = params.limit || 100;
      const offset = params.offset || 0;
      query = query
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1);

      const {
        data: result,
        error,
        count,
      } = (await query) as QueryResult<unknown>;

      const data = result as TaskMessageDbRecord[] | null;

      if (error) {
        throw new Error(`Failed to fetch task messages: ${error.message}`);
      }

      return {
        messages: (data || []).map((item) => this.mapToTaskMessage(item)),
        total: count || 0,
      };
    } catch (error) {
      this.logger.error('Failed to get task messages', error);
      throw error;
    }
  }

  /**
   * Get recent messages across all tasks for a user
   */
  async getRecentMessages(
    userId: string,
    params: TaskMessageQueryParams = {},
  ): Promise<{ messages: TaskMessage[]; total: number }> {
    try {
      let query = this.db
        .from(null, 'task_messages')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      // Apply filters
      if (params.messageType) {
        query = query.eq('message_type', params.messageType);
      }

      // Apply pagination
      const limit = params.limit || 50;
      const offset = params.offset || 0;
      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const {
        data: result,
        error,
        count,
      } = (await query) as QueryResult<unknown>;

      const data = result as TaskMessageDbRecord[] | null;

      if (error) {
        throw new Error(`Failed to fetch recent messages: ${error.message}`);
      }

      return {
        messages: (data || []).map((item) => this.mapToTaskMessage(item)),
        total: count || 0,
      };
    } catch (error) {
      this.logger.error('Failed to get recent messages', error);
      throw error;
    }
  }

  /**
   * Delete messages for a specific task (cleanup)
   */
  async deleteTaskMessages(taskId: string, userId: string): Promise<void> {
    try {
      const { error } = (await this.db
        .from(null, 'task_messages')
        .delete()
        .eq('task_id', taskId)
        .eq('user_id', userId)) as QueryResult<unknown>;

      if (error) {
        throw new Error(`Failed to delete task messages: ${error.message}`);
      }
    } catch (error) {
      this.logger.error('Failed to delete task messages', error);
      throw error;
    }
  }

  /**
   * Get message statistics for a task
   */
  async getTaskMessageStats(
    taskId: string,
    userId: string,
  ): Promise<{
    total: number;
    byType: Record<string, number>;
    progressMessages: number;
    errorMessages: number;
    lastMessage?: TaskMessage;
  }> {
    try {
      const { data: result, error } = (await this.db
        .from(null, 'task_messages')
        .select('*')
        .eq('task_id', taskId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })) as QueryResult<unknown>;

      const data = result as TaskMessageDbRecord[] | null;

      if (error) {
        throw new Error(`Failed to fetch task message stats: ${error.message}`);
      }

      const messages = (data || []).map((item) => this.mapToTaskMessage(item));
      const byType: Record<string, number> = {};
      let progressMessages = 0;
      let errorMessages = 0;

      messages.forEach((message) => {
        byType[message.messageType] = (byType[message.messageType] || 0) + 1;
        if (message.messageType === 'progress') progressMessages++;
        if (message.messageType === 'error') errorMessages++;
      });

      return {
        total: messages.length,
        byType,
        progressMessages,
        errorMessages,
        lastMessage: messages[0], // Most recent message
      };
    } catch (error) {
      this.logger.error('Failed to get task message stats', error);
      throw error;
    }
  }

  /**
   * Stream task messages for real-time updates
   */
  async *streamTaskMessages(taskId: string, userId: string) {
    // Verify task access (could add task verification here)

    let lastMessageTime: Date | null = null;

    // Create event listener for new messages
    const messageListener = (event: {
      taskId: string;
      userId: string;
      message: string;
    }) => {
      if (event.taskId === taskId && event.userId === userId) {
        return event.message;
      }
      return null;
    };

    // Subscribe to message events
    this.eventEmitter.on('task.message', messageListener);

    try {
      // Yield existing messages first
      const { messages } = await this.getTaskMessages(taskId, userId);
      for (const message of messages) {
        yield message;
        lastMessageTime = message.createdAt;
      }

      // Keep connection alive and yield new messages
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check for new messages since last known message
        const { messages: newMessages } = await this.getTaskMessages(
          taskId,
          userId,
          {
            limit: 10, // Just check for recent messages
          },
        );

        const unseenMessages = lastMessageTime
          ? newMessages.filter((msg) => msg.createdAt > lastMessageTime!)
          : newMessages;

        for (const message of unseenMessages) {
          yield message;
          lastMessageTime = message.createdAt;
        }
      }
    } finally {
      // Clean up listener
      this.eventEmitter.off('task.message', messageListener);
    }
  }

  /**
   * Map database record to TaskMessage type
   */
  private mapToTaskMessage(data: unknown): TaskMessage {
    const converted = snakeToCamel(data) as Record<string, unknown>;

    return {
      id: converted.id as string,
      taskId: converted.taskId as string,
      userId: converted.userId as string,
      content: converted.content as string,
      messageType: converted.messageType as TaskMessage['messageType'],
      progressPercentage: converted.progressPercentage as number | undefined,
      metadata: (converted.metadata as Record<string, unknown>) || {},
      createdAt: new Date(converted.createdAt as string),
    };
  }
}

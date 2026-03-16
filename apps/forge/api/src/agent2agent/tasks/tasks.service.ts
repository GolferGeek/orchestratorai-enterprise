import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
// TaskLifecycleService archived with agents/base
// Using local TaskStatus type
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
import { AgentConversationsService } from '@/agent2agent/conversations/agent-conversations.service';
import {
  Task,
  CreateTaskDto,
  UpdateTaskDto,
  TaskQueryParams,
  TaskProgressEvent,
  AgentType,
} from '@/agent2agent/types/agent-conversations.types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { snakeToCamel } from '@/utils/case-converter';
import { TaskMessageService } from './task-message.service';
import { TaskStatusService, TaskStatusState } from './task-status.service';
import {
  MessageEmitter,
  TaskMessageEmitter,
} from './message-emitter.interface';

// Database row type for tasks table (snake_case)
interface TaskRow {
  id?: string;
  conversation_id: string;
  user_id: string;
  method: string;
  prompt: string;
  params?: Record<string, unknown>;
  response?: string;
  response_metadata?: Record<string, unknown>;
  status: string;
  progress: number;
  evaluation?: Record<string, unknown>;
  llm_metadata?: Record<string, unknown>;
  pii_metadata?: Record<string, unknown>;
  error_code?: string;
  error_message?: string;
  error_data?: Record<string, unknown>;
  started_at?: string;
  completed_at?: string;
  timeout_seconds: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // HITL pending tracking (Session 2)
  hitl_pending?: boolean;
  hitl_pending_since?: string;
  // Agent info for HITL pending list
  agent_slug?: string;
  agent_name?: string;
}
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly agentConversationsService: AgentConversationsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly taskMessageService: TaskMessageService,
    @Inject(forwardRef(() => TaskStatusService))
    private readonly taskStatusService: TaskStatusService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate a unique task ID using UUID v4
   */
  private generateTaskId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );
  }

  /**
   * Create a new task with database persistence
   * Supports lazy conversation creation - if no conversationId provided, creates one
   */
  async createTask(
    userId: string,
    agentName: string,
    agentType: AgentType,
    dto: CreateTaskDto,
  ): Promise<Task> {
    // Handle conversation - always ensure it exists
    let conversationId: string | null = dto.conversationId || null;

    // Always validate/create conversation to avoid foreign key violations
    const conversation =
      await this.agentConversationsService.getOrCreateConversation(
        userId,
        agentName,
        agentType,
        conversationId, // Pass existing ID for validation/reuse
      );
    conversationId = conversation.id;

    // Prepare task data with proper ID handling
    const taskData: TaskRow = {
      conversation_id: conversationId,
      user_id: userId,
      method: dto.method,
      prompt: dto.prompt,
      params: dto.params || {},
      status: 'pending',
      progress: 0,
      timeout_seconds:
        dto.timeoutSeconds ||
        parseInt(
          this.configService.get<string>('AGENT_TASK_TIMEOUT_SECONDS') || '120',
          10,
        ),
      metadata: dto.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Use provided task ID if available, otherwise generate new one
    if (dto.taskId) {
      taskData.id = dto.taskId;
    } else {
      taskData.id = this.generateTaskId();
    }

    // Store LLM selection metadata if provided
    if (dto.llmSelection) {
      taskData.llm_metadata = {
        originalLLMSelection: dto.llmSelection,
        createdAt: new Date().toISOString(),
      };
    }

    let finalTaskData = taskData;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const response = await this.db
          .from(null, 'tasks')
          .insert(finalTaskData)
          .select()
          .single();

        const dataRaw: unknown = response.data;
        const errorRaw: unknown = response.error;
        const result = dataRaw as TaskRow | null;
        const error = errorRaw as { message?: string; code?: string } | null;

        if (error) {
          // If it's a duplicate key error and we have attempts left, generate new ID
          if (error.code === '23505' && attempts < maxAttempts - 1) {
            finalTaskData = {
              ...taskData,
              id: this.generateTaskId(), // Generate new unique ID
            };
            attempts++;
            continue;
          }

          throw new Error(`Failed to create task: ${error.message}`);
        }

        // Success - continue with task setup
        const createdTask = result;
        if (!createdTask) {
          throw new Error('No data returned from task creation');
        }

        // Legacy TaskLifecycleService archived - task tracking now handled via database

        // Register task with TaskStatusService for live tracking
        await this.taskStatusService.createTask(
          createdTask.id!,
          userId,
          `${agentType}/${agentName}`, // Use the constructed task type for status service
          {
            status: 'pending',
            progress: 0,
          },
        );

        // Create initial task message for status tracking
        await this.taskMessageService.createTaskMessage({
          taskId: createdTask.id!,
          userId,
          content: 'Task created, waiting for execution...',
          messageType: 'status',
          progressPercentage: 0,
        });

        // Emit task created event
        this.eventEmitter.emit('task.created', {
          taskId: createdTask.id,
          conversationId,
          userId,
          agentName,
        });

        return this.mapToTask(createdTask);
      } catch (error) {
        if (attempts >= maxAttempts - 1) {
          throw error;
        }
        attempts++;
      }
    }

    throw new Error(`Failed to create task after ${maxAttempts} attempts`);
  }

  /**
   * Get task by ID
   */
  async getTaskById(taskId: string, userId: string): Promise<Task | null> {
    const response2 = await this.db
      .from(null, 'tasks')
      .select()
      .eq('id', taskId)
      .eq('user_id', userId)
      .single();

    const dataRaw2: unknown = response2.data;
    const errorRaw2: unknown = response2.error;
    const taskData = dataRaw2 as TaskRow | null;
    const error = errorRaw2 as { code?: string; message?: string } | null;
    const data = taskData;

    if (error && error.code !== 'PGRST116') {
      throw new Error(
        `Failed to fetch task: ${error.message || 'Unknown error'}`,
      );
    }

    const result = data ? this.mapToTask(data) : null;

    if (result) {
      if (result.response) {
        // Response processing if needed
      }
    }

    return result;
  }

  /**
   * List tasks with filters
   */
  async listTasks(
    params: TaskQueryParams,
  ): Promise<{ tasks: Task[]; total: number }> {
    let query = this.db.from(null, 'tasks').select('*', { count: 'exact' });

    // Apply filters
    if (params.conversationId) {
      query = query.eq('conversation_id', params.conversationId);
    }
    if (params.userId) {
      query = query.eq('user_id', params.userId);
    }
    if (params.status) {
      query = query.eq('status', params.status);
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

    const data = result as TaskRow[] | null;

    if (error) {
      throw new Error(`Failed to list tasks: ${error.message}`);
    }

    return {
      tasks: (data || []).map((item) => this.mapToTask(item)),
      total: count || 0,
    };
  }

  /**
   * Update task status and progress
   */
  async updateTask(
    taskId: string,
    userId: string,
    updates: UpdateTaskDto,
  ): Promise<Task> {
    const updateData: Partial<TaskRow> = {
      ...(updates as unknown as Partial<TaskRow>),
      updated_at: new Date().toISOString(),
    };

    // Handle status transitions
    if (updates.status === 'running' && !updateData.started_at) {
      updateData.started_at = new Date().toISOString();
    }
    if (
      updates.status === 'completed' ||
      updates.status === 'failed' ||
      updates.status === 'cancelled'
    ) {
      updateData.completed_at = new Date().toISOString();
    }

    // Convert camelCase to snake_case for database columns
    // Type assertion needed because we're converting between camelCase DTO and snake_case DB
    const anyUpdateData = updateData as unknown as {
      responseMetadata?: Record<string, unknown>;
      errorData?: Record<string, unknown>;
      errorCode?: string;
      errorMessage?: string;
      llmMetadata?: Record<string, unknown>;
    };
    if (anyUpdateData.responseMetadata !== undefined) {
      updateData.response_metadata = anyUpdateData.responseMetadata;
      delete anyUpdateData.responseMetadata;
    }
    if (anyUpdateData.errorData !== undefined) {
      updateData.error_data = anyUpdateData.errorData;
      delete anyUpdateData.errorData;
    }
    if (anyUpdateData.errorCode !== undefined) {
      updateData.error_code = anyUpdateData.errorCode;
      delete anyUpdateData.errorCode;
    }
    if (anyUpdateData.errorMessage !== undefined) {
      updateData.error_message = anyUpdateData.errorMessage;
      delete anyUpdateData.errorMessage;
    }
    if (anyUpdateData.llmMetadata !== undefined) {
      updateData.llm_metadata = anyUpdateData.llmMetadata;
      delete anyUpdateData.llmMetadata;
    }

    const response3 = await this.db
      .from(null, 'tasks')
      .update(updateData)
      .eq('id', taskId)
      .eq('user_id', userId)
      .select()
      .single();

    const dataRaw3: unknown = response3.data;
    const errorRaw3: unknown = response3.error;
    const result = dataRaw3 as TaskRow | null;
    const error = errorRaw3 as { message?: string } | null;

    if (error) {
      throw new Error(`Failed to update task: ${error.message}`);
    }

    const updatedTask = result;
    if (!updatedTask) {
      throw new Error('No data returned from task update');
    }

    // Sync with TaskStatusService for live tracking
    await this.taskStatusService.updateTaskStatus(taskId, userId, {
      status: updates.status as TaskStatusState | undefined,
      progress: updates.progress,
      result: updates.response
        ? typeof updates.response === 'string'
          ? updates.response
          : JSON.stringify(updates.response)
        : undefined,
      error: updates.errorMessage,
    });

    // Emit progress event
    if (updates.progress !== undefined) {
      const progressEvent: TaskProgressEvent = {
        taskId,
        progress: updates.progress ?? updatedTask.progress,
        status: updates.status,
      };
      this.eventEmitter.emit('task.progress', progressEvent);
    }

    // Deliverable creation is now handled via event listeners in DeliverablesService

    // Note: Completion events are now emitted by TaskStatusService.emitStatusChange()
    // to avoid duplicate emissions that cause multiple deliverable versions

    return this.mapToTask(updatedTask);
  }

  /**
   * Update task progress
   */
  async updateTaskProgress(
    taskId: string,
    progress: number,
    message?: string,
  ): Promise<void> {
    const { error } = (await this.db
      .from(null, 'tasks')
      .update({
        progress,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)) as QueryResult<unknown>;

    if (error) {
      throw new Error(`Failed to update task progress: ${error.message}`);
    }

    // We don't know the userId in this method, so we can't sync with TaskStatusService here
    // Progress updates should go through the main updateTask method instead

    // Emit progress event
    const progressEvent: TaskProgressEvent = {
      taskId,
      progress,
      message,
    };
    this.eventEmitter.emit('task.progress', progressEvent);
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string, userId: string): Promise<void> {
    await this.updateTask(taskId, userId, {
      status: 'cancelled',
    });

    // Legacy TaskLifecycleService archived - cancellation now handled via database status update
  }

  /**
   * Get active tasks for a profile
   */
  async getActiveTasks(userId: string): Promise<Task[]> {
    const { data: result, error } = (await this.db
      .from(null, 'tasks')
      .select()
      .eq('user_id', userId)
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })) as QueryResult<unknown>;

    const data = result as TaskRow[] | null;

    if (error) {
      throw new Error(`Failed to fetch active tasks: ${error.message}`);
    }

    return (data || []).map((item) => this.mapToTask(item));
  }

  /**
   * Get task metrics and analytics for the user
   */
  async getTaskMetrics(userId: string): Promise<Record<string, unknown>> {
    try {
      const { data: result, error } = (await this.db
        .from(null, 'tasks')
        .select('*')
        .eq('user_id', userId)) as QueryResult<unknown>;

      const tasks = result as TaskRow[] | null;

      if (error) {
        this.logger.error('Failed to fetch tasks for metrics:', error);
        throw new Error(`Failed to fetch task metrics: ${error.message}`);
      }

      const typedTasks = tasks ?? [];

      // Calculate basic metrics
      const totalTasks = typedTasks.length;
      const completedTasks = typedTasks.filter(
        (task) => task.status === 'completed',
      ).length;
      const activeTasks = typedTasks.filter((task) =>
        ['pending', 'running'].includes(task.status),
      ).length;
      const failedTasks = typedTasks.filter(
        (task) => task.status === 'failed',
      ).length;

      // Calculate success rate
      const successRate =
        totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 100;

      // Calculate average completion time (for completed tasks)
      const completedTasksWithTimes = typedTasks.filter(
        (task) =>
          task.status === 'completed' && task.created_at && task.updated_at,
      );

      const averageCompletionTime =
        completedTasksWithTimes.length > 0
          ? completedTasksWithTimes.reduce((sum, task) => {
              const created = new Date(task.created_at).getTime();
              const updated = new Date(task.updated_at).getTime();
              return sum + (updated - created);
            }, 0) / completedTasksWithTimes.length
          : 0;

      return {
        totalTasks,
        completedTasks,
        activeTasks,
        failedTasks,
        successRate: Math.round(successRate * 100) / 100, // Round to 2 decimal places
        averageCompletionTime: Math.round(averageCompletionTime), // in milliseconds
        timestamp: new Date().toISOString(),
        uptime: process.uptime() * 1000, // Convert to milliseconds
        memoryUsage: process.memoryUsage(),
      };
    } catch (error) {
      this.logger.error('Error calculating task metrics:', error);
      throw error;
    }
  }

  /**
   * Stream task progress events (for SSE)
   */
  async *streamTaskProgress(taskId: string, userId: string) {
    // Verify task belongs to user
    const task = await this.getTaskById(taskId, userId);
    if (!task) {
      throw new Error('Task not found');
    }

    // Create event listener
    const progressListener = (event: TaskProgressEvent) => {
      if (event.taskId === taskId) {
        return event;
      }
      return null;
    };

    // Subscribe to progress events
    this.eventEmitter.on('task.progress', progressListener);

    try {
      // Yield current task status
      yield {
        taskId,
        progress: task.progress,
        status: task.status,
      };

      // Keep connection alive and yield updates
      while (task.status === 'pending' || task.status === 'running') {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check for updates
        const updatedTask = await this.getTaskById(taskId, userId);
        if (updatedTask && updatedTask.status !== task.status) {
          yield {
            taskId,
            progress: updatedTask.progress,
            status: updatedTask.status,
          };

          if (
            updatedTask.status !== 'pending' &&
            updatedTask.status !== 'running'
          ) {
            break;
          }
        }
      }
    } finally {
      // Clean up listener
      this.eventEmitter.off('task.progress', progressListener);
    }
  }

  /**
   * Create a MessageEmitter for a task
   * This allows agents to emit messages during task execution
   */
  createMessageEmitter(taskId: string, userId: string): MessageEmitter {
    return new TaskMessageEmitter(taskId, userId, this.taskMessageService);
  }

  /**
   * Emit a message for a task
   * Convenience method for direct message emission
   */
  async emitTaskMessage(
    taskId: string,
    userId: string,
    content: string,
    type: 'progress' | 'status' | 'info' | 'warning' | 'error' = 'info',
    progressPercentage?: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const task = await this.getTaskById(taskId, userId);

      if (!task) {
        this.logger.warn(
          `Skipping task message for ${taskId} – task not found for user ${userId}`,
        );
        return;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to verify task ${taskId} for user ${userId} before emitting message: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return;
    }

    await this.taskMessageService.createTaskMessage({
      taskId,
      userId,
      content,
      messageType: type,
      progressPercentage,
      metadata,
    });
  }

  /**
   * Get messages for a task
   */
  async getTaskMessages(taskId: string, userId: string): Promise<unknown[]> {
    const { messages } = await this.taskMessageService.getTaskMessages(
      taskId,
      userId,
    );
    return messages;
  }

  // ============================================================================
  // HITL Pending Methods (Session 2)
  // ============================================================================

  /**
   * Find all tasks with pending HITL reviews for a user
   * Note: HITL pending is on TASKS table, not conversations
   * This is future-proof for multiple tasks per conversation
   */
  async findPendingHitl(
    userId: string,
    organizationSlug?: string,
  ): Promise<TaskRow[]> {
    this.logger.log(
      `Finding pending HITL tasks for user ${userId}, org ${organizationSlug}`,
    );

    // Query tasks with hitl_pending = true
    // Join with conversations to filter by organization if needed
    let query = this.db
      .from(null, 'tasks')
      .select(
        `
        *,
        conversations!inner(
          id,
          user_id,
          organization_slug,
          title
        )
      `,
      )
      .eq('hitl_pending', true)
      .eq('conversations.user_id', userId)
      .order('hitl_pending_since', { ascending: false });

    if (organizationSlug) {
      query = query.eq('conversations.organization_slug', organizationSlug);
    }

    const { data, error } = (await query) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to find pending HITL tasks: ${error.message}`);
      throw new Error(`Failed to find pending HITL tasks: ${error.message}`);
    }

    return (data as TaskRow[]) || [];
  }

  /**
   * Update task HITL pending status
   *
   * IMPORTANT: Safe Partial Update Pattern
   * - Only modifies specified HITL columns
   * - Does not affect other task fields
   */
  async updateHitlPending(taskId: string, pending: boolean): Promise<void> {
    this.logger.log(
      `Updating HITL pending for task ${taskId}: pending=${pending}`,
    );

    // When clearing HITL pending, explicitly set hitl_pending_since to null
    const updateData: Record<string, unknown> = {
      hitl_pending: pending,
      hitl_pending_since: pending ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = (await this.db
      .from(null, 'tasks')
      .update(updateData)
      .eq('id', taskId)) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to update HITL pending: ${error.message}`);
      throw new Error(`Failed to update HITL pending: ${error.message}`);
    }
  }

  /**
   * Get a task by ID (without user restriction - for internal use)
   */
  async findOne(taskId: string): Promise<TaskRow | null> {
    const { data: rawData, error } = (await this.db
      .from(null, 'tasks')
      .select('*')
      .eq('id', taskId)
      .single()) as QueryResult<unknown>;
    const data = rawData as TaskRow | null;

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch task: ${error.message}`);
    }

    return data;
  }

  /**
   * Add deliverable ID to task response
   */
  private addDeliverableIdToResponse(
    response: unknown,
    deliverableId: string,
  ): string {
    try {
      let result = response;
      if (typeof response === 'string') {
        try {
          result = JSON.parse(response);
        } catch {
          result = { response };
        }
      }

      const enhancedResult = {
        ...(result as Record<string, unknown>),
        deliverableId,
      };

      return JSON.stringify(enhancedResult);
    } catch {
      return response as string;
    }
  }

  /**
   * Map database record to Task type
   */
  private mapToTask(data: unknown): Task {
    // Use the case converter to handle snake_case to camelCase conversion
    const converted = snakeToCamel(data) as Record<string, unknown>;

    return {
      id: converted.id as string,
      agentConversationId: converted.conversationId as string,
      userId: converted.userId as string,
      method: converted.method as string,
      prompt: converted.prompt as string,
      params: (converted.params as Record<string, unknown>) || {},
      response: converted.response as string | undefined,
      responseMetadata:
        (converted.responseMetadata as Record<string, unknown>) || {},
      status: converted.status as Task['status'],
      progress: (converted.progress as number | undefined) ?? 0,
      evaluation: (converted.evaluation as Record<string, unknown>) || {},
      llmMetadata: (converted.llmMetadata as Record<string, unknown>) || {},
      errorCode: converted.errorCode as string | undefined,
      errorMessage: converted.errorMessage as string | undefined,
      errorData: converted.errorData as Record<string, unknown> | undefined,
      startedAt: converted.startedAt
        ? new Date(converted.startedAt as string)
        : undefined,
      completedAt: converted.completedAt
        ? new Date(converted.completedAt as string)
        : undefined,
      timeoutSeconds: (converted.timeoutSeconds as number | undefined) ?? 30,
      metadata: (converted.metadata as Record<string, unknown>) || {},
      createdAt: new Date(converted.createdAt as string),
      updatedAt: new Date(converted.updatedAt as string),
    };
  }
}

import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { JsonObject, JsonValue } from '@orchestrator-ai/transport-types';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  AgentStreamChunkEvent,
  AgentStreamCompleteEvent,
  AgentStreamErrorEvent,
} from '@/agent-platform/services/agent-runtime-stream.service';
import { randomUUID } from 'crypto';
import { TaskMessageService } from './task-message.service';

export type TaskStatusState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'hitl_waiting';

export type TaskType = 'long_running' | 'swarm' | 'ephemeral';

export interface TaskStatus {
  taskId: string;
  userId: string;
  status: TaskStatusState;
  progress: number;
  result?: JsonValue;
  error?: string;
  metadata?: JsonObject;
  createdAt: Date;
  updatedAt: Date;
  taskType: TaskType;
}

export interface TaskStatusUpdate {
  status?: TaskStatusState;
  progress?: number;
  result?: JsonValue;
  error?: string;
  metadata?: JsonObject;
}

interface TaskMessageRecord {
  id: string;
  taskId: string;
  content: string;
  messageType: 'progress' | 'status' | 'info' | 'warning' | 'error';
  progressPercentage?: number;
  metadata?: JsonObject;
  createdAt: string;
  expiresAt: string;
}

interface TaskStreamSession {
  sessionId: string;
  taskId: string;
  userId: string;
  agentSlug: string;
  organizationSlug: string;
  conversationId: string | null;
  streamId: string | null;
  registeredAt: number;
  lastEventAt: number;
  conversationKey: string;
}

/**
 * Single source of truth for task status management
 * Handles both ephemeral and persistent tasks based on agent card taskType
 */
@Injectable()
export class TaskStatusService {
  private readonly logger = new Logger(TaskStatusService.name);
  private readonly messageTtlMs: number;
  private readonly streamInactivityMs: number;

  // Hot cache for all active tasks (both ephemeral and persistent)
  private activeTaskStatuses = new Map<string, TaskStatus>();

  // Live message cache for active tasks (for polling clients)
  private activeTaskMessages = new Map<string, TaskMessageRecord[]>();

  // Cleanup timers for completed tasks
  private cleanupTimers = new Map<string, NodeJS.Timeout>();
  private streamSessionsById = new Map<string, TaskStreamSession>();
  private activeStreamSessionsByStreamId = new Map<string, TaskStreamSession>();
  private activeStreamSessionsByConversation = new Map<
    string,
    TaskStreamSession
  >();
  private streamCleanupTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly taskMessageService: TaskMessageService,
    private readonly configService: ConfigService,
  ) {
    this.messageTtlMs =
      Math.max(
        Number(
          this.configService.get<string>('TASK_MESSAGE_TTL_MINUTES') ?? '60',
        ),
        1,
      ) *
      60 *
      1000;
    this.streamInactivityMs = Math.max(
      Number(
        this.configService.get<string>('TASK_STREAM_INACTIVITY_MS') ?? '60000',
      ),
      5_000,
    );
  }

  registerStreamSession(params: {
    taskId: string;
    userId: string;
    agentSlug: string;
    organizationSlug: string;
    streamId?: string | null;
    conversationId?: string | null;
  }): string {
    const sessionId = randomUUID();
    const normalizedOrg =
      params.organizationSlug && params.organizationSlug.trim().length > 0
        ? params.organizationSlug
        : 'global';
    const session: TaskStreamSession = {
      sessionId,
      taskId: params.taskId,
      userId: params.userId,
      agentSlug: params.agentSlug,
      organizationSlug: normalizedOrg,
      conversationId: params.conversationId ?? null,
      streamId: params.streamId ?? null,
      registeredAt: Date.now(),
      lastEventAt: Date.now(),
      conversationKey: this.buildConversationKey(
        normalizedOrg,
        params.agentSlug,
        params.conversationId ?? null,
      ),
    };

    this.streamSessionsById.set(session.sessionId, session);
    if (session.streamId) {
      this.activeStreamSessionsByStreamId.set(session.streamId, session);
    }
    this.activeStreamSessionsByConversation.set(
      session.conversationKey,
      session,
    );

    this.scheduleStreamCleanup(session);

    return session.sessionId;
  }

  unregisterStreamSession(
    sessionId: string,
    _reason: string = 'cleanup',
  ): void {
    const session = this.streamSessionsById.get(sessionId);
    if (!session) {
      return;
    }

    if (session.streamId) {
      this.activeStreamSessionsByStreamId.delete(session.streamId);
    }
    this.activeStreamSessionsByConversation.delete(session.conversationKey);
    this.streamSessionsById.delete(session.sessionId);
    this.clearStreamCleanup(session);
  }

  private resolveStreamSession(filters: {
    streamId?: string;
    agentSlug: string;
    organizationSlug?: string | null;
    conversationId?: string | null;
  }): TaskStreamSession | undefined {
    if (filters.streamId) {
      const match = this.activeStreamSessionsByStreamId.get(filters.streamId);
      if (match) {
        return match;
      }
    }

    const conversationKey = this.buildConversationKey(
      filters.organizationSlug ?? 'global',
      filters.agentSlug,
      filters.conversationId ?? null,
    );

    return this.activeStreamSessionsByConversation.get(conversationKey);
  }

  private buildConversationKey(
    organizationSlug: string | null,
    agentSlug: string,
    conversationId: string | null,
  ): string {
    const normalizedOrg =
      organizationSlug && organizationSlug.trim().length > 0
        ? organizationSlug
        : 'global';
    const normalizedConversation =
      conversationId && conversationId.trim().length > 0
        ? conversationId
        : 'none';

    return `${normalizedOrg}::${agentSlug}::${normalizedConversation}`;
  }

  private touchStreamSession(session: TaskStreamSession): void {
    session.lastEventAt = Date.now();
    this.scheduleStreamCleanup(session);
  }

  private scheduleStreamCleanup(session: TaskStreamSession): void {
    this.clearStreamCleanup(session);

    const timer = setTimeout(() => {
      this.unregisterStreamSession(session.sessionId, 'inactivity_timeout');
    }, this.streamInactivityMs);

    this.streamCleanupTimers.set(session.sessionId, timer);
  }

  private clearStreamCleanup(session: TaskStreamSession): void {
    const timer = this.streamCleanupTimers.get(session.sessionId);
    if (timer) {
      clearTimeout(timer);
      this.streamCleanupTimers.delete(session.sessionId);
    }
  }

  private pruneExpiredMessages(taskId: string): void {
    const messages = this.activeTaskMessages.get(taskId);
    if (!messages || messages.length === 0) {
      return;
    }

    const now = Date.now();
    const filtered = messages.filter(
      (message) => new Date(message.expiresAt).getTime() > now,
    );

    if (filtered.length === messages.length) {
      return;
    }

    this.activeTaskMessages.set(taskId, filtered);
  }

  private removeStreamSessionsForTask(taskId: string): void {
    const sessionIds = Array.from(this.streamSessionsById.values())
      .filter((session) => session.taskId === taskId)
      .map((session) => session.sessionId);

    for (const sessionId of sessionIds) {
      this.unregisterStreamSession(sessionId, 'task_cleanup');
    }
  }

  private extractProgress(
    metadata: JsonObject | undefined,
  ): number | undefined {
    if (!metadata) {
      return undefined;
    }

    const candidates: Array<unknown> = [
      metadata.progress,
      metadata.progressPercentage,
      metadata.percentage,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
      if (typeof candidate === 'string') {
        const parsed = Number(candidate);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }

    return undefined;
  }

  @OnEvent('agent.stream.chunk')
  handleAgentStreamChunkEvent(event: AgentStreamChunkEvent): void {
    const session = this.resolveStreamSession({
      streamId: event.streamId,
      agentSlug: event.agentSlug,
      organizationSlug: event.organizationSlug ?? 'global',
      conversationId: event.conversationId ?? null,
    });

    if (!session) {
      return;
    }

    this.touchStreamSession(session);

    const metadata: JsonObject = {
      streamId: event.streamId,
      conversationId: event.conversationId ?? null,
      orchestrationRunId: event.orchestrationRunId ?? null,
      organizationSlug: event.organizationSlug ?? null,
      agentSlug: event.agentSlug,
      mode: event.mode,
      chunkType: event.chunk.type,
      chunkMetadata: this.asJsonObject(event.chunk.metadata) ?? {},
      receivedAt: new Date().toISOString(),
    } as JsonObject;

    const content =
      typeof event.chunk.content === 'string'
        ? event.chunk.content
        : JSON.stringify(event.chunk.content);

    this.addTaskMessage(session.taskId, content, 'progress', metadata);

    const progress = this.extractProgress(
      this.asJsonObject(event.chunk.metadata),
    );
    const currentStatus = this.activeTaskStatuses.get(session.taskId);

    const update: TaskStatusUpdate = {
      status: 'running',
    };

    if (progress !== undefined) {
      update.progress = progress;
    }

    // Write progress message to task_messages table before updating status
    if (content && content.trim().length > 0) {
      this.taskMessageService
        .createTaskMessage({
          taskId: session.taskId,
          userId: session.userId,
          content,
          messageType: 'progress',
          progressPercentage: progress,
        })
        .catch(() => {
          // Silently ignore task message creation errors
        });
    }

    if (!currentStatus || currentStatus.status !== 'completed') {
      this.updateTaskStatus(session.taskId, session.userId, update).catch(
        () => {
          // Silently ignore status update errors
        },
      );
    }
  }

  @OnEvent('agent.stream.complete')
  handleAgentStreamCompleteEvent(event: AgentStreamCompleteEvent): void {
    const session = this.resolveStreamSession({
      streamId: event.streamId,
      agentSlug: event.agentSlug,
      organizationSlug: event.organizationSlug ?? 'global',
      conversationId: event.conversationId ?? null,
    });

    if (!session) {
      return;
    }

    this.touchStreamSession(session);

    const metadata: JsonObject = {
      streamId: event.streamId,
      conversationId: event.conversationId ?? null,
      orchestrationRunId: event.orchestrationRunId ?? null,
      organizationSlug: event.organizationSlug ?? null,
      agentSlug: event.agentSlug,
      mode: event.mode,
      type: 'complete',
      receivedAt: new Date().toISOString(),
    } as JsonObject;

    this.addTaskMessage(session.taskId, 'Stream completed', 'status', metadata);

    // Write completion message to task_messages table
    this.taskMessageService
      .createTaskMessage({
        taskId: session.taskId,
        userId: session.userId,
        content: 'Stream completed',
        messageType: 'status',
        progressPercentage: 100,
        metadata,
      })
      .catch(() => {
        // Silently ignore task message creation errors
      });

    const currentStatus = this.activeTaskStatuses.get(session.taskId);
    if (!currentStatus || currentStatus.status !== 'completed') {
      this.updateTaskStatus(session.taskId, session.userId, {
        status: 'completed',
        progress: 100,
      }).catch(() => {
        // Silently ignore status update errors
      });
    }

    this.unregisterStreamSession(session.sessionId, 'complete_event');
  }

  @OnEvent('agent.stream.error')
  handleAgentStreamErrorEvent(event: AgentStreamErrorEvent): void {
    const session = this.resolveStreamSession({
      streamId: event.streamId,
      agentSlug: event.agentSlug,
      organizationSlug: event.organizationSlug ?? 'global',
      conversationId: event.conversationId ?? null,
    });

    if (!session) {
      return;
    }

    this.touchStreamSession(session);

    const errorMessage =
      typeof event.error === 'string'
        ? event.error
        : JSON.stringify(event.error);

    const metadata: JsonObject = {
      streamId: event.streamId,
      conversationId: event.conversationId ?? null,
      orchestrationRunId: event.orchestrationRunId ?? null,
      organizationSlug: event.organizationSlug ?? null,
      agentSlug: event.agentSlug,
      mode: event.mode,
      type: 'error',
      receivedAt: new Date().toISOString(),
    } as JsonObject;

    this.addTaskMessage(session.taskId, errorMessage, 'error', metadata);

    const currentStatus = this.activeTaskStatuses.get(session.taskId);
    if (!currentStatus || currentStatus.status !== 'failed') {
      this.updateTaskStatus(session.taskId, session.userId, {
        status: 'failed',
        error: errorMessage,
      }).catch(() => {
        // Silently ignore status update errors
      });
    }

    this.unregisterStreamSession(session.sessionId, 'error_event');
  }

  /**
   * Create a new task with initial status
   */
  async createTask(
    taskId: string,
    userId: string,
    taskType?: string,
    initialData: Partial<TaskStatus> = {},
  ): Promise<void> {
    // Default to ephemeral behavior if no task type specified
    const normalizedTaskType =
      taskType === 'long_running' || taskType === 'swarm'
        ? taskType
        : 'ephemeral';
    const taskStatus: TaskStatus = {
      taskId,
      userId,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      taskType: normalizedTaskType, // Store normalized taskType for persistence decisions
      ...initialData,
    };

    if (taskStatus.metadata) {
      taskStatus.metadata = this.cloneJsonValue(taskStatus.metadata);
    }
    if (taskStatus.result) {
      taskStatus.result = this.cloneJsonValue(taskStatus.result);
    }

    // Store in hot cache
    this.activeTaskStatuses.set(taskId, taskStatus);

    // Persist to database for all task types (including ephemeral for evaluations)
    if (
      normalizedTaskType === 'long_running' ||
      normalizedTaskType === 'swarm' ||
      normalizedTaskType === 'ephemeral'
    ) {
      try {
        await this.db
          .from(null, 'tasks')
          .update({
            status: taskStatus.status,
            progress: taskStatus.progress,
            updated_at: new Date().toISOString(),
          })
          .eq('id', taskId)
          .eq('user_id', userId);
      } catch {
        // Silently ignore database update errors
      }
    }

    // Emit status change events (don't await to avoid blocking)
    this.emitStatusChange(taskId, taskStatus).catch((error) => {
      this.logger.warn(
        `Failed to emit status change event: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  /**
   * Update task status with flexible JSON data
   * This is the ONLY method that should update task status
   */
  async updateTaskStatus(
    taskId: string,
    userId: string,
    update: TaskStatusUpdate,
  ): Promise<void> {
    const currentStatus = this.activeTaskStatuses.get(taskId);
    if (!currentStatus) {
      return;
    }

    // Verify user ownership
    if (currentStatus.userId !== userId) {
      return;
    }

    // Merge the update with current status
    const newStatus: TaskStatus = {
      ...currentStatus,
      ...update,
      updatedAt: new Date(),
    };

    if (newStatus.metadata) {
      newStatus.metadata = this.cloneJsonValue(newStatus.metadata);
    }
    if (newStatus.result) {
      newStatus.result = this.cloneJsonValue(newStatus.result);
    }

    // Update hot cache
    this.activeTaskStatuses.set(taskId, newStatus);

    // Persist to database for all task types (including ephemeral for evaluations)
    if (
      currentStatus.taskType === 'long_running' ||
      currentStatus.taskType === 'swarm' ||
      currentStatus.taskType === 'ephemeral'
    ) {
      try {
        const updateData: Record<string, unknown> = {
          status: newStatus.status,
          progress: newStatus.progress,
          updated_at: new Date().toISOString(),
        };

        if (newStatus.result) {
          updateData.response =
            typeof newStatus.result === 'string'
              ? newStatus.result
              : JSON.stringify(newStatus.result);

          // Extract and store LLM metadata if present in the result
          if (this.isJsonObject(newStatus.result)) {
            const resultMetadataValue = newStatus.result['metadata'];
            const resultMetadata = this.asJsonObject(resultMetadataValue);

            if (resultMetadata) {
              // Store general metadata
              updateData.metadata = this.cloneJsonValue(resultMetadata);

              // Extract and store LLM-specific metadata
              const llmUsed = this.asJsonObject(resultMetadata.llmUsed);
              if (llmUsed) {
                updateData.llm_metadata = this.cloneJsonValue(llmUsed);
              }

              // Store response metadata (for compatibility)
              updateData.response_metadata =
                this.cloneJsonValue(resultMetadata);
            }
          }
        }

        if (newStatus.error) {
          updateData.error_message = newStatus.error;
        }

        await this.db
          .from(null, 'tasks')
          .update(updateData)
          .eq('id', taskId)
          .eq('user_id', userId);
      } catch {
        // Silently ignore database update errors
      }
    }

    // Emit status change event (don't await to avoid blocking)
    this.emitStatusChange(taskId, newStatus).catch((error) => {
      this.logger.warn(
        `Failed to emit status change event: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

    // Handle task completion
    if (
      newStatus.status === 'completed' ||
      newStatus.status === 'failed' ||
      newStatus.status === 'cancelled'
    ) {
      this.handleTaskCompletion(taskId, newStatus);
    }
  }

  /**
   * Get current task status (for polling)
   * Only returns status if user owns the task
   */
  getTaskStatus(taskId: string, userId: string): TaskStatus | null {
    const status = this.activeTaskStatuses.get(taskId);
    if (!status || status.userId !== userId) {
      return null;
    }
    return { ...status }; // Return copy to prevent mutations
  }

  /**
   * Add a progress message to the live cache (for polling clients)
   */
  addTaskMessage(
    taskId: string,
    messageContent: string,
    messageType:
      | 'progress'
      | 'status'
      | 'info'
      | 'warning'
      | 'error' = 'progress',
    metadata?: JsonObject,
  ): void {
    if (!this.activeTaskMessages.has(taskId)) {
      this.activeTaskMessages.set(taskId, []);
    }

    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const expiresAt = new Date(now + this.messageTtlMs).toISOString();
    const messages = this.activeTaskMessages.get(taskId)!;
    const filtered = messages.filter(
      (message) => new Date(message.expiresAt).getTime() > now,
    );

    const normalizedMetadata =
      metadata !== undefined ? this.cloneJsonValue(metadata) : undefined;
    const progressPercentage =
      this.extractProgress(normalizedMetadata) ?? undefined;

    const newMessage: TaskMessageRecord = {
      id: `msg-${now}-${Math.random().toString(36).slice(2, 11)}`,
      taskId,
      content: messageContent,
      messageType,
      progressPercentage,
      metadata: normalizedMetadata,
      createdAt,
      expiresAt,
    };

    filtered.push(newMessage);
    this.activeTaskMessages.set(taskId, filtered);
  }

  /**
   * Get accumulated messages for a task (live cache first, for polling)
   */
  getTaskMessages(taskId: string, userId: string): TaskMessageRecord[] {
    // Check if user owns this task
    const taskStatus = this.getTaskStatus(taskId, userId);
    if (!taskStatus) {
      return [];
    }

    // Return live messages from cache
    this.pruneExpiredMessages(taskId);
    const messages = this.activeTaskMessages.get(taskId) || [];

    return messages.map((message) => ({
      ...message,
      metadata:
        message.metadata !== undefined
          ? this.cloneJsonValue(message.metadata)
          : undefined,
    }));
  }

  /**
   * Get all active tasks for a user (for dashboard)
   */
  getUserActiveTasks(userId: string): TaskStatus[] {
    const userTasks: TaskStatus[] = [];
    for (const status of this.activeTaskStatuses.values()) {
      if (
        status.userId === userId &&
        status.status !== 'completed' &&
        status.status !== 'failed' &&
        status.status !== 'cancelled'
      ) {
        userTasks.push({
          ...status,
          metadata: status.metadata
            ? this.cloneJsonValue(status.metadata)
            : undefined,
          result: status.result
            ? this.cloneJsonValue(status.result)
            : undefined,
        });
      }
    }
    return userTasks;
  }

  /**
   * Mark task as completed (single authority)
   */
  async completeTask(
    taskId: string,
    userId: string,
    result: JsonValue,
  ): Promise<void> {
    await this.updateTaskStatus(taskId, userId, {
      status: 'completed',
      progress: 100,
      result,
    });
  }

  /**
   * Mark task as failed (single authority)
   */
  async failTask(taskId: string, userId: string, error: string): Promise<void> {
    await this.updateTaskStatus(taskId, userId, {
      status: 'failed',
      error,
    });
  }

  /**
   * Update task progress (convenience method)
   */
  async updateProgress(
    taskId: string,
    userId: string,
    progress: number,
    message?: string,
  ): Promise<void> {
    // Write message to task_messages table if provided
    if (message) {
      await this.taskMessageService.createTaskMessage({
        taskId,
        userId,
        content: message,
        messageType: 'progress',
        progressPercentage: progress,
      });
    }

    await this.updateTaskStatus(taskId, userId, {
      status: 'running',
      progress,
    });
  }

  /**
   * Handle task completion and cleanup
   */
  private handleTaskCompletion(taskId: string, taskStatus: TaskStatus): void {
    // Clear any existing cleanup timer
    const existingTimer = this.cleanupTimers.get(taskId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set cleanup based on task type
    let cleanupDelayMs: number;

    switch (taskStatus.taskType) {
      case 'ephemeral':
        cleanupDelayMs = 60 * 1000; // 1 minute
        break;
      case 'long_running':
        cleanupDelayMs = 15 * 60 * 1000; // 15 minutes
        break;
      case 'swarm':
        cleanupDelayMs = 60 * 60 * 1000; // 1 hour
        break;
      default:
        cleanupDelayMs = 60 * 1000; // Default 1 minute
    }

    // Schedule cleanup
    const cleanupTimer = setTimeout(() => {
      this.cleanupTask(taskId);
    }, cleanupDelayMs);

    this.cleanupTimers.set(taskId, cleanupTimer);
  }

  /**
   * Remove task from active cache
   */
  private cleanupTask(taskId: string): void {
    this.removeStreamSessionsForTask(taskId);
    this.activeTaskStatuses.delete(taskId);
    this.activeTaskMessages.delete(taskId); // Clean up live messages too
    this.cleanupTimers.delete(taskId);
  }

  /**
   * Emit status change events for WebSocket broadcasting
   */
  private async emitStatusChange(
    taskId: string,
    taskStatus: TaskStatus,
  ): Promise<void> {
    // Extract conversation context from metadata or look it up
    let conversationId: string | null = null;
    let organizationSlug: string | null = null;
    let agentSlug: string | null = null;

    // First try to get context from taskStatus metadata
    if (taskStatus.metadata) {
      const metadata = taskStatus.metadata;
      conversationId =
        typeof metadata.conversationId === 'string'
          ? metadata.conversationId
          : null;
      organizationSlug =
        typeof metadata.organizationSlug === 'string'
          ? metadata.organizationSlug
          : null;
      agentSlug =
        typeof metadata.agentSlug === 'string' ? metadata.agentSlug : null;
    }

    // If not in metadata, look up task from database
    if (!conversationId) {
      try {
        const taskResponse = await this.db
          .from(null, 'tasks')
          .select('conversation_id, metadata')
          .eq('id', taskId)
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
    }

    // Emit generic task status change with conversation context
    this.eventEmitter.emit('task.status_changed', {
      taskId,
      userId: taskStatus.userId,
      conversationId,
      organizationSlug,
      agentSlug,
      status: taskStatus.status,
      progress: taskStatus.progress,
      data: taskStatus,
    });

    // Emit specific lifecycle events with conversation context
    switch (taskStatus.status) {
      case 'running':
        this.eventEmitter.emit('task.started', {
          taskId,
          userId: taskStatus.userId,
          conversationId,
          organizationSlug,
          agentSlug,
        });
        break;
      case 'completed':
        this.eventEmitter.emit('task.completed', {
          taskId,
          userId: taskStatus.userId,
          conversationId,
          organizationSlug,
          agentSlug,
          result: taskStatus.result,
        });
        break;
      case 'failed':
        this.eventEmitter.emit('task.failed', {
          taskId,
          userId: taskStatus.userId,
          conversationId,
          organizationSlug,
          agentSlug,
          error: taskStatus.error,
        });
        break;
      case 'cancelled':
        this.eventEmitter.emit('task.cancelled', {
          taskId,
          userId: taskStatus.userId,
          conversationId,
          organizationSlug,
          agentSlug,
        });
        break;
      case 'hitl_waiting':
        this.eventEmitter.emit('task.hitl_waiting', {
          taskId,
          userId: taskStatus.userId,
          conversationId,
          organizationSlug,
          agentSlug,
          result: taskStatus.result, // Contains generated content for review
        });
        break;
    }
  }

  /**
   * Get service statistics
   */
  getStats(): {
    activeTaskCount: number;
    userTaskCounts: Record<string, number>;
  } {
    const userTaskCounts: Record<string, number> = {};

    for (const status of this.activeTaskStatuses.values()) {
      userTaskCounts[status.userId] = (userTaskCounts[status.userId] || 0) + 1;
    }

    return {
      activeTaskCount: this.activeTaskStatuses.size,
      userTaskCounts,
    };
  }

  private cloneJsonValue<T extends JsonValue>(value: T): T {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'object') {
      try {
        return JSON.parse(JSON.stringify(value)) as T;
      } catch {
        return value;
      }
    }

    return value;
  }

  private asJsonObject(value: unknown): JsonObject | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as JsonObject;
    }
    return undefined;
  }

  private isJsonObject(value: JsonValue | undefined): value is JsonObject {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}

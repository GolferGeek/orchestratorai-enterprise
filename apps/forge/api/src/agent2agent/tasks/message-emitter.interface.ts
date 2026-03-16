import type { TaskMessageService } from './task-message.service';

/**
 * MessageEmitter interface for agents to emit progress and status messages
 * This allows agents to communicate with users in real-time during task execution
 */
export interface MessageEmitter {
  /**
   * Emit a message during task execution
   * @param content - The message content to display to the user
   * @param type - The type of message (progress, status, info, warning, error)
   * @param progressPercentage - Optional progress percentage (0-100) for progress messages
   * @param metadata - Optional additional metadata about the message
   */
  emit(
    content: string,
    type?: 'progress' | 'status' | 'info' | 'warning' | 'error',
    progressPercentage?: number,
    metadata?: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Emit a progress message with percentage
   * @param content - Progress message content
   * @param progressPercentage - Progress percentage (0-100)
   * @param metadata - Optional additional metadata
   */
  progress(
    content: string,
    progressPercentage: number,
    metadata?: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Emit a status message
   * @param content - Status message content
   * @param metadata - Optional additional metadata
   */
  status(content: string, metadata?: Record<string, unknown>): Promise<void>;

  /**
   * Emit an info message
   * @param content - Info message content
   * @param metadata - Optional additional metadata
   */
  info(content: string, metadata?: Record<string, unknown>): Promise<void>;

  /**
   * Emit a warning message
   * @param content - Warning message content
   * @param metadata - Optional additional metadata
   */
  warning(content: string, metadata?: Record<string, unknown>): Promise<void>;

  /**
   * Emit an error message
   * @param content - Error message content
   * @param metadata - Optional additional metadata
   */
  error(content: string, metadata?: Record<string, unknown>): Promise<void>;
}

/**
 * Implementation of MessageEmitter for task execution
 */
export class TaskMessageEmitter implements MessageEmitter {
  constructor(
    private readonly taskId: string,
    private readonly userId: string,
    private readonly messageService: TaskMessageService,
  ) {}

  async emit(
    content: string,
    type: 'progress' | 'status' | 'info' | 'warning' | 'error' = 'info',
    progressPercentage?: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.messageService.createTaskMessage({
      taskId: this.taskId,
      userId: this.userId,
      content,
      messageType: type,
      progressPercentage,
      metadata,
    });
  }

  async progress(
    content: string,
    progressPercentage: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.emit(content, 'progress', progressPercentage, metadata);
  }

  async status(
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.emit(content, 'status', undefined, metadata);
  }

  async info(
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.emit(content, 'info', undefined, metadata);
  }

  async warning(
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.emit(content, 'warning', undefined, metadata);
  }

  async error(
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.emit(content, 'error', undefined, metadata);
  }
}

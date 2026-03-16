import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Status types for LangGraph workflow execution
 */
export type LangGraphStatus =
  | 'started'
  | 'processing'
  | 'hitl_waiting'
  | 'hitl_resumed'
  | 'completed'
  | 'failed'
  | 'tool_calling'
  | 'tool_completed';

/**
 * Observability event payload for LangGraph workflows
 * Uses ExecutionContext as the single source of context.
 */
export interface LangGraphObservabilityEvent {
  /** ExecutionContext - passed through unchanged */
  context: ExecutionContext;
  /** LangGraph thread ID (usually same as taskId) */
  threadId: string;
  /** Event status */
  status: LangGraphStatus;
  /** Human-readable message */
  message?: string;
  /** Current step/phase name */
  step?: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * ObservabilityService for LangGraph
 *
 * Sends observability events to the Orchestrator AI API's webhook endpoint.
 * Takes ExecutionContext and passes it through - never constructs or modifies it.
 */
@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);
  private readonly apiBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const apiPort = this.configService.get<string>('API_PORT');
    if (!apiPort) {
      throw new Error(
        'API_PORT environment variable is required. ' +
          'Please set API_PORT in your .env file (e.g., API_PORT=6100).',
      );
    }

    const apiHost = this.configService.get<string>('API_HOST') || 'localhost';
    this.apiBaseUrl = `http://${apiHost}:${apiPort}`;
  }

  /**
   * Send an observability event to the Orchestrator AI API
   * Non-blocking - failures are logged but don't throw
   */
  async emit(event: LangGraphObservabilityEvent): Promise<void> {
    try {
      const url = `${this.apiBaseUrl}/webhooks/status`;
      const { context } = event;

      const payload = {
        // ExecutionContext capsule - SINGLE SOURCE OF TRUTH
        // All context fields (userId, conversationId, agentSlug, orgSlug) are in here
        context,
        // Event-specific fields
        // NOTE: conversationId is used here for routing before parsing context.
        conversationId: context.conversationId,
        status: this.mapStatusToEventType(event.status),
        timestamp: new Date().toISOString(),
        message: event.message,
        step: event.step,
        percent: event.progress,
        mode: 'build',
        userMessage: event.message,
        data: {
          hook_event_type: this.mapStatusToEventType(event.status),
          source_app: 'langgraph',
          threadId: event.threadId,
          ...event.metadata,
        },
      };

      this.logger.debug(`Emitting observability event: ${event.status}`, {
        conversationId: context.conversationId,
        threadId: event.threadId,
        agentSlug: context.agentSlug,
      });

      await firstValueFrom(
        this.httpService.post(url, payload, {
          timeout: 2000, // 2 second timeout - don't block
          validateStatus: () => true, // Accept any status
        }),
      );
    } catch (error) {
      // Log but don't throw - observability failures shouldn't break workflow execution
      this.logger.warn(
        `Failed to send observability event (non-blocking): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Map LangGraph status to observability event type
   */
  private mapStatusToEventType(status: LangGraphStatus): string {
    const statusMap: Record<LangGraphStatus, string> = {
      started: 'langgraph.started',
      processing: 'langgraph.processing',
      hitl_waiting: 'langgraph.hitl_waiting',
      hitl_resumed: 'langgraph.hitl_resumed',
      completed: 'langgraph.completed',
      failed: 'langgraph.failed',
      tool_calling: 'langgraph.tool_calling',
      tool_completed: 'langgraph.tool_completed',
    };
    return statusMap[status] || `langgraph.${status}`;
  }

  /**
   * Convenience: Emit workflow started event
   */
  async emitStarted(
    context: ExecutionContext,
    threadId: string,
    message?: string,
  ): Promise<void> {
    await this.emit({
      context,
      threadId,
      status: 'started',
      message: message || 'Workflow started',
    });
  }

  /**
   * Convenience: Emit processing/progress event
   */
  async emitProgress(
    context: ExecutionContext,
    threadId: string,
    message: string,
    options?: {
      step?: string;
      progress?: number;
      metadata?: Record<string, unknown>;
      [key: string]: unknown; // Allow additional properties for observability
    },
  ): Promise<void> {
    // Extract known properties, rest goes to metadata
    const { step, progress, metadata, ...rest } = options || {};
    await this.emit({
      context,
      threadId,
      status: 'processing',
      message,
      step,
      progress,
      metadata: { ...metadata, ...rest },
    });
  }

  /**
   * Convenience: Emit HITL waiting event
   */
  async emitHitlWaiting(
    context: ExecutionContext,
    threadId: string,
    pendingContent?: unknown,
    message?: string,
  ): Promise<void> {
    await this.emit({
      context,
      threadId,
      status: 'hitl_waiting',
      message: message || 'Awaiting human review',
      metadata: { pendingContent },
    });
  }

  /**
   * Convenience: Emit HITL resumed event
   */
  async emitHitlResumed(
    context: ExecutionContext,
    threadId: string,
    decision: 'approve' | 'edit' | 'reject',
    message?: string,
  ): Promise<void> {
    await this.emit({
      context,
      threadId,
      status: 'hitl_resumed',
      message: message || `Human review decision: ${decision}`,
      metadata: { decision },
    });
  }

  /**
   * Convenience: Emit tool calling event
   */
  async emitToolCalling(
    context: ExecutionContext,
    threadId: string,
    toolName: string,
    toolInput?: unknown,
  ): Promise<void> {
    await this.emit({
      context,
      threadId,
      status: 'tool_calling',
      message: `Calling tool: ${toolName}`,
      step: toolName,
      metadata: { toolName, toolInput },
    });
  }

  /**
   * Convenience: Emit tool completed event
   */
  async emitToolCompleted(
    context: ExecutionContext,
    threadId: string,
    toolName: string,
    success: boolean,
    toolResult?: unknown,
    error?: string,
  ): Promise<void> {
    await this.emit({
      context,
      threadId,
      status: 'tool_completed',
      message: success
        ? `Tool completed: ${toolName}`
        : `Tool failed: ${toolName}`,
      step: toolName,
      metadata: { toolName, toolResult, success, error },
    });
  }

  /**
   * Convenience: Emit workflow completed event
   */
  async emitCompleted(
    context: ExecutionContext,
    threadId: string,
    result?: unknown,
    duration?: number,
  ): Promise<void> {
    await this.emit({
      context,
      threadId,
      status: 'completed',
      message: 'Workflow completed successfully',
      metadata: { result, duration },
    });
  }

  /**
   * Convenience: Emit workflow failed event
   */
  async emitFailed(
    context: ExecutionContext,
    threadId: string,
    error: string,
    duration?: number,
  ): Promise<void> {
    await this.emit({
      context,
      threadId,
      status: 'failed',
      message: `Workflow failed: ${error}`,
      metadata: { error, duration },
    });
  }
}

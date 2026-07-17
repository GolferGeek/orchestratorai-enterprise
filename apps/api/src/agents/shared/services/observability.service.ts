import { Injectable, Logger } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  ObservabilityEventsService,
  type ObservabilityEventRecord,
} from '@orchestratorai/planes/observability';

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
 * Convenience wrapper around the observability plane's ObservabilityEventsService.
 * Pushes events directly into the in-memory reactive buffer — no HTTP hop.
 * The SSE stream controller reads from the same buffer.
 *
 * Takes ExecutionContext and passes it through — never constructs or modifies it.
 */
@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);

  constructor(
    private readonly observabilityEvents: ObservabilityEventsService,
  ) {}

  /**
   * Push an observability event directly into the reactive buffer.
   * Non-blocking — failures are logged but don't throw.
   */
  async emit(event: LangGraphObservabilityEvent): Promise<void> {
    try {
      const { context } = event;
      const hookEventType = this.mapStatusToEventType(event.status);

      const record: ObservabilityEventRecord = {
        context,
        source_app: 'langgraph',
        hook_event_type: hookEventType,
        status: hookEventType,
        message: event.message || null,
        progress: event.progress ?? null,
        step: event.step || null,
        payload: {
          data: {
            hook_event_type: hookEventType,
            source_app: 'langgraph',
            threadId: event.threadId,
            ...event.metadata,
          },
          mode: 'build',
          userMessage: event.message,
        },
        timestamp: Date.now(),
      };

      this.logger.debug(`Emitting observability event: ${event.status}`, {
        conversationId: context.conversationId,
        threadId: event.threadId,
        agentSlug: context.agentSlug,
      });

      await this.observabilityEvents.push(record);
    } catch (error) {
      // Log but don't throw — observability failures shouldn't break workflow execution
      this.logger.warn(
        `Failed to emit observability event (non-blocking): ${
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

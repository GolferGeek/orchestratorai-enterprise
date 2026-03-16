import { Injectable, Logger } from '@nestjs/common';
import {
  AgentStreamChunkData,
  AgentStreamCompleteData,
  AgentStreamErrorData,
  AgentStreamChunkSSEEvent,
  AgentStreamCompleteSSEEvent,
  AgentStreamErrorSSEEvent,
  SSEEvent,
} from '@orchestrator-ai/transport-types';
import { ObservabilityEventRecord } from '../../observability/observability-events.service';
import { Response } from 'express';

@Injectable()
export class SseEventMapperService {
  private readonly logger = new Logger(SseEventMapperService.name);

  matchesObservabilityEvent(
    event: ObservabilityEventRecord,
    filters: {
      taskId: string;
      agentSlug: string;
      organizationSlug: string;
      conversationId?: string | null;
    },
  ): boolean {
    // Check taskId match
    if (event.context.taskId !== filters.taskId) {
      this.logger.debug(
        `[STREAM-FILTER] taskId mismatch: event=${event.context.taskId}, filter=${filters.taskId}`,
      );
      return false;
    }

    // Check organization match
    const eventOrg = this.normalizeOrgValue(event.context.orgSlug);
    if (eventOrg !== filters.organizationSlug) {
      this.logger.debug(
        `[STREAM-FILTER] org mismatch: eventOrg=${eventOrg}, filterOrg=${filters.organizationSlug}`,
      );
      return false;
    }

    if (filters.conversationId) {
      return event.context.conversationId === filters.conversationId;
    }

    return true;
  }

  toChunkSseEventFromObservability(
    event: ObservabilityEventRecord,
  ): AgentStreamChunkSSEEvent | null {
    const chunkData = this.buildChunkEventFromObservability(event);
    if (!chunkData) {
      return null;
    }
    return this.toChunkSseEvent(chunkData);
  }

  toCompleteSseEventFromObservability(
    event: ObservabilityEventRecord,
  ): AgentStreamCompleteSSEEvent | null {
    if (!event.context) {
      this.logger.warn(`Observability event missing context`);
      return null;
    }

    const completeEvent: AgentStreamCompleteData = {
      context: event.context,
      streamId: event.context.taskId,
      mode: (event.payload?.mode as string) ?? 'converse',
      userMessage: event.message || '',
      timestamp: new Date(event.timestamp).toISOString(),
      type: 'complete',
    };
    return this.toCompleteSseEvent(completeEvent);
  }

  toErrorSseEventFromObservability(
    event: ObservabilityEventRecord,
  ): AgentStreamErrorSSEEvent | null {
    if (!event.context) {
      this.logger.warn(`Observability event missing context`);
      return null;
    }

    const errorEvent: AgentStreamErrorData = {
      context: event.context,
      streamId: event.context.taskId,
      mode: (event.payload?.mode as string) ?? 'converse',
      userMessage: event.message || '',
      timestamp: new Date(event.timestamp).toISOString(),
      type: 'error',
      error:
        event.message ||
        (event.payload?.error as string) ||
        event.status ||
        'Agent task failed',
    };
    return this.toErrorSseEvent(errorEvent);
  }

  writeSseEvent(response: Response, event: SSEEvent): void {
    response.write(`event: ${event.event}\n`);
    response.write(`data: ${JSON.stringify(event.data)}\n\n`);
  }

  /**
   * Build chunk event from observability record.
   * Uses the ExecutionContext stored with the event.
   */
  private buildChunkEventFromObservability(
    event: ObservabilityEventRecord,
  ): AgentStreamChunkData | null {
    // Context should be present - it's stored with the event
    if (!event.context) {
      this.logger.warn(`Observability event missing context`);
      return null;
    }

    return {
      context: event.context,
      streamId: event.context.taskId,
      mode: (event.payload?.mode as string) ?? 'converse',
      userMessage: event.message || '',
      timestamp: new Date(event.timestamp).toISOString(),
      chunk: {
        type: 'progress',
        content: this.resolveObservabilityContent(event),
        metadata: {
          progress: event.progress ?? undefined,
          step: event.step ?? undefined,
          message: event.message ?? undefined,
          status: event.status,
          hookEventType: event.hook_event_type,
          payload: event.payload,
          sequence: (event.payload?.sequence as number) ?? undefined,
          totalSteps: (event.payload?.totalSteps as number) ?? undefined,
        },
      },
    };
  }

  private resolveObservabilityContent(event: ObservabilityEventRecord): string {
    if (typeof event.message === 'string' && event.message.trim().length > 0) {
      return event.message;
    }
    const payloadMessage = event.payload?.message;
    if (
      typeof payloadMessage === 'string' &&
      payloadMessage.trim().length > 0
    ) {
      return payloadMessage;
    }
    return event.hook_event_type;
  }

  private normalizeOrgValue(value: string | null | undefined): string {
    if (value && value.trim().length > 0) {
      return value;
    }
    return 'global';
  }

  /**
   * Transform chunk event data to SSE event.
   * Events now include full ExecutionContext - just wrap in SSE envelope.
   */
  private toChunkSseEvent(
    event: AgentStreamChunkData,
  ): AgentStreamChunkSSEEvent {
    return {
      event: 'agent_stream_chunk',
      data: event,
    };
  }

  /**
   * Transform complete event data to SSE event.
   * Events now include full ExecutionContext - just wrap in SSE envelope.
   */
  private toCompleteSseEvent(
    event: AgentStreamCompleteData,
  ): AgentStreamCompleteSSEEvent {
    return {
      event: 'agent_stream_complete',
      data: event,
    };
  }

  /**
   * Transform error event data to SSE event.
   * Events now include full ExecutionContext - just wrap in SSE envelope.
   */
  private toErrorSseEvent(
    event: AgentStreamErrorData,
  ): AgentStreamErrorSSEEvent {
    return {
      event: 'agent_stream_error',
      data: event,
    };
  }
}

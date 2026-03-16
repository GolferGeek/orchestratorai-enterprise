import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { AgentRuntimeStreamChunk } from './agent-runtime-dispatch.service';

export interface AgentStreamContext {
  conversationId?: string;
  sessionId?: string;
  orchestrationRunId?: string;
  organizationSlug?: string | null;
  agentSlug: string;
  mode: string;
}

export interface AgentStreamStartEvent extends AgentStreamContext {
  streamId: string;
}

export interface AgentStreamChunkEvent extends AgentStreamContext {
  streamId: string;
  chunk: AgentRuntimeStreamChunk;
}

export interface AgentStreamCompleteEvent extends AgentStreamContext {
  streamId: string;
}

export interface AgentStreamErrorEvent extends AgentStreamContext {
  streamId: string;
  error: string;
}

export interface AgentStreamSession {
  streamId: string;
  publishChunk: (chunk: AgentRuntimeStreamChunk) => void;
  complete: () => void;
  error: (error: unknown) => void;
}

@Injectable()
export class AgentRuntimeStreamService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  start(
    context: AgentStreamContext,
    streamId: string = randomUUID(),
  ): AgentStreamSession {
    const normalizedContext: AgentStreamContext = {
      ...context,
      organizationSlug: context.organizationSlug ?? null,
    };

    this.eventEmitter.emit('agent.stream.start', {
      streamId,
      ...normalizedContext,
    } satisfies AgentStreamStartEvent);

    return {
      streamId,
      publishChunk: (chunk) => {
        this.eventEmitter.emit('agent.stream.chunk', {
          streamId,
          ...normalizedContext,
          chunk,
        } satisfies AgentStreamChunkEvent);
      },
      complete: () => {
        this.eventEmitter.emit('agent.stream.complete', {
          streamId,
          ...normalizedContext,
        } satisfies AgentStreamCompleteEvent);
      },
      error: (error) => {
        this.eventEmitter.emit('agent.stream.error', {
          streamId,
          ...normalizedContext,
          error: this.stringifyError(error),
        } satisfies AgentStreamErrorEvent);
      },
    };
  }

  private stringifyError(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }
    if (error instanceof Error) {
      return error.message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
}

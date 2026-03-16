import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentTaskMode } from '@agent2agent/dto/task-request.dto';

export interface LifecycleContext {
  conversationId?: string;
  sessionId?: string;
  organizationSlug: string | null;
  agentSlug: string;
  mode: AgentTaskMode;
}

export interface LifecycleProgress {
  step?: string;
  message?: string;
  percent?: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AgentRuntimeLifecycleService {
  constructor(private readonly emitter: EventEmitter2) {}

  start(ctx: LifecycleContext, metadata?: Record<string, unknown>) {
    this.emitter.emit(
      'agent.lifecycle.start',
      this.envelope(ctx, { metadata }),
    );
  }

  progress(ctx: LifecycleContext, progress: LifecycleProgress) {
    this.emitter.emit(
      'agent.lifecycle.progress',
      this.envelope(ctx, { progress }),
    );
  }

  complete(ctx: LifecycleContext, result?: unknown) {
    this.emitter.emit(
      'agent.lifecycle.complete',
      this.envelope(ctx, { result }),
    );
  }

  fail(
    ctx: LifecycleContext,
    reason: string,
    metadata?: Record<string, unknown>,
  ) {
    this.emitter.emit(
      'agent.lifecycle.fail',
      this.envelope(ctx, { error: { reason }, metadata }),
    );
  }

  private envelope(ctx: LifecycleContext, payload: Record<string, unknown>) {
    return {
      ...ctx,
      timestamp: new Date().toISOString(),
      ...payload,
    };
  }
}
